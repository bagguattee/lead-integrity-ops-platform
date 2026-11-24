import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { processPipelineBatch } from "../src/lib/pipeline-engine";
import { RawInboundLead } from "../src/contracts/lead-contracts";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding multi-tenant lead integrity database...");

  // Clean existing data
  await prisma.enrichmentLog.deleteMany({});
  await prisma.quarantineRecord.deleteMany({});
  await prisma.leadAlias.deleteMany({});
  await prisma.leadMaster.deleteMany({});
  await prisma.ingestionRun.deleteMany({});
  await prisma.auditEvent.deleteMany({});
  await prisma.budgetPolicy.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});

  const passwordHash = await bcrypt.hash("demo123456", 10);

  // 1. Create Demo Users
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@apexroofing.com",
      name: "Marcus Vance (Ops Lead)",
      passwordHash,
    },
  });

  const reviewerUser = await prisma.user.create({
    data: {
      email: "reviewer@apexroofing.com",
      name: "Sarah Jenkins (Lead Triage)",
      passwordHash,
    },
  });

  const viewerUser = await prisma.user.create({
    data: {
      email: "viewer@apexroofing.com",
      name: "Alex Auditor (Read-Only)",
      passwordHash,
    },
  });

  // 2. Tenant A: Apex Roofing TX (US Locale)
  const apexTenant = await prisma.tenant.create({
    data: {
      name: "Apex Roofing TX",
      slug: "apex-roofing",
      localeDefault: "US",
      webhookSecret: "whsec_apex_tx_secret_key_998877",
      budgetPolicy: {
        create: {
          monthlyCapCents: 5000, // $50.00
          currentSpendCents: 125, // $1.25
          cacheSavingsCents: 65,  // $0.65
          warningThreshold: 80,
          cacheOnlyOnCap: true,
        },
      },
      memberships: {
        create: [
          { userId: adminUser.id, role: "ADMIN" },
          { userId: reviewerUser.id, role: "REVIEWER" },
          { userId: viewerUser.id, role: "VIEWER" },
        ],
      },
    },
  });

  // 3. Tenant B: Summit Solar AU (AU Locale)
  const summitTenant = await prisma.tenant.create({
    data: {
      name: "Summit Solar AU",
      slug: "summit-solar",
      localeDefault: "AU",
      webhookSecret: "whsec_summit_au_secret_key_112233",
      budgetPolicy: {
        create: {
          monthlyCapCents: 7500, // $75.00
          currentSpendCents: 210,
          cacheSavingsCents: 110,
          warningThreshold: 80,
          cacheOnlyOnCap: true,
        },
      },
      memberships: {
        create: [
          { userId: adminUser.id, role: "OWNER" },
        ],
      },
    },
  });

  console.log(`Created tenants: ${apexTenant.name} (${apexTenant.id}) and ${summitTenant.name} (${summitTenant.id})`);

  // 4. Ingest sample leads into Apex Roofing TX to populate live dashboard & quarantine board
  const sampleLeads: RawInboundLead[] = [
    {
      name: "David Miller",
      phone: "512-555-0199",
      email: "david.miller@gmail.com",
      address: "104 Elm Street, Austin, TX",
      notes: "Severe storm damage, roof is leaking into living room! Need emergency inspection ASAP.",
      estimated_value: 14500,
      created_at: "2026-11-20T10:00:00Z",
    },
    {
      name: "David Miller", // Exact Duplicate
      phone: "+15125550199",
      email: "david.miller@gmail.com",
      address: "104 Elm St, Austin, TX",
      notes: "Follow up: did someone receive my leak request?",
      estimated_value: 14500,
      created_at: "2026-11-20T11:30:00Z",
    },
    {
      name: "Robert Henderson", // DNC Contamination
      phone: "512-555-0144",
      email: "robert.h@outlook.com",
      address: "88 Barton Springs Rd, Austin, TX",
      notes: "Do not call me again. Taking you to court.",
      is_dnc: true,
      tcpa_consent: false,
      estimated_value: 8000,
      created_at: "2026-11-21T09:00:00Z",
    },
    {
      name: "Brenda Smith", // Invalid Shape (No phone, garbage email)
      phone: "idk",
      email: "na",
      address: "Unknown Location",
      notes: "Just curious how much roofs cost.",
      estimated_value: 0,
      created_at: "2026-11-22T14:15:00Z",
    },
    {
      name: "Carlos Rodriguez", // Clean High Value
      phone: "512-555-0182",
      email: "carlos.r@gmail.com",
      address: "2400 South Congress Ave, Austin, TX",
      notes: "Replacing entire commercial warehouse roof. Ready to sign contract this week.",
      estimated_value: 48000,
      created_at: "2026-11-22T16:00:00Z",
    },
    {
      name: "Unknown Prospect", // Low Confidence HITL
      phone: "512-555-0133",
      email: "inquiry@test.com",
      address: "Austin, TX",
      notes: "Maybe looking for a quote, not sure, could be school project",
      estimated_value: 3000,
      created_at: "2026-11-23T08:00:00Z",
    },
    // Shared Commercial Hub: 4 separate names on the same property broker line (512-555-0100)
    {
      name: "Tenant Unit 1A (Brokers Inc)",
      phone: "512-555-0100",
      email: "broker1@austinbrokers.com",
      address: "500 Commerce St, Suite 100",
      notes: "Commercial office inspection",
      created_at: "2026-11-18T10:00:00Z",
    },
    {
      name: "Tenant Unit 2B (Brokers Inc)",
      phone: "512-555-0100",
      email: "broker2@austinbrokers.com",
      address: "500 Commerce St, Suite 200",
      notes: "Commercial office inspection",
      created_at: "2026-11-18T11:00:00Z",
    },
    {
      name: "Tenant Unit 3C (Brokers Inc)",
      phone: "512-555-0100",
      email: "broker3@austinbrokers.com",
      address: "500 Commerce St, Suite 300",
      notes: "Commercial office inspection",
      created_at: "2026-11-18T12:00:00Z",
    },
    {
      name: "Tenant Unit 4D (Commercial Hub Sandbox)",
      phone: "512-555-0100", // 4th distinct household -> flags SHARED_HUB quarantine
      email: "broker4@austinbrokers.com",
      address: "500 Commerce St, Suite 400",
      notes: "Commercial office inspection",
      created_at: "2026-11-18T13:00:00Z",
    },
  ];

  console.log("Running pipeline batch ingestion for Apex Roofing TX...");
  const result = await processPipelineBatch(
    apexTenant.id,
    sampleLeads,
    "CSV_UPLOAD",
    "Apex_Leads_Batch_Nov24.csv",
    "US"
  );

  console.log("Ingestion Batch Result:", result);

  // Ingest sample AU lead into Summit Solar AU
  await processPipelineBatch(
    summitTenant.id,
    [
      {
        name: "Lachlan Murdoch",
        phone: "0412 345 678",
        email: "lachlan@sydneyenergy.com.au",
        address: "42 George St, Sydney NSW 2000",
        notes: "Installing 15kW commercial solar array on roof.",
        estimated_value: 22000,
        created_at: "2026-11-23T11:00:00Z",
      },
    ],
    "N8N_WEBHOOK",
    "webhook-stream",
    "AU"
  );

  console.log("Database seeded successfully with multi-tenant isolation, clean masters, duplicates, and quarantine records!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
