import {
  dispatchStoreReactivation,
  getTenantSnapshot,
  resolveStoreQuarantine,
  toggleStoreEnrichmentPause,
  updateStoreBudgetPolicy,
} from "../src/lib/store";

async function verifyRbacActions() {
  console.log("=== Verification Gate 6: Action-Level RBAC Enforcement ===");

  const snap = getTenantSnapshot("apex-roofing");
  const qItem = snap.tenant.quarantine.find((q) => !q.resolved);
  const mItem = snap.tenant.masters[0];

  if (!qItem || !mItem) throw new Error("Missing seeded items for RBAC verification");

  // 1. VIEWER must get 403 on quarantine resolution
  let viewerBlockedQuarantine = false;
  try {
    resolveStoreQuarantine({
      slugOrId: "apex-roofing",
      role: "VIEWER",
      actorName: "Alex Auditor",
      quarantineId: qItem.id,
      action: "PERMANENT_QUARANTINE",
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("403 Forbidden")) viewerBlockedQuarantine = true;
  }

  // 2. VIEWER & REVIEWER must get 403 on FinOps budget policy change
  let reviewerBlockedBudget = false;
  try {
    updateStoreBudgetPolicy({
      slugOrId: "apex-roofing",
      role: "REVIEWER",
      actorName: "Sarah Reviewer",
      monthlyCapCents: 99900,
      warningThreshold: 90,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("403 Forbidden")) reviewerBlockedBudget = true;
  }

  // 3. VIEWER must get 403 on GHL reactivation dispatch & pause toggle
  let viewerBlockedDispatch = false;
  try {
    dispatchStoreReactivation({
      slugOrId: "apex-roofing",
      role: "VIEWER",
      actorName: "Alex Auditor",
      masterId: mItem.id,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("403 Forbidden")) viewerBlockedDispatch = true;
  }

  let viewerBlockedPause = false;
  try {
    toggleStoreEnrichmentPause({
      slugOrId: "apex-roofing",
      role: "VIEWER",
      actorName: "Alex Auditor",
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("403 Forbidden")) viewerBlockedPause = true;
  }

  if (!viewerBlockedQuarantine || !reviewerBlockedBudget || !viewerBlockedDispatch || !viewerBlockedPause) {
    throw new Error("FAILED: Unauthorized role bypassed action-level RBAC gate!");
  }

  console.log("PASS: VIEWER & REVIEWER unauthorized mutations strictly rejected with 403 Forbidden.\n");
}

verifyRbacActions().catch((e) => {
  console.error(e);
  process.exit(1);
});
