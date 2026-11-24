import { PrismaClient } from "@prisma/client";
import { processPipelineBatch } from "../src/lib/pipeline-engine";
import { RawInboundLead } from "../src/contracts/lead-contracts";

const prisma = new PrismaClient();

async function verifyReconciliationInvariant() {
  console.log("=== Verification Gate 2: Two-Sided Reconciliation Invariant ===");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "apex-roofing" } });
  if (!tenant) throw new Error("Tenant not found");

  // Ingest a batch with deliberate mixed outcomes
  const batch: RawInboundLead[] = [
    { name: "Clean Lead 1", phone: "512-555-0901", email: "clean1@test.com", notes: "roof leak" },
    { name: "Clean Lead 2", phone: "512-555-0902", email: "clean2@test.com", notes: "new roof" },
    { name: "Clean Lead 1 Dup", phone: "512-555-0901", email: "clean1@test.com", notes: "follow up" }, // Duplicate
    { name: "Garbage Lead", phone: "idk", email: "n/a", notes: "no contact" }, // Quarantine (Invalid shape)
    { name: "Opted Out Lead", phone: "512-555-0903", is_dnc: true, tcpa_consent: false, notes: "dnc" }, // Quarantine (DNC)
  ];

  const result = await processPipelineBatch(
    tenant.id,
    batch,
    "CSV_UPLOAD",
    "verification_batch.csv",
    "US"
  );

  console.log("Reconciliation Batch Result:", result);

  const equationHolds = result.totalInbound === (result.cleanMastersCount + result.mergedDuplicates + result.quarantinedCount + result.systemFailuresCount);
  const zeroFailures = result.systemFailuresCount === 0;

  if (!equationHolds || !zeroFailures) {
    throw new Error(`FAILED: Invariant failed! ${result.totalInbound} != ${result.cleanMastersCount} + ${result.mergedDuplicates} + ${result.quarantinedCount}`);
  }

  console.log(`PASS: Invariant strictly holds: ${result.totalInbound} Inbound = ${result.cleanMastersCount} Masters + ${result.mergedDuplicates} Dups + ${result.quarantinedCount} Quarantined + 0 Failures.\n`);
}

verifyReconciliationInvariant()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
