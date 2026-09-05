data "aws_caller_identity" "current" {}
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"
  name = var.name
  cidr = var.vpc_cidr
  azs = var.availability_zones
  private_subnets = [for i, _ in var.availability_zones : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets = [for i, _ in var.availability_zones : cidrsubnet(var.vpc_cidr, 8, i + 48)]
  database_subnets = [for i, _ in var.availability_zones : cidrsubnet(var.vpc_cidr, 8, i + 64)]
  enable_nat_gateway = true
  single_nat_gateway = false
  one_nat_gateway_per_az = true
  enable_dns_hostnames = true
  public_subnet_tags = {"kubernetes.io/role/elb" = 1}
  private_subnet_tags = {"kubernetes.io/role/internal-elb" = 1}
}

module "eks" {
  source = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"
  name = var.name
  kubernetes_version = "1.33"
  endpoint_public_access = true
  enable_cluster_creator_admin_permissions = true
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets
  addons = {coredns = {}, kube-proxy = {}, vpc-cni = {before_compute = true}, aws-ebs-csi-driver = {}}
  eks_managed_node_groups = {
    application = {instance_types = var.node_instance_types, capacity_type = "ON_DEMAND", min_size = 3, max_size = 12, desired_size = 3, subnet_ids = module.vpc.private_subnets}
  }
}

resource "random_password" "db" { length = 40; special = true; override_special = "!#$%&*+-=?@^_" }
resource "aws_security_group" "data" { name = "${var.name}-data"; description = "Data services, ingress added by workload security policy"; vpc_id = module.vpc.vpc_id; egress { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] } }
resource "aws_db_subnet_group" "main" { name = var.name; subnet_ids = module.vpc.database_subnets }
resource "aws_db_instance" "mysql" {
  identifier = var.name
  engine = "mysql"
  engine_version = "8.4"
  instance_class = var.db_instance_class
  allocated_storage = 50
  max_allocated_storage = 500
  storage_type = "gp3"
  storage_encrypted = true
  multi_az = true
  db_name = "leaseflow"
  username = "leaseflow"
  password = random_password.db.result
  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.data.id]
  backup_retention_period = 14
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.name}-final"
  enabled_cloudwatch_logs_exports = ["error", "general", "slowquery"]
  performance_insights_enabled = true
  auto_minor_version_upgrade = true
}

resource "aws_elasticache_subnet_group" "main" { name = var.name; subnet_ids = module.vpc.database_subnets }
resource "random_password" "redis" { length = 40; special = false }
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = var.name
  description = "Leaseflow Redis"
  engine = "redis"
  node_type = var.redis_node_type
  num_cache_clusters = 2
  automatic_failover_enabled = true
  multi_az_enabled = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token = random_password.redis.result
  subnet_group_name = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.data.id]
}

resource "aws_s3_bucket" "documents" { bucket = "${var.name}-documents-${data.aws_caller_identity.current.account_id}" }
resource "aws_s3_bucket_versioning" "documents" { bucket = aws_s3_bucket.documents.id; versioning_configuration { status = "Enabled" } }
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" { bucket = aws_s3_bucket.documents.id; rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } } }
resource "aws_s3_bucket_public_access_block" "documents" { bucket = aws_s3_bucket.documents.id; block_public_acls = true; block_public_policy = true; ignore_public_acls = true; restrict_public_buckets = true }
resource "aws_s3_bucket_lifecycle_configuration" "documents" { bucket = aws_s3_bucket.documents.id; rule { id = "abort-multipart"; status = "Enabled"; abort_incomplete_multipart_upload { days_after_initiation = 7 } } }

resource "aws_secretsmanager_secret" "application" { name = var.name; recovery_window_in_days = 30 }
resource "aws_secretsmanager_secret_version" "application" {
  secret_id = aws_secretsmanager_secret.application.id
  secret_string = jsonencode({DATABASE_URL = "mysql://leaseflow:${urlencode(random_password.db.result)}@${aws_db_instance.mysql.address}:3306/leaseflow", REDIS_URL = "rediss://default:${random_password.redis.result}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379", S3_BUCKET = aws_s3_bucket.documents.id, S3_REGION = var.aws_region})
}
