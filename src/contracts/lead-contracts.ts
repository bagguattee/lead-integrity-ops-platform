import { z } from "zod";

// 1. Raw Inbound Webhook & CSV Row Contract
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

export type RawInboundLead = z.infer<typeof RawInboundLeadSchema>;

// 2. Normalized Clean Lead Contract
export const NormalizedLeadSchema = z.object({
  canonicalName: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  normalizedPhone: z.string().nullable(), // E.164: +1XXXXXXXXXX or +61XXXXXXXXX
  normalizedEmail: z.string().nullable(),
  rawAddress: z.string().nullable(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  estimatedValue: z.number().default(0),
  isTcpaOptedOut: z.boolean().default(false),
  payloadHash: z.string(), // SHA-256
  isSharedHub: z.boolean().default(false),
  sharedHubCount: z.number().default(1),
  triageScore: z.number().min(1).max(5).default(1),
  triageConfidence: z.number().min(0).max(1).default(1.0),
  intentCategory: z.enum(["EMERGENCY_STORM", "HIGH_INTENT", "ROUTINE", "UNCERTAIN"]).default("ROUTINE"),
  dateParsed: z.date().nullable(),
});

export type NormalizedLead = z.infer<typeof NormalizedLeadSchema>;

// 3. Quarantine Classification Reasons
export const QuarantineReasonEnum = z.enum([
  "INVALID_SHAPE",
  "DNC_CLUSTER",
  "SHARED_HUB",
  "LOW_CONFIDENCE_HITL",
  "TIME_GAP_REVIEW",
]);

export type QuarantineReason = z.infer<typeof QuarantineReasonEnum>;

// 4. Webhook Payload & Response Contracts
export const WebhookInboundPayloadSchema = z.object({
  leads: z.array(z.record(z.any())).min(1),
  source: z.enum(["CSV_UPLOAD", "N8N_WEBHOOK"]).default("N8N_WEBHOOK"),
  locale: z.enum(["US", "AU"]).default("US"),
});

export const WebhookResponseSchema = z.object({
  status: z.enum(["SUCCESS", "QUARANTINED", "BUDGET_CAPPED", "ERROR"]),
  runId: z.string(),
  reconciliation: z.object({
    totalInbound: z.number(),
    cleanMastersCount: z.number(),
    mergedDuplicates: z.number(),
    quarantinedCount: z.number(),
    systemFailuresCount: z.number(),
    isReconciled: z.boolean(), // Total = Clean + Merged + Quarantined + Failures
  }),
  finOps: z.object({
    costCents: z.number(),
    cacheSavingsCents: z.number(),
    capped: z.boolean(),
  }),
});

export type WebhookResponse = z.infer<typeof WebhookResponseSchema>;

// 5. GHL Dispatch Outbound Payload
export const GhlDispatchPayloadSchema = z.object({
  contact: z.object({
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address1: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    postalCode: z.string().nullable(),
    tags: z.array(z.string()),
    customFields: z.record(z.any()),
  }),
  opportunity: z.object({
    title: z.string(),
    stage: z.string(),
    monetaryValue: z.number(),
  }).optional(),
});

export type GhlDispatchPayload = z.infer<typeof GhlDispatchPayloadSchema>;
