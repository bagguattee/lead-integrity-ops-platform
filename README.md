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

## ⚡ 3-Minute Evaluator Cheat Sheet (For OnlineJobs.ph / Technical Evaluators)

If you have 180 seconds to test technical depth, regulatory compliance, and business value, follow this exact click path:

| Step | Action to Test | What Happens Under the Hood | Technical Proof |
| :--- | :--- | :--- | :--- |
| **1** | **Switch Agency Sub-Account** *(Top of Sidebar)* | Switch between `Apex Roofing TX` ($ / TCPA), `Summit Solar AU` (A$ / Spam Act), and `Thames Heating UK` (£ / PECR). | Encrypted `iron-session` updates server context; currency formatting, legal statutory disclaimers, and telephone masks update without page flicker. Zero IDOR risk. |
| **2** | **Test 503 Outage Fallback** *(Ledger Card)* | Toggle `Simulate Provider Outage (503)`, then ingest a lead without property specs. | **Honest Degradation:** Instead of crashing or faking numbers, lead is safely stored as `UNENRICHED_DEGRADED` with `propertyEnrichment: null`. When toggled back, click **`Backfill Degraded Records`** to pull live specs. |
| **3** | **Interactive 2-Way Voice AI & Barge-In** *(Go to `/voice`)* | Click **`Start Live Call (You Play Customer)`**. Speak or type as homeowner. Interrupt **Ash** mid-sentence. | **Production Barge-In:** AI speech instantly halts via `speechSynthesis.cancel()`, UI accepts your reply without locking, and Ash dynamically pivots. Ash enforces pricing guardrails and autonomously invokes `check_availability` & `book_appointment`. |
| **4** | **Pre-Dial DNC Gate** *(On `/voice`)* | Attempt to dial an opted-out homeowner (`Sarah Connor`). | Hard-blocked **before dialing (0s duration, $0.00 spend)**. Prevents $500–$2,200 statutory fines per call. |
| **5** | **Test Server-Action RBAC** *(Bottom Sidebar)* | Click **`RBAC Test Harness`** to cycle role to `VIEWER`. Try to approve a quarantined lead or trigger an ingestion run. | The UI allows you to evaluate RBAC without creating 4 accounts. Server Action blocks the mutation and raises a **`403 Forbidden (Insufficient permissions)`** notification. |
| **6** | **Lead Master & Quarantine Dossiers** *(Click any row)* | Click on any Clean Master lead or Quarantined lead. | Full diagnostic dossier opens: raw vs. normalized diffs, AI Triage confidence meter, FinOps billing tier, and 1-click HITL overrides. |

---

## 💼 The Commercial Problem & ROI (Why High-Ticket Agencies Buy This)

Agencies spending $10k–$50k/month on Meta/Google Ads and aged homeowner lead lists lose thousands of dollars every week through four critical production failure points:

```
Raw Web Form / Meta Ad / CSV Export / Inbound Webhook
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
│ 6. 3-Tier Speed-to-Lead Triage │ Instant Voice AI vs Standard Drip     │
└────────────────────────────────┬───────────────────────────────────────┘
                          │
         ┌────────────────┴────────────────────────┐
         ▼                                         ▼
   [CLEAN MASTERS]                         [HITL QUARANTINE]
   • Routine (2-4hr Drip)                  • TCPA Opt-Outs ($500 Fine Prev)
   • Emergency (5-Min Voice AI)            • Invalid Format / AI Low-Conf
```

1. **Statutory Non-Compliance ($500–$2,200 fine per violation):**  
   A homeowner submits a new solar rebate form while their spouse opted out of calls 3 weeks prior on the same household number. Naive CRMs dial anyway. **IntegrityOps links family members via Household Clustering and hard-blocks the dial before telecom connection.**
2. **Runaway Enrichment API Costs ($0.05 to $0.15 per lead):**  
   A prospect submits 3 forms across different ad campaigns. Traditional setups trigger 3 separate paid property lookups. **IntegrityOps serves repeat lookups from a $0.00 local cache and halts API billing the moment a tenant hits their monthly budget ceiling.**
3. **Silent Data Fabrication During API Outages:**  
   When external enrichment providers 503, poorly designed systems either drop the paid lead completely or inject fake property estimates. **IntegrityOps degrades honestly: leads sync cleanly with `UNENRICHED_DEGRADED` status and queue into a 1-click backfill ledger for when the API recovers.**
4. **Dormant Revenue Recovery:**  
   Old CRM leads with stale quotes (>2 years) or unformatted phones sit abandoned. IntegrityOps normalizes contact data and surfaces high-value estimates for automated **Voice AI reactivation**.

---

## 🎯 3-Tier Lead Triage & Speed-to-Lead Hierarchy

Why not send all valid leads straight into GoHighLevel standard drip campaigns?  
In high-ticket contracting ($12,000–$35,000 roof replacements), **Speed-to-Lead is the primary determinant of revenue**:

| Lead Tier | Qualification Criteria | Routing & Action Protocol | Business Impact & ROI |
| :--- | :--- | :--- | :--- |
| **Tier 1: Quarantined / Compliance Hold** | TCPA opt-outs, invalid/hallucinated phone numbers, disposable emails, or AI confidence < 0.70. | **Hard-blocked from CRM sync & dialing.** Isolated into Human-In-The-Loop (HITL) Quarantine Ledger for operator audit. | **Prevents $500–$2,200 statutory fines per call.** Prevents CRM spam flags and preserves telecom sender reputation. |
| **Tier 2: Routine Valid Leads** | Enriched, clean contact data, standard residential maintenance inquiry, normal urgency. | Synced to GoHighLevel CRM via HMAC-verified webhook. Queued into standard 2-4 hour outreach drip (email nurture + conversational SMS). | Normalizes sales team workload, warms up cold prospects, and prevents lead fatigue. |
| **Tier 3: Emergency / High-Urgency Leads** | Active interior ceiling leaks, storm damage, commercial structural threats, or high intent ($15k+ job estimate). | **Bypasses standard drip completely.** Triggers immediate autonomous **Voice AI dispatch (Ash)** within seconds, accompanied by instant SMS alert to the on-call estimator. | **The 5-Minute Speed-to-Lead Rule:** Leads contacted within 5 minutes convert at **391% higher rates** than those contacted after 30 minutes. After 60 minutes, qualification drop-off exceeds 80%. |

---

## 🎙️ Real-Time Voice AI Telephony Architecture

The platform features an autonomous 2-way Voice AI qualification engine powered by **Vapi** and native **Web Audio API**:

```
[Outbound Dispatch Action]
           │
           ▼
[Pre-Dial Compliance Gate] ──► Blocked? ──► Terminate (0s duration, $0.00 spend)
           │ (Clear)
           ▼
[Web Audio Dual-Frequency Dialing Ringtone]
           │
           ▼
[Connection Chime & Live Ticking Wall-Clock Timer]
           │
           ▼
┌────────────────────────────────────────────────────────┐
│             Ash (Voice AI Qualification Agent)         │
├────────────────────────────────────────────────────────┤
│ • Anti-Hallucination Guard: Refuses to guess quotes     │
│ • Autonomous Tool Calling: `check_availability`        │
│ • Autonomous Tool Calling: `book_appointment`          │
│ • Autonomous Tool Calling: `flag_do_not_call`          │
│ • Production Barge-In / Interruption Engine            │
└────────────────────────────────────────────────────────┘
```

### Production Barge-In & Interruption Handling
* **Smooth Mid-Sentence Cutoff:** When a prospect speaks or submits a reply while the agent is talking, the platform immediately triggers `speechSynthesis.cancel()` (or Vapi cancel signal) to cut off audio instantly without UI stutter or button lockups.
* **No Agent Lockout:** Homeowner quick-reply chips and text inputs remain active throughout the call, allowing realistic mid-sentence interruptions.
* **Two Operating Modes:**
  * **Interactive Mode (`You Play Customer`):** The operator plays the role of the homeowner (via microphone or interactive chips) to evaluate Ash's conversational agility, pricing defense, and booking workflows.
  * **Automated QA Regression Replay:** Replays predefined regression scenarios (`Books Inspection`, `Mid-Call Opt-Out`, `Declines Offer`, `Voicemail Left`) turn-by-turn with speech synthesis to verify webhook settlement and compliance handlers automatically.

---

## 🏛️ Senior Full-Stack Engineering Highlights

### 1. Zero-IDOR Multi-Tenancy & Action-Level RBAC
* **Session-Derived Workspace Scope:** Active tenant identity is read strictly from encrypted `iron-session` cookies on the server. Client-side URL tampering or payload spoofing cannot cross tenant boundaries.
* **Granular Role Hierarchy:**
  * `OWNER` / `ADMIN`: Full operational authority (quarantine overrides, FinOps policy edits, backfill execution).
  * `REVIEWER`: Human-In-The-Loop triage (approve, split household clusters, permanent quarantine).
  * `VIEWER`: Read-only access. All Server Action mutations fail-closed with `403 Forbidden`.
* **RBAC Test Harness:** Built directly into the sidebar (`[OWN]`, `[ADM]`, `[REV]`, `[VIE]`) so hiring managers and evaluators can immediately verify permission gates without logging in and out of 4 accounts.

### 2. FinOps Ledger & Honest Enrichment Fallback
* **Three-Tier Fallback Hierarchy:**
  * `ENRICHED_CACHE` ($0.00): Serves known property square footage and roof age from local database.
  * `ENRICHED_LIVE` ($0.05): Calls live provider when under monthly cap.
  * `UNENRICHED_DEGRADED` ($0.00): Triggered by 503 outages or budget caps. Saves verified contact info without faking specs, allowing sales teams to work leads while queueing them for backfill.
* **1-Click Backfill Queue:** Once provider status is restored, operators click `Backfill Degraded Records` to enrich all pending leads in a single batch.

### 3. Scalable UI Architecture (React 19 & Next.js 15)
* **Bounded Layouts + Sticky Headers + Pagination:** All operational tables (Ledger, Quarantine, Reactivation, Voice History) feature fixed-height containers (`max-h-[380px]`) and `8 / 25 / 50` page controls. Ingesting 1,000+ leads will never elongate or break the browser window.
* **React 19 `useOptimistic`:** HITL quarantine actions (Approve, Split Cluster, DNC Quarantine) apply instantly in the UI while database transactions resolve asynchronously in the background.

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
    │   ├── dashboard-client.tsx # FinOps balance, bounded ledger, Lead Master Dossier
    │   ├── voice-client.tsx     # 2-way interactive Voice AI console + Barge-In + Vapi simulator
    │   ├── quarantine-table.tsx # React 19 optimistic HITL triage + Lead Quarantine Dossier
    │   └── copilot-drawer.tsx   # Tenant-scoped AI Ops RAG drawer
    ├── contracts/
    │   └── lead-contracts.ts    # Zod schemas, LeadPayload, TenantSettings
    └── lib/
        ├── audio-effects.ts     # Web Audio API ringtones, chimes, Web Speech GC & barge-in
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
