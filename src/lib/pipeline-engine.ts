import { prisma } from "./prisma";
import { normalizeLead } from "./normalizer";
import { classifyLeadDedupe, ExistingLeadRecord } from "./dedupe";
import { triageLead } from "./triage";
import { checkAndRecordFinOps } from "./finops";
import { RawInboundLead } from "../contracts/lead-contracts";

export interface PipelineBatchResult {
  runId: string;
  totalInbound: number;
  cleanMastersCount: number;
  mergedDuplicates: number;
  quarantinedCount: number;
  systemFailuresCount: number;
  isReconciled: boolean;
  totalCostCents: number;
  totalCacheSavingsCents: number;
}

/**
 * Executes full pipeline batch with two-sided reconciliation:
 * Total Inbound = Clean Masters + Merged Duplicates + Quarantined Records + System Failures (0)
 */
export async function processPipelineBatch(
  tenantId: string,
  rawItems: RawInboundLead[],
  source: "CSV_UPLOAD" | "N8N_WEBHOOK" = "N8N_WEBHOOK",
  fileName?: string,
  locale: "US" | "AU" = "US"
): Promise<PipelineBatchResult> {
  // 1. Create IngestionRun record
  const run = await prisma.ingestionRun.create({
    data: {
      tenantId,
      source,
      fileName,
      locale,
      status: "PROCESSING",
      totalInbound: rawItems.length,
    },
  });

  let cleanMastersCount = 0;
  let mergedDuplicates = 0;
  let quarantinedCount = 0;
  let systemFailuresCount = 0;
  let totalCostCents = 0;
  let totalCacheSavingsCents = 0;

  try {
    // Fetch all existing masters for this tenant to evaluate deduplication & commercial hubs
    const existingMastersRaw = await prisma.leadMaster.findMany({
      where: { tenantId },
      select: {
        id: true,
        normalizedPhone: true,
        normalizedEmail: true,
        canonicalName: true,
        isTcpaOptedOut: true,
        isSharedHub: true,
        createdAt: true,
        rawPayloadHash: true,
      },
    });

    const existingMasters: ExistingLeadRecord[] = existingMastersRaw.map((m) => ({
      ...m,
      createdAt: m.createdAt,
    }));

    // Build phone household map
    const phoneHouseholdCountMap = new Map<string, number>();
    for (const m of existingMasters) {
      if (m.normalizedPhone) {
        const count = phoneHouseholdCountMap.get(m.normalizedPhone) || 0;
        phoneHouseholdCountMap.set(m.normalizedPhone, count + 1);
      }
    }

    // Process each item sequentially in memory/db
    for (const raw of rawItems) {
      try {
        const normalized = normalizeLead(raw, locale);
        const triage = triageLead(raw.notes, normalized.estimatedValue);
        normalized.triageScore = triage.urgencyScore;
        normalized.triageConfidence = triage.confidence;
        normalized.intentCategory = triage.intentCategory;

        // Classify deduplication & safety gates
        const classification = classifyLeadDedupe(normalized, existingMasters, phoneHouseholdCountMap);

        if (classification.type === "QUARANTINE") {
          await prisma.quarantineRecord.create({
            data: {
              tenantId,
              runId: run.id,
              reason: classification.quarantineReason || "INVALID_SHAPE",
              contaminatingRecord: classification.contaminatingRecord || null,
              rawPayload: JSON.stringify(raw),
            },
          });
          quarantinedCount++;
          continue;
        }

        if (classification.type === "MERGE_ALIAS" && classification.matchedMasterId) {
          await prisma.leadAlias.create({
            data: {
              tenantId,
              masterId: classification.matchedMasterId,
              runId: run.id,
              rawName: normalized.canonicalName,
              rawPhone: normalized.normalizedPhone,
              rawEmail: normalized.normalizedEmail,
              rawAddress: normalized.rawAddress,
              rawPayload: JSON.stringify(raw),
              matchTier: classification.matchTier || "TIER_1_EXACT",
              payloadHash: normalized.payloadHash,
            },
          });

          // Check FinOps (Cache hit because master already exists)
          const finOps = await checkAndRecordFinOps(
            tenantId,
            run.id,
            normalized.normalizedPhone || normalized.normalizedEmail || "unknown",
            true
          );
          totalCacheSavingsCents += finOps.cacheSavingsCents;

          mergedDuplicates++;
          continue;
        }

        // Otherwise NEW_MASTER
        // Run FinOps check
        const finOps = await checkAndRecordFinOps(
          tenantId,
          run.id,
          normalized.normalizedPhone || normalized.normalizedEmail || "unknown",
          false
        );
        totalCostCents += finOps.costCents;

        const newMaster = await prisma.leadMaster.create({
          data: {
            tenantId,
            runId: run.id,
            canonicalName: normalized.canonicalName,
            firstName: normalized.firstName,
            lastName: normalized.lastName,
            normalizedPhone: normalized.normalizedPhone,
            normalizedEmail: normalized.normalizedEmail,
            rawAddress: normalized.rawAddress,
            street: normalized.street,
            city: normalized.city,
            state: normalized.state,
            zip: normalized.zip,
            rawPayloadHash: normalized.payloadHash,
            isSharedHub: false,
            isTcpaOptedOut: normalized.isTcpaOptedOut,
            triageScore: normalized.triageScore,
            triageConfidence: normalized.triageConfidence,
            intentCategory: normalized.intentCategory,
            estimatedValue: normalized.estimatedValue,
            status: "CLEAN_MASTER",
          },
        });

        // Add to in-memory lookup for subsequent rows in this same batch
        existingMasters.push({
          id: newMaster.id,
          normalizedPhone: newMaster.normalizedPhone,
          normalizedEmail: newMaster.normalizedEmail,
          canonicalName: newMaster.canonicalName,
          isTcpaOptedOut: newMaster.isTcpaOptedOut,
          isSharedHub: newMaster.isSharedHub,
          createdAt: newMaster.createdAt,
          rawPayloadHash: newMaster.rawPayloadHash,
        });

        if (newMaster.normalizedPhone) {
          const c = phoneHouseholdCountMap.get(newMaster.normalizedPhone) || 0;
          phoneHouseholdCountMap.set(newMaster.normalizedPhone, c + 1);
        }

        cleanMastersCount++;
      } catch (err: any) {
        systemFailuresCount++;
      }
    }

    const isReconciled = rawItems.length === cleanMastersCount + mergedDuplicates + quarantinedCount + systemFailuresCount;

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: systemFailuresCount === 0 ? "COMPLETED" : "FAILED",
        cleanMastersCount,
        mergedDuplicates,
        quarantinedCount,
        systemFailuresCount,
      },
    });

    return {
      runId: run.id,
      totalInbound: rawItems.length,
      cleanMastersCount,
      mergedDuplicates,
      quarantinedCount,
      systemFailuresCount,
      isReconciled,
      totalCostCents,
      totalCacheSavingsCents,
    };
  } catch (globalErr: any) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: String(globalErr.message || globalErr),
      },
    });
    throw globalErr;
  }
}
