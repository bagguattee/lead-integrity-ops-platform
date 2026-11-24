import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { WebhookInboundPayloadSchema } from "@/contracts/lead-contracts";
import { getTenantSnapshot, ingestStoreBatch } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Live Inbound n8n Webhook Endpoint:
 * Consumes lead batches with constant-time HMAC-SHA256 signature verification,
 * executes deterministic normalization + dedupe + FinOps circuit-breaker,
 * and returns two-sided reconciliation proof.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-n8n-signature") || req.headers.get("x-signature-sha256");
    const requestedSlug =
      req.headers.get("x-tenant-slug") || req.nextUrl.searchParams.get("tenant") || "apex-roofing";

    const validSlugs = new Set(["apex-roofing", "summit-solar", "thames-heating"]);
    if (!validSlugs.has(requestedSlug)) {
      return NextResponse.json({ error: `Tenant '${requestedSlug}' not found` }, { status: 404 });
    }

    const snap = getTenantSnapshot(requestedSlug);

    // Verify HMAC-SHA256 signature when header is supplied (or required via ?strict=1)
    const requireSig = req.nextUrl.searchParams.get("strict") === "1";
    if (requireSig && !signature) {
      return NextResponse.json({ error: "Missing x-n8n-signature header" }, { status: 401 });
    }

    if (signature) {
      const cleanHex = signature.replace(/^sha256=/i, "").trim();
      const expectedHex = crypto
        .createHmac("sha256", snap.tenant.webhookSecret)
        .update(rawBody)
        .digest("hex");

      const isHex = /^[0-9a-fA-F]+$/.test(cleanHex) && cleanHex.length === expectedHex.length;
      if (!isHex) {
        return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 401 });
      }

      const sigBuf = Buffer.from(cleanHex, "hex");
      const expBuf = Buffer.from(expectedHex, "hex");
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 401 });
      }
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parsed = WebhookInboundPayloadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload failed contract validation", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { leads, source, locale } = parsed.data;
    const run = ingestStoreBatch(
      snap.tenant.slug,
      leads as Record<string, unknown>[],
      source,
      "n8n_live_webhook_stream",
      locale || snap.tenant.localeDefault,
      "n8n Webhook Bridge"
    );

    const updatedSnap = getTenantSnapshot(snap.tenant.slug);
    const isReconciled =
      run.totalInbound ===
      run.cleanMastersCount + run.mergedDuplicates + run.quarantinedCount + run.systemFailuresCount;
    const httpStatus = run.quarantinedCount > 0 ? 202 : 200;

    return NextResponse.json(
      {
        status: run.quarantinedCount > 0 ? "QUARANTINED" : "SUCCESS",
        tenant: snap.tenant.slug,
        runId: run.id,
        reconciliation: {
          totalInbound: run.totalInbound,
          cleanMastersCount: run.cleanMastersCount,
          mergedDuplicates: run.mergedDuplicates,
          quarantinedCount: run.quarantinedCount,
          systemFailuresCount: run.systemFailuresCount,
          isReconciled,
        },
        finOps: {
          costCents: run.costCents,
          cacheSavingsCents: run.cacheSavingsCents,
          capped:
            updatedSnap.tenant.budget.isPaused ||
            updatedSnap.tenant.budget.currentSpendCents >= updatedSnap.tenant.budget.monthlyCapCents,
        },
      },
      { status: httpStatus }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
