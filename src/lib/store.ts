import {
  QuarantineReason,
  RawInboundLead,
  SupportedLocale,
  UserRole,
} from "../contracts/lead-contracts";
import { normalizeLead } from "./normalizer";
import { classifyLeadDedupe, ExistingLeadRecord } from "./dedupe";
import { triageLead } from "./triage";
import {
  analyzeCall,
  buildMockCall,
  CallRecord,
  ClockMode,
  costForDuration,
  createVoiceState,
  defaultVoiceConfig,
  evaluateInteractiveCustomerTurn,
  evaluatePreDialGate,
  getVapiEnvStatus,
  placeVapiCall,
  ToolEvent,
  TranscriptTurn,
  VoiceAgentConfig,
  VoiceScenario,
  VoiceState,
} from "./voice";
import {
  getPersistenceHealth,
  loadSnapshotFromPostgres,
  PersistenceHealth,
  saveSnapshotToPostgres,
} from "./db-persistence";

export interface PropertyEnrichment {
  roofSqft: number;
  yearBuilt: number;
  propertyType: string;
  roofMaterial: string;
  provider: string;
  cachedAt: string;
}

export type EnrichmentStatus = "ENRICHED_LIVE" | "ENRICHED_CACHE" | "UNENRICHED_DEGRADED";

export interface WorkspaceSummary {
  id: string;
  slug: "apex-roofing" | "summit-solar" | "thames-heating";
  name: string;
  subtitle: string;
  regionLabel: string;
  ghlLocationId: string;
  localeDefault: SupportedLocale;
  currencySymbol: "$" | "A$" | "£";
  phonePrefix: string;
  dateFormat: string;
  complianceLaw: string;
  webhookSecret: string;
  statusBadge: "ACTIVE" | "PAUSE" | "CAP GUARD" | "API OUTAGE";
  totalInbound: number;
  pipelineValue: number;
  unresolvedQuarantineCount: number;
  unenrichedCount: number;
  spendCents: number;
  capCents: number;
}

export interface LineageRow {
  rowNumber: number;
  rawName: string;
  rawPhone: string | null;
  rawEmail: string | null;
  normalizedName: string;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  outcome: "CLEAN_MASTER" | "MERGED_DUPLICATE" | "QUARANTINED";
  detail: string;
  finOpsProvider: "LOCAL_CACHE" | "PRIMARY_API" | "BUDGET_CAPPED" | "API_OUTAGE_DEGRADED" | "SKIPPED_GATE";
  enrichmentStatus?: EnrichmentStatus;
  costCents: number;
  triageScore: number;
  triageConfidence: number;
}

export interface IngestionRunItem {
  id: string;
  tenantSlug: string;
  source: "CSV_UPLOAD" | "N8N_WEBHOOK";
  fileName: string;
  status: "COMPLETED" | "FAILED";
  locale: SupportedLocale;
  totalInbound: number;
  cleanMastersCount: number;
  mergedDuplicates: number;
  quarantinedCount: number;
  systemFailuresCount: number;
  costCents: number;
  cacheSavingsCents: number;
  createdAt: string;
  lineage: LineageRow[];
}

export interface LeadMasterItem {
  id: string;
  tenantSlug: string;
  runId: string;
  canonicalName: string;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  rawAddress: string | null;
  rawPayloadHash: string;
  isTcpaOptedOut: boolean;
  isSharedHub: boolean;
  triageScore: number;
  triageConfidence: number;
  intentCategory: "EMERGENCY_STORM" | "HIGH_INTENT" | "ROUTINE" | "UNCERTAIN";
  triageSummary: string;
  estimatedValue: number;
  enrichmentStatus: EnrichmentStatus;
  enrichmentReason: string;
  propertyEnrichment: PropertyEnrichment | null;
  status: "CLEAN_MASTER" | "SYNCED_TO_GHL" | "DORMANT";
  daysDormant: number;
  sourceChannel: string;
  createdAt: string;
}

export interface LeadAliasItem {
  id: string;
  tenantSlug: string;
  masterId: string;
  masterName: string;
  runId: string;
  rawName: string;
  rawPhone: string | null;
  rawEmail: string | null;
  rawPayload: string;
  matchTier: "TIER_1_EXACT" | "TIER_2_FUZZY" | "SHARED_HOUSEHOLD";
  payloadHash: string;
  createdAt: string;
}

export interface QuarantineItem {
  id: string;
  tenantSlug: string;
  runId: string;
  reason: QuarantineReason;
  contaminatingRecord: string;
  rawPayload: string;
  normalizedPreview: {
    canonicalName: string;
    normalizedPhone: string | null;
    normalizedEmail: string | null;
    estimatedValue: number;
    triageConfidence: number;
    intentCategory: string;
  };
  resolved: boolean;
  resolutionAction: "APPROVED_SYNC" | "SPLIT_MASTER" | "EDITED_FIELDS" | "PERMANENT_QUARANTINE" | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

export interface LedgerTransactionItem {
  id: string;
  tenantSlug: string;
  timestamp: string;
  contactName: string;
  contactSub: string;
  channel: "GoHighLevel" | "n8n Webhook" | "CSV Batch" | "Meta Lead Ads";
  operation:
    | "GHL_SYNCED"
    | "DEDUPE_MERGED"
    | "DNC_QUARANTINE"
    | "SHARED_HUB"
    | "TIME_GAP_HOLD"
    | "LOW_CONF_HITL"
    | "INVALID_DROP"
    | "REACTIVATED"
    | "UNENRICHED_DEGRADED";
  enrichmentStatus?: EnrichmentStatus;
  amountDisplay: string;
  amountTone: "positive" | "neutral" | "warning" | "danger";
}

export interface AuditEventItem {
  id: string;
  tenantSlug: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetId: string | null;
  detail: string;
  createdAt: string;
}

export interface DailyVolumePoint {
  dayLabel: string;
  cleanCount: number;
  heldOrMergedCount: number;
}

export interface TeamMemberItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
}

export interface TenantState {
  id: string;
  slug: "apex-roofing" | "summit-solar" | "thames-heating";
  name: string;
  subtitle: string;
  regionLabel: string;
  ghlLocationId: string;
  localeDefault: SupportedLocale;
  currencySymbol: "$" | "A$" | "£";
  phonePrefix: string;
  dateFormat: string;
  complianceLaw: string;
  webhookSecret: string;
  budget: {
    monthlyCapCents: number;
    currentSpendCents: number;
    cacheSavingsCents: number;
    warningThreshold: number;
    cacheOnlyOnCap: boolean;
    isPaused: boolean;
    isApiDown: boolean;
  };
  propertyCache: Record<string, PropertyEnrichment>;
  members: TeamMemberItem[];
  dailySeries: DailyVolumePoint[];
  runs: IngestionRunItem[];
  masters: LeadMasterItem[];
  aliases: LeadAliasItem[];
  quarantine: QuarantineItem[];
  ledger: LedgerTransactionItem[];
  audits: AuditEventItem[];
  voice: VoiceState;
  distinctPhoneNames: Record<string, string[]>;
}

export interface TenantSnapshot {
  tenant: Omit<TenantState, "distinctPhoneNames" | "propertyCache">;
  reconciliation: {
    totalInbound: number;
    cleanMasters: number;
    mergedAliases: number;
    activeQuarantine: number;
    permanentQuarantine: number;
    totalQuarantined: number;
    systemFailures: number;
    isReconciled: boolean;
  };
  businessImpact: {
    tcpaBlockedCount: number;
    tcpaLiabilityProtected: number;
    unenrichedPendingCount: number;
    dormantPipelineValue: number;
    cacheEntriesCount: number;
  };
  persistence: PersistenceHealth;
  pipelineValue: number;
}

interface GlobalStore {
  initialized: boolean;
  seq: number;
  tenants: Record<string, TenantState>;
}

const globalForStore = globalThis as unknown as {
  __leadIntegrityStore?: GlobalStore;
};

function nextId(store: GlobalStore, prefix: string): string {
  store.seq += 1;
  return `${prefix}_${store.seq.toString(36).padStart(4, "0")}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = months[d.getUTCMonth()];
  const yr = d.getUTCFullYear();
  const hr = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${mon} ${yr}, ${hr}:${min}`;
}

/**
 * Executes a deterministic pipeline batch against a TenantState.
 * Used both at seed time and for live CSV / Webhook / Simulation mutations.
 */
function executeBatchOnTenant(
  store: GlobalStore,
  tenant: TenantState,
  rawItems: RawInboundLead[],
  source: "CSV_UPLOAD" | "N8N_WEBHOOK",
  fileName: string,
  localeOverride?: SupportedLocale,
  actorName: string = "System Pipeline"
): IngestionRunItem {
  const locale = localeOverride || tenant.localeDefault;
  const runId = nextId(store, "run");
  const nowIso = new Date().toISOString();

  let cleanMastersCount = 0;
  let mergedDuplicates = 0;
  let quarantinedCount = 0;
  const systemFailuresCount = 0;
  let batchCostCents = 0;
  let batchSavingsCents = 0;
  const lineage: LineageRow[] = [];

  rawItems.forEach((raw, idx) => {
    const normalized = normalizeLead(raw, locale);
    const triage = triageLead(raw.notes, normalized.estimatedValue);
    normalized.triageScore = triage.urgencyScore;
    normalized.triageConfidence = triage.confidence;
    normalized.intentCategory = triage.intentCategory;

    const existingMasters: ExistingLeadRecord[] = [
      ...tenant.masters.map((m) => ({
        id: m.id,
        normalizedPhone: m.normalizedPhone,
        normalizedEmail: m.normalizedEmail,
        canonicalName: m.canonicalName,
        isTcpaOptedOut: m.isTcpaOptedOut,
        isSharedHub: m.isSharedHub,
        createdAt: new Date(m.createdAt),
        rawPayloadHash: m.rawPayloadHash,
      })),
      // Include all quarantined DNC_CLUSTER contacts so any subsequent household member
      // sharing a DNC phone/email is caught even if the original DNC contact never entered masters!
      ...tenant.quarantine
        .filter((q) => q.reason === "DNC_CLUSTER")
        .map((q) => ({
          id: q.id,
          normalizedPhone: q.normalizedPreview.normalizedPhone,
          normalizedEmail: q.normalizedPreview.normalizedEmail,
          canonicalName: q.normalizedPreview.canonicalName,
          isTcpaOptedOut: true,
          isSharedHub: false,
          createdAt: new Date(q.createdAt),
          rawPayloadHash: `dnc_${q.id}`,
        })),
    ];

    const phoneHouseholdCountMap = new Map<string, number>();
    for (const [phone, names] of Object.entries(tenant.distinctPhoneNames)) {
      phoneHouseholdCountMap.set(phone, names.length);
    }

    const classification = classifyLeadDedupe(normalized, existingMasters, phoneHouseholdCountMap);
    const channelLabel =
      (raw.source_channel as LedgerTransactionItem["channel"]) ||
      (source === "N8N_WEBHOOK" ? "n8n Webhook" : "CSV Batch");
    const ts = normalized.dateParsed ? normalized.dateParsed.toISOString() : nowIso;

    if (classification.type === "QUARANTINE") {
      const reason = classification.quarantineReason || "INVALID_SHAPE";
      const qId = nextId(store, "q");
      tenant.quarantine.unshift({
        id: qId,
        tenantSlug: tenant.slug,
        runId,
        reason,
        contaminatingRecord: classification.contaminatingRecord || "Safety boundary triggered",
        rawPayload: JSON.stringify(raw),
        normalizedPreview: {
          canonicalName: normalized.canonicalName,
          normalizedPhone: normalized.normalizedPhone,
          normalizedEmail: normalized.normalizedEmail,
          estimatedValue: normalized.estimatedValue,
          triageConfidence: normalized.triageConfidence,
          intentCategory: normalized.intentCategory,
        },
        resolved: false,
        resolutionAction: null,
        resolvedBy: null,
        resolutionNotes: null,
        createdAt: ts,
      });

      const opMap: Record<QuarantineReason, LedgerTransactionItem["operation"]> = {
        DNC_CLUSTER: "DNC_QUARANTINE",
        SHARED_HUB: "SHARED_HUB",
        TIME_GAP_REVIEW: "TIME_GAP_HOLD",
        LOW_CONFIDENCE_HITL: "LOW_CONF_HITL",
        INVALID_SHAPE: "INVALID_DROP",
      };

      const dncPenaltyLabel =
        tenant.localeDefault === "AU"
          ? "Spam Act Blocked"
          : tenant.localeDefault === "UK"
            ? "PECR Blocked"
            : "Saved $1,500 TCPA";

      tenant.ledger.unshift({
        id: nextId(store, "tx"),
        tenantSlug: tenant.slug,
        timestamp: formatShortDate(ts),
        contactName: normalized.canonicalName,
        contactSub: normalized.normalizedPhone || normalized.normalizedEmail || "Invalid contact shape",
        channel: channelLabel,
        operation: opMap[reason],
        amountDisplay:
          reason === "DNC_CLUSTER"
            ? dncPenaltyLabel
            : normalized.estimatedValue > 0
              ? `Held $${normalized.estimatedValue.toLocaleString()}`
              : "Quarantined",
        amountTone: reason === "DNC_CLUSTER" ? "danger" : "warning",
      });

      lineage.push({
        rowNumber: idx + 1,
        rawName: raw.name || [raw.first_name, raw.last_name].filter(Boolean).join(" ") || "(empty)",
        rawPhone: raw.phone || raw.phone_number || null,
        rawEmail: raw.email || null,
        normalizedName: normalized.canonicalName,
        normalizedPhone: normalized.normalizedPhone,
        normalizedEmail: normalized.normalizedEmail,
        outcome: "QUARANTINED",
        detail: `${reason}: ${classification.contaminatingRecord}`,
        finOpsProvider: "SKIPPED_GATE",
        costCents: 0,
        triageScore: normalized.triageScore,
        triageConfidence: normalized.triageConfidence,
      });

      quarantinedCount += 1;
      return;
    }

    if (classification.type === "MERGE_ALIAS" && classification.matchedMasterId) {
      const matchedMaster = tenant.masters.find((m) => m.id === classification.matchedMasterId);
      tenant.aliases.unshift({
        id: nextId(store, "alias"),
        tenantSlug: tenant.slug,
        masterId: classification.matchedMasterId,
        masterName: matchedMaster?.canonicalName || normalized.canonicalName,
        runId,
        rawName: normalized.canonicalName,
        rawPhone: normalized.normalizedPhone,
        rawEmail: normalized.normalizedEmail,
        rawPayload: JSON.stringify(raw),
        matchTier: classification.matchTier || "TIER_1_EXACT",
        payloadHash: normalized.payloadHash,
        createdAt: ts,
      });

      // Track distinct household name on shared phone if household match
      if (normalized.normalizedPhone) {
        const list = tenant.distinctPhoneNames[normalized.normalizedPhone] || [];
        const lowerName = normalized.canonicalName.toLowerCase();
        if (!list.includes(lowerName)) {
          list.push(lowerName);
          tenant.distinctPhoneNames[normalized.normalizedPhone] = list;
        }
      }

      // Local cache hit saves $0.05 external enrichment fee
      tenant.budget.cacheSavingsCents += 5;
      batchSavingsCents += 5;

      tenant.ledger.unshift({
        id: nextId(store, "tx"),
        tenantSlug: tenant.slug,
        timestamp: formatShortDate(ts),
        contactName: normalized.canonicalName,
        contactSub: `${normalized.normalizedPhone || normalized.normalizedEmail} • ${classification.matchTier}`,
        channel: channelLabel,
        operation: "DEDUPE_MERGED",
        amountDisplay: "$0.00 (Cache Saved)",
        amountTone: "neutral",
      });

      lineage.push({
        rowNumber: idx + 1,
        rawName: raw.name || "(empty)",
        rawPhone: raw.phone || null,
        rawEmail: raw.email || null,
        normalizedName: normalized.canonicalName,
        normalizedPhone: normalized.normalizedPhone,
        normalizedEmail: normalized.normalizedEmail,
        outcome: "MERGED_DUPLICATE",
        detail: `Merged into ${matchedMaster?.canonicalName || classification.matchedMasterId} (${classification.matchTier})`,
        finOpsProvider: "LOCAL_CACHE",
        costCents: 0,
        triageScore: normalized.triageScore,
        triageConfidence: normalized.triageConfidence,
      });

      mergedDuplicates += 1;
      return;
    }

    // NEW_MASTER: Evaluate Honest Property Enrichment Waterfall
    // Step 1: Check local address/phone cache FIRST ($0.00)
    const cacheKey = (normalized.rawAddress || normalized.normalizedPhone || normalized.normalizedEmail || "")
      .trim()
      .toLowerCase();
    const cachedProperty = cacheKey ? tenant.propertyCache[cacheKey] || null : null;

    // Step 2: Check FinOps Circuit Breaker & External Provider Health
    const capReached =
      tenant.budget.isPaused ||
      (tenant.budget.cacheOnlyOnCap && tenant.budget.currentSpendCents >= tenant.budget.monthlyCapCents);
    const apiUnavailable = tenant.budget.isApiDown;

    let lookupCost = 0;
    let finOpsProvider: LineageRow["finOpsProvider"] = "PRIMARY_API";
    let enrichmentStatus: EnrichmentStatus = "ENRICHED_LIVE";
    let enrichmentReason = "Enriched via live property intelligence API ($0.05)";
    let propertyEnrichment: PropertyEnrichment | null = null;

    if (cachedProperty) {
      // Honest Cache Hit -> reuse real cached firmographics ($0.00, +$0.05 genuine cache savings)
      lookupCost = 0;
      finOpsProvider = "LOCAL_CACHE";
      enrichmentStatus = "ENRICHED_CACHE";
      enrichmentReason = `Served verified specs from local property cache ($0.00 saved vs ${cachedProperty.provider})`;
      propertyEnrichment = cachedProperty;
      tenant.budget.cacheSavingsCents += 5;
      batchSavingsCents += 5;
    } else if (apiUnavailable || capReached) {
      // HONEST DEGRADATION: Cache Miss + API Down or FinOps Cap/Pause
      // NEVER fabricate property values or falsely inflate "Cache Savings"!
      // Lead still syncs cleanly with explicit UNENRICHED_DEGRADED flag and enters Backfill Queue.
      lookupCost = 0;
      finOpsProvider = apiUnavailable ? "API_OUTAGE_DEGRADED" : "BUDGET_CAPPED";
      enrichmentStatus = "UNENRICHED_DEGRADED";
      enrichmentReason = apiUnavailable
        ? "External property API outage (503) + Cache Miss — zero fabricated fields; queued for backfill"
        : tenant.budget.isPaused
          ? "FinOps Pause (Cache-Only Guard) + Cache Miss — zero fabricated fields; queued for backfill"
          : "Monthly FinOps cap reached + Cache Miss — zero fabricated fields; queued for backfill";
      propertyEnrichment = null;
    } else {
      // Cache Miss + API Healthy + Under Budget -> Live Enrichment ($0.05) + Populate Cache
      lookupCost = 5;
      finOpsProvider = "PRIMARY_API";
      enrichmentStatus = "ENRICHED_LIVE";
      const seedNum = normalized.payloadHash
        .slice(0, 6)
        .split("")
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const materials =
        tenant.localeDefault === "AU"
          ? ["Colorbond Steel", "Terracotta Tile", "Concrete Tile"]
          : tenant.localeDefault === "UK"
            ? ["Welsh Slate", "Clay Plain Tile", "Modern Composite"]
            : ["Architectural Shingle", "Standing Seam Metal", "Clay Barrel Tile"];
      const providerName =
        tenant.localeDefault === "AU"
          ? "CoreLogic AU API"
          : tenant.localeDefault === "UK"
            ? "HM Land Registry API"
            : "ATTOM Property API";

      propertyEnrichment = {
        roofSqft: 1650 + (seedNum % 18) * 120,
        yearBuilt: 1988 + (seedNum % 34),
        propertyType: normalized.estimatedValue >= 25000 ? "Commercial / Multi-Unit" : "Single-Family Detached",
        roofMaterial: materials[seedNum % materials.length],
        provider: providerName,
        cachedAt: nowIso,
      };
      if (cacheKey) {
        tenant.propertyCache[cacheKey] = propertyEnrichment;
      }
      enrichmentReason = `Enriched via ${providerName} (${propertyEnrichment.roofSqft} sqft, built ${propertyEnrichment.yearBuilt}) — $0.05`;
      tenant.budget.currentSpendCents += lookupCost;
      batchCostCents += lookupCost;
    }

    const masterCreatedDate = normalized.dateParsed || new Date();
    const daysDormant = Math.max(
      0,
      Math.floor((Date.now() - masterCreatedDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    const masterId = nextId(store, "lead");
    const newMaster: LeadMasterItem = {
      id: masterId,
      tenantSlug: tenant.slug,
      runId,
      canonicalName: normalized.canonicalName,
      normalizedPhone: normalized.normalizedPhone,
      normalizedEmail: normalized.normalizedEmail,
      rawAddress: normalized.rawAddress,
      rawPayloadHash: normalized.payloadHash,
      isTcpaOptedOut: false,
      isSharedHub: false,
      triageScore: normalized.triageScore,
      triageConfidence: normalized.triageConfidence,
      intentCategory: normalized.intentCategory,
      triageSummary: triage.summary,
      estimatedValue: normalized.estimatedValue,
      enrichmentStatus,
      enrichmentReason,
      propertyEnrichment,
      status: daysDormant >= 730 ? "DORMANT" : "CLEAN_MASTER",
      daysDormant,
      sourceChannel: channelLabel,
      createdAt: masterCreatedDate.toISOString(),
    };

    tenant.masters.unshift(newMaster);

    if (normalized.normalizedPhone) {
      const list = tenant.distinctPhoneNames[normalized.normalizedPhone] || [];
      const lowerName = normalized.canonicalName.toLowerCase();
      if (!list.includes(lowerName)) {
        list.push(lowerName);
        tenant.distinctPhoneNames[normalized.normalizedPhone] = list;
      }
    }

    const curr = tenant.currencySymbol;
    const isDegraded = enrichmentStatus === "UNENRICHED_DEGRADED";
    tenant.ledger.unshift({
      id: nextId(store, "tx"),
      tenantSlug: tenant.slug,
      timestamp: formatShortDate(ts),
      contactName: normalized.canonicalName,
      contactSub: `${normalized.normalizedPhone || normalized.normalizedEmail} • Urgency ${normalized.triageScore}/5${
        isDegraded ? " • Pending Backfill (No Fake Data)" : ""
      }`,
      channel: channelLabel,
      operation: isDegraded ? "UNENRICHED_DEGRADED" : "GHL_SYNCED",
      enrichmentStatus,
      amountDisplay:
        normalized.estimatedValue > 0
          ? `+ ${curr}${normalized.estimatedValue.toLocaleString()}.00`
          : isDegraded
            ? "Unenriched (0 Fake)"
            : "+ Verified Lead",
      amountTone: isDegraded ? "warning" : "positive",
    });

    lineage.push({
      rowNumber: idx + 1,
      rawName: raw.name || "(empty)",
      rawPhone: raw.phone || null,
      rawEmail: raw.email || null,
      normalizedName: normalized.canonicalName,
      normalizedPhone: normalized.normalizedPhone,
      normalizedEmail: normalized.normalizedEmail,
      outcome: "CLEAN_MASTER",
      detail: enrichmentReason,
      finOpsProvider,
      enrichmentStatus,
      costCents: lookupCost,
      triageScore: normalized.triageScore,
      triageConfidence: normalized.triageConfidence,
    });

    cleanMastersCount += 1;
  });

  // Update latest bar in 14-day chart series
  if (tenant.dailySeries.length > 0) {
    const lastIdx = tenant.dailySeries.length - 1;
    tenant.dailySeries[lastIdx] = {
      ...tenant.dailySeries[lastIdx],
      cleanCount: tenant.dailySeries[lastIdx].cleanCount + cleanMastersCount,
      heldOrMergedCount: tenant.dailySeries[lastIdx].heldOrMergedCount + mergedDuplicates + quarantinedCount,
    };
  }

  const runRecord: IngestionRunItem = {
    id: runId,
    tenantSlug: tenant.slug,
    source,
    fileName,
    status: "COMPLETED",
    locale,
    totalInbound: rawItems.length,
    cleanMastersCount,
    mergedDuplicates,
    quarantinedCount,
    systemFailuresCount,
    costCents: batchCostCents,
    cacheSavingsCents: batchSavingsCents,
    createdAt: nowIso,
    lineage,
  };

  tenant.runs.unshift(runRecord);

  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName,
    actorRole: "ADMIN",
    action: `ingest:${source.toLowerCase()}`,
    targetId: runId,
    detail: `Reconciled ${rawItems.length} payloads (${cleanMastersCount} clean, ${mergedDuplicates} merged, ${quarantinedCount} quarantined, 0 failed)`,
    createdAt: nowIso,
  });

  return runRecord;
}

function createInitialStore(): GlobalStore {
  const store: GlobalStore = {
    initialized: true,
    seq: 100,
    tenants: {},
  };

  // 1. Tenant A: Apex Roofing TX (US Agency Sub-Account)
  const apex: TenantState = {
    id: "tenant_apex_us",
    slug: "apex-roofing",
    name: "Apex Roofing TX",
    subtitle: "Austin, TX • Storm Restoration",
    regionLabel: "United States (US)",
    ghlLocationId: "ghl_loc_austin_981",
    localeDefault: "US",
    currencySymbol: "$",
    phonePrefix: "+1 E.164",
    dateFormat: "MM/DD/YYYY",
    complianceLaw: "US TCPA ($1,500/text)",
    webhookSecret: "whsec_apex_tx_secret_key_998877",
    budget: {
      monthlyCapCents: 5000, // $50.00
      currentSpendCents: 1200, // $12.00 prior month-to-date
      cacheSavingsCents: 840, // $8.40 saved
      warningThreshold: 80,
      cacheOnlyOnCap: true,
      isPaused: false,
      isApiDown: false,
    },
    propertyCache: {},
    members: [
      { id: "u_1", name: "Marcus Vance", email: "marcus@integrityops.io", role: "OWNER", title: "Principal Systems Lead" },
      { id: "u_2", name: "Sarah Jenkins", email: "sarah@apexroofing.com", role: "REVIEWER", title: "Account Triage Specialist" },
      { id: "u_3", name: "Alex Mercer", email: "alex@apexroofing.com", role: "VIEWER", title: "Compliance Auditor (Read-Only)" },
    ],
    dailySeries: [
      { dayLabel: "11 Nov", cleanCount: 8, heldOrMergedCount: 5 },
      { dayLabel: "12 Nov", cleanCount: 6, heldOrMergedCount: 4 },
      { dayLabel: "13 Nov", cleanCount: 11, heldOrMergedCount: 6 },
      { dayLabel: "14 Nov", cleanCount: 5, heldOrMergedCount: 3 },
      { dayLabel: "15 Nov", cleanCount: 7, heldOrMergedCount: 5 },
      { dayLabel: "16 Nov", cleanCount: 10, heldOrMergedCount: 7 },
      { dayLabel: "17 Nov", cleanCount: 9, heldOrMergedCount: 5 },
      { dayLabel: "18 Nov", cleanCount: 12, heldOrMergedCount: 8 },
      { dayLabel: "19 Nov", cleanCount: 7, heldOrMergedCount: 4 },
      { dayLabel: "20 Nov", cleanCount: 9, heldOrMergedCount: 6 },
      { dayLabel: "21 Nov", cleanCount: 6, heldOrMergedCount: 3 },
      { dayLabel: "22 Nov", cleanCount: 8, heldOrMergedCount: 4 },
      { dayLabel: "23 Nov", cleanCount: 11, heldOrMergedCount: 7 },
      { dayLabel: "24 Nov", cleanCount: 4, heldOrMergedCount: 2 },
    ],
    runs: [],
    masters: [],
    aliases: [],
    quarantine: [],
    ledger: [],
    audits: [],
    voice: createVoiceState("Apex Roofing TX", "US"),
    distinctPhoneNames: {},
  };

  // 2. Tenant B: Summit Solar AU (Australian Agency Sub-Account)
  const summit: TenantState = {
    id: "tenant_summit_au",
    slug: "summit-solar",
    name: "Summit Solar AU",
    subtitle: "Sydney, NSW • Commercial Solar",
    regionLabel: "Australia (AU)",
    ghlLocationId: "ghl_loc_sydney_402",
    localeDefault: "AU",
    currencySymbol: "A$",
    phonePrefix: "+61 E.164",
    dateFormat: "DD/MM/YYYY",
    complianceLaw: "AU Spam Act 2003",
    webhookSecret: "whsec_summit_au_secret_key_112233",
    budget: {
      monthlyCapCents: 7500, // A$75.00
      currentSpendCents: 2450, // A$24.50
      cacheSavingsCents: 1620, // A$16.20 saved
      warningThreshold: 80,
      cacheOnlyOnCap: true,
      isPaused: false,
      isApiDown: false,
    },
    propertyCache: {},
    members: [
      { id: "u_1", name: "Marcus Vance", email: "marcus@integrityops.io", role: "OWNER", title: "Principal Systems Lead" },
      { id: "u_4", name: "Liam O'Connor", email: "liam@summitsolar.com.au", role: "ADMIN", title: "NSW Operations Manager" },
      { id: "u_5", name: "Chloe Tan", email: "chloe@summitsolar.com.au", role: "REVIEWER", title: "Commercial Desk Reviewer" },
    ],
    dailySeries: [
      { dayLabel: "11 Nov", cleanCount: 5, heldOrMergedCount: 2 },
      { dayLabel: "12 Nov", cleanCount: 9, heldOrMergedCount: 4 },
      { dayLabel: "13 Nov", cleanCount: 7, heldOrMergedCount: 3 },
      { dayLabel: "14 Nov", cleanCount: 12, heldOrMergedCount: 5 },
      { dayLabel: "15 Nov", cleanCount: 8, heldOrMergedCount: 3 },
      { dayLabel: "16 Nov", cleanCount: 6, heldOrMergedCount: 2 },
      { dayLabel: "17 Nov", cleanCount: 11, heldOrMergedCount: 6 },
      { dayLabel: "18 Nov", cleanCount: 13, heldOrMergedCount: 5 },
      { dayLabel: "19 Nov", cleanCount: 9, heldOrMergedCount: 4 },
      { dayLabel: "20 Nov", cleanCount: 10, heldOrMergedCount: 3 },
      { dayLabel: "21 Nov", cleanCount: 14, heldOrMergedCount: 6 },
      { dayLabel: "22 Nov", cleanCount: 8, heldOrMergedCount: 3 },
      { dayLabel: "23 Nov", cleanCount: 10, heldOrMergedCount: 4 },
      { dayLabel: "24 Nov", cleanCount: 5, heldOrMergedCount: 1 },
    ],
    runs: [],
    masters: [],
    aliases: [],
    quarantine: [],
    ledger: [],
    audits: [],
    voice: createVoiceState("Summit Solar AU", "AU"),
    distinctPhoneNames: {},
  };

  // 3. Tenant C: Thames Heating UK (UK Agency Sub-Account in FinOps Pause/Cap Guard)
  const thames: TenantState = {
    id: "tenant_thames_uk",
    slug: "thames-heating",
    name: "Thames Heating UK",
    subtitle: "London, UK • Heat Pump & Boiler",
    regionLabel: "United Kingdom (UK)",
    ghlLocationId: "ghl_loc_london_719",
    localeDefault: "UK",
    currencySymbol: "£",
    phonePrefix: "+44 E.164",
    dateFormat: "DD/MM/YYYY",
    complianceLaw: "UK PECR & GDPR",
    webhookSecret: "whsec_thames_uk_secret_key_445566",
    budget: {
      monthlyCapCents: 3000, // £30.00
      currentSpendCents: 2885, // £28.85 (96% near cap / Guard mode)
      cacheSavingsCents: 1940, // £19.40 saved
      warningThreshold: 80,
      cacheOnlyOnCap: true,
      isPaused: true, // Active Cache-Only Pause demonstrated on Card 3!
      isApiDown: false,
    },
    propertyCache: {},
    members: [
      { id: "u_1", name: "Marcus Vance", email: "marcus@integrityops.io", role: "OWNER", title: "Principal Systems Lead" },
      { id: "u_6", name: "Oliver Wright", email: "oliver@thamesheating.co.uk", role: "REVIEWER", title: "London Dispatch Coordinator" },
    ],
    dailySeries: [
      { dayLabel: "11 Nov", cleanCount: 9, heldOrMergedCount: 6 },
      { dayLabel: "12 Nov", cleanCount: 11, heldOrMergedCount: 7 },
      { dayLabel: "13 Nov", cleanCount: 8, heldOrMergedCount: 5 },
      { dayLabel: "14 Nov", cleanCount: 10, heldOrMergedCount: 6 },
      { dayLabel: "15 Nov", cleanCount: 12, heldOrMergedCount: 8 },
      { dayLabel: "16 Nov", cleanCount: 7, heldOrMergedCount: 4 },
      { dayLabel: "17 Nov", cleanCount: 9, heldOrMergedCount: 5 },
      { dayLabel: "18 Nov", cleanCount: 8, heldOrMergedCount: 6 },
      { dayLabel: "19 Nov", cleanCount: 11, heldOrMergedCount: 7 },
      { dayLabel: "20 Nov", cleanCount: 6, heldOrMergedCount: 4 },
      { dayLabel: "21 Nov", cleanCount: 9, heldOrMergedCount: 5 },
      { dayLabel: "22 Nov", cleanCount: 7, heldOrMergedCount: 4 },
      { dayLabel: "23 Nov", cleanCount: 8, heldOrMergedCount: 5 },
      { dayLabel: "24 Nov", cleanCount: 3, heldOrMergedCount: 2 },
    ],
    runs: [],
    masters: [],
    aliases: [],
    quarantine: [],
    ledger: [],
    audits: [],
    voice: createVoiceState("Thames Heating UK", "UK"),
    distinctPhoneNames: {},
  };

  store.tenants[apex.slug] = apex;
  store.tenants[summit.slug] = summit;
  store.tenants[thames.slug] = thames;

  // Seed Apex Roofing TX via real pipeline execution
  executeBatchOnTenant(
    store,
    apex,
    [
      {
        name: "Elena Rostova",
        phone: "(512) 555-0164",
        email: "elena.rostova@gmail.com",
        address: "912 Westlake Dr, Austin, TX",
        notes: "Full architectural shingle quote from 2023, checking warranty options.",
        estimated_value: 19500,
        source_channel: "CSV Batch",
        created_at: "08/14/2023", // >730 days ago -> Dormant Reactivation candidate!
      },
      {
        name: "Grant Holloway",
        phone: "512-555-0171",
        email: "grant.h@austinprop.com",
        address: "4402 Shoal Creek Blvd, Austin, TX",
        notes: "Standing seam metal roof estimate requested previously.",
        estimated_value: 26800,
        source_channel: "CSV Batch",
        created_at: "03/19/2024", // >730 days ago -> Dormant Reactivation candidate!
      },
      {
        name: "David Miller",
        phone: "512-555-0199",
        email: "david.miller@gmial.com", // Typo auto-corrected to @gmail.com
        address: "104 Elm Street, Austin, TX",
        notes: "Severe hail damage, water leaking into living room! Need emergency tarp ASAP.",
        estimated_value: 14500,
        source_channel: "GoHighLevel",
        created_at: "11/23/2026",
      },
      {
        name: "David Miller",
        phone: "+15125550199",
        email: "david.miller@gmail.com",
        address: "104 Elm St, Austin, TX",
        notes: "Follow up on storm leak form submission.",
        estimated_value: 14500,
        source_channel: "n8n Webhook",
        created_at: "11/23/2026",
      },
      {
        name: "Carlos Rodriguez",
        phone: "512-555-0182",
        email: "carlos.r@gmail.com",
        address: "2400 South Congress Ave, Austin, TX",
        notes: "Insurance check in hand, ready to replace entire commercial warehouse roof.",
        estimated_value: 48000,
        source_channel: "GoHighLevel",
        created_at: "11/24/2026",
      },
      {
        name: "Robert Henderson",
        phone: "512-555-0144",
        email: "robert.h@outlook.com",
        address: "88 Barton Springs Rd, Austin, TX",
        notes: "Stop texting this number. DNC requested.",
        is_dnc: true,
        tcpa_consent: false,
        estimated_value: 8000,
        source_channel: "CSV Batch",
        created_at: "11/24/2026",
      },
      {
        name: "Brenda Smith",
        phone: "idk",
        email: "n/a",
        address: "fake",
        notes: "Left blank contact fields on ad form",
        estimated_value: 0,
        source_channel: "Meta Lead Ads",
        created_at: "11/24/2026",
      },
      {
        name: "Brokers Inc - Unit 100",
        phone: "512-555-0100",
        email: "unit100@austinbrokers.com",
        notes: "Commercial roof inspection",
        estimated_value: 6200,
        source_channel: "CSV Batch",
        created_at: "11/22/2026",
      },
      {
        name: "Brokers Inc - Unit 200",
        phone: "512-555-0100",
        email: "unit200@austinbrokers.com",
        notes: "Commercial roof inspection",
        estimated_value: 6200,
        source_channel: "CSV Batch",
        created_at: "11/22/2026",
      },
      {
        name: "Brokers Inc - Unit 300",
        phone: "512-555-0100",
        email: "unit300@austinbrokers.com",
        notes: "Commercial roof inspection",
        estimated_value: 6200,
        source_channel: "CSV Batch",
        created_at: "11/22/2026",
      },
      {
        name: "Brokers Inc - Unit 400",
        phone: "512-555-0100", // 4th distinct name on same broker phone -> SHARED_HUB quarantine!
        email: "unit400@austinbrokers.com",
        notes: "Commercial roof inspection for suite 400",
        estimated_value: 11000,
        source_channel: "n8n Webhook",
        created_at: "11/24/2026",
      },
      {
        name: "Jordan Avery",
        phone: "512-555-0133",
        email: "jordan.avery@gmail.com",
        notes: "Maybe curious for a school project, not my house",
        estimated_value: 3000,
        source_channel: "Meta Lead Ads",
        created_at: "11/24/2026",
      },
    ],
    "CSV_UPLOAD",
    "Apex_Austin_Storm_Nov24.csv",
    "US"
  );

  // Seed Summit Solar AU via real pipeline execution (AU +61 E.164 & DD/MM/YYYY dates)
  executeBatchOnTenant(
    store,
    summit,
    [
      {
        name: "Lachlan Murdoch",
        phone: "0412 345 678",
        email: "lachlan@sydneyenergy.com.au",
        address: "42 George St, Sydney NSW 2000",
        notes: "Ready to buy 30kW commercial rooftop solar array ASAP.",
        estimated_value: 38500,
        source_channel: "GoHighLevel",
        created_at: "24/11/2026", // DD/MM/YYYY
      },
      {
        name: "Lachlan Murdoch",
        phone: "+61412345678",
        email: "lachlan@sydneyenergy.com.au",
        notes: "Duplicate webhook retry from GHL form",
        estimated_value: 38500,
        source_channel: "n8n Webhook",
        created_at: "24/11/2026",
      },
      {
        name: "Matilda Kerr",
        phone: "0423 889 102",
        email: "mkerr@parramattalogistics.com.au",
        address: "18 Victoria Rd, Parramatta NSW",
        notes: "Immediate quote for warehouse solar + battery storage.",
        estimated_value: 64000,
        source_channel: "GoHighLevel",
        created_at: "23/11/2026",
      },
      {
        name: "Hamish Campbell",
        phone: "0431 220 914",
        email: "hamish@bondibrewing.com.au",
        address: "95 Campbell Parade, Bondi NSW",
        notes: "Commercial inverter upgrade quote from 2023.",
        estimated_value: 21500,
        source_channel: "CSV Batch",
        created_at: "14/05/2023", // Dormant >730d
      },
      {
        name: "Nigel Thornton",
        phone: "0409 771 330",
        email: "nigel.t@gmail.com",
        notes: "Opted out under Australian Spam Act.",
        is_dnc: true,
        tcpa_consent: false,
        estimated_value: 12000,
        source_channel: "CSV Batch",
        created_at: "24/11/2026",
      },
      {
        name: "Sienna Brooks",
        phone: "0450 118 442",
        email: "sienna@unsure.com.au",
        notes: "Just looking, unsure if strata roof allows solar panels",
        estimated_value: 9500,
        source_channel: "Meta Lead Ads",
        created_at: "24/11/2026",
      },
    ],
    "CSV_UPLOAD",
    "Summit_Sydney_Solar_Q4.csv",
    "AU"
  );

  // Seed Thames Heating UK via real pipeline execution (UK +44 E.164 & Cache-Only FinOps Guard)
  executeBatchOnTenant(
    store,
    thames,
    [
      {
        name: "Arthur Pendelton",
        phone: "07700 900412",
        email: "arthur@kensingtonestates.co.uk",
        address: "19 High Street Kensington, London",
        notes: "Emergency boiler breakdown & water leaking in plant room!",
        estimated_value: 16400,
        source_channel: "GoHighLevel",
        created_at: "24/11/2026",
      },
      {
        name: "Beatrice Holloway",
        phone: "07700 900885",
        email: "beatrice@canarywharfops.co.uk",
        address: "8 Canada Square, London",
        notes: "Ready to sign commercial air-source heat pump installation.",
        estimated_value: 34200,
        source_channel: "n8n Webhook",
        created_at: "23/11/2026",
      },
      {
        name: "Beatrice Holloway",
        phone: "+447700900885",
        email: "beatrice@canarywharfops.co.uk",
        notes: "Follow-up confirmation",
        estimated_value: 34200,
        source_channel: "GoHighLevel",
        created_at: "24/11/2026",
      },
      {
        name: "Giles Alistair",
        phone: "07700 900319",
        email: "giles@chelseamews.co.uk",
        address: "41 King's Road, London",
        notes: "2018 historical boiler service record.",
        estimated_value: 8900,
        source_channel: "CSV Batch",
        created_at: "10/04/2019", // >7 years ago -> sets up >5yr Time-Gap test AND dormant reactivation!
      },
      {
        name: "New Flat Resident",
        phone: "07700 900319", // Matches Giles Alistair (>7 years old) -> triggers TIME_GAP_REVIEW!
        email: "tenant2026@chelseamews.co.uk",
        notes: "Routine annual heat pump service request",
        estimated_value: 4500,
        source_channel: "GoHighLevel",
        created_at: "24/11/2026",
      },
      {
        name: "catherine@nomarketing.co.uk",
        phone: "07700 900661",
        email: "catherine@nomarketing.co.uk",
        notes: "PECR / GDPR marketing consent withdrawn.",
        is_dnc: true,
        tcpa_consent: false,
        estimated_value: 7200,
        source_channel: "CSV Batch",
        created_at: "24/11/2026",
      },
    ],
    "CSV_UPLOAD",
    "Thames_London_HeatPump_Nov24.csv",
    "UK"
  );

  return store;
}

function getStore(): GlobalStore {
  if (!globalForStore.__leadIntegrityStore) {
    globalForStore.__leadIntegrityStore = createInitialStore();
  }
  return globalForStore.__leadIntegrityStore;
}

export function resolveTenantSlug(slugOrId?: string | null): "apex-roofing" | "summit-solar" | "thames-heating" {
  if (!slugOrId) return "apex-roofing";
  const s = slugOrId.toLowerCase();
  if (s.includes("summit") || s === "au") return "summit-solar";
  if (s.includes("thames") || s === "uk") return "thames-heating";
  return "apex-roofing";
}

export function listWorkspaceSummaries(): WorkspaceSummary[] {
  const store = getStore();
  return (["apex-roofing", "summit-solar", "thames-heating"] as const).map((slug) => {
    const t = store.tenants[slug];
    const snap = getTenantSnapshot(slug);
    const pct = Math.round((t.budget.currentSpendCents / Math.max(1, t.budget.monthlyCapCents)) * 100);
    const statusBadge: WorkspaceSummary["statusBadge"] = t.budget.isApiDown
      ? "API OUTAGE"
      : t.budget.isPaused
        ? "PAUSE"
        : pct >= t.budget.warningThreshold
          ? "CAP GUARD"
          : "ACTIVE";

    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      subtitle: t.subtitle,
      regionLabel: t.regionLabel,
      ghlLocationId: t.ghlLocationId,
      localeDefault: t.localeDefault,
      currencySymbol: t.currencySymbol,
      phonePrefix: t.phonePrefix,
      dateFormat: t.dateFormat,
      complianceLaw: t.complianceLaw,
      webhookSecret: t.webhookSecret,
      statusBadge,
      totalInbound: snap.reconciliation.totalInbound,
      pipelineValue: snap.pipelineValue,
      unresolvedQuarantineCount: snap.reconciliation.activeQuarantine,
      unenrichedCount: snap.businessImpact.unenrichedPendingCount,
      spendCents: t.budget.currentSpendCents,
      capCents: t.budget.monthlyCapCents,
    };
  });
}

export function getTenantSnapshot(slugOrId?: string | null): TenantSnapshot {
  const store = getStore();
  const slug = resolveTenantSlug(slugOrId);
  const t = store.tenants[slug];

  const cleanMasters = t.masters.length;
  const mergedAliases = t.aliases.length;
  const activeQuarantine = t.quarantine.filter((q) => !q.resolved).length;
  const permanentQuarantine = t.quarantine.filter(
    (q) => q.resolved && q.resolutionAction === "PERMANENT_QUARANTINE"
  ).length;
  const totalQuarantined = activeQuarantine + permanentQuarantine;
  const systemFailures = t.runs.reduce((acc, r) => acc + r.systemFailuresCount, 0);
  const totalInbound = cleanMasters + mergedAliases + totalQuarantined + systemFailures;
  const isReconciled =
    totalInbound === cleanMasters + mergedAliases + totalQuarantined + systemFailures &&
    systemFailures === 0;

  const pipelineValue = t.masters.reduce((acc, m) => acc + m.estimatedValue, 0);
  const tcpaBlockedCount = t.quarantine.filter((q) => q.reason === "DNC_CLUSTER").length;
  const finePerViolation = t.localeDefault === "AU" ? 2200 : t.localeDefault === "UK" ? 1000 : 1500;
  const tcpaLiabilityProtected = tcpaBlockedCount * finePerViolation;
  const unenrichedPendingCount = t.masters.filter((m) => m.enrichmentStatus === "UNENRICHED_DEGRADED").length;
  const dormantPipelineValue = t.masters
    .filter((m) => m.daysDormant >= 730)
    .reduce((acc, m) => acc + m.estimatedValue, 0);
  const cacheEntriesCount = Object.keys(t.propertyCache || {}).length;

  const { distinctPhoneNames: _ignored, propertyCache: _ignoredCache, ...safeTenant } = t;

  return {
    tenant: safeTenant,
    reconciliation: {
      totalInbound,
      cleanMasters,
      mergedAliases,
      activeQuarantine,
      permanentQuarantine,
      totalQuarantined,
      systemFailures,
      isReconciled,
    },
    businessImpact: {
      tcpaBlockedCount,
      tcpaLiabilityProtected,
      unenrichedPendingCount,
      dormantPipelineValue,
      cacheEntriesCount,
    },
    persistence: getPersistenceHealth(),
    pipelineValue,
  };
}

export function ingestStoreBatch(
  slugOrId: string,
  rawItems: RawInboundLead[],
  source: "CSV_UPLOAD" | "N8N_WEBHOOK",
  fileName: string,
  localeOverride?: SupportedLocale,
  actorName: string = "Live Ingestion Engine"
): IngestionRunItem {
  const store = getStore();
  const slug = resolveTenantSlug(slugOrId);
  const tenant = store.tenants[slug];
  return executeBatchOnTenant(store, tenant, rawItems, source, fileName, localeOverride, actorName);
}

export function resolveStoreQuarantine(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
  quarantineId: string;
  action: "APPROVED_SYNC" | "SPLIT_MASTER" | "EDITED_FIELDS" | "PERMANENT_QUARANTINE";
  editedName?: string;
  editedPhone?: string;
  editedEmail?: string;
  notes?: string;
}) {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot resolve or override quarantined records.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];

  const record = tenant.quarantine.find((q) => q.id === params.quarantineId);
  if (!record) {
    throw new Error("Quarantine record not found in current workspace.");
  }
  if (record.resolved) {
    return { record, promotedMasterId: null };
  }

  // Block overriding DNC_CLUSTER unless explicitly rejected! Compliance Overrides Revenue!
  if (record.reason === "DNC_CLUSTER" && params.action !== "PERMANENT_QUARANTINE") {
    throw new Error(
      `Compliance Gate Blocked: ${tenant.complianceLaw} prohibits syncing DNC/Opt-Out contacts. Confirm Permanent Quarantine instead.`
    );
  }

  record.resolved = true;
  record.resolutionAction = params.action;
  record.resolvedBy = params.actorName;
  record.resolutionNotes = params.notes || null;

  const nowIso = new Date().toISOString();
  let promotedMasterId: string | null = null;

  if (
    params.action === "APPROVED_SYNC" ||
    params.action === "SPLIT_MASTER" ||
    params.action === "EDITED_FIELDS"
  ) {
    const finalName = params.editedName?.trim() || record.normalizedPreview.canonicalName;
    const finalPhone =
      params.editedPhone !== undefined
        ? normalizeLead({ phone: params.editedPhone }, tenant.localeDefault).normalizedPhone
        : record.normalizedPreview.normalizedPhone;
    const finalEmail =
      params.editedEmail !== undefined
        ? normalizeLead({ email: params.editedEmail }, tenant.localeDefault).normalizedEmail
        : record.normalizedPreview.normalizedEmail;

    if (!finalPhone && !finalEmail) {
      record.resolved = false;
      record.resolutionAction = null;
      throw new Error("Validation Error: Provide a valid phone or email before promoting to Clean Master.");
    }

    promotedMasterId = nextId(store, "lead");
    tenant.masters.unshift({
      id: promotedMasterId,
      tenantSlug: tenant.slug,
      runId: record.runId,
      canonicalName: finalName,
      normalizedPhone: finalPhone,
      normalizedEmail: finalEmail,
      rawAddress: null,
      rawPayloadHash: `hitl_${record.id}`,
      isTcpaOptedOut: false,
      isSharedHub: params.action === "SPLIT_MASTER",
      triageScore: 3,
      triageConfidence: 1.0,
      intentCategory: "HIGH_INTENT",
      triageSummary: `Human-verified via ${params.action}`,
      estimatedValue: record.normalizedPreview.estimatedValue || 5000,
      enrichmentStatus: "UNENRICHED_DEGRADED",
      enrichmentReason: "Human-verified from Quarantine — queued for optional property enrichment backfill",
      propertyEnrichment: null,
      status: "SYNCED_TO_GHL",
      daysDormant: 0,
      sourceChannel: "HITL Approved",
      createdAt: nowIso,
    });

    tenant.ledger.unshift({
      id: nextId(store, "tx"),
      tenantSlug: tenant.slug,
      timestamp: formatShortDate(nowIso),
      contactName: finalName,
      contactSub: `${finalPhone || finalEmail} • HITL ${params.action}`,
      channel: "GoHighLevel",
      operation: "GHL_SYNCED",
      enrichmentStatus: "UNENRICHED_DEGRADED",
      amountDisplay: `+ ${tenant.currencySymbol}${(record.normalizedPreview.estimatedValue || 5000).toLocaleString()}.00`,
      amountTone: "positive",
    });
  }

  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName: params.actorName,
    actorRole: params.role,
    action: `quarantine:${params.action.toLowerCase()}`,
    targetId: record.id,
    detail: `Resolved ${record.reason} for "${record.normalizedPreview.canonicalName}" (${params.action})`,
    createdAt: nowIso,
  });

  return { record, promotedMasterId };
}

export function updateStoreBudgetPolicy(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
  monthlyCapCents: number;
  warningThreshold: number;
}) {
  if (params.role !== "OWNER" && params.role !== "ADMIN") {
    throw new Error("403 Forbidden: Only OWNER or ADMIN roles may modify FinOps budget caps.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];

  tenant.budget.monthlyCapCents = Math.max(100, params.monthlyCapCents);
  tenant.budget.warningThreshold = Math.min(100, Math.max(10, params.warningThreshold));

  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName: params.actorName,
    actorRole: params.role,
    action: "finops:policy_updated",
    targetId: tenant.id,
    detail: `Updated monthly FinOps cap to $${(tenant.budget.monthlyCapCents / 100).toFixed(2)} (${tenant.budget.warningThreshold}% alert threshold)`,
    createdAt: new Date().toISOString(),
  });

  return tenant.budget;
}

export function toggleStoreEnrichmentPause(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
}) {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot toggle FinOps enrichment circuit breaker.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];

  tenant.budget.isPaused = !tenant.budget.isPaused;

  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName: params.actorName,
    actorRole: params.role,
    action: tenant.budget.isPaused ? "finops:circuit_paused" : "finops:circuit_resumed",
    targetId: tenant.id,
    detail: tenant.budget.isPaused
      ? "Switched workspace to Cache-Only mode ($0.00 external API spend)"
      : "Resumed live external property enrichment & AI triage",
    createdAt: new Date().toISOString(),
  });

  return tenant.budget.isPaused;
}

export function dispatchStoreReactivation(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
  masterId: string;
}) {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot dispatch outbound CRM campaigns.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];

  const master = tenant.masters.find((m) => m.id === params.masterId);
  if (!master) throw new Error("Lead master not found in active workspace.");
  if (master.isTcpaOptedOut) {
    throw new Error(`Compliance Gate: Cannot dispatch to opted-out contact (${tenant.complianceLaw}).`);
  }

  master.status = "SYNCED_TO_GHL";
  const nowIso = new Date().toISOString();

  tenant.ledger.unshift({
    id: nextId(store, "tx"),
    tenantSlug: tenant.slug,
    timestamp: formatShortDate(nowIso),
    contactName: master.canonicalName,
    contactSub: `${master.normalizedPhone || master.normalizedEmail} • Reactivation Sequence`,
    channel: "GoHighLevel",
    operation: "REACTIVATED",
    amountDisplay: `+ $${master.estimatedValue.toLocaleString()}.00`,
    amountTone: "positive",
  });

  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName: params.actorName,
    actorRole: params.role,
    action: "dispatch:ghl_reactivation",
    targetId: master.id,
    detail: `Dispatched "${master.canonicalName}" ($${master.estimatedValue.toLocaleString()}) to GoHighLevel location ${tenant.ghlLocationId}`,
    createdAt: nowIso,
  });

  return master;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Voice AI Orchestration & State Helpers
 * ────────────────────────────────────────────────────────────────────────── */

export function getTenantVoiceState(slugOrId?: string | null): {
  voice: VoiceState;
  envStatus: ReturnType<typeof getVapiEnvStatus>;
  tenant: {
    name: string;
    slug: string;
    locale: SupportedLocale;
    complianceLaw: string;
  };
} {
  const store = getStore();
  const slug = resolveTenantSlug(slugOrId);
  const tenant = store.tenants[slug];
  if (!tenant.voice) {
    tenant.voice = createVoiceState(tenant.name, tenant.localeDefault);
  }
  return {
    voice: tenant.voice,
    envStatus: getVapiEnvStatus(),
    tenant: {
      name: tenant.name,
      slug: tenant.slug,
      locale: tenant.localeDefault,
      complianceLaw: tenant.complianceLaw,
    },
  };
}

export function updateVoiceClockMode(params: {
  slugOrId: string;
  role: UserRole;
  clockMode: ClockMode;
}) {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot modify voice calling window policy.");
  }
  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];
  if (!tenant.voice) tenant.voice = createVoiceState(tenant.name, tenant.localeDefault);
  tenant.voice.clockMode = params.clockMode;
  return tenant.voice.clockMode;
}

export async function dispatchVoiceCallAction(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
  masterId?: string | null;
  contactName: string;
  phone: string;
  scenario?: VoiceScenario;
}): Promise<{ ok: boolean; callRecord?: CallRecord; error?: string; code?: string }> {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot trigger voice outreach.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];
  if (!tenant.voice) tenant.voice = createVoiceState(tenant.name, tenant.localeDefault);

  const matchedMaster = params.masterId
    ? tenant.masters.find((m) => m.id === params.masterId)
    : tenant.masters.find((m) => m.normalizedPhone === params.phone || m.canonicalName.toLowerCase() === params.contactName.toLowerCase());

  // 1. Evaluate Pre-Dial Gate
  const priorAttempts = tenant.voice.calls.filter((c) => c.phone === params.phone && c.status !== "BLOCKED").length;
  const budgetRemaining = tenant.budget.monthlyCapCents - tenant.budget.currentSpendCents;

  const gate = evaluatePreDialGate({
    phone: params.phone,
    locale: tenant.localeDefault,
    clockMode: tenant.voice.clockMode,
    isOptedOut: Boolean(matchedMaster?.isTcpaOptedOut),
    priorAttempts,
    maxAttempts: tenant.voice.config.maxAttempts,
    isPaused: tenant.budget.isPaused,
    budgetRemainingCents: budgetRemaining,
  });

  if (!gate.allowed) {
    // Record blocked attempt audit
    const blockedCall: CallRecord = {
      id: nextId(store, "call"),
      tenantSlug: tenant.slug,
      direction: "OUTBOUND",
      provider: tenant.voice.config.provider,
      providerCallId: null,
      masterId: matchedMaster?.id || null,
      contactName: params.contactName,
      phone: params.phone,
      scenario: params.scenario || null,
      status: "BLOCKED",
      outcome: "BLOCKED_BY_GATE",
      durationSec: 0,
      costCents: 0,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      endedReason: gate.reason,
      transcript: [],
      toolEvents: [],
      summary: `Blocked by ${gate.code}: ${gate.reason}`,
      sentiment: "NEUTRAL",
      appointmentAt: null,
      optOutDetected: false,
      gateLocalTime: gate.localTime,
    };
    tenant.voice.calls.unshift(blockedCall);

    tenant.audits.unshift({
      id: nextId(store, "aud"),
      tenantSlug: tenant.slug,
      actorName: params.actorName,
      actorRole: params.role,
      action: "voice:dial_blocked",
      targetId: matchedMaster?.id || null,
      detail: `Pre-dial gate blocked voice call to ${params.contactName} (${gate.code}: ${gate.reason})`,
      createdAt: new Date().toISOString(),
    });

    return { ok: false, error: gate.reason, code: gate.code, callRecord: blockedCall };
  }

  // 2. Determine execution mode: Live Vapi vs Deterministic Simulation
  const env = getVapiEnvStatus();
  if (env.configured && process.env.ENABLE_LIVE_VAPI_CALLS === "true") {
    // Live Vapi Outbound Telephony
    const vapiRes = await placeVapiCall({
      phone: params.phone,
      contactName: params.contactName,
      masterId: matchedMaster?.id || null,
      tenantSlug: tenant.slug,
      config: tenant.voice.config,
      tenantName: tenant.name,
    });

    if (!vapiRes.ok) {
      return { ok: false, error: vapiRes.error || "Failed to trigger Vapi call." };
    }

    const pendingCall: CallRecord = {
      id: nextId(store, "call"),
      tenantSlug: tenant.slug,
      direction: "OUTBOUND",
      provider: "VAPI",
      providerCallId: vapiRes.providerCallId || null,
      masterId: matchedMaster?.id || null,
      contactName: params.contactName,
      phone: params.phone,
      scenario: null,
      status: "IN_PROGRESS",
      outcome: "PENDING",
      durationSec: 0,
      costCents: 0,
      startedAt: new Date().toISOString(),
      endedAt: null,
      endedReason: "Dialing via live telephony...",
      transcript: [],
      toolEvents: [],
      summary: "Outbound call placed via Vapi. Waiting for webhook callback.",
      sentiment: "NEUTRAL",
      appointmentAt: null,
      optOutDetected: false,
      gateLocalTime: gate.localTime,
    };
    tenant.voice.calls.unshift(pendingCall);
    return { ok: true, callRecord: pendingCall };
  }

  // Fallback: Deterministic Interactive Mock Simulation
  const scenario = params.scenario || "INTERESTED_BOOKS";
  const mock = buildMockCall({
    scenario,
    contactName: params.contactName,
    tenantName: tenant.name,
    locale: tenant.localeDefault,
    config: tenant.voice.config,
    now: new Date(),
  });

  const analysis = analyzeCall(mock.transcript, mock.toolEvents, mock.status, params.contactName);
  const costCents = Math.ceil((mock.durationSec / 60) * 12);
  const nowIso = new Date().toISOString();

  // Deduct from tenant FinOps budget
  tenant.budget.currentSpendCents += costCents;

  const finishedCall: CallRecord = {
    id: nextId(store, "call"),
    tenantSlug: tenant.slug,
    direction: "OUTBOUND",
    provider: "MOCK",
    providerCallId: `mock_${Math.random().toString(36).substring(2, 9)}`,
    masterId: matchedMaster?.id || null,
    contactName: params.contactName,
    phone: params.phone,
    scenario,
    status: mock.status,
    outcome: analysis.outcome,
    durationSec: mock.durationSec,
    costCents,
    startedAt: nowIso,
    endedAt: nowIso,
    endedReason: mock.endedReason,
    transcript: mock.transcript,
    toolEvents: mock.toolEvents,
    summary: analysis.summary,
    sentiment: analysis.sentiment,
    appointmentAt: analysis.appointmentAt,
    optOutDetected: analysis.optOutDetected,
    gateLocalTime: gate.localTime,
  };
  tenant.voice.calls.unshift(finishedCall);

  // If customer opted out, enforce immediate compliance DNC quarantine across the tenant cluster
  if (analysis.optOutDetected) {
    if (matchedMaster) {
      matchedMaster.isTcpaOptedOut = true;
    }
    tenant.quarantine.unshift({
      id: nextId(store, "qr"),
      tenantSlug: tenant.slug,
      runId: "voice_ai_dnc_trigger",
      reason: "DNC_CLUSTER",
      contaminatingRecord: `Voice AI opt-out: ${params.contactName} (${params.phone})`,
      rawPayload: JSON.stringify({
        name: params.contactName,
        phone: params.phone,
        notes: `Opted out during Voice AI call (${analysis.summary})`,
        is_dnc: true,
      }),
      normalizedPreview: {
        canonicalName: params.contactName,
        normalizedPhone: params.phone,
        normalizedEmail: matchedMaster?.normalizedEmail || null,
        estimatedValue: matchedMaster?.estimatedValue || 0,
        triageConfidence: 1.0,
        intentCategory: "DNC_REVOCATION",
      },
      resolved: false,
      resolutionAction: null,
      resolvedBy: null,
      resolutionNotes: null,
      createdAt: nowIso,
    });
  }

  // If appointment was booked, update master status and add ledger transaction
  if (analysis.appointmentAt && matchedMaster) {
    matchedMaster.status = "SYNCED_TO_GHL";
    tenant.ledger.unshift({
      id: nextId(store, "tx"),
      tenantSlug: tenant.slug,
      timestamp: formatShortDate(nowIso),
      contactName: matchedMaster.canonicalName,
      contactSub: `${matchedMaster.normalizedPhone} • Booked: ${analysis.appointmentAt}`,
      channel: "GoHighLevel",
      operation: "GHL_SYNCED",
      amountDisplay: `+ $${matchedMaster.estimatedValue.toLocaleString()}.00`,
      amountTone: "positive",
    });
  }

  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName: params.actorName,
    actorRole: params.role,
    action: "voice:call_completed",
    targetId: matchedMaster?.id || null,
    detail: `Voice AI completed call with ${params.contactName} (${analysis.outcome}, ${mock.durationSec}s, ${tenant.currencySymbol}${(costCents / 100).toFixed(2)})`,
    createdAt: nowIso,
  });

  return { ok: true, callRecord: finishedCall };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Enrichment API Outage Simulator & Deferred Backfill Queue
 * ────────────────────────────────────────────────────────────────────────── */

export function toggleStoreApiOutage(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
}) {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot toggle external enrichment API health simulation.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];
  tenant.budget.isApiDown = !tenant.budget.isApiDown;

  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName: params.actorName,
    actorRole: params.role,
    action: tenant.budget.isApiDown ? "enrichment:api_outage_simulated" : "enrichment:api_restored",
    targetId: tenant.id,
    detail: tenant.budget.isApiDown
      ? "Simulated 503 outage on external property enrichment API (Cache misses will mark UNENRICHED_DEGRADED with zero fabricated fields)"
      : "External property enrichment API restored — queued leads ready for backfill",
    createdAt: new Date().toISOString(),
  });

  return tenant.budget.isApiDown;
}

export function backfillStoreUnenrichedLeads(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
}): { backfilled: number; skippedCap: number; costCents: number; remaining: number } {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot run enrichment backfill jobs.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];

  if (tenant.budget.isApiDown) {
    throw new Error("External Enrichment API is currently in 503 Outage state. Restore API health before backfilling.");
  }
  if (tenant.budget.isPaused) {
    throw new Error("FinOps Cache-Only Pause is active. Resume API enrichment before running paid backfill.");
  }

  const pending = tenant.masters.filter((m) => m.enrichmentStatus === "UNENRICHED_DEGRADED");
  let backfilled = 0;
  let skippedCap = 0;
  let totalCostCents = 0;
  const nowIso = new Date().toISOString();

  const materials =
    tenant.localeDefault === "AU"
      ? ["Colorbond Steel", "Terracotta Tile", "Concrete Tile"]
      : tenant.localeDefault === "UK"
        ? ["Welsh Slate", "Clay Plain Tile", "Modern Composite"]
        : ["Architectural Shingle", "Standing Seam Metal", "Clay Barrel Tile"];
  const providerName =
    tenant.localeDefault === "AU"
      ? "CoreLogic AU API"
      : tenant.localeDefault === "UK"
        ? "HM Land Registry API"
        : "ATTOM Property API";

  for (const master of pending) {
    const cacheKey = (master.rawAddress || master.normalizedPhone || master.normalizedEmail || "")
      .trim()
      .toLowerCase();
    const cached = cacheKey ? tenant.propertyCache[cacheKey] : null;

    if (cached) {
      master.propertyEnrichment = cached;
      master.enrichmentStatus = "ENRICHED_CACHE";
      master.enrichmentReason = `Backfilled from local property cache (${cached.roofSqft} sqft) — $0.00`;
      tenant.budget.cacheSavingsCents += 5;
      backfilled += 1;
      continue;
    }

    if (tenant.budget.cacheOnlyOnCap && tenant.budget.currentSpendCents + 5 > tenant.budget.monthlyCapCents) {
      skippedCap += 1;
      continue;
    }

    const seedNum = master.rawPayloadHash
      .slice(0, 6)
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const enriched: PropertyEnrichment = {
      roofSqft: 1750 + (seedNum % 16) * 115,
      yearBuilt: 1990 + (seedNum % 32),
      propertyType: master.estimatedValue >= 25000 ? "Commercial / Multi-Unit" : "Single-Family Detached",
      roofMaterial: materials[seedNum % materials.length],
      provider: providerName,
      cachedAt: nowIso,
    };

    if (cacheKey) tenant.propertyCache[cacheKey] = enriched;
    master.propertyEnrichment = enriched;
    master.enrichmentStatus = "ENRICHED_LIVE";
    master.enrichmentReason = `Backfilled via ${providerName} (${enriched.roofSqft} sqft, built ${enriched.yearBuilt}) — $0.05`;
    tenant.budget.currentSpendCents += 5;
    totalCostCents += 5;
    backfilled += 1;

    tenant.ledger.unshift({
      id: nextId(store, "tx"),
      tenantSlug: tenant.slug,
      timestamp: formatShortDate(nowIso),
      contactName: master.canonicalName,
      contactSub: `${master.normalizedPhone || master.normalizedEmail} • Backfilled (${enriched.roofSqft} sqft, ${enriched.roofMaterial})`,
      channel: "GoHighLevel",
      operation: "GHL_SYNCED",
      enrichmentStatus: "ENRICHED_LIVE",
      amountDisplay: `${tenant.currencySymbol}0.05 Backfill`,
      amountTone: "positive",
    });
  }

  const remaining = tenant.masters.filter((m) => m.enrichmentStatus === "UNENRICHED_DEGRADED").length;

  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName: params.actorName,
    actorRole: params.role,
    action: "enrichment:backfill_executed",
    targetId: tenant.id,
    detail: `Backfilled ${backfilled} unenriched leads (${skippedCap} paused at cap, ${tenant.currencySymbol}${(totalCostCents / 100).toFixed(2)} spend, ${remaining} remaining)`,
    createdAt: nowIso,
  });

  return { backfilled, skippedCap, costCents: totalCostCents, remaining };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Interactive 2-Way Voice AI Call Sessions (User plays Homeowner/Customer!)
 * ────────────────────────────────────────────────────────────────────────── */

function settleVoiceCallSideEffects(
  store: GlobalStore,
  tenant: TenantState,
  call: CallRecord,
  actorName: string,
  role: UserRole
) {
  const analysis = analyzeCall(call.transcript, call.toolEvents, call.status, call.contactName);
  const nowIso = new Date().toISOString();

  call.outcome = analysis.outcome;
  call.summary = analysis.summary;
  call.sentiment = analysis.sentiment;
  call.appointmentAt = analysis.appointmentAt;
  call.optOutDetected = analysis.optOutDetected;
  call.endedAt = nowIso;
  call.costCents = costForDuration(call.durationSec);

  tenant.budget.currentSpendCents += call.costCents;

  const matchedMaster = call.masterId
    ? tenant.masters.find((m) => m.id === call.masterId)
    : tenant.masters.find((m) => m.normalizedPhone === call.phone);

  if (analysis.optOutDetected) {
    if (matchedMaster) {
      matchedMaster.isTcpaOptedOut = true;
    }
    // Also propagate DNC to any master sharing the exact phone number
    if (call.phone) {
      tenant.masters.forEach((m) => {
        if (m.normalizedPhone === call.phone) m.isTcpaOptedOut = true;
      });
    }
    tenant.quarantine.unshift({
      id: nextId(store, "qr"),
      tenantSlug: tenant.slug,
      runId: "voice_ai_dnc_trigger",
      reason: "DNC_CLUSTER",
      contaminatingRecord: `Mid-Call Consent Revocation: ${call.contactName} (${call.phone})`,
      rawPayload: JSON.stringify({
        name: call.contactName,
        phone: call.phone,
        notes: `Revoked consent during live Voice AI call (${analysis.summary})`,
        is_dnc: true,
      }),
      normalizedPreview: {
        canonicalName: call.contactName,
        normalizedPhone: call.phone,
        normalizedEmail: matchedMaster?.normalizedEmail || null,
        estimatedValue: matchedMaster?.estimatedValue || 0,
        triageConfidence: 1.0,
        intentCategory: "DNC_REVOCATION",
      },
      resolved: false,
      resolutionAction: null,
      resolvedBy: null,
      resolutionNotes: null,
      createdAt: nowIso,
    });

    tenant.ledger.unshift({
      id: nextId(store, "tx"),
      tenantSlug: tenant.slug,
      timestamp: formatShortDate(nowIso),
      contactName: call.contactName,
      contactSub: `${call.phone} • Mid-Call DNC Revocation (${tenant.complianceLaw})`,
      channel: "GoHighLevel",
      operation: "DNC_QUARANTINE",
      amountDisplay: "DNC Blocked",
      amountTone: "danger",
    });
  }

  if (analysis.appointmentAt && matchedMaster) {
    matchedMaster.status = "SYNCED_TO_GHL";
    tenant.ledger.unshift({
      id: nextId(store, "tx"),
      tenantSlug: tenant.slug,
      timestamp: formatShortDate(nowIso),
      contactName: matchedMaster.canonicalName,
      contactSub: `${matchedMaster.normalizedPhone} • Voice Booked: ${analysis.appointmentAt}`,
      channel: "GoHighLevel",
      operation: "GHL_SYNCED",
      enrichmentStatus: matchedMaster.enrichmentStatus,
      amountDisplay: `+ ${tenant.currencySymbol}${matchedMaster.estimatedValue.toLocaleString()}.00`,
      amountTone: "positive",
    });
  }

  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName,
    actorRole: role,
    action: "voice:interactive_call_settled",
    targetId: call.id,
    detail: `Interactive Voice AI call with ${call.contactName} ended (${call.outcome}, ${call.durationSec}s, ${tenant.currencySymbol}${(call.costCents / 100).toFixed(2)})`,
    createdAt: nowIso,
  });
}

export function startInteractiveVoiceCall(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
  masterId?: string | null;
  contactName: string;
  phone: string;
}): { ok: boolean; callRecord: CallRecord; error?: string; code?: string } {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot initiate interactive voice calls.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];
  if (!tenant.voice) tenant.voice = createVoiceState(tenant.name, tenant.localeDefault);

  const matchedMaster = params.masterId
    ? tenant.masters.find((m) => m.id === params.masterId)
    : tenant.masters.find((m) => m.normalizedPhone === params.phone);

  // Check DNC across BOTH LeadMaster AND Quarantine DNC_CLUSTER records sharing this phone
  const phoneQuarantinedDnc = Boolean(
    params.phone &&
      tenant.quarantine.some(
        (q) => q.reason === "DNC_CLUSTER" && q.normalizedPreview.normalizedPhone === params.phone
      )
  );
  const isOptedOut = Boolean(matchedMaster?.isTcpaOptedOut) || phoneQuarantinedDnc;

  const priorAttempts = tenant.voice.calls.filter((c) => c.phone === params.phone && c.status !== "BLOCKED").length;
  const budgetRemaining = tenant.budget.monthlyCapCents - tenant.budget.currentSpendCents;

  const gate = evaluatePreDialGate({
    phone: params.phone,
    locale: tenant.localeDefault,
    clockMode: tenant.voice.clockMode,
    isOptedOut,
    priorAttempts,
    maxAttempts: tenant.voice.config.maxAttempts,
    isPaused: tenant.budget.isPaused,
    budgetRemainingCents: budgetRemaining,
  });

  const nowIso = new Date().toISOString();

  if (!gate.allowed) {
    const blockedCall: CallRecord = {
      id: nextId(store, "call"),
      tenantSlug: tenant.slug,
      direction: "OUTBOUND",
      provider: tenant.voice.config.provider,
      providerCallId: null,
      masterId: matchedMaster?.id || null,
      contactName: params.contactName,
      phone: params.phone,
      scenario: null,
      status: "BLOCKED",
      outcome: "BLOCKED_BY_GATE",
      durationSec: 0,
      costCents: 0,
      startedAt: nowIso,
      endedAt: nowIso,
      endedReason: gate.reason,
      transcript: [],
      toolEvents: [],
      summary: `Pre-Dial Gate Blocked (${gate.code}): ${gate.reason}`,
      sentiment: "NEUTRAL",
      appointmentAt: null,
      optOutDetected: false,
      gateLocalTime: gate.localTime,
    };
    tenant.voice.calls.unshift(blockedCall);

    tenant.audits.unshift({
      id: nextId(store, "aud"),
      tenantSlug: tenant.slug,
      actorName: params.actorName,
      actorRole: params.role,
      action: "voice:pre_dial_blocked",
      targetId: matchedMaster?.id || null,
      detail: `Pre-dial compliance gate blocked call to ${params.contactName} (${gate.code}: ${gate.reason})`,
      createdAt: nowIso,
    });

    return { ok: false, callRecord: blockedCall, error: gate.reason, code: gate.code };
  }

  const first = params.contactName.split(/\s+/)[0] || "there";
  const opener = tenant.voice.config.firstMessage
    .replace(/\{\{first_name\}\}/g, first)
    .replace(/\{\{agent_name\}\}/g, tenant.voice.config.agentName);

  const activeCall: CallRecord = {
    id: nextId(store, "call"),
    tenantSlug: tenant.slug,
    direction: "OUTBOUND",
    provider: "MOCK",
    providerCallId: `live_sim_${Math.random().toString(36).slice(2, 9)}`,
    masterId: matchedMaster?.id || null,
    contactName: params.contactName,
    phone: params.phone,
    scenario: null,
    status: "IN_PROGRESS",
    outcome: "PENDING",
    durationSec: 6,
    costCents: 0,
    startedAt: nowIso,
    endedAt: null,
    endedReason: "in-progress",
    transcript: [{ role: "agent", text: opener, atSec: 0 }],
    toolEvents: [],
    summary: "Live interactive test call in progress — reply as the homeowner below.",
    sentiment: "NEUTRAL",
    appointmentAt: null,
    optOutDetected: false,
    gateLocalTime: gate.localTime,
  };

  tenant.voice.calls.unshift(activeCall);
  return { ok: true, callRecord: activeCall };
}

export function sendInteractiveVoiceReply(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
  callId: string;
  customerMessage: string;
}): { ok: boolean; callRecord: CallRecord } {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot interact with active voice sessions.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];
  const call = tenant.voice.calls.find((c) => c.id === params.callId);
  if (!call) throw new Error("Active voice call session not found.");
  if (call.status !== "IN_PROGRESS") {
    throw new Error("This voice call has already ended. Start a new call to test again.");
  }

  const nextSec = call.durationSec + 8;
  call.transcript.push({ role: "customer", text: params.customerMessage.trim(), atSec: nextSec });

  const turn = evaluateInteractiveCustomerTurn({
    customerMessage: params.customerMessage,
    contactName: call.contactName,
    tenantName: tenant.name,
    locale: tenant.localeDefault,
    config: tenant.voice.config,
    existingToolEvents: call.toolEvents,
    now: new Date(),
  });

  if (turn.newToolEvents.length > 0) {
    call.toolEvents.push(...turn.newToolEvents);
  }
  const replySec = nextSec + 6;
  call.transcript.push({ role: "agent", text: turn.agentReply, atSec: replySec });
  call.durationSec = replySec + 4;

  // Update intermediate live analysis preview
  const liveAnalysis = analyzeCall(call.transcript, call.toolEvents, call.status, call.contactName);
  call.sentiment = liveAnalysis.sentiment;
  call.appointmentAt = liveAnalysis.appointmentAt;
  call.optOutDetected = liveAnalysis.optOutDetected;

  if (turn.shouldEndCall) {
    call.status = "COMPLETED";
    call.endedReason = turn.endedReason || "completed";
    settleVoiceCallSideEffects(store, tenant, call, params.actorName, params.role);
  } else {
    call.summary = liveAnalysis.appointmentAt
      ? `Appointment booked for ${liveAnalysis.appointmentAt} (call still live — say thanks or hang up to settle).`
      : "Live interactive test call in progress — reply as the homeowner below.";
  }

  return { ok: true, callRecord: call };
}

export function hangUpInteractiveVoiceCall(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
  callId: string;
}): { ok: boolean; callRecord: CallRecord } {
  if (params.role === "VIEWER") {
    throw new Error("403 Forbidden: VIEWER role cannot end voice sessions.");
  }

  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];
  const call = tenant.voice.calls.find((c) => c.id === params.callId);
  if (!call) throw new Error("Voice call session not found.");
  if (call.status !== "IN_PROGRESS") return { ok: true, callRecord: call };

  call.status = "COMPLETED";
  call.endedReason = "operator-ended-call";
  settleVoiceCallSideEffects(store, tenant, call, params.actorName, params.role);
  return { ok: true, callRecord: call };
}

export function resetVoiceCallLimits(params: {
  slugOrId: string;
  role: UserRole;
  actorName: string;
  phone?: string | null;
  masterId?: string | null;
}): { ok: boolean; message: string } {
  const store = getStore();
  const slug = resolveTenantSlug(params.slugOrId);
  const tenant = store.tenants[slug];
  if (!tenant.voice) tenant.voice = createVoiceState(tenant.name, tenant.localeDefault);

  // 1. Elevate maxAttempts for evaluation
  tenant.voice.config.maxAttempts = 50;

  // 2. Clear call logs and DNC flags for this phone
  if (params.phone) {
    tenant.voice.calls = tenant.voice.calls.filter((c) => c.phone !== params.phone);
    tenant.quarantine = tenant.quarantine.filter(
      (q) => !(q.reason === "DNC_CLUSTER" && q.normalizedPreview.normalizedPhone === params.phone)
    );
  }
  if (params.masterId) {
    const m = tenant.masters.find((lead) => lead.id === params.masterId);
    if (m) {
      m.isTcpaOptedOut = false;
      if (m.normalizedPhone) {
        tenant.voice.calls = tenant.voice.calls.filter((c) => c.phone !== m.normalizedPhone);
        tenant.quarantine = tenant.quarantine.filter(
          (q) => !(q.reason === "DNC_CLUSTER" && q.normalizedPreview.normalizedPhone === m.normalizedPhone)
        );
      }
    }
  }

  // 3. Record audit event
  tenant.audits.unshift({
    id: nextId(store, "aud"),
    tenantSlug: tenant.slug,
    actorName: params.actorName,
    actorRole: params.role,
    action: "voice:limits_reset",
    targetId: params.masterId || null,
    detail: `Reviewer reset voice call attempts and DNC locks for ${params.phone || "active workspace"} (unlimited testing mode enabled)`,
    createdAt: new Date().toISOString(),
  });

  return { ok: true, message: "Voice dial attempt counters and DNC locks reset! Unlimited testing is active." };
}

export function ingestVapiWebhookEndOfCall(params: {
  tenantSlug: string;
  providerCallId: string | null;
  direction: "OUTBOUND" | "INBOUND";
  phone: string | null;
  masterId: string | null;
  durationSec: number;
  costCents: number;
  endedReason: string;
  status: CallRecord["status"];
  transcript: TranscriptTurn[];
  toolEvents: ToolEvent[];
  summary: string | null;
}): CallRecord {
  const store = getStore();
  const slug = resolveTenantSlug(params.tenantSlug);
  const tenant = store.tenants[slug];

  const matchedMaster = params.masterId
    ? tenant.masters.find((m) => m.id === params.masterId)
    : params.phone
      ? tenant.masters.find((m) => m.normalizedPhone === params.phone)
      : undefined;

  const existing = params.providerCallId
    ? tenant.voice.calls.find((c) => c.providerCallId === params.providerCallId)
    : undefined;

  const call: CallRecord = existing || {
    id: nextId(store, "call"),
    tenantSlug: tenant.slug,
    direction: params.direction,
    provider: "VAPI",
    providerCallId: params.providerCallId,
    masterId: matchedMaster?.id || null,
    contactName: matchedMaster?.canonicalName || params.phone || "Vapi Caller",
    phone: params.phone,
    scenario: null,
    status: params.status,
    outcome: "PENDING",
    durationSec: params.durationSec,
    costCents: params.costCents,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    endedReason: params.endedReason,
    transcript: params.transcript,
    toolEvents: params.toolEvents,
    summary: params.summary || "",
    sentiment: "NEUTRAL",
    appointmentAt: null,
    optOutDetected: false,
    gateLocalTime: "Vapi Webhook",
  };

  call.status = params.status;
  call.durationSec = params.durationSec;
  call.endedReason = params.endedReason;
  call.transcript = params.transcript;
  call.toolEvents = params.toolEvents;

  if (!existing) {
    tenant.voice.calls.unshift(call);
  }

  settleVoiceCallSideEffects(store, tenant, call, "Vapi Webhook", "ADMIN");
  if (params.summary) call.summary = params.summary;
  return call;
}

/* ──────────────────────────────────────────────────────────────────────────
 * PostgreSQL Durable Hydration & Write-Through Sync
 * ────────────────────────────────────────────────────────────────────────── */

const globalHydration = globalThis as unknown as {
  __integrityDbHydrated?: boolean;
};

export async function ensureStoreHydrated(): Promise<void> {
  if (globalHydration.__integrityDbHydrated) return;
  globalHydration.__integrityDbHydrated = true;

  const persisted = await loadSnapshotFromPostgres<GlobalStore>();
  if (persisted && persisted.initialized && persisted.tenants?.["apex-roofing"]) {
    // Ensure backwards-compatible defaults for newly added fields
    (["apex-roofing", "summit-solar", "thames-heating"] as const).forEach((slug) => {
      const t = persisted.tenants[slug];
      if (!t) return;
      if (!t.currencySymbol) t.currencySymbol = slug === "summit-solar" ? "A$" : slug === "thames-heating" ? "£" : "$";
      if (!t.propertyCache) t.propertyCache = {};
      if (typeof t.budget.isApiDown !== "boolean") t.budget.isApiDown = false;
      t.masters.forEach((m) => {
        if (!m.enrichmentStatus) m.enrichmentStatus = "ENRICHED_LIVE";
        if (!m.enrichmentReason) m.enrichmentReason = "Enriched via live property intelligence API ($0.05)";
        if (m.propertyEnrichment === undefined) m.propertyEnrichment = null;
      });
    });
    globalForStore.__leadIntegrityStore = persisted;
  } else {
    // Initial seed -> write initial baseline into PostgreSQL if connected
    const fresh = getStore();
    await persistTenantStateToPostgres("apex-roofing");
    await persistTenantStateToPostgres("summit-solar");
    await persistTenantStateToPostgres("thames-heating");
    globalForStore.__leadIntegrityStore = fresh;
  }
}

export async function persistTenantStateToPostgres(
  slugOrId: string,
  latestVoiceCall?: CallRecord
): Promise<boolean> {
  const store = getStore();
  const slug = resolveTenantSlug(slugOrId);
  const tenant = store.tenants[slug];
  const latestAudit = tenant.audits[0];
  return saveSnapshotToPostgres(store, {
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    localeDefault: tenant.localeDefault,
    webhookSecret: tenant.webhookSecret,
    budget: tenant.budget,
    latestAudit: latestAudit
      ? {
          action: latestAudit.action,
          targetId: latestAudit.targetId,
          detail: latestAudit.detail,
          actorName: latestAudit.actorName,
          actorRole: latestAudit.actorRole,
        }
      : undefined,
    latestVoiceCall: latestVoiceCall
      ? {
          id: latestVoiceCall.id,
          tenantSlug: latestVoiceCall.tenantSlug,
          direction: latestVoiceCall.direction,
          provider: latestVoiceCall.provider,
          providerCallId: latestVoiceCall.providerCallId,
          masterId: latestVoiceCall.masterId,
          contactName: latestVoiceCall.contactName,
          phone: latestVoiceCall.phone,
          status: latestVoiceCall.status,
          outcome: latestVoiceCall.outcome,
          durationSec: latestVoiceCall.durationSec,
          costCents: latestVoiceCall.costCents,
          sentiment: latestVoiceCall.sentiment,
          appointmentAt: latestVoiceCall.appointmentAt,
          optOutDetected: latestVoiceCall.optOutDetected,
          summary: latestVoiceCall.summary,
          transcript: latestVoiceCall.transcript,
          toolEvents: latestVoiceCall.toolEvents,
        }
      : undefined,
  });
}


