import { normalizeLead } from "../src/lib/normalizer";
import { classifyLeadDedupe, ExistingLeadRecord } from "../src/lib/dedupe";

async function verifyHubAndTimeGap() {
  console.log("=== Verification Gate 4: Shared Hub Isolation & 5-Year Time-Gap ===");

  // 1. Shared Commercial Hub Test (>3 distinct households sharing phone line)
  const phoneHouseholdMap = new Map<string, number>();
  phoneHouseholdMap.set("+15125550100", 3); // Already 3 distinct households

  const inbound4thHousehold = normalizeLead({
    name: "Broker Unit 4",
    phone: "512-555-0100",
    email: "broker4@building.com",
    notes: "Commercial inspection",
  });

  const hubClassification = classifyLeadDedupe(inbound4thHousehold, [], phoneHouseholdMap);
  console.log("Commercial Hub Classification:", hubClassification);

  if (hubClassification.type !== "QUARANTINE" || hubClassification.quarantineReason !== "SHARED_HUB") {
    throw new Error("FAILED: Shared Commercial Hub (>3 households) failed to isolate into sandbox!");
  }
  console.log("PASS: Commercial Hub isolation verified.");

  // 2. 5-Year Time-Gap Demotion Test
  const sixYearsAgo = new Date();
  sixYearsAgo.setFullYear(sixYearsAgo.getFullYear() - 6);

  const staleMaster: ExistingLeadRecord = {
    id: "stale_master_999",
    normalizedPhone: "+15125550999",
    normalizedEmail: "stale@domain.com",
    canonicalName: "Stale Customer",
    isTcpaOptedOut: false,
    isSharedHub: false,
    createdAt: sixYearsAgo,
    rawPayloadHash: "hash_stale",
  };

  const incomingTimeGapLead = normalizeLead({
    name: "New Inhabitant",
    phone: "512-555-0999",
    email: "new_inhabitant@domain.com",
  });

  const timeGapClassification = classifyLeadDedupe(incomingTimeGapLead, [staleMaster], new Map());
  console.log("Time-Gap Classification:", timeGapClassification);

  if (timeGapClassification.type !== "QUARANTINE" || timeGapClassification.quarantineReason !== "TIME_GAP_REVIEW") {
    throw new Error("FAILED: 6-year-old lead match was auto-merged instead of demoting to TIME_GAP_REVIEW!");
  }

  console.log("PASS: 5-Year Time-Gap demoted to HITL review successfully.\n");
}

verifyHubAndTimeGap().catch((e) => {
  console.error(e);
  process.exit(1);
});
