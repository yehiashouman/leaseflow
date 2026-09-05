variable "aws_region" { type = string; default = "me-central-1" }
variable "name" { type = string; default = "leaseflow-production" }
variable "vpc_cidr" { type = string; default = "10.40.0.0/16" }
variable "availability_zones" { type = list(string); description = "Three availability zones" }
variable "db_instance_class" { type = string; default = "db.t4g.medium" }
variable "redis_node_type" { type = string; default = "cache.t4g.small" }
variable "node_instance_types" { type = list(string); default = ["m7i.large"] }
variable "tags" { type = map(string); default = {Application = "leaseflow", ManagedBy = "terraform"} }
