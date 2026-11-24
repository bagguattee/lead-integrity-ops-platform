import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processPipelineBatch } from "@/lib/pipeline-engine";
import { WebhookInboundPayloadSchema } from "@/contracts/lead-contracts";

export const dynamic = "force-dynamic";

/**
 * Live Inbound n8n Webhook Endpoint:
 * Consumes lead batches with HMAC-SHA256 signature verification.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-n8n-signature") || req.headers.get("x-signature-sha256");
    const tenantSlug = req.headers.get("x-tenant-slug") || req.nextUrl.searchParams.get("tenant") || "apex-roofing";

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      return NextResponse.json({ error: `Tenant '${tenantSlug}' not found` }, { status: 404 });
    }

    // Verify HMAC signature if provided
    if (signature) {
      const expectedSignature = crypto
        .createHmac("sha256", tenant.webhookSecret)
        .update(rawBody)
        .digest("hex");

      const match = crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );

      if (!match) {
        return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 401 });
      }
    }

    const json = JSON.parse(rawBody);
    const parsed = WebhookInboundPayloadSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload failed contract validation", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { leads, source, locale } = parsed.data;

    // Execute synchronous pipeline batch with strict two-sided reconciliation
    const result = await processPipelineBatch(
      tenant.id,
      leads as any,
      source,
      "n8n-live-webhook",
      locale
    );

    const httpStatus = result.quarantinedCount > 0 ? 202 : 200;

    return NextResponse.json(
      {
        status: result.quarantinedCount > 0 ? "QUARANTINED" : "SUCCESS",
        runId: result.runId,
        reconciliation: {
          totalInbound: result.totalInbound,
          cleanMastersCount: result.cleanMastersCount,
          mergedDuplicates: result.mergedDuplicates,
          quarantinedCount: result.quarantinedCount,
          systemFailuresCount: result.systemFailuresCount,
          isReconciled: result.isReconciled,
        },
        finOps: {
          costCents: result.totalCostCents,
          cacheSavingsCents: result.totalCacheSavingsCents,
          capped: false,
        },
      },
      { status: httpStatus }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
