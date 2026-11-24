import { PrismaClient } from "@prisma/client";
import { normalizeLead } from "../src/lib/normalizer";
import { classifyLeadDedupe, ExistingLeadRecord } from "../src/lib/dedupe";

const prisma = new PrismaClient();

async function verifyTcpaClusterQuarantine() {
  console.log("=== Verification Gate 3: TCPA Cluster Quarantine Propagation ===");

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

  const incomingCleanLookingLead = normalizeLead({
    name: "Spouse of Revoked Consent",
    phone: "512-555-0777", // Shared phone line with DNC opted out master
    email: "spouse@test.com",
    notes: "I want a new roof estimate worth $50,000",
    estimated_value: 50000,
  });

  const classification = classifyLeadDedupe(
    incomingCleanLookingLead,
    [existingDncMaster],
    new Map()
  );

  console.log("Classification Result:", classification);

  if (classification.type !== "QUARANTINE" || classification.quarantineReason !== "DNC_CLUSTER") {
    throw new Error("FAILED: High-value lead bypassed TCPA quarantine despite matching DNC cluster!");
  }

  console.log("PASS: Compliance Overrides Revenue! Lead successfully quarantined under DNC_CLUSTER.\n");
}

verifyTcpaClusterQuarantine().catch((e) => {
  console.error(e);
  process.exit(1);
});
