terraform {
  required_version = ">= 1.7.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.43"
    }
  }

  # Local backend — state is cached in GitHub Actions between runs.
  # No Spaces keys required; only DIGITALOCEAN_API_TOKEN is needed.
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "digitalocean" {
  token = var.do_token
}

# ── Spaces bucket: terraform state ──────────────────────────────────────────
# Bootstrap: `terraform init` will create this if it doesn't exist yet.
# Run `terraform apply -target=digitalocean_spaces_bucket.tf_state` first time.
resource "digitalocean_spaces_bucket" "tf_state" {
  name   = "gradient-guard-tf-state"
  region = var.do_region

  lifecycle {
    prevent_destroy = true
  }
}

# ── Spaces bucket: evidence PDFs ────────────────────────────────────────────
resource "digitalocean_spaces_bucket" "evidence" {
  name   = "gradient-guard-evidence"
  region = var.do_region
}

resource "digitalocean_spaces_bucket_cors_configuration" "evidence" {
  bucket = digitalocean_spaces_bucket.evidence.name
  region = var.do_region

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = [
      "https://gradient-guard.ondigitalocean.app",
      "http://localhost:3000",
    ]
    max_age_seconds = 3600
  }
}

# ── Managed PostgreSQL cluster ───────────────────────────────────────────────
resource "digitalocean_database_cluster" "postgres" {
  name       = "gradient-guard-db"
  engine     = "pg"
  version    = "16"
  size       = var.db_size
  region     = var.do_region
  node_count = 1

  maintenance_window {
    day  = "sunday"
    hour = "02:00:00"
  }

  tags = ["gradient-guard", "production"]
}

resource "digitalocean_database_db" "gradientguard" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "gradientguard"
}

# Restrict DB access to App Platform outbound IP range
resource "digitalocean_database_firewall" "postgres" {
  cluster_id = digitalocean_database_cluster.postgres.id

  rule {
    type  = "app"
    value = digitalocean_app.gradient_guard.id
  }
}

# ── App Platform application ─────────────────────────────────────────────────
resource "digitalocean_app" "gradient_guard" {
  spec {
    name   = "gradient-guard"
    region = var.do_region

    # ── Web (Next.js) ────────────────────────────────────────────
    service {
      name               = "web"
      environment_slug   = "node-js"
      instance_count     = 1
      instance_size_slug = "apps-s-1vcpu-0.5gb"
      source_dir         = "packages/web"

      github {
        repo           = var.github_repo
        branch         = var.github_branch
        deploy_on_push = true
      }

      build_command = "npm install && npm run build"
      run_command   = "npm start"

      health_check {
        http_path             = "/"
        initial_delay_seconds = 30
        period_seconds        = 30
        failure_threshold     = 3
      }

      env {
        key   = "NEXT_PUBLIC_API_URL"
        value = "$${api.PUBLIC_URL}"
        scope = "BUILD_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "NEXT_PUBLIC_APP_URL"
        value = "$${APP_URL}"
        scope = "BUILD_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "GRADIENT_AGENT_KEY_COUNSEL"
        value = var.gradient_agent_key_counsel
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_URL_COUNSEL"
        value = var.gradient_agent_url_counsel
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      routes {
        path = "/"
      }
    }

    # ── API (Express) ─────────────────────────────────────────────
    service {
      name               = "api"
      environment_slug   = "node-js"
      instance_count     = 1
      instance_size_slug = "apps-s-1vcpu-0.5gb"
      source_dir         = "packages/api"

      github {
        repo           = var.github_repo
        branch         = var.github_branch
        deploy_on_push = true
      }

      build_command = "npm install && npm run build"
      run_command   = "npm start"

      health_check {
        http_path             = "/health"
        initial_delay_seconds = 30
        period_seconds        = 30
        failure_threshold     = 3
      }

      env {
        key   = "NODE_ENV"
        value = "production"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "API_PORT"
        value = "8080"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "DATABASE_URL"
        value = digitalocean_database_cluster.postgres.uri
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "DIGITALOCEAN_API_TOKEN"
        value = var.do_token
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_MODEL_ACCESS_KEY"
        value = var.gradient_model_access_key
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_KEY_SENTINEL"
        value = var.gradient_agent_key_sentinel
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_URL_SENTINEL"
        value = var.gradient_agent_url_sentinel
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "GRADIENT_AGENT_KEY_EVIDENCE"
        value = var.gradient_agent_key_evidence
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_URL_EVIDENCE"
        value = var.gradient_agent_url_evidence
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "GRADIENT_AGENT_KEY_REMEDIATION"
        value = var.gradient_agent_key_remediation
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_URL_REMEDIATION"
        value = var.gradient_agent_url_remediation
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "GRADIENT_AGENT_KEY_COUNSEL"
        value = var.gradient_agent_key_counsel
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_URL_COUNSEL"
        value = var.gradient_agent_url_counsel
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "DO_SPACES_KEY"
        value = var.do_spaces_key
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "DO_SPACES_SECRET"
        value = var.do_spaces_secret
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "DO_SPACES_ENDPOINT"
        value = "https://${var.do_region}.digitaloceanspaces.com"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "DO_SPACES_BUCKET"
        value = digitalocean_spaces_bucket.evidence.name
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "DO_SPACES_CDN_ENDPOINT"
        value = "https://${digitalocean_spaces_bucket.evidence.name}.${var.do_region}.cdn.digitaloceanspaces.com"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "SLACK_WEBHOOK_URL"
        value = var.slack_webhook_url
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      routes {
        path = "/api"
      }
      routes {
        path = "/health"
      }
    }

    # ── Sentinel Cron Worker ─────────────────────────────────────
    worker {
      name               = "sentinel-worker"
      environment_slug   = "node-js"
      instance_count     = 1
      instance_size_slug = "apps-s-1vcpu-0.5gb"
      source_dir         = "packages/api"

      github {
        repo           = var.github_repo
        branch         = var.github_branch
        deploy_on_push = true
      }

      build_command = "npm install && npm run build"
      run_command   = "node dist/workers/sentinel-cron.js"

      env {
        key   = "NODE_ENV"
        value = "production"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "DATABASE_URL"
        value = digitalocean_database_cluster.postgres.uri
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_KEY_SENTINEL"
        value = var.gradient_agent_key_sentinel
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_URL_SENTINEL"
        value = var.gradient_agent_url_sentinel
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "GRADIENT_AGENT_KEY_EVIDENCE"
        value = var.gradient_agent_key_evidence
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_URL_EVIDENCE"
        value = var.gradient_agent_url_evidence
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
      env {
        key   = "GRADIENT_AGENT_KEY_REMEDIATION"
        value = var.gradient_agent_key_remediation
        scope = "RUN_TIME"
        type  = "SECRET"
      }
      env {
        key   = "GRADIENT_AGENT_URL_REMEDIATION"
        value = var.gradient_agent_url_remediation
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
    }

    # ── DB Migration Job (runs on every deploy, before services start) ──
    job {
      name               = "db-migrate"
      environment_slug   = "node-js"
      instance_count     = 1
      instance_size_slug = "apps-s-1vcpu-0.5gb"
      source_dir         = "packages/api"
      kind               = "PRE_DEPLOY"

      github {
        repo           = var.github_repo
        branch         = var.github_branch
        deploy_on_push = true
      }

      build_command = "npm install"
      run_command   = "npx drizzle-kit push"

      env {
        key   = "DATABASE_URL"
        value = digitalocean_database_cluster.postgres.uri
        scope = "RUN_TIME"
        type  = "SECRET"
      }
    }
  }
}
