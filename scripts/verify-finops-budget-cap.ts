import { getTenantSnapshot, ingestStoreBatch, updateStoreBudgetPolicy } from "../src/lib/store";

async function verifyFinOpsBudgetCap() {
  console.log("=== Verification Gate 5: Pre-Flight FinOps Circuit Breaker ===");

  // Set cap below current spend ($1.00 = 100 cents)
  updateStoreBudgetPolicy({
    slugOrId: "apex-roofing",
    role: "ADMIN",
    actorName: "FinOps Tester",
    monthlyCapCents: 100,
    warningThreshold: 80,
  });

  const before = getTenantSnapshot("apex-roofing");
  const run = ingestStoreBatch(
    "apex-roofing",
    [
      {
        name: "Budget Cap Test Lead",
        phone: "512-555-0819",
        email: "captest@domain.com",
        estimated_value: 15000,
        notes: "Checking pre-flight cap degradation",
      },
    ],
    "N8N_WEBHOOK",
    "finops_cap_probe",
    "US"
  );

  const after = getTenantSnapshot("apex-roofing");
  const row = run.lineage[0];

  if (
    run.costCents !== 0 ||
    row.finOpsProvider !== "BUDGET_CAPPED" ||
    after.tenant.budget.currentSpendCents !== before.tenant.budget.currentSpendCents
  ) {
    throw new Error("FAILED: Paid lookup executed after monthly FinOps cap was reached!");
  }

  // Restore $50.00 cap
  updateStoreBudgetPolicy({
    slugOrId: "apex-roofing",
    role: "ADMIN",
    actorName: "FinOps Tester",
    monthlyCapCents: 5000,
    warningThreshold: 80,
  });

  console.log("PASS: FinOps Circuit Breaker degraded cleanly to $0.00 BUDGET_CAPPED without dropping the lead.\n");
}

verifyFinOpsBudgetCap().catch((e) => {
  console.error(e);
  process.exit(1);
});
