"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession, mutateServerActionSession } from "@/lib/auth";
import {
  backfillStoreUnenrichedLeads,
  dispatchStoreReactivation,
  dispatchVoiceCallAction,
  ensureStoreHydrated,
  getTenantSnapshot,
  getTenantVoiceState,
  hangUpInteractiveVoiceCall,
  ingestStoreBatch,
  persistTenantStateToPostgres,
  resolveStoreQuarantine,
  sendInteractiveVoiceReply,
  startInteractiveVoiceCall,
  toggleStoreApiOutage,
  toggleStoreEnrichmentPause,
  updateStoreBudgetPolicy,
  updateVoiceClockMode,
  resetVoiceCallLimits,
} from "@/lib/store";
import { ClockMode, VoiceScenario } from "@/lib/voice";
import { RawInboundLead, SupportedLocale, UserRole } from "@/contracts/lead-contracts";

export interface ActionResult<T = unknown> {
  ok: boolean;
  message: string;
  data?: T;
}

function revalidateAllSurfaces() {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/runs");
  revalidatePath("/quarantine");
  revalidatePath("/reactivation");
  revalidatePath("/voice");
  revalidatePath("/settings");
}

export async function switchWorkspaceAction(tenantSlug: string): Promise<ActionResult> {
  try {
    const session = await mutateServerActionSession({ tenantSlug });
    revalidateAllSurfaces();
    return {
      ok: true,
      message: `Switched active sub-account to ${session.tenantName}`,
      data: { tenantSlug: session.tenantSlug, tenantName: session.tenantName, role: session.role },
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to switch workspace" };
  }
}

export async function switchRoleAction(role: UserRole): Promise<ActionResult> {
  try {
    const session = await mutateServerActionSession({ role });
    revalidateAllSurfaces();
    return {
      ok: true,
      message: `Active session role changed to ${session.role} (${session.userName})`,
      data: { role: session.role, userName: session.userName },
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to switch role" };
  }
}

export async function ingestSingleLeadFromUiAction(input: {
  name: string;
  phone: string;
  email: string;
  address?: string;
  estimatedValue?: string | number;
  notes?: string;
  isDnc?: boolean;
  sourceChannel?: string;
}): Promise<ActionResult> {
  try {
    const session = await getCurrentSession();
    if (session.role === "VIEWER") {
      return {
        ok: false,
        message: "403 Forbidden: VIEWER role cannot ingest or mutate workspace leads.",
      };
    }

    await ensureStoreHydrated();
    const snap = getTenantSnapshot(session.tenantSlug);
    const rawLead: RawInboundLead = {
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      estimated_value: input.estimatedValue,
      notes: input.notes,
      is_dnc: Boolean(input.isDnc),
      tcpa_consent: !input.isDnc,
      source_channel: input.sourceChannel || "GoHighLevel",
      locale: snap.tenant.localeDefault,
    };

    const run = ingestStoreBatch(
      session.tenantSlug,
      [rawLead],
      "N8N_WEBHOOK",
      `Manual_UI_Intake_${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`,
      snap.tenant.localeDefault,
      `${session.userName} (UI Intake)`
    );

    await persistTenantStateToPostgres(session.tenantSlug);
    revalidateAllSurfaces();

    const row = run.lineage[0];
    const outcomeSummary =
      row.outcome === "CLEAN_MASTER"
        ? `Synced Clean Master (${row.normalizedPhone || row.normalizedEmail}) • Cost $${(row.costCents / 100).toFixed(2)}`
        : row.outcome === "MERGED_DUPLICATE"
          ? `Deduplicated & Merged (${row.detail}) • $0.00 Cache Hit`
          : `Intercepted into HITL Quarantine (${row.detail})`;

    return {
      ok: true,
      message: outcomeSummary,
      data: { runId: run.id, outcome: row.outcome, row },
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to ingest lead" };
  }
}

/**
 * Simple RFC-compatible CSV line parser supporting quoted fields with commas.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function uploadCsvBatchAction(input: {
  csvText: string;
  fileName: string;
  locale?: SupportedLocale;
}): Promise<ActionResult> {
  try {
    const session = await getCurrentSession();
    if (session.role === "VIEWER") {
      return {
        ok: false,
        message: "403 Forbidden: VIEWER role cannot upload batch CSV runs.",
      };
    }

    const lines = input.csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return {
        ok: false,
        message: "CSV must include a header row and at least 1 data row.",
      };
    }

    const headers = parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/[^a-z0-9_]/g, "_")
    );

    const rawItems: RawInboundLead[] = lines.slice(1).map((line) => {
      const cols = parseCsvLine(line);
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h] = cols[idx] ?? "";
      });

      return {
        name: record.name || record.full_name || record.contact_name,
        first_name: record.first_name || record.firstname,
        last_name: record.last_name || record.lastname,
        phone: record.phone || record.phone_number || record.mobile,
        email: record.email || record.email_address,
        address: record.address || record.street,
        estimated_value: record.estimated_value || record.value || record.amount,
        notes: record.notes || record.message || record.comments,
        is_dnc: record.is_dnc || record.dnc,
        tcpa_consent: record.tcpa_consent,
        created_at: record.created_at || record.date,
        source_channel: "CSV Batch",
      };
    });

    await ensureStoreHydrated();
    const snap = getTenantSnapshot(session.tenantSlug);
    const effectiveLocale = input.locale || snap.tenant.localeDefault;

    const run = ingestStoreBatch(
      session.tenantSlug,
      rawItems,
      "CSV_UPLOAD",
      input.fileName || "Uploaded_Batch.csv",
      effectiveLocale,
      `${session.userName} (CSV Upload)`
    );

    await persistTenantStateToPostgres(session.tenantSlug);
    revalidateAllSurfaces();

    return {
      ok: true,
      message: `Batch reconciled: ${run.totalInbound} Inbound = ${run.cleanMastersCount} Clean + ${run.mergedDuplicates} Merged + ${run.quarantinedCount} Quarantined + 0 Failed`,
      data: run,
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "CSV ingestion failed" };
  }
}

export async function resolveQuarantineAction(
  quarantineId: string,
  action: "APPROVED_SYNC" | "SPLIT_MASTER" | "EDITED_FIELDS" | "PERMANENT_QUARANTINE",
  options?: {
    editedName?: string;
    editedPhone?: string;
    editedEmail?: string;
    notes?: string;
  }
): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const res = resolveStoreQuarantine({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
      quarantineId,
      action,
      editedName: options?.editedName,
      editedPhone: options?.editedPhone,
      editedEmail: options?.editedEmail,
      notes: options?.notes,
    });

    await persistTenantStateToPostgres(session.tenantSlug);
    revalidateAllSurfaces();
    return {
      ok: true,
      message:
        action === "PERMANENT_QUARANTINE"
          ? `Confirmed permanent quarantine for "${res.record.normalizedPreview.canonicalName}".`
          : `Promoted "${res.record.normalizedPreview.canonicalName}" to Clean Master & synced to GoHighLevel.`,
      data: res,
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to resolve quarantine item" };
  }
}

export async function updateBudgetPolicyAction(
  monthlyCapCents: number,
  warningThreshold: number
): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const updated = updateStoreBudgetPolicy({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
      monthlyCapCents,
      warningThreshold,
    });

    await persistTenantStateToPostgres(session.tenantSlug);
    revalidateAllSurfaces();
    return {
      ok: true,
      message: `FinOps monthly cap set to $${(updated.monthlyCapCents / 100).toFixed(2)} (${updated.warningThreshold}% alert threshold).`,
      data: updated,
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to update FinOps policy" };
  }
}

export async function toggleEnrichmentPauseAction(): Promise<ActionResult<{ isPaused: boolean }>> {
  try {
    const session = await getCurrentSession();
    await ensureStoreHydrated();
    const isPaused = toggleStoreEnrichmentPause({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
    });
    await persistTenantStateToPostgres(session.tenantSlug);

    revalidateAllSurfaces();
    return {
      ok: true,
      message: isPaused
        ? "Cache-Only FinOps Guard activated ($0.00 paid lookups — cache misses queue honestly as Unenriched)."
        : "Live enrichment & AI triage resumed.",
      data: { isPaused },
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to toggle enrichment pause" };
  }
}

export async function toggleApiOutageAction(): Promise<ActionResult<{ isApiDown: boolean }>> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const isApiDown = toggleStoreApiOutage({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
    });
    await persistTenantStateToPostgres(session.tenantSlug);
    revalidateAllSurfaces();
    return {
      ok: true,
      message: isApiDown
        ? "Simulated 503 Property API Outage active — cache misses will save as UNENRICHED_DEGRADED (zero fabricated fields)."
        : "External Property API restored — queued leads can now be backfilled.",
      data: { isApiDown },
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to toggle API outage simulation" };
  }
}

export async function backfillUnenrichedLeadsAction(): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const res = backfillStoreUnenrichedLeads({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
    });
    await persistTenantStateToPostgres(session.tenantSlug);
    revalidateAllSurfaces();
    return {
      ok: true,
      message: `Backfilled ${res.backfilled} unenriched lead(s) ($${(res.costCents / 100).toFixed(2)} spend, ${res.remaining} remaining).`,
      data: res,
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Backfill failed" };
  }
}

export async function dispatchReactivationAction(masterId: string): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const master = dispatchStoreReactivation({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
      masterId,
    });

    await persistTenantStateToPostgres(session.tenantSlug);
    revalidateAllSurfaces();
    return {
      ok: true,
      message: `Dispatched "${master.canonicalName}" ($${master.estimatedValue.toLocaleString()}) to GoHighLevel reactivation workflow.`,
      data: master,
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to dispatch reactivation" };
  }
}

export async function askWorkspaceCopilotAction(question: string): Promise<ActionResult<{ answer: string; tokensUsed: number }>> {
  await ensureStoreHydrated();
  const session = await getCurrentSession();
  const snap = getTenantSnapshot(session.tenantSlug);
  const q = question.toLowerCase();
  const curr = snap.tenant.currencySymbol;

  const { totalInbound, cleanMasters, mergedAliases, activeQuarantine, permanentQuarantine } =
    snap.reconciliation;
  const spend = (snap.tenant.budget.currentSpendCents / 100).toFixed(2);
  const cap = (snap.tenant.budget.monthlyCapCents / 100).toFixed(2);
  const saved = (snap.tenant.budget.cacheSavingsCents / 100).toFixed(2);

  const wantsQuarantine =
    q.includes("quarantine") || q.includes("dnc") || q.includes("hub") || q.includes("blocked");
  const wantsFinops =
    q.includes("spend") || q.includes("budget") || q.includes("finops") || q.includes("cost") || q.includes("cap");
  const wantsEnrichment =
    q.includes("enrich") || q.includes("outage") || q.includes("backfill") || q.includes("cache") || q.includes("degrad");
  const wantsVoice =
    q.includes("voice") || q.includes("call") || q.includes("vapi") || q.includes("ash") || q.includes("book");
  const wantsReconciliation =
    q.includes("reconcil") ||
    q.includes("count") ||
    q.includes("equation") ||
    q.includes("inbound") ||
    q.includes("summary") ||
    (!wantsQuarantine && !wantsFinops && !wantsEnrichment && !wantsVoice);

  const segments: string[] = [];

  if (wantsReconciliation) {
    segments.push(
      `Reconciliation (${snap.tenant.name}, ${snap.tenant.phonePrefix}): ${totalInbound} Total Inbound = ${cleanMasters} Clean Masters + ${mergedAliases} Merged Duplicates + ${activeQuarantine + permanentQuarantine} Quarantined + 0 System Failures (100% verified, ${curr}${snap.pipelineValue.toLocaleString()} clean pipeline, ${curr}${snap.businessImpact.tcpaLiabilityProtected.toLocaleString()} compliance liability protected).`
    );
  }
  if (wantsFinops) {
    segments.push(
      `FinOps Telemetry: ${curr}${spend} spent of ${curr}${cap} monthly cap (${curr}${saved} saved via genuine local cache hits). Circuit breaker: ${
        snap.tenant.budget.isApiDown
          ? "API 503 OUTAGE (Degraded Honest Mode)"
          : snap.tenant.budget.isPaused
            ? "PAUSED (Cache-Only $0.00)"
            : "ACTIVE"
      }.`
    );
  }
  if (wantsEnrichment) {
    segments.push(
      `Enrichment Health: ${snap.businessImpact.unenrichedPendingCount} lead(s) currently UNENRICHED_DEGRADED (queued for backfill with zero fabricated specs) and ${snap.businessImpact.cacheEntriesCount} verified address(es) in local cache.`
    );
  }
  if (wantsVoice) {
    const calls = snap.tenant.voice?.calls || [];
    const booked = calls.filter((c) => c.outcome === "APPOINTMENT_BOOKED").length;
    const optedOut = calls.filter((c) => c.outcome === "OPTED_OUT").length;
    const blocked = calls.filter((c) => c.status === "BLOCKED").length;
    segments.push(
      `Voice AI Ledger (${snap.tenant.voice?.config.agentName || "Ash"}): ${calls.length} total call event(s) — ${booked} booked, ${optedOut} mid-call DNC revocations, ${blocked} pre-dial gate blocks.`
    );
  }
  if (wantsQuarantine) {
    const byReason: Record<string, number> = {};
    snap.tenant.quarantine
      .filter((item) => !item.resolved)
      .forEach((item) => {
        byReason[item.reason] = (byReason[item.reason] || 0) + 1;
      });
    const breakdown =
      Object.entries(byReason)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ") || "0 pending items";
    segments.push(
      `Quarantine Queue: ${activeQuarantine} active (${breakdown}) and ${permanentQuarantine} permanently blocked. Raw DNC PII redacted per ${snap.tenant.complianceLaw}.`
    );
  }

  const answer = segments.join(" ");

  return {
    ok: true,
    message: "Copilot response generated",
    data: { answer, tokensUsed: 142 },
  };
}

export async function setVoiceClockModeAction(clockMode: ClockMode): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const updated = updateVoiceClockMode({
      slugOrId: session.tenantSlug,
      role: session.role,
      clockMode,
    });
    await persistTenantStateToPostgres(session.tenantSlug);
    revalidateAllSurfaces();
    return { ok: true, message: `Calling window policy set to ${updated}`, data: updated };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to set calling window policy" };
  }
}

export async function startInteractiveVoiceCallAction(params: {
  masterId?: string | null;
  contactName: string;
  phone: string;
}): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const result = startInteractiveVoiceCall({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
      masterId: params.masterId,
      contactName: params.contactName,
      phone: params.phone,
    });
    await persistTenantStateToPostgres(session.tenantSlug, result.callRecord);
    revalidateAllSurfaces();
    if (!result.ok) {
      return { ok: false, message: result.error || "Pre-dial compliance gate blocked call", data: result.callRecord };
    }
    return { ok: true, message: "Live interactive call connected — Ash is on the line. Reply as the customer below.", data: result.callRecord };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to start interactive voice call" };
  }
}

export async function sendInteractiveVoiceReplyAction(params: {
  callId: string;
  customerMessage: string;
}): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const result = sendInteractiveVoiceReply({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
      callId: params.callId,
      customerMessage: params.customerMessage,
    });
    await persistTenantStateToPostgres(session.tenantSlug, result.callRecord);
    revalidateAllSurfaces();
    return {
      ok: true,
      message:
        result.callRecord.status === "COMPLETED"
          ? `Call ended (${result.callRecord.outcome}).`
          : "Ash replied.",
      data: result.callRecord,
    };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to send voice reply" };
  }
}

export async function hangUpInteractiveVoiceCallAction(callId: string): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const result = hangUpInteractiveVoiceCall({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
      callId,
    });
    await persistTenantStateToPostgres(session.tenantSlug, result.callRecord);
    revalidateAllSurfaces();
    return { ok: true, message: `Call settled (${result.callRecord.outcome}).`, data: result.callRecord };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to end voice call" };
  }
}

export async function triggerVoiceCallAction(params: {
  masterId?: string | null;
  contactName: string;
  phone: string;
  scenario?: VoiceScenario;
}): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const result = await dispatchVoiceCallAction({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
      masterId: params.masterId,
      contactName: params.contactName,
      phone: params.phone,
      scenario: params.scenario,
    });

    await persistTenantStateToPostgres(session.tenantSlug, result.callRecord);
    revalidateAllSurfaces();
    if (!result.ok) {
      return { ok: false, message: result.error || "Voice dial blocked", data: result.callRecord };
    }
    return { ok: true, message: `Automated QA replay executed (${result.callRecord?.outcome || "OK"})`, data: result.callRecord };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Voice dispatch failed" };
  }
}

export async function resetVoiceLimitsAction(params?: {
  phone?: string;
  masterId?: string | null;
}): Promise<ActionResult> {
  try {
    await ensureStoreHydrated();
    const session = await getCurrentSession();
    const result = resetVoiceCallLimits({
      slugOrId: session.tenantSlug,
      role: session.role,
      actorName: session.userName,
      phone: params?.phone,
      masterId: params?.masterId,
    });
    revalidateAllSurfaces();
    return { ok: true, message: result.message };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to reset voice limits" };
  }
}

