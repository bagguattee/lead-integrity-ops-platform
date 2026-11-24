# IntegrityOps: Multi-Tenant Lead Hygiene, FinOps & Voice AI Platform

[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?style=flat&logo=prisma)](https://www.prisma.io/)
[![Vapi AI](https://img.shields.io/badge/Voice_AI-Vapi.ai-00D2A0?style=flat)](https://vapi.ai)

> **System 4** of the Senior CRM Automation & RevOps Systems Engineering Portfolio.  
> An enterprise-grade RevOps operations portal built with a Figma-inspired visual design system. Provides multi-tenant lead hygiene, entity resolution, human-in-the-loop (HITL) quarantine resolution, real-time FinOps spend controls, and an integrated Voice AI qualification agent.

---

## 🏛️ Executive Architecture & Core Highlights

### 1. Multi-Tenant Sub-Account Architecture
* **Strict Cross-Tenant Isolation**: Instant context switching between **Apex Roofing TX** (United States • TCPA compliance • `+1 E.164`), **Summit Solar AU** (Australia • DNCR Spam Act • `+61 E.164`), and **Thames Heating UK** (United Kingdom • PECR/GDPR • `+44 E.164`).
* **Session-Derived Tenancy**: Secured with encrypted `iron-session` cookies. No URL or client-provided body parameters can spoof workspace boundaries.
* **Action-Level RBAC**: Role-based permissions (`OWNER`, `ADMIN`, `REVIEWER`, `VIEWER`) re-validated server-side on every mutation.

### 2. Deterministic Entity Resolution & Ingestion Pipeline
* **Multi-Tier Deduplication**: Tier 1 exact match (phone/email), Tier 2 normalized fuzzy match (address + surname).
* **Shared Commercial Hub Isolation**: Detects broker and corporate lines with >3 distinct household names, isolating them into sub-clusters to prevent false deduplication.
* **Stale Record Protection**: 5-year time-gap demotion flag prevents legacy customer records from overwriting active homeowner files.
* **Compliance Overrides Revenue**: Immediate cluster-wide quarantine propagation upon receiving any TCPA/DNC opt-out request.

### 3. Two-Sided Mathematical Reconciliation Invariant
$$\text{Total Inbound} = \text{Clean Masters} + \text{Merged Duplicates} + \text{Quarantined Records} + \text{System Failures (0)}$$
* Built-in reconciliation engine enforces that **every single ingested payload** is mathematically accounted for in real time across the ledger, analytics charts, and the AI Ops Copilot drawer.

### 4. Pre-Flight FinOps Circuit Breaker
* **Budget Telemetry**: Monitors external API spend (property enrichment, skip tracing) against monthly caps with custom threshold alerting (e.g. 80%).
* **Autonomous Fallback**: When monthly budgets are exhausted or paused (e.g., Thames Heating UK demo), the platform automatically engages **Cache-Only Guard Mode** ($0.00 marginal spend).

### 5. Integrated Voice AI Qualification Agent (`/voice`)
* **Dual Telephony Mode**:
  - **Live Vapi Telephony**: Integrates with [Vapi.ai](https://vapi.ai) REST endpoints (`POST /api/call`) and inbound webhook signatures (`/api/webhooks/vapi`).
  - **Deterministic Showcase Simulator**: Allows zero-cost interactive testing of voice outreach, multi-turn dialogue, tool calls (`check_availability`, `book_appointment`), and compliance opt-out handling without carrier charges.
* **Pre-Dial Compliance Gating**: Automatically enforces statutory calling windows (e.g., 8:00 AM – 9:00 PM local time per area code) and checks contact frequency before dialing.

---

## 📸 Platform Tour & Visual Interface

| Surface | Description | Highlights |
| :--- | :--- | :--- |
| **Balance & Ledger (`/dashboard`)** | Main agency operations overview matching Figma executive standard | 14-day stacked activity bars, FinOps donut gauge, 3-column sub-account switcher, real-time lead ledger. |
| **Voice AI Agent (`/voice`)** | Voice outreach console & qualification auditor | Pre-dial calling window gatekeeper, live dialogue transcripts, autonomous tool call tracking, appointment booking. |
| **Quarantine Queue (`/quarantine`)** | Human-in-the-Loop (HITL) exception triage | Side-by-side field diff viewer, one-click approved sync, split master, or permanent DNC blocking. |
| **Ingestion Runs (`/runs`)** | Batch lineage and execution auditor | Full row-level lineage inspector displaying normalization, dedupe tiers, and FinOps cache savings. |
| **Dormant Revival (`/reactivation`)** | Pipeline reactivation console | Dispatches dormant past leads (>180 days) directly into automated GoHighLevel nurture sequences. |
| **RBAC & FinOps (`/settings`)** | Workspace governance & budget controls | Monthly cap configuration, Cache-Only circuit toggle, team management, and immutable audit log. |

---

## 🛠️ Environment Configuration (`.env`)

```env
# Database Configuration (PostgreSQL on Vercel, SQLite in local development)
DATABASE_URL="file:./dev.db"

# Session Security Secret (32+ characters)
SESSION_SECRET="complex_password_at_least_32_characters_long_for_security_123456"

# App Public URL
NEXT_PUBLIC_APP_URL="http://localhost:3005"

# Webhook Shared Signing Secret (for verifying n8n HMAC-SHA256 signatures)
WEBHOOK_DEFAULT_SECRET="whsec_enterprise_resilient_pipeline_secret_test_key"

# Optional LLM Key for Fast Triage (Groq)
GROQ_API_KEY=""

# ─────────────────────────────────────────────────────────────────────────────
# Vapi Voice AI Configuration
# ─────────────────────────────────────────────────────────────────────────────
# When keys are supplied, live outbound calls can be initiated.
# If PHONE_NUMBER_ID is omitted, it operates in Showcase Simulation Mode ($0.00 cost).
VAPI_API_KEY=""
VAPI_ASSISTANT_ID=""
VAPI_PHONE_NUMBER_ID=""
VAPI_WEBHOOK_SECRET="whsec_vapi_voice_ai_lead_qualification_audit"
```

For detailed assistant prompts, slot definitions, and first messages, refer to [`VAPI_CONFIGURATION_GUIDE.md`](VAPI_CONFIGURATION_GUIDE.md).

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies & Generate Prisma Client
```bash
npm install
npm run prisma:push
npm run prisma:seed
```

### 2. Run Verification Suite (All 7 Quality Gates)
```bash
npm run verify
```

### 3. Run Production Build
```bash
npm run build
npm run start
```
Open [http://localhost:3005](http://localhost:3005) in your browser.

---

## 📚 Portfolio Documentation
* **Voice AI Setup Reference**: [`VAPI_CONFIGURATION_GUIDE.md`](VAPI_CONFIGURATION_GUIDE.md)
* **Lead Contracts & Schemas**: [`CONTRACTS.md`](CONTRACTS.md)
* **Technical Interview Defense & 3-Minute Script**: [`INTERVIEW_DEFENSE_GUIDE.md`](INTERVIEW_DEFENSE_GUIDE.md)
