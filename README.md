# Lead Integrity Ops Platform (`lead-integrity-ops-platform`)

> **System 4** of the Senior CRM Automation & Systems Engineering Portfolio.  
> An enterprise operations portal providing multi-tenant lead hygiene, entity resolution, human-in-the-loop (HITL) quarantine review, and FinOps spend control.

---

## Key Features

1. **Strict Multi-Tenancy & Action-Level RBAC:**
   * Session-derived tenancy via tamper-proof `iron-session` cookies (no URL or body parameter tampering).
   * Granular permissions (`OWNER`, `ADMIN`, `REVIEWER`, `VIEWER`) re-verified on every server mutation.
2. **Deterministic First, AI Second:**
   * E.164 phone formatting (+1 for US, +61 for AU), email sanitization, and SHA-256 payload idempotency.
   * Shared Commercial Hub isolation (>3 households sharing a broker line).
   * 5-Year time-gap demotion to prevent accidental overwrites of stale customer records.
   * Compliance Overrides Revenue: Automatic TCPA/DNC cluster quarantine propagation.
3. **Two-Sided Mathematical Reconciliation Invariant:**
   $$\text{Total Inbound} = \text{Clean Masters} + \text{Merged Duplicates} + \text{Quarantined Records} + \text{System Failures (0)}$$
4. **Pre-Flight FinOps Circuit Breaker:**
   * Real-time monitoring of third-party lookup spend vs. cache savings.
   * Refuses pre-flight charges when monthly tenant budget is reached, gracefully degrading to local cache.
5. **Live Inbound Webhook (`POST /api/webhooks/n8n-ingest`):**
   * HMAC-SHA256 signature verification directly consuming leads from **System 3 (`resilient-lead-pipeline`)**.

---

## Quick Start & Verification

### 1. Install & Setup Database
```bash
cd lead-integrity-ops-platform
npm run prisma:push
npm run prisma:seed
```

### 2. Run Local Verification Suite (All 6 Gates)
```bash
npm run verify
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the live dashboard.

---

## Portfolio & Interview Artifacts
* Detailed Contracts: [`CONTRACTS.md`](CONTRACTS.md)
* Interview Defense & 3-Minute Demo Script: [`INTERVIEW_DEFENSE_GUIDE.md`](INTERVIEW_DEFENSE_GUIDE.md)
