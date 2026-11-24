import { PrismaClient } from "@prisma/client";
import { checkAndRecordFinOps } from "../src/lib/finops";

const prisma = new PrismaClient();

async function verifyFinOpsBudgetCap() {
  console.log("=== Verification Gate 5: Pre-Flight FinOps Circuit Breaker ===");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "apex-roofing" } });
  if (!tenant) throw new Error("Tenant not found");

  // Set budget cap to $1.00 (100 cents) and set current spend to $1.00 (reached)
  await prisma.budgetPolicy.update({
    where: { tenantId: tenant.id },
    data: {
      monthlyCapCents: 100,
      currentSpendCents: 100,
    },
  });

  const check = await checkAndRecordFinOps(
    tenant.id,
    null,
    "+15125550888",
    false // Paid lookup
  );

  console.log("FinOps Check Result at Budget Cap:", check);

  if (check.allowed !== false || check.status !== "BUDGET_CAPPED" || check.costCents !== 0) {
    throw new Error("FAILED: Paid lookup was permitted after budget cap was reached!");
  }

  // Restore budget policy
  await prisma.budgetPolicy.update({
    where: { tenantId: tenant.id },
    data: {
      monthlyCapCents: 5000,
      currentSpendCents: 150,
    },
  });

  console.log("PASS: FinOps Circuit Breaker refused pre-flight successfully. Zero bill shock.\n");
}

verifyFinOpsBudgetCap()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
