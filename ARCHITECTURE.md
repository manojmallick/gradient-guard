# GradientGuard — Architecture

## Overview

GradientGuard is a **multi-agent AI compliance intelligence platform** built on
DigitalOcean Gradient™ AI. The system continuously monitors cloud infrastructure
for DORA (Digital Operational Resilience Act) threshold breaches, orchestrates
4 specialised AI agents via an A2A (Agent-to-Agent) protocol, and delivers
audit-ready evidence packages and natural language compliance Q&A.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         DigitalOcean Gradient™ AI                            │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Agent Layer (Python · LangGraph)                │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  A2A POST   ┌─────────────────┐                │   │
│  │  │  A1: DORA       │────────────►│  A2: Evidence   │──► DO Spaces   │   │
│  │  │  Sentinel       │             │  Forge          │    (PDF)       │   │
│  │  │  llama3.3-70b   │  A2A POST   └─────────────────┘                │   │
│  │  │  (cron 60s)     │────────────►┌─────────────────┐                │   │
│  │  └─────────────────┘             │  A3: Remediation│──► Slack       │   │
│  │                                  │  Advisor        │                │   │
│  │                                  │  claude-s-4-6   │                │   │
│  │                                  └─────────────────┘                │   │
│  │  ┌──────────────────────────────────────────────────┐               │   │
│  │  │  A4: Compliance Counsel  (claude-sonnet-4-5)      │◄── RAG KBs   │   │
│  │  │  DORA · NIS2 · GDPR · MAS TRM                    │               │   │
│  │  └──────────────────────────────────────────────────┘               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌───────────────────────────┐   ┌──────────────────────────────────────┐   │
│  │  Gradient Knowledge Bases │   │  Gradient Serverless Inference       │   │
│  │  · DORA (3 PDFs)          │   │  · llama3.3-70b-instruct             │   │
│  │  · NIS2 (1 PDF)           │   │  · claude-sonnet-4-5                 │   │
│  │  · GDPR (1 PDF)           │   │  · claude-sonnet-4-6                 │   │
│  │  · MAS TRM (1 PDF)        │   └──────────────────────────────────────┘   │
│  └───────────────────────────┘                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                │ PostgreSQL                     │ HTTP/SSE
                ▼                                ▼
┌──────────────────────────┐      ┌──────────────────────────────┐
│  DO Managed PostgreSQL   │◄────►│  Node.js API  (Express)      │
│  · incidents             │      │  · /api/incidents  (REST)    │
│  · compliance_scores     │      │  · /api/incidents/stream SSE │
│  · audit_log             │      │  · /api/counsel   (SSE proxy)│
└──────────────────────────┘      │  · /api/simulate             │
                                  │  · /api/compliance/score     │
                                  │  · /health                   │
                                  └──────────────┬───────────────┘
                                                 │ HTTP
                                                 ▼
                                  ┌──────────────────────────────┐
                                  │  Next.js 15  Dashboard       │
                                  │  · ComplianceGauge           │
                                  │  · IncidentFeed (SSE)        │
                                  │  · AgentTrace                │
                                  │  · EvidencePanel             │
                                  │  · CounselChat (streaming)   │
                                  │  · RoiCalculator             │
                                  │  · SimulateButton            │
                                  └──────────────────────────────┘
```

---

## Agent Specifications

### A1 — DORASentinel

| Property    | Value |
|-------------|-------|
| Language    | Python |
| Framework   | LangGraph |
| Model       | `llama3.3-70b-instruct` |
| Trigger     | HTTP POST every 60s from sentinel-worker cron |
| Role        | Polls DO infrastructure, detects DORA threshold breaches, classifies incidents, dispatches A2 + A3 in parallel |

**LangGraph execution graph:**

```
START
  └─► fetch_infrastructure_state    DO API v2: droplets, apps, databases
        └─► check_thresholds        DORA Art.11: RTO ≤ 4h, RPO ≤ 1h, avail ≥ 99.5%
              ├─► [no breach] ──────────────────────────────────────────► END
              └─► [breach]
                    └─► classify_incident        P1 / P2 / P3 + DORA article mapping
                          └─► persist_incident   INSERT into PostgreSQL → incident_id
                                └─► dispatch_downstream_agents
                                      ├─► A2A POST → EvidenceForge  (parallel)
                                      └─► A2A POST → RemediationAdvisor (parallel)
                                                                    └─► END
```

**DORA thresholds checked (Article 11):**

| Metric       | Threshold    | Breach severity |
|--------------|--------------|-----------------|
| RTO          | ≤ 4 hours    | P1 if RPO also breached, else P2 |
| RPO          | ≤ 1 hour     | P1 if RTO also breached, else P2 |
| Availability | ≥ 99.5%      | P2 |
| MTTD         | ≤ 2 hours    | P3 |

---

### A2 — EvidenceForge

| Property    | Value |
|-------------|-------|
| Language    | Python |
| Framework   | LangGraph |
| Model       | `claude-sonnet-4-5` |
| Trigger     | A2A HTTP POST from A1 `dispatch_downstream_agents` |
| Role        | Fetches app logs, builds incident timeline, queries DORA KB via RAG, generates PDF evidence package, uploads to DO Spaces |

**LangGraph execution graph:**

```
START
  └─► fetch_logs_and_metrics       DO API: App Platform logs (last 50 entries)
        └─► build_incident_timeline  LLM: structured chronological events JSON
              └─► query_dora_kb      RAG: top-3 chunks per DORA article from KB
                    └─► generate_pdf   reportlab: A4 PDF with timeline + citations
                          └─► upload_to_spaces   DO Spaces: private + presigned URL (24h)
                                └─► update_incident_record   UPDATE incidents SET evidence_url
                                                                              └─► END
```

**PDF evidence package sections:**
1. Executive Summary (incident ID, severity, breach count)
2. Incident Timeline (timestamp / event / system / impact table)
3. DORA Regulation Citations (RAG-retrieved article text)
4. Attestation (DORA Article 17 compliance statement)

---

### A3 — RemediationAdvisor

| Property    | Value |
|-------------|-------|
| Language    | Python |
| Framework   | LangGraph |
| Model       | `claude-sonnet-4-6` |
| Trigger     | A2A HTTP POST from A1 (parallel with A2) |
| Role        | Performs root cause analysis, queries KB for DORA Article 17 remediation guidance, generates prioritised remediation plan, notifies Slack |

**LangGraph execution graph:**

```
START
  └─► analyze_root_cause          LLM: primary_cause, contributing_factors, immediate_actions
        └─► query_remediation_kb  RAG: DORA KB + incidents KB (Article 17 runbooks)
              └─► generate_remediation_plan  LLM: step-by-step plan with owner + dora_article
                    └─► estimate_recovery_time  Σ(step.estimated_minutes), floor 15min
                          └─► update_incident   UPDATE incidents SET root_cause, remediation_plan
                                └─► notify_slack   POST to SLACK_WEBHOOK_URL (if set)
                                                                          └─► END
```

---

### A4 — ComplianceCounsel

| Property    | Value |
|-------------|-------|
| Language    | Python |
| Framework   | LangGraph |
| Model       | `claude-sonnet-4-5` |
| Trigger     | HTTP POST from frontend chat via `/api/counsel` SSE proxy |
| Role        | Multi-turn RAG Q&A over DORA, NIS2, GDPR, MAS TRM; supports gap reports and incident history summaries |

**LangGraph execution graph:**

```
START
  └─► classify_query_intent
        ├─► [chat / gap_report / matrix]
        │     └─► rag_retrieve    Query all 4 KBs, top-8 chunks by relevance score
        │           └─► generate_grounded_answer   LLM: cited answer with article refs
        │                                                                   └─► END
        └─► [history]
              └─► query_incident_history   SELECT last 20 incidents from PostgreSQL
                    └─► summarize          LLM: trend analysis for compliance officer
                                                                          └─► END
```

**Knowledge bases queried:**

| KB | Contents | Regulation |
|----|----------|------------|
| `GRADIENT_KB_DORA_ID` | 3 PDFs — Regulation, RTS, ITS | EU 2022/2554 |
| `GRADIENT_KB_NIS2_ID` | NIS2 Directive | EU 2022/2555 |
| `GRADIENT_KB_GDPR_ID` | Articles 32 + 35 | EU 2016/679 |
| `GRADIENT_KB_MAS_ID`  | MAS TRM Guidelines 2021 | MAS Singapore |

---

## Data Flow

### Incident Detection → Evidence → Remediation (Happy Path)

```
sentinel-worker (cron 60s)
  │
  └─► POST /run → A1:DORASentinel
                    │
                    ├─► DO API v2 (droplets / apps / databases)
                    ├─► PostgreSQL INSERT → incident_id
                    ├─► SSE broadcast → dashboard
                    │
                    ├─► A2A POST → A2:EvidenceForge
                    │               ├─► DO API (app logs)
                    │               ├─► Gradient KB (DORA RAG)
                    │               ├─► reportlab PDF
                    │               ├─► DO Spaces upload
                    │               └─► PostgreSQL UPDATE evidence_url
                    │
                    └─► A2A POST → A3:RemediationAdvisor
                                    ├─► Gradient KB (Article 17 RAG)
                                    ├─► LLM root cause analysis
                                    ├─► LLM remediation plan
                                    ├─► PostgreSQL UPDATE remediation_plan
                                    └─► Slack webhook notification
```

### Compliance Q&A Flow

```
User (browser)
  │
  └─► POST /api/counsel { question }
        │
        └─► Express API streamCounselResponse()
              │
              └─► @digitalocean/gradient SSE stream
                    │
                    └─► A4:ComplianceCounsel
                          ├─► classify_query_intent
                          ├─► RAG over 4 KBs
                          └─► grounded answer with citations
                                    │
                         SSE delta chunks ──► browser (CounselChat.tsx)
```

---

## API Reference

### Express API (`packages/api`) — port 3001

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/incidents` | List incidents (`?severity=P1&status=open`) |
| `GET` | `/api/incidents/:id` | Single incident with full detail |
| `POST` | `/api/incidents` | Create incident manually |
| `PUT` | `/api/incidents/:id` | Update incident status |
| `GET` | `/api/incidents/stream` | SSE stream — real-time incident events |
| `GET` | `/api/evidence/:id` | Presigned PDF URL for incident evidence |
| `POST` | `/api/counsel` | Proxy to A4 — returns SSE delta stream |
| `POST` | `/api/simulate` | Trigger demo P1 incident (broadcasts via SSE) |
| `GET` | `/api/compliance/score` | Live DORA score (0–100) + per-article breakdown |
| `GET` | `/health` | Health check for App Platform |

### Compliance Score Algorithm

```
score = 100
for each open incident:
  deduction = P1 → 20pts | P2 → 10pts | P3 → 5pts
  score = max(0, score − deduction)
  per-article breakdown updated proportionally
```

---

## Database Schema

**Engine:** DigitalOcean Managed PostgreSQL 16 · region `ams3`
**ORM:** Drizzle ORM · migrations via `drizzle-kit push`

```
incidents
├── id                    UUID PK
├── severity              VARCHAR(3)          P1 | P2 | P3
├── dora_articles         JSONB               ["Article 11(3)", ...]
├── details               JSONB               raw breach objects from A1
├── status                VARCHAR(20)         open | investigating | resolved | closed
├── detected_at           TIMESTAMPTZ
├── resolved_at           TIMESTAMPTZ
├── evidence_url          TEXT                DO Spaces presigned URL (set by A2)
├── evidence_generated_at TIMESTAMPTZ
├── root_cause            JSONB               RCA output from A3
├── remediation_plan      JSONB               step-by-step plan from A3
├── estimated_rto_minutes INT
└── remediation_generated_at TIMESTAMPTZ

compliance_scores
├── id             UUID PK
├── score          INT                 0–100
├── breakdown      JSONB               per-article scores
└── calculated_at  TIMESTAMPTZ

audit_log
├── id             UUID PK
├── action         VARCHAR(100)
├── actor          VARCHAR(50)         agent:dora_sentinel | user:api
├── resource_type  VARCHAR(50)
├── resource_id    TEXT
├── payload        JSONB
└── created_at     TIMESTAMPTZ
```

**Indexes:**
```sql
idx_incidents_severity     ON incidents(severity)
idx_incidents_detected_at  ON incidents(detected_at DESC)
idx_incidents_status       ON incidents(status)
```

---

## Infrastructure (Terraform-managed)

**Provider:** DigitalOcean · region `ams3`
**State:** DO Spaces bucket `gradient-guard-tf-state`

| Resource | Type | Purpose |
|----------|------|---------|
| `digitalocean_spaces_bucket.tf_state` | Spaces | Terraform remote state |
| `digitalocean_spaces_bucket.evidence` | Spaces | PDF evidence packages |
| `digitalocean_database_cluster.postgres` | Managed DB | PostgreSQL 16 cluster |
| `digitalocean_database_db.gradientguard` | DB | Application schema |
| `digitalocean_database_firewall.postgres` | Firewall | Restrict to App Platform only |
| `digitalocean_app.gradient_guard` | App Platform | All services + job |

### App Platform Services

| Service | Type | Source | Port | Instance |
|---------|------|--------|------|----------|
| `web` | Web service | `packages/web` | 443 | apps-s-1vcpu-0.5gb |
| `api` | Web service | `packages/api` | 3001 | apps-s-1vcpu-0.5gb |
| `sentinel-worker` | Worker | `packages/api` | — | apps-s-1vcpu-0.5gb |
| `db-migrate` | Job (PRE_DEPLOY) | `packages/api` | — | — |

---

## Frontend Components

**Framework:** Next.js 15 · App Router · Tailwind CSS

| Component | File | Description |
|-----------|------|-------------|
| `ComplianceGauge` | `components/ComplianceGauge.tsx` | Animated SVG radial gauge 0–100, colour-coded by score |
| `IncidentFeed` | `components/IncidentFeed.tsx` | SSE-connected live feed, slide-in animations, detail drawer |
| `AgentTrace` | `components/AgentTrace.tsx` | LangGraph node execution visualiser (pending → running → done) |
| `EvidencePanel` | `components/EvidencePanel.tsx` | Evidence package browser + PDF download from DO Spaces CDN |
| `CounselChat` | `components/CounselChat.tsx` | Streaming multi-turn chat with markdown + citation cards |
| `RoiCalculator` | `components/RoiCalculator.tsx` | Cost savings calculator (Deloitte 2024 DORA study) |
| `SimulateButton` | `components/SimulateButton.tsx` | Triggers demo P1 incident via `POST /api/simulate` |
| `DoProductBadge` | `components/DoProductBadge.tsx` | Active DO product usage indicator |

### Real-time Architecture (SSE)

```
IncidentFeed.tsx
  └─► EventSource → GET /api/incidents/stream  (Next.js route proxy)
        └─► Express SSE handler
              └─► sse.ts broadcast()  ← called by A1 after incident persist
                                         called by /api/simulate
```

---

## Security Model

| Concern | Implementation |
|---------|----------------|
| Agent authentication | Bearer token per agent (`GRADIENT_AGENT_KEY_*`) |
| Database access | DO Managed PG firewall — App Platform IPs only |
| Evidence storage | DO Spaces private ACL + 24h presigned URLs |
| Environment secrets | App Platform encrypted env vars (never in code) |
| SSL | `sslmode=require` on all DB connections |
| CORS | Express CORS middleware — API URL allowlist |

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Agent runtime | Python 3.11 · gradient-adk · LangGraph 0.2 |
| Agent inference | DigitalOcean Gradient™ Serverless Inference |
| Knowledge retrieval | DigitalOcean Gradient™ Knowledge Bases |
| Observability | DigitalOcean Gradient™ ADK Traces (`@trace`) |
| Evaluations | DigitalOcean Gradient™ Agent Evaluate |
| API | Node.js 20 · Express · TypeScript · Drizzle ORM |
| Frontend | Next.js 15 · React 19 · Tailwind CSS |
| Database | DigitalOcean Managed PostgreSQL 16 |
| Object storage | DigitalOcean Spaces (S3-compatible) + CDN |
| Hosting | DigitalOcean App Platform |
| Infrastructure | Terraform + DigitalOcean provider |
| CI/CD | GitHub Actions (ci.yml · deploy.yml · evaluate.yml) |
| PDF generation | reportlab 4.2 |
| HTTP client | httpx (Python) · fetch (Node.js) |
| Env validation | Zod (Node.js) |
