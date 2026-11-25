# IntegrityOps: Enterprise Multi-Tenant Lead Hygiene, FinOps & Voice AI Platform

[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_Docker-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Playwright](https://img.shields.io/badge/E2E-Playwright-2EAD33?style=flat&logo=playwright)](https://playwright.dev/)
[![Vapi AI](https://img.shields.io/badge/Voice_AI-Vapi.ai-00D2A0?style=flat)](https://vapi.ai)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)

> **System 4** of the Senior CRM Automation & Full-Stack Systems Engineering Portfolio.  
> An enterprise B2B operations platform engineered for marketing agencies managing multi-client GoHighLevel (GHL) sub-accounts across **US (TCPA)**, **AU (Spam Act 2003)**, and **UK (PECR/GDPR)** jurisdictions.

---

## ⚡ 3-Minute Evaluator Cheat Sheet (For OnlineJobs.ph / Technical Reviewers)

If you have 180 seconds to test technical depth and business value, follow this exact click path:

| Step | Action to Test | What Happens Under the Hood | Technical Proof |
| :--- | :--- | :--- | :--- |
| **1** | **Switch Agency Sub-Account** *(Top of Sidebar)* | Switch between `Apex Roofing TX` ($ / TCPA), `Summit Solar AU` (A$ / Spam Act), and `Thames Heating UK` (£ / PECR). | Encrypted `iron-session` changes tenant context; currency formatting, legal statutory disclaimers, and telephone masks update without page flicker. Zero IDOR risk. |
| **2** | **Test 503 Outage Fallback** *(Ledger Card)* | Toggle `Simulate Provider Outage (503)`, then ingest a lead without property specs. | **Honest Degradation:** Instead of crashing or faking numbers, lead is safely stored as `UNENRICHED_DEGRADED` with `propertyEnrichment: null`. When toggled back, click **`Backfill Degraded Records`** to pull live specs. |
| **3** | **Interactive 2-Way Voice AI** *(Go to `/voice`)* | Select a lead and click **`Start 2-Way Voice Call`**. Play the homeowner (mic or quick-replies) with live agent **Ash**. | Live agent runs tool calling (`check_availability`, `book_appointment`, pricing guards). Click **`Mid-Call DNC`** to test mid-call consent revocation—instantly quarantining the entire household cluster. |
| **4** | **Pre-Dial DNC Gate** *(On `/voice`)* | Attempt to dial an opted-out homeowner (`Sarah Connor`). | Hard-blocked **before dialing (0s duration, $0.00 spend)**. Prevents $500–$2,200 statutory fines per call. |
| **5** | **Test Server-Action RBAC** *(Bottom Sidebar)* | Click **`RBAC Test Harness`** to cycle role to `VIEWER`. Try to approve a quarantined lead or trigger an ingestion run. | The UI allows you to evaluate RBAC without creating 4 accounts. Server Action blocks the mutation and raises a **`403 Forbidden (Insufficient permissions)`** notification. |
| **6** | **AI Ops Copilot** *(Bottom Sidebar)* | Click **`AI Ops Copilot`** and ask: *"What is our current API spend and quarantine count?"* | RAG pipeline answers strictly grounded in the active tenant's real-time PostgreSQL operational metrics. |

---

## 💼 The Commercial Problem & ROI (Why Agencies Buy This)

Agencies spending $10k–$50k/month on Meta/Google Ads and aged homeowner lead lists lose thousands of dollars every week through four critical production failure points:

```
Raw Web Form / Meta Ad / CSV Export
           │
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        INTEGRITYOPS GATEWAY                            │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. Telephone / Address Cleansing│ E.164 normalization, typo fixing      │
│ 2. Household Clustering & Dedupe│ Links spouses & duplicate submissions │
│ 3. Pre-Dial DNC Compliance Gate │ Blocks TCPA / Spam Act violations     │
│ 4. FinOps Cost Waterfall       │ Serves from $0.00 Cache vs $0.05 Live │
│ 5. Honest 503 Provider Fallback│ Zero hallucinated data during outages │
└────────────────────────────────┬───────────────────────────────────────┘
           │
           ▼
   Clean Sync to GHL CRM + 2-Way Voice AI Qualification (Ash)
```

1. **Statutory Non-Compliance ($500–$2,200 fine per violation):**  
   A homeowner submits a new solar rebate form while their spouse opted out of calls 3 weeks prior on the same household number. Naive CRMs dial anyway. **IntegrityOps links family members via Household Clustering and hard-blocks the dial before the telecom provider connects.**
2. **Runaway Enrichment API Costs ($0.05 to $0.15 per lead):**  
   A prospect submits 3 forms across different ad campaigns. Traditional setups trigger 3 separate paid property lookups. **IntegrityOps serves repeat lookups from a $0.00 local cache and halts API billing the moment a tenant hits their monthly budget ceiling.**
3. **Silent Data Fabrication During API Outages:**  
   When external enrichment providers 503, poorly designed systems either drop the paid lead completely or inject fake property estimates. **IntegrityOps degrades honestly: leads sync cleanly with `UNENRICHED_DEGRADED` status and queue into a 1-click backfill ledger for when the API recovers.**
4. **Dormant Revenue Recovery:**  
   Old CRM leads with stale quotes (>2 years) or unformatted phones sit abandoned. IntegrityOps normalizes the contact data and surfaces high-value estimates for automated **Voice AI reactivation**.

---

## 🏛️ Senior Full-Stack Engineering Highlights

### 1. Zero-IDOR Multi-Tenancy & Action-Level RBAC
* **Session-Derived Workspace Scope:** Active tenant identity is read strictly from encrypted `iron-session` cookies on the server. Client-side URL tampering or payload spoofing cannot cross tenant boundaries.
* **Granular Role Hierarchy:**
  * `OWNER` / `ADMIN`: Full operational authority (quarantine overrides, FinOps policy edits, backfill execution).
  * `REVIEWER`: Human-In-The-Loop triage (approve, split household clusters, permanent quarantine).
  * `VIEWER`: Read-only access. All Server Action mutations fail-closed with `403 Forbidden`.
* **Reviewer Test Harness:** Includes an evaluation switcher directly in the sidebar so hiring managers can immediately verify permission gates without logging in and out of 4 accounts.

### 2. FinOps Ledger & Honest Enrichment Fallback
* **Three-Tier Fallback Hierarchy:**
  * `ENRICHED_CACHE` ($0.00): Serves known property square footage and roof age from local database.
  * `ENRICHED_LIVE` ($0.05): Calls live provider when under monthly cap.
  * `UNENRICHED_DEGRADED` ($0.00): Triggered by 503 outages or budget caps. Saves verified contact info without faking specs, allowing sales teams to work leads while queueing them for backfill.
* **1-Click Backfill Queue:** Once provider status is restored, operators click `Backfill Degraded Records` to enrich all pending leads in a single batch.

### 3. Scalable UI Architecture (React 19 & Next.js 15)
* **Bounded Layouts + Sticky Headers + Pagination:** All operational tables (Ledger, Quarantine, Reactivation, Voice History) feature fixed-height containers (`max-h-[380px]`) and `8 / 25 / 50` page controls. Ingesting 1,000+ leads will never elongate or break the browser window.
* **React 19 `useOptimistic`:** HITL quarantine actions (Approve, Split Cluster, DNC Quarantine) apply instantly in the UI while database transactions resolve asynchronously in the background.

### 4. Interactive Voice AI (Vapi Integration & Pre-Dial Compliance)
* **Real Vapi Webhook Handler (`POST /api/webhooks/vapi`):** HMAC-verified signature verification for live inbound calls, function tool calling (`check_availability`, `book_appointment`, `flag_do_not_call`), and end-of-call transcription sync.
* **2-Way Call Simulator:** Built-in interactive console where operators can speak or type as the homeowner, conversing directly with **Ash** (including Web Speech audio synthesis).
* **Mid-Call DNC Consent Revocation:** If a homeowner says *"Remove me from your list"*, Ash executes the `flag_do_not_call` tool call, immediately terminates the call, quarantines the phone number across all tenant campaigns, and blocks future dials.

---

## 📊 End-to-End Test Suite & Verification Gates

The platform enforces deterministic invariants across unit, regression, and browser integration layers.

### 1. Invariant & Unit Gates (7/7 Suites Passing)
Run deterministic verification scripts covering FinOps capping, household clustering, TCPA hours, and 503 fallback:
```bash
npm run verify
```
```
[PASS] Suite 1: Phone & Address Normalization (E.164, UK/AU masks)
[PASS] Suite 2: Household Dedupe & Fuzzy Matching
[PASS] Suite 3: TCPA Calling Window & Pre-Dial DNC Gates
[PASS] Suite 4: FinOps Budget Capping & Ledger Accounting
[PASS] Suite 5: Honest 503 Enrichment Degradation & Backfill
[PASS] Suite 6: RBAC Server Action 403 Enforcement
[PASS] Suite 7: HMAC-SHA256 Webhook Integrity & Tamper Rejection
```

### 2. Playwright End-to-End Browser Tests (6/6 Suites Passing)
Comprehensive automated browser tests validating user workflows in headless Chromium:
```bash
npm run test:e2e
```
* **Test 1:** Agency Sub-Account Switching (verifies currency, locale, and legal disclaimer updates).
* **Test 2:** Intake Modal & Ingestion Ledger (verifies bounded scroll and pagination).
* **Test 3:** 503 Enrichment Outage & 1-Click Backfill (verifies zero data hallucination).
* **Test 4:** RBAC Security Gate (verifies `VIEWER` role receives `403 Forbidden` on mutation).
* **Test 5:** Interactive Voice AI Console & Pre-Dial DNC Hard-Block.
* **Test 6:** AI Ops Copilot (verifies slide-over drawer and grounded RAG responses).

---

## 🛠️ Local Development & Docker Deployment

### Prerequisites
* Node.js 20+
* Docker Desktop & Docker Compose (Optional for local PostgreSQL)

### 1. Clone & Configure Environment
```bash
git clone https://github.com/bagguattee/lead-integrity-ops-platform.git
cd lead-integrity-ops-platform
cp .env.example .env
npm install
```

### 2. Start PostgreSQL 16 via Docker (Optional)
```bash
docker compose up -d
npx prisma db push
```
*(Note: If Docker is not running, IntegrityOps automatically defaults to zero-config in-memory state with live storage telemetry in the UI).*

### 3. Run Development Server
```bash
npm run dev
# Open http://localhost:3000
```

### 4. Build Production Bundle
```bash
npm run build
npm start
```

---

## 📂 Project Structure

```
├── docker-compose.yml           # PostgreSQL 16 Alpine container configuration
├── Dockerfile                   # Multi-stage production container build
├── prisma/
│   └── schema.prisma            # Tenants, Memberships, IngestionRuns, VoiceCallRecords
├── tests/
│   └── e2e/
│       └── platform.spec.ts     # Playwright 6-suite browser regression suite
├── scripts/
│   └── verify-all.ts            # Deterministic 7-suite invariant gate
└── src/
    ├── app/
    │   ├── actions.ts           # Server Actions (RBAC enforced, optimistic)
    │   ├── api/
    │   │   ├── webhooks/
    │   │   │   ├── n8n-ingest/  # HMAC-SHA256 lead ingestion webhook
    │   │   │   └── vapi/        # Vapi Voice AI tool-call & transcription webhook
    │   ├── (dashboard)/         # App Router routes (/dashboard, /runs, /quarantine, etc.)
    │   └── layout.tsx           # Global shell & font configuration
    ├── components/
    │   ├── shell-navigation.tsx # Multi-tenant switcher + Demo RBAC Test Harness
    │   ├── dashboard-client.tsx # FinOps balance, bounded ledger & pagination
    │   ├── voice-client.tsx     # 2-way interactive Voice AI console + Vapi simulator
    │   ├── quarantine-table.tsx # React 19 optimistic HITL triage
    │   └── copilot-drawer.tsx   # Tenant-scoped AI Ops RAG drawer
    ├── contracts/
    │   └── lead-contracts.ts    # Zod schemas, LeadPayload, TenantSettings
    └── lib/
        ├── auth.ts              # Session reading & Server Action RBAC assertion
        ├── finops.ts            # Ledger debiting & budget cap calculations
        ├── pipeline-engine.ts   # Cleansing, deduplication, and routing waterfall
        ├── voice.ts             # Vapi tool handlers & pre-dial compliance checks
        └── store.ts             # State persistence (PostgreSQL / In-Memory fallback)
```

---

## 📑 Technical Documentation & References
* **Voice AI Architecture & Vapi Setup:** [`VAPI_CONFIGURATION_GUIDE.md`](VAPI_CONFIGURATION_GUIDE.md)
* **Lead Contracts & Type Specifications:** [`CONTRACTS.md`](CONTRACTS.md)
* **System Design & Interview Defense Notes:** [`INTERVIEW_DEFENSE_GUIDE.md`](INTERVIEW_DEFENSE_GUIDE.md)
