import { prisma } from "./prisma";

export interface FinOpsResult {
  allowed: boolean;
  provider: "LOCAL_CACHE" | "PRIMARY_MOCK_API" | "FALLBACK_MOCK_API";
  costCents: number;
  cacheSavingsCents: number;
  status: "SUCCESS" | "BUDGET_CAPPED";
}

/**
 * Pre-Flight FinOps Circuit Breaker:
 * Prevents third-party lookup charges and API bill shock when monthly tenant budget is reached.
 */
export async function checkAndRecordFinOps(
  tenantId: string,
  runId: string | null,
  leadIdentifier: string,
  isCached: boolean = false
): Promise<FinOpsResult> {
  const policy = await prisma.budgetPolicy.findUnique({
    where: { tenantId },
  });

  if (!policy) {
    return {
      allowed: true,
      provider: "LOCAL_CACHE",
      costCents: 0,
      cacheSavingsCents: 0,
      status: "SUCCESS",
    };
  }

  // If local cache hit -> $0 cost, increments cache savings by $0.05
  if (isCached) {
    await prisma.budgetPolicy.update({
      where: { tenantId },
      data: {
        cacheSavingsCents: { increment: 5 },
      },
    });

    await prisma.enrichmentLog.create({
      data: {
        tenantId,
        runId,
        leadIdentifier,
        provider: "LOCAL_CACHE",
        cacheHit: true,
        costCents: 0,
        latencyMs: 4,
        status: "SUCCESS",
      },
    });

    return {
      allowed: true,
      provider: "LOCAL_CACHE",
      costCents: 0,
      cacheSavingsCents: 5,
      status: "SUCCESS",
    };
  }

  // Pre-flight check: if current spend reaches or exceeds cap
  if (policy.currentSpendCents >= policy.monthlyCapCents) {
    await prisma.enrichmentLog.create({
      data: {
        tenantId,
        runId,
        leadIdentifier,
        provider: "LOCAL_CACHE",
        cacheHit: false,
        costCents: 0,
        latencyMs: 1,
        status: "BUDGET_CAPPED",
      },
    });

    return {
      allowed: false,
      provider: "LOCAL_CACHE",
      costCents: 0,
      cacheSavingsCents: 0,
      status: "BUDGET_CAPPED",
    };
  }

  // Execute primary provider lookup ($0.05)
  const lookupCost = 5;
  await prisma.budgetPolicy.update({
    where: { tenantId },
    data: {
      currentSpendCents: { increment: lookupCost },
    },
  });

  await prisma.enrichmentLog.create({
    data: {
      tenantId,
      runId,
      leadIdentifier,
      provider: "PRIMARY_MOCK_API",
      cacheHit: false,
      costCents: lookupCost,
      latencyMs: 85,
      status: "SUCCESS",
    },
  });

  return {
    allowed: true,
    provider: "PRIMARY_MOCK_API",
    costCents: lookupCost,
    cacheSavingsCents: 0,
    status: "SUCCESS",
  };
}
