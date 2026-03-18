output "app_live_url" {
  description = "Public URL of the GradientGuard web dashboard"
  value       = "https://${digitalocean_app.gradient_guard.live_url}"
}

output "api_url" {
  description = "Internal API service URL"
  value       = digitalocean_app.gradient_guard.live_url
}

output "db_host" {
  description = "PostgreSQL cluster host (for reference)"
  value       = digitalocean_database_cluster.postgres.host
  sensitive   = false
}

output "db_connection_uri" {
  description = "Full DATABASE_URL (sensitive)"
  value       = digitalocean_database_cluster.postgres.uri
  sensitive   = true
}

output "evidence_bucket_name" {
  description = "DO Spaces bucket name for evidence PDFs"
  value       = digitalocean_spaces_bucket.evidence.name
}

output "evidence_cdn_endpoint" {
  description = "CDN endpoint for evidence bucket"
  value       = "https://${digitalocean_spaces_bucket.evidence.name}.${var.do_region}.cdn.digitaloceanspaces.com"
}
