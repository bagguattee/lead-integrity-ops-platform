# CONTRACTS.md — Lead Integrity Ops Platform

This document defines the strict, typed data contracts governing inputs, entity normalization, deduplication classification, webhook transport, and outbound dispatch across the system.

---

## 1. Inbound Lead Contract (Raw Input)

Every raw lead consumed via batch CSV import or live webhook stream adheres to the schema below:

```typescript
export const RawInboundLeadSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  phone_number: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  notes: z.string().optional(),
  job_type: z.string().optional(),
  estimated_value: z.union([z.string(), z.number()]).optional(),
  is_dnc: z.union([z.boolean(), z.string()]).optional(),
  tcpa_consent: z.union([z.boolean(), z.string()]).optional(),
  created_at: z.string().optional(),
  locale: z.enum(["US", "AU"]).default("US"),
});
```

### Invalid String Token Filtering
Placeholder tokens (`"idk"`, `"n/a"`, `"none"`, `"nil"`, `"unknown"`, `"fake"`, `"0000000000"`) are automatically stripped and converted to typed `null` values before entity resolution.

---

## 2. Normalized Canonical Lead Contract

After in-process deterministic normalization:

```typescript
export const NormalizedLeadSchema = z.object({
  canonicalName: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  normalizedPhone: z.string().nullable(), // E.164 (+1XXXXXXXXXX or +61XXXXXXXXX)
  normalizedEmail: z.string().nullable(), // Lowercase, typo-domain corrected
  rawAddress: z.string().nullable(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  estimatedValue: z.number().default(0),
  isTcpaOptedOut: z.boolean().default(false),
  payloadHash: z.string(), // SHA-256 idempotency hash
  isSharedHub: z.boolean().default(false),
  sharedHubCount: z.number().default(1),
  triageScore: z.number().min(1).max(5).default(1),
  triageConfidence: z.number().min(0).max(1).default(1.0),
  intentCategory: z.enum(["EMERGENCY_STORM", "HIGH_INTENT", "ROUTINE", "UNCERTAIN"]).default("ROUTINE"),
  dateParsed: z.date().nullable(),
});
```

---

## 3. Quarantine Classification Reasons

Leads failing deterministic safety gates or requiring human oversight are routed into the HITL queue:

| Reason Code | Trigger Condition | Safety Boundary Protected |
| :--- | :--- | :--- |
| `INVALID_SHAPE` | Missing both valid E.164 phone and normalized email | Prevents junk CRM pollution |
| `DNC_CLUSTER` | Inbound opt-out OR matches an existing DNC household master | TCPA Regulatory Compliance (\$1,500/call fine prevention) |
| `SHARED_HUB` | > 3 distinct households/names sharing single phone line | Prevents shared broker line cross-contamination |
| `LOW_CONFIDENCE_HITL` | AI triage confidence score < 0.70 | Prevents incorrect automation routing |
| `TIME_GAP_REVIEW` | Matched record was last active > 5.0 years ago | Prevents stale customer record accidental overwrite |

---

## 4. Live Inbound Webhook Contract (`POST /api/webhooks/n8n-ingest`)

### Request Headers
* `Content-Type: application/json`
* `x-tenant-slug: <tenant-slug>` (e.g. `apex-roofing`)
* `x-n8n-signature: <hmac-sha256-hex>` (Computed with tenant's secret key)

### Response Payload (`200 OK` or `202 Quarantined`)
```json
{
  "status": "SUCCESS",
  "runId": "cmwuauka7000e13xa6dsdga23",
  "reconciliation": {
    "totalInbound": 10,
    "cleanMastersCount": 4,
    "mergedDuplicates": 4,
    "quarantinedCount": 2,
    "systemFailuresCount": 0,
    "isReconciled": true
  },
  "finOps": {
    "costCents": 20,
    "cacheSavingsCents": 20,
    "capped": false
  }
}
```

---

## 5. Two-Sided Mathematical Invariant

Every batch import and webhook ingestion strictly satisfies:

$$\text{Total Inbound} = \text{Clean Masters} + \text{Merged Duplicates} + \text{Quarantined Records} + \text{System Failures (0)}$$
