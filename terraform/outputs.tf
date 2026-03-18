# App Platform is the source of truth for the app. Terraform reads it read-only.
output "app_live_url" {
  description = "Public URL of the GradientGuard web dashboard"
  value       = data.digitalocean_app.gradient_guard.live_url
}

output "app_id" {
  description = "App Platform app ID"
  value       = data.digitalocean_app.gradient_guard.id
}

# DB is managed by App Platform as a component — DATABASE_URL is injected
# automatically via ${gradient-guard-db.DATABASE_URL} in .do/app.yaml.
# It is not available here; use the App Platform console to retrieve it.
output "db_connection_uri" {
  description = "Managed by App Platform. Retrieve from the DO console or app env vars."
  value       = "see-app-platform-env"
  sensitive   = false
}

output "evidence_bucket_name" {
  description = "DO Spaces bucket name for evidence PDFs"
  value       = "gradient-guard-evidence"
}

output "evidence_cdn_endpoint" {
  description = "CDN endpoint for evidence bucket"
  value       = "https://gradient-guard-evidence.${var.do_region}.cdn.digitaloceanspaces.com"
}
