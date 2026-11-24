import { getTenantSnapshot, ingestStoreBatch, resolveStoreQuarantine } from "../src/lib/store";
import { normalizeLead } from "../src/lib/normalizer";
import { classifyLeadDedupe, ExistingLeadRecord } from "../src/lib/dedupe";

async function verifyTcpaClusterQuarantine() {
  console.log("=== Verification Gate 3: TCPA Cluster Quarantine & Override Block ===");

  const existingDncMaster: ExistingLeadRecord = {
    id: "master_dnc_123",
    normalizedPhone: "+15125550777",
    normalizedEmail: "dnc_optout@test.com",
    canonicalName: "Revoked Consent Prospect",
    isTcpaOptedOut: true,
    isSharedHub: false,
    createdAt: new Date(),
    rawPayloadHash: "hash_dnc_123",
  };

  const incomingHighTicketLead = normalizeLead({
    name: "Spouse of Revoked Consent",
    phone: "512-555-0777",
    email: "spouse@test.com",
    notes: "I want a new roof estimate worth $50,000",
    estimated_value: 50000,
  });

  const classification = classifyLeadDedupe(incomingHighTicketLead, [existingDncMaster], new Map());
  if (classification.type !== "QUARANTINE" || classification.quarantineReason !== "DNC_CLUSTER") {
    throw new Error("FAILED: High-value lead bypassed TCPA quarantine despite matching DNC cluster!");
  }

  // Also prove an ADMIN cannot accidentally click "Approve & Sync" on a DNC_CLUSTER quarantine item!
  const snap = getTenantSnapshot("apex-roofing");
  const dncItem = snap.tenant.quarantine.find((q) => !q.resolved && q.reason === "DNC_CLUSTER");
  if (!dncItem) throw new Error("Expected seeded DNC_CLUSTER item in Apex Roofing");

  let blockedApprove = false;
  try {
    resolveStoreQuarantine({
      slugOrId: "apex-roofing",
      role: "ADMIN",
      actorName: "Admin Tester",
      quarantineId: dncItem.id,
      action: "APPROVED_SYNC",
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Compliance Gate Blocked")) {
      blockedApprove = true;
    }
  }

  if (!blockedApprove) {
    throw new Error("FAILED: System allowed approving a DNC_CLUSTER item for outbound GHL sync!");
  }

  // Regression Check: Verify CSV / Webhook upload of a household contact (is_dnc: false)
  // sharing a phone with a previously quarantined DNC contact (512-555-0144) is ALSO quarantined!
  const csvDncRun = ingestStoreBatch(
    "apex-roofing",
    [
      {
        name: "DNC Household Test",
        phone: "512-555-0144",
        email: "dnc_match@outlook.com",
        estimated_value: 32000,
        is_dnc: false,
        notes: "High value but shares phone with quarantined DNC contact",
      },
    ],
    "CSV_UPLOAD",
    "regression_dnc_csv.csv",
    "US"
  );

  if (csvDncRun.quarantinedCount !== 1 || csvDncRun.cleanMastersCount !== 0) {
    throw new Error(
      "FAILED: Household contact sharing phone with quarantined DNC record escaped quarantine!"
    );
  }

  console.log("PASS: Compliance Overrides Revenue! Inbound DNC, quarantined DNC cluster propagation, and HITL sync block all verified.\n");
}

verifyTcpaClusterQuarantine().catch((e) => {
  console.error(e);
  process.exit(1);
});
