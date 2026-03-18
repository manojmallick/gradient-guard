# GradientGuard

> **DORA Compliance Intelligence Platform** — Built on DigitalOcean Gradient™ AI

**22,000 EU financial institutions. €2.4 million average annual compliance cost. January 2025: DORA became law. Most SMB fintechs still manage this manually. GradientGuard changes that — built in 72 hours on DigitalOcean Gradient™ AI.**

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/manojmallick/gradient-guard/tree/main)

**Live Demo:** https://gradient-guard.ondigitalocean.app  
**Builder:** Manoj Mallick · Amsterdam · 15 years FinTech (ING Netherlands, ABN AMRO)

---

## What It Does

GradientGuard is a production-ready, multi-agent AI compliance platform that:

- **Monitors** cloud infrastructure 24/7 for DORA Article 11 threshold breaches (RTO/RPO/availability)
- **Detects** ICT incidents in real time and auto-classifies by severity (P1/P2/P3)
- **Generates** PDF audit evidence packages with DORA article citations (stored in DO Spaces)
- **Advises** on root cause and remediation steps with estimated recovery times
- **Answers** natural language compliance questions via RAG over DORA/NIS2/GDPR/MAS regulations

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DigitalOcean Gradient™ AI                    │
│                                                                 │
│  ┌─────────────┐  A2A  ┌──────────────┐                        │
│  │ A1: DORA    │──────►│ A2: Evidence │                        │
│  │  Sentinel   │       │   Forge      │──► DO Spaces (PDF)     │
│  │  (Monitor)  │──────►│              │                        │
│  └──────┬──────┘  A2A  └──────────────┘                        │
│         │              ┌──────────────┐                        │
│         └─────────────►│ A3: Remediat │──► Slack Webhook       │
│                        │   ion Advisor│                        │
│                        └──────────────┘                        │
│  ┌──────────────────────────────────────┐                      │
│  │ A4: Compliance Counsel (RAG Q&A)     │◄── Knowledge Bases   │
│  │ DORA + NIS2 + GDPR + MAS TRM        │    (4 regulation KBs) │
│  └──────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
┌────────────────┐      ┌──────────────────┐
│  Node.js API   │      │  DO Managed PG   │
│  (Express/SSE) │◄────►│  (Incidents DB)  │
└────────────────┘      └──────────────────┘
         │
         ▼
┌────────────────┐
│  Next.js 15    │
│  Dashboard     │
│  (App Platform)│
└────────────────┘
```

---

## DigitalOcean Products Used

| Product | How Used |
|---------|----------|
| **Gradient™ AI Agents (ADK)** | All 4 compliance agents deployed via `gradient agent deploy` |
| **Gradient™ Serverless Inference** | LLM calls: llama3.3-70b, claude-sonnet-4-5, claude-sonnet-4-6 |
| **Gradient™ Knowledge Bases** | RAG over DORA, NIS2, GDPR, MAS TRM regulatory PDFs |
| **Gradient™ Agent Evaluate** | Automated eval on ComplianceCounsel + DORASentinel |
| **Gradient™ ADK Traces** | Every LangGraph node instrumented with `@trace` |
| **App Platform** | Web + API + cron worker all deployed from monorepo |
| **Managed PostgreSQL** | Incident records, compliance scores, audit log |
| **Spaces (Object Storage)** | PDF evidence packages, CDN delivery |

---

## Quick Start

### Prerequisites
- DigitalOcean account with Gradient ADK preview enabled
- Node.js 20+, Python 3.11+
- Docker Desktop (for local PostgreSQL)

### Local Development

```bash
# 1. Clone
git clone https://github.com/manojmallick/gradient-guard
cd gradient-guard

# 2. Configure environment
cp .env.example .env
# Fill in your DO API token and Gradient keys

# 3. Start local PostgreSQL
docker-compose up -d

# 4. Install dependencies
cd packages/api && npm install
cd ../web && npm install
cd ../agents/dora_sentinel && pip install -r requirements.txt
# Repeat for other agents...

# 5. Run DB migrations
cd packages/api && npx drizzle-kit push

# 6. Seed knowledge bases (requires PDFs in knowledge-bases/)
python knowledge-bases/seed.py

# 7. Seed demo incidents
cd packages/api && npx ts-node scripts/seed-db.ts

# 8. Deploy agents to Gradient ADK
./scripts/deploy-agents.sh

# 9. Start services
cd packages/api && npm run dev     # http://localhost:3001
cd packages/web && npm run dev     # http://localhost:3000
```

---

## DORA Compliance Coverage

| DORA Article | Coverage |
|-------------|----------|
| **Article 3** — Definitions | KB indexed |
| **Article 11** — ICT Business Continuity (RTO/RPO) | ✅ Real-time monitoring |
| **Article 17** — ICT Incident Management | ✅ Evidence generation |
| **Article 19** — Incident Reporting | ✅ Auto-classification |
| **Article 25** — ICT Testing | ✅ Q&A coverage |
| **Article 28** — Third-party ICT Risk | ✅ KB indexed |

---

## ROI

| | Manual Compliance | GradientGuard |
|--|--|--|
| **Annual cost (100 employees)** | €120,000 | €2,160 |
| **Evidence generation time** | 4-8 hours/incident | < 2 minutes |
| **Audit readiness** | Quarterly scramble | Always-on |
| **Savings** | — | **€117,840/yr (98%)** |

_Cost estimates based on Deloitte 2024 DORA Compliance Cost Study_

---

## Project Structure

See [CLAUDE.md](CLAUDE.md) for full technical specification.

---

## Builder

**Manoj Mallick** — Solution Architect, HCL Technologies Netherlands  
15+ years FinTech experience at ING Netherlands and ABN AMRO  
Amsterdam, Netherlands

_This project does not constitute legal advice._

---

## License

Apache 2.0 — See [LICENSE](LICENSE)
