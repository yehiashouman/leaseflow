output "eks_cluster_name" { value = module.eks.cluster_name }
output "rds_endpoint" { value = aws_db_instance.mysql.address; sensitive = true }
output "redis_endpoint" { value = aws_elasticache_replication_group.redis.primary_endpoint_address; sensitive = true }
output "documents_bucket" { value = aws_s3_bucket.documents.id }
output "application_secret_arn" { value = aws_secretsmanager_secret.application.arn }
