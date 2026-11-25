# IntegrityOps: Multi-Tenant Lead Hygiene, FinOps & Voice AI Platform

[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_Docker-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Playwright](https://img.shields.io/badge/E2E-Playwright-2EAD33?style=flat&logo=playwright)](https://playwright.dev/)
[![Vapi AI](https://img.shields.io/badge/Voice_AI-Vapi.ai-00D2A0?style=flat)](https://vapi.ai)

> **System 4** of the Senior CRM Automation & Full-Stack Systems Engineering Portfolio.  
> An enterprise B2B RevOps operations portal built for marketing agencies managing multi-client GoHighLevel sub-accounts across **US (TCPA)**, **AU (Spam Act 2003)**, and **UK (PECR/GDPR)**.

---

## 💼 The Business Problem & ROI (Why Agencies Pay For Lead Integrity Ops)

Agencies spending \$10k–\$50k/month on Meta/Google ads and aged lead lists face four expensive production failures when dumping raw leads directly into GoHighLevel:

1. **Statutory Compliance Fines (\$500–\$2,200 per violation):** A homeowner submits a new web form while their spouse opted out last month on the same landline. Naive CRMs text the household anyway. **IntegrityOps enforces cluster-wide DNC quarantine and hard pre-dial voice blocks.**
2. **Duplicate Ad & Enrichment Spend:** The same prospect submits 3 forms across Meta Ads, website chat, and CSV exports—triggering 3× paid property lookups (\$0.05–\$0.15 each) and causing multiple sales reps to awkwardly call the same homeowner. **IntegrityOps deduplicates deterministically across E.164 phone/email/address tiers and serves repeat lookups from a \$0.00 local property cache.**
3. **Silent Data Fabrication & Runaway Bills:** When third-party enrichment APIs go down (503) or monthly budgets exhaust, brittle pipelines either crash (dropping paid leads) or silently invent fake numbers. **IntegrityOps degrades honestly: cache misses save cleanly as `UNENRICHED_DEGRADED` with `propertyEnrichment: null` (zero fabricated fields), sync safely to CRM so zero leads are lost, and queue into a 1-click Backfill Queue.**
4. **Lost Dormant Revenue & Zero Auditability:** Unformatted phones, typos (`gmial.com`), and stale >2-year quotes bury \$100k+ in recoverable homeowner estimates. **IntegrityOps enforces a two-sided reconciliation invariant (`Inbound = Clean + Merged + Quarantined + 0 Failed`) and surfaces clean dormant estimates for 1-click reactivation.**

---

## 🏛️ Engineering Architecture & Production Guarantees

### 1. Strict Multi-Tenancy & Action-Level RBAC
* **Zero IDOR / Session-Derived Tenancy:** Active workspace (`apex-roofing` US `$`, `summit-solar` AU `A$`, `thames-heating` UK `£`) is read strictly from encrypted `iron-session` cookies—never trusted from URL/body parameters.
* **Server-Enforced RBAC:** Roles (`OWNER`, `ADMIN`, `REVIEWER`, `VIEWER`) are verified inside every Next.js Server Action. Hiding buttons is UX, not security—`VIEWER` mutations fail closed with `403 Forbidden`, and every mutation writes an immutable audit trail with `actorName (actorRole)`.

### 2. Honest Property Enrichment Waterfall & Backfill Queue
* **Layer 1 (`ENRICHED_CACHE` — \$0.00):** Reuses verified property specs from the tenant's local address/phone cache and records genuine cache savings.
* **Layer 2 (`ENRICHED_LIVE` — \$0.05):** Calls the live property provider when under budget and healthy, caching the verified response.
* **Layer 3 (`UNENRICHED_DEGRADED` — \$0.00, Zero Fabricated Data):** On a cache miss during a 503 API Outage, FinOps Pause, or Cap Guard, property fields stay explicitly `null` (never hallucinated, never falsely counted as "cache savings"). Leads still sync with `UNENRICHED_DEGRADED` status and can be backfilled in 1 click once the API recovers.

### 3. Paginated, Searchable, Scale-Ready UI (React 19)
* **Bounded-Height Tables + Pagination + Live Search:** Dashboard Lead Operations Ledger, Clean Masters/Dormant Revival, Quarantine Queue, and Voice History all use sticky-header bounded scroll containers (`max-h`) + page controls (`8 / 25 / 50` per page) + instant search, verified under a 30-lead scale batch so 1,000+ leads never break browser usability.
* **React 19 `useOptimistic`:** Quarantine HITL actions (`Approve`, `Split`, `Permanent Block`) update instantaneously while server transactions settle.

### 4. Interactive 2-Way Voice AI Qualification Console (`/voice`) & Real Vapi Webhook
* **Live 2-Way Call Sandbox (YOU Play the Homeowner):** Talk directly to **Ash** (optional Web Speech API audio TTS) by typing custom homeowner replies or clicking realistic quick replies—testing Ash's pricing guard (never guesses quotes), `check_availability`, `book_appointment`, `transfer_to_human`, and **Mid-Call Consent Revocation** (`flag_do_not_call`).
* **Pre-Dial DNC Block vs. Mid-Call Consent Revocation:** Already-opted-out leads are **hard-blocked before dialing (0s, \$0.00)** alongside statutory calling-window hours. Previously opted-in leads who revoke consent mid-call are immediately flagged DNC, quarantined across the household cluster, and hard-blocked from all future dials.
* **Production Webhook Endpoints:**
  - `POST /api/webhooks/n8n-ingest` — constant-time HMAC-SHA256 verified lead batch ingestion (`401` on tamper, `200`/`202` with reconciliation proof).
  - `POST /api/webhooks/vapi` — secret/signature-verified Vapi real-time `tool-calls` and `end-of-call-report` handler.

### 5. PostgreSQL 16 (Docker) + Graceful Preview Fallback
* Includes [`docker-compose.yml`](docker-compose.yml) (PostgreSQL 16 Alpine + healthcheck + persistent volume) and multi-stage [`Dockerfile`](Dockerfile).
* Hydrates and writes through to PostgreSQL via Prisma (`WorkspaceSnapshot`, `Tenant`, `BudgetPolicy`, `AuditEvent`, `VoiceCallRecord`) when `DATABASE_URL` points to Postgres, and degrades cleanly to in-memory demo mode on zero-config preview deployments with live telemetry showing storage status.

---

## 🚀 Quick Start (Docker + PostgreSQL + Playwright E2E)

### 1. Start PostgreSQL 16 via Docker Compose
```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma db push
```

### 2. Run Deterministic Unit & Invariant Gates (7/7 Suites)
```bash
npm run verify
```

### 3. Build, Start, and Run Playwright E2E Browser Suite
```bash
npm run build
npx next start -p 3005
# In a second terminal:
npm run test:e2e
```

---

## 📚 Portfolio Documentation
* **Voice AI Setup Reference:** [`VAPI_CONFIGURATION_GUIDE.md`](VAPI_CONFIGURATION_GUIDE.md)
* **Lead Contracts & Schemas:** [`CONTRACTS.md`](CONTRACTS.md)
* **Technical Interview Defense & Demo Guide:** [`INTERVIEW_DEFENSE_GUIDE.md`](INTERVIEW_DEFENSE_GUIDE.md)
