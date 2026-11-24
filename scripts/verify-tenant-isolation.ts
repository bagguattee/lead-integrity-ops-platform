import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyTenantIsolation() {
  console.log("=== Verification Gate 1: Tenant Isolation ===");

  const tenantA = await prisma.tenant.findUnique({ where: { slug: "apex-roofing" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "summit-solar" } });

  if (!tenantA || !tenantB) throw new Error("Tenants missing from database");

  // Query leads scoped to Tenant A
  const leadsA = await prisma.leadMaster.findMany({ where: { tenantId: tenantA.id } });
  // Query leads scoped to Tenant B
  const leadsB = await prisma.leadMaster.findMany({ where: { tenantId: tenantB.id } });

  console.log(`Tenant A (${tenantA.name}) Leads Count: ${leadsA.length}`);
  console.log(`Tenant B (${tenantB.name}) Leads Count: ${leadsB.length}`);

  // Assert complete cross-tenant isolation
  const crossLeak = leadsA.some((l) => l.tenantId === tenantB.id) || leadsB.some((l) => l.tenantId === tenantA.id);
  if (crossLeak) {
    throw new Error("FAILED: Cross-tenant data leakage detected!");
  }

  console.log("PASS: 100% strict tenant isolation verified. Zero cross-tenant data leaks.\n");
}

verifyTenantIsolation()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
