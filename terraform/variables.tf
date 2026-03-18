# ── DigitalOcean core ───────────────────────────────────────────────────────
variable "do_token" {
  description = "DigitalOcean personal access token (read+write scopes)"
  type        = string
  sensitive   = true
}

variable "do_region" {
  description = "DigitalOcean region slug. ams3 (Amsterdam) is required for EU data residency under DORA/GDPR."
  type        = string
  default     = "ams3"

  validation {
    condition     = contains(["ams3", "fra1", "lon1"], var.do_region)
    error_message = "Region must be a European DO region (ams3, fra1, or lon1) for DORA/GDPR compliance. ams3 (Amsterdam) is preferred."
  }
}

# ── GitHub ──────────────────────────────────────────────────────────────────
variable "github_repo" {
  description = "GitHub repo in owner/repo format"
  type        = string
  default     = "manojmallick/gradient-guard"
}

variable "github_branch" {
  description = "Branch to deploy from"
  type        = string
  default     = "main"
}

# ── Database ────────────────────────────────────────────────────────────────
variable "db_size" {
  description = "PostgreSQL cluster size slug"
  type        = string
  default     = "db-s-1vcpu-1gb"
}

# ── DO Spaces credentials ────────────────────────────────────────────────────
variable "do_spaces_key" {
  description = "DO Spaces access key ID"
  type        = string
  sensitive   = true
}

variable "do_spaces_secret" {
  description = "DO Spaces secret access key"
  type        = string
  sensitive   = true
}

# ── Gradient AI ──────────────────────────────────────────────────────────────
variable "gradient_model_access_key" {
  description = "Gradient Serverless Inference model access key"
  type        = string
  sensitive   = true
}

# ── Gradient Agents (set AFTER `gradient agent deploy`) ─────────────────────
variable "gradient_agent_key_sentinel" {
  description = "Access key for dora-sentinel agent"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gradient_agent_url_sentinel" {
  description = "Endpoint URL for dora-sentinel agent"
  type        = string
  default     = "https://dora-sentinel.agents.do-ai.run"
}

variable "gradient_agent_key_evidence" {
  description = "Access key for evidence-forge agent"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gradient_agent_url_evidence" {
  description = "Endpoint URL for evidence-forge agent"
  type        = string
  default     = "https://evidence-forge.agents.do-ai.run"
}

variable "gradient_agent_key_remediation" {
  description = "Access key for remediation-advisor agent"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gradient_agent_url_remediation" {
  description = "Endpoint URL for remediation-advisor agent"
  type        = string
  default     = "https://remediation-advisor.agents.do-ai.run"
}

variable "gradient_agent_key_counsel" {
  description = "Access key for compliance-counsel agent"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gradient_agent_url_counsel" {
  description = "Endpoint URL for compliance-counsel agent"
  type        = string
  default     = "https://compliance-counsel.agents.do-ai.run"
}

# ── Optional integrations ────────────────────────────────────────────────────
variable "slack_webhook_url" {
  description = "Slack incoming webhook URL for P1/P2 alerts (optional)"
  type        = string
  sensitive   = true
  default     = ""
}
