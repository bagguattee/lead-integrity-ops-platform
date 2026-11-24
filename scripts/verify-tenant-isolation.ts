import { getTenantSnapshot, ingestStoreBatch } from "../src/lib/store";

async function verifyTenantIsolation() {
  console.log("=== Verification Gate 1: Multi-Tenant Isolation (US / AU / UK) ===");

  const beforeAU = getTenantSnapshot("summit-solar");
  const beforeUK = getTenantSnapshot("thames-heating");

  // Mutate Tenant A (Apex Roofing US) with a new unique lead
  ingestStoreBatch(
    "apex-roofing",
    [
      {
        name: "Isolation Probe TX",
        phone: "(512) 555-0189",
        email: "probe.tx@isolationtest.com",
        estimated_value: 27000,
        notes: "Emergency leak check",
      },
    ],
    "N8N_WEBHOOK",
    "probe_tx_stream",
    "US"
  );

  const afterUS = getTenantSnapshot("apex-roofing");
  const afterAU = getTenantSnapshot("summit-solar");
  const afterUK = getTenantSnapshot("thames-heating");

  const leakedIntoAU = afterAU.tenant.masters.some((m) => m.canonicalName === "Isolation Probe TX");
  const leakedIntoUK = afterUK.tenant.masters.some((m) => m.canonicalName === "Isolation Probe TX");

  if (
    leakedIntoAU ||
    leakedIntoUK ||
    afterAU.reconciliation.totalInbound !== beforeAU.reconciliation.totalInbound ||
    afterUK.reconciliation.totalInbound !== beforeUK.reconciliation.totalInbound
  ) {
    throw new Error("FAILED: Cross-tenant state mutation or read leakage detected!");
  }

  // Verify locale-specific E.164 rules in each workspace
  const hasPlus1InUS = afterUS.tenant.masters.every(
    (m) => !m.normalizedPhone || m.normalizedPhone.startsWith("+1")
  );
  const hasPlus61InAU = afterAU.tenant.masters.every(
    (m) => !m.normalizedPhone || m.normalizedPhone.startsWith("+61")
  );
  const hasPlus44InUK = afterUK.tenant.masters.every(
    (m) => !m.normalizedPhone || m.normalizedPhone.startsWith("+44")
  );

  if (!hasPlus1InUS || !hasPlus61InAU || !hasPlus44InUK) {
    throw new Error("FAILED: Locale-specific E.164 prefixes (+1, +61, +44) violated across tenants!");
  }

  console.log(
    `PASS: US (${afterUS.reconciliation.totalInbound}), AU (${afterAU.reconciliation.totalInbound}), and UK (${afterUK.reconciliation.totalInbound}) completely isolated.\n`
  );
}

verifyTenantIsolation().catch((e) => {
  console.error(e);
  process.exit(1);
});
