terraform {
  required_version = ">= 1.7.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.43"
    }
  }

  # Local backend — state cached in GitHub Actions between runs.
  # Only DIGITALOCEAN_API_TOKEN is required; no Spaces credentials needed.
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "digitalocean" {
  # DIGITALOCEAN_API_TOKEN env var is sufficient — no Spaces credentials needed.
  token = var.do_token
}

# ── Read existing App Platform app (managed via .do/app.yaml + deploy_on_push)
# This is read-only. Terraform does not create or modify the app or its
# components (web, api, sentinel-worker, managed DB). All infra changes go
# through .do/app.yaml. Terraform is used only to verify and export outputs.
data "digitalocean_app" "gradient_guard" {
  app_id = var.app_id
}

