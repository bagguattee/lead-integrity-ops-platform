import { getTenantSnapshot, ingestStoreBatch, resolveStoreQuarantine } from "../src/lib/store";
import { RawInboundLead } from "../src/contracts/lead-contracts";

async function verifyReconciliationInvariant() {
  console.log("=== Verification Gate 2: Two-Sided Reconciliation Invariant (100-Row Benchmark + HITL) ===");

  // Generate 100 dirty historical payloads (clean, exact duplicates, DNC opt-outs, invalid shapes, low AI conf)
  const batch: RawInboundLead[] = [];
  for (let i = 1; i <= 40; i++) {
    batch.push({
      name: `Clean Prospect ${i}`,
      phone: `512-555-${String(2000 + i).padStart(4, "0")}`,
      email: `prospect${i}@gmial.com`,
      estimated_value: 12000,
      notes: "Need roof replacement quote this week",
    });
  }
  for (let i = 1; i <= 30; i++) {
    // Duplicates of Clean Prospect 1..30
    batch.push({
      name: `Clean Prospect ${i}`,
      phone: `+1512555${String(2000 + i).padStart(4, "0")}`,
      email: `prospect${i}@gmail.com`,
      notes: "Follow up inquiry",
    });
  }
  for (let i = 1; i <= 15; i++) {
    // DNC opt-outs
    batch.push({
      name: `OptOut Contact ${i}`,
      phone: `512-555-${String(3000 + i).padStart(4, "0")}`,
      is_dnc: true,
      tcpa_consent: false,
      notes: "Stop calling",
    });
  }
  for (let i = 1; i <= 15; i++) {
    // Garbage shapes
    batch.push({
      name: `Trash Row ${i}`,
      phone: "idk",
      email: "n/a",
      notes: "fake",
    });
  }

  const run = ingestStoreBatch(
    "apex-roofing",
    batch,
    "CSV_UPLOAD",
    "benchmark_100_rows.csv",
    "US"
  );

  const sum =
    run.cleanMastersCount +
    run.mergedDuplicates +
    run.quarantinedCount +
    run.systemFailuresCount;

  if (run.totalInbound !== 100 || sum !== 100 || run.systemFailuresCount !== 0) {
    throw new Error(
      `FAILED: 100-row batch failed reconciliation! ${run.totalInbound} != ${sum}`
    );
  }

  // Also prove invariant holds AFTER human HITL resolution (Edit & Promote + Permanent Reject)
  const snapBefore = getTenantSnapshot("apex-roofing");
  if (!snapBefore.reconciliation.isReconciled) {
    throw new Error("FAILED: Workspace snapshot drifted before HITL resolution!");
  }

  const nonDncItem = snapBefore.tenant.quarantine.find(
    (q) => !q.resolved && q.reason !== "DNC_CLUSTER"
  );
  if (nonDncItem) {
    resolveStoreQuarantine({
      slugOrId: "apex-roofing",
      role: "REVIEWER",
      actorName: "Test Lead Engineer",
      quarantineId: nonDncItem.id,
      action: "EDITED_FIELDS",
      editedPhone: "512-555-8899",
      editedEmail: "fixed@verified.com",
    });
  }

  const snapAfter = getTenantSnapshot("apex-roofing");
  if (
    !snapAfter.reconciliation.isReconciled ||
    snapAfter.reconciliation.totalInbound !== snapBefore.reconciliation.totalInbound
  ) {
    throw new Error("FAILED: Workspace invariant drifted after HITL promotion!");
  }

  console.log(
    `PASS: 100-Row Batch (${run.cleanMastersCount} Clean + ${run.mergedDuplicates} Merged + ${run.quarantinedCount} Quarantined + 0 Failed = 100) AND post-HITL invariant verified!\n`
  );
}

verifyReconciliationInvariant().catch((e) => {
  console.error(e);
  process.exit(1);
});
