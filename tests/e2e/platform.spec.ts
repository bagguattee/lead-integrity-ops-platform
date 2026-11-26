import crypto from "crypto";
import { test, expect } from "@playwright/test";

test.describe.serial("IntegrityOps 99th-Percentile E2E Verification Suite", () => {
  test("1. Multi-Tenant Isolation & Localized Currency / Compliance (US -> AU -> UK -> US)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("active-workspace-heading")).toContainText("Apex Roofing TX");
    await expect(page.getByTestId("business-roi-strip")).toBeVisible();

    // Switch to Summit Solar AU
    await page.getByTestId("switch-btn-summit-solar").click();
    await expect(page.getByTestId("active-workspace-heading")).toContainText("Summit Solar AU");
    await expect(page.locator("body")).toContainText("A$");
    await expect(page.locator("body")).toContainText("+61 E.164");
    await expect(page.locator("body")).toContainText("AU Spam Act 2003");

    // Switch to Thames Heating UK
    await page.getByTestId("switch-btn-thames-heating").click();
    await expect(page.getByTestId("active-workspace-heading")).toContainText("Thames Heating UK");
    await expect(page.locator("body")).toContainText("£");
    await expect(page.locator("body")).toContainText("+44 E.164");
    await expect(page.locator("body")).toContainText("UK PECR & GDPR");

    // Return to Apex Roofing TX
    await page.getByTestId("switch-btn-apex-roofing").click();
    await expect(page.getByTestId("active-workspace-heading")).toContainText("Apex Roofing TX");
  });

  test("2. Honest Enrichment Degradation (API 503 Outage -> Zero Fabricated Data -> Backfill Recovery)", async ({ page }) => {
    await page.goto("/dashboard");

    // Ensure simulated external property API outage is ON
    const outageBtn = page.getByTestId("header-outage-btn");
    const btnText = await outageBtn.textContent();
    if (btnText?.includes("Sim API Outage")) {
      await outageBtn.click();
      await expect(page.getByTestId("dashboard-status-banner")).toContainText("503 Property API Outage");
    }

    // Ingest a brand new lead (guaranteed cache miss) during API outage
    await page.getByTestId("rail-add-lead-btn").click();
    await page.getByPlaceholder("e.g. Hannah Montgomery").fill("Outage Honest Lead");
    await page.getByPlaceholder(/512|0412|07700/).fill("512-555-8841");
    await page.getByPlaceholder("prospect@gmial.com").fill("outage.honest@example.com");
    await page.getByPlaceholder("15000").fill("19500");
    await page.getByRole("button", { name: /Run Through Pipeline/i }).click();
    await expect(page.locator("body")).toContainText("Normalized Phone: +15125558841");
    await page.getByRole("button", { name: /^Close$/i }).click();

    // Verify UNENRICHED_DEGRADED is explicitly surfaced with ZERO fabricated data
    await expect(page.getByTestId("unenriched-backfill-banner")).toBeVisible();
    await expect(page.getByTestId("lead-operations-ledger")).toContainText("Outage Honest Lead");
    await expect(page.getByTestId("lead-operations-ledger")).toContainText("UNENRICHED (NO FAKE)");

    // Check /reactivation confirms propertyEnrichment is null ("UNENRICHED (NO FAKE DATA)")
    await page.goto("/reactivation");
    await expect(page.getByTestId("master-unenriched-badge").first()).toBeVisible();

    // Restore API health and run Backfill Queue
    await page.goto("/dashboard");
    await page.getByTestId("header-outage-btn").click();
    await expect(page.getByTestId("dashboard-status-banner")).toContainText("External Property API restored");

    await page.getByTestId("run-backfill-btn").click();
    await expect(page.getByTestId("dashboard-status-banner")).toContainText("Backfilled");
    await expect(page.getByTestId("unenriched-backfill-banner")).toHaveCount(0);
  });

  test("3. Scale Test (30-Lead Batch) + Bounded Scroll + Ledger Pagination & Live Search", async ({ page }) => {
    await page.goto("/runs");
    await page.getByTestId("load-stress-csv-btn").click();
    await page.getByTestId("execute-csv-btn").click();
    await expect(page.getByTestId("runs-status-banner")).toContainText("30 Inbound");

    // Return to dashboard and verify pagination prevents infinite page growth
    await page.goto("/dashboard");
    const rowsOnPage1 = await page.getByTestId("ledger-row").count();
    expect(rowsOnPage1).toBe(8);
    await expect(page.getByTestId("ledger-page-indicator")).toContainText("Page 1 /");

    // Advance to Page 2
    await page.getByTestId("ledger-next-page").click();
    await expect(page.getByTestId("ledger-page-indicator")).toContainText("Page 2 /");

    // Test live search across ledger
    await page.getByTestId("ledger-search-input").fill("Scale Lead 15");
    await expect(page.getByTestId("lead-operations-ledger")).toContainText("Scale Lead 15");
    expect(await page.getByTestId("ledger-row").count()).toBeGreaterThanOrEqual(1);
  });

  test("4. Action-Level RBAC 403 Enforcement & Audit Trail Actor Attribution", async ({ page }) => {
    await page.goto("/settings");
    await page.getByTestId("set-role-VIEWER").click();
    await expect(page.getByTestId("settings-status-banner")).toContainText("VIEWER");

    // Attempt mutation as VIEWER -> must fail closed with 403 Forbidden
    await page.getByTestId("finops-cap-input").fill("99");
    await page.getByTestId("save-finops-btn").click();
    await expect(page.getByTestId("settings-status-banner")).toContainText("403 Forbidden");

    // Restore ADMIN role and verify audit trail records actorName + actorRole
    await page.getByTestId("set-role-ADMIN").click();
    await expect(page.getByTestId("audit-trail-list")).toContainText("Marcus Vance (");
  });

  test("5. Interactive 2-Way Voice AI Call (Booking + Mid-Call Opt-Out -> Pre-Dial DNC Hard Block)", async ({ page }) => {
    await page.goto("/voice");
    await expect(page.locator("body")).toContainText("Ash");
    await expect(page.locator("body")).toContainText("You Play Customer");

    // Verify mode separation: QA Replay hides interactive reply panel
    await page.getByTestId("voice-mode-qa").click();
    await expect(page.getByTestId("interactive-reply-panel")).not.toBeVisible();
    await page.getByTestId("voice-mode-interactive").click();

    // Start live interactive call as customer and test pricing guard + appointment booking
    await page.getByTestId("voice-lead-select").selectOption({ index: 2 });
    await page.getByTestId("start-interactive-call-btn").click();
    await expect(page.getByTestId("selected-call-outcome")).toContainText("LIVE CALL ACTIVE");
    await expect(page.getByTestId("interactive-reply-panel")).toBeVisible();

    // Ask pricing question -> Ash must refuse to fabricate a quote & call check_availability
    await page.getByTestId("voice-customer-input").fill("How much does a new roof cost?");
    await page.getByTestId("voice-send-reply-btn").click();
    await expect(page.getByTestId("voice-transcript-box")).toContainText("never guess or quote prices");
    await expect(page.getByTestId("voice-tool-events")).toContainText("check_availability");

    // Confirm first slot -> Ash must invoke book_appointment
    await page.getByTestId("voice-customer-input").fill("The first slot works for me, book it!");
    await page.getByTestId("voice-send-reply-btn").click();
    await expect(page.getByTestId("booked-slot-badge")).toBeVisible();
    await expect(page.getByTestId("voice-tool-events")).toContainText("book_appointment");
    await page.getByTestId("hangup-call-btn").click();
    await expect(page.getByTestId("selected-call-outcome")).toContainText("APPOINTMENT_BOOKED");

    // Now test Mid-Call Consent Revocation on another lead -> then prove Pre-Dial Gate hard-blocks next attempt!
    await page.getByTestId("voice-lead-select").selectOption({ index: 3 });
    await page.getByTestId("start-interactive-call-btn").click();
    await expect(page.getByTestId("selected-call-outcome")).toContainText("LIVE CALL ACTIVE");

    await page.getByTestId("voice-customer-input").fill("Please stop calling me and take me off your list.");
    await page.getByTestId("voice-send-reply-btn").click();
    await expect(page.getByTestId("selected-call-outcome")).toContainText("OPTED_OUT");
    await expect(page.getByTestId("dnc-enforced-badge")).toBeVisible();
    await expect(page.getByTestId("voice-tool-events")).toContainText("flag_do_not_call");

    // Re-attempt calling the exact same lead -> Pre-Dial Gate MUST hard-block before ringing!
    await page.getByTestId("start-interactive-call-btn").click();
    await expect(page.getByTestId("voice-status-banner")).toContainText("Pre-Dial Gate Blocked");
    await expect(page.getByTestId("selected-call-outcome")).toContainText("BLOCKED_BY_GATE");
  });

  test("6. Live HMAC-SHA256 n8n Webhook + Vapi Webhook Endpoint Security", async ({ request }) => {
    const body = JSON.stringify({
      source: "N8N_WEBHOOK",
      locale: "US",
      leads: [
        {
          name: "Webhook Verified Lead",
          phone: "(512) 555-7741",
          email: "webhook.verified@example.com",
          estimated_value: 22400,
          notes: "Active storm roof leak urgent",
        },
      ],
    });

    // Forged signature MUST return 401
    const badRes = await request.post("/api/webhooks/n8n-ingest?tenant=apex-roofing&strict=1", {
      data: body,
      headers: { "content-type": "application/json", "x-n8n-signature": "deadbeef" },
    });
    expect(badRes.status()).toBe(401);

    // Valid HMAC-SHA256 signature MUST return 200 and reconcile 100%
    const secret = "whsec_apex_tx_secret_key_998877";
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const goodRes = await request.post("/api/webhooks/n8n-ingest?tenant=apex-roofing&strict=1", {
      data: body,
      headers: { "content-type": "application/json", "x-n8n-signature": `sha256=${sig}` },
    });
    expect(goodRes.status()).toBe(200);
    const goodJson = await goodRes.json();
    expect(goodJson.reconciliation.isReconciled).toBe(true);
    expect(goodJson.reconciliation.totalInbound).toBe(1);

    // Vapi webhook without secret MUST return 401
    const badVapi = await request.post("/api/webhooks/vapi?tenant=apex-roofing", {
      data: JSON.stringify({ message: { type: "status-update" } }),
      headers: { "content-type": "application/json" },
    });
    expect(badVapi.status()).toBe(401);

    // Vapi webhook with valid secret tool-call MUST return slots
    const vapiSecret = process.env.VAPI_WEBHOOK_SECRET || "whsec_vapi_voice_ai_lead_qualification_audit";
    const goodVapi = await request.post("/api/webhooks/vapi?tenant=apex-roofing", {
      data: JSON.stringify({
        message: {
          type: "tool-calls",
          call: { id: "vapi_test_1", metadata: { tenantSlug: "apex-roofing" } },
          toolCallList: [{ id: "tc_1", name: "check_availability", arguments: {} }],
        },
      }),
      headers: { "content-type": "application/json", "x-vapi-secret": vapiSecret },
    });
    expect(goodVapi.status()).toBe(200);
    const vapiJson = await goodVapi.json();
    expect(vapiJson.results[0].result).toContain("Available on-site inspection slots");
  });
});
