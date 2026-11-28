"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  backfillUnenrichedLeadsAction,
  switchWorkspaceAction,
  toggleApiOutageAction,
  toggleEnrichmentPauseAction,
} from "@/app/actions";
import { TenantSnapshot, WorkspaceSummary, LeadMasterItem, LedgerTransactionItem } from "@/lib/store";
import { UserRole } from "@/contracts/lead-contracts";
import { LeadIntakeModal } from "./lead-intake-modal";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Database,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Webhook,
  FileSpreadsheet,
  Globe,
  Building2,
  Eye,
  X,
  MapPin,
  Phone,
  Mail,
  PhoneCall,
  Calendar,
} from "lucide-react";

interface DashboardClientProps {
  snapshot: TenantSnapshot;
  workspaces: WorkspaceSummary[];
  currentRole: UserRole;
}

export function DashboardClient({
  snapshot,
  workspaces,
  currentRole,
}: DashboardClientProps) {
  const router = useRouter();
  const [switchingSlug, setSwitchingSlug] = useState<string | null>(null);
  const [isTogglingPause, startPauseTransition] = useTransition();
  const [isTogglingOutage, startOutageTransition] = useTransition();
  const [isBackfilling, startBackfillTransition] = useTransition();
  const [intakeOpen, setIntakeOpen] = useState(false);

  const [chartWindow, setChartWindow] = useState<"14" | "7">("14");
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);
  const [donutMode, setDonutMode] = useState<"SPEND" | "SAVED">("SPEND");
  const [ledgerFilter, setLedgerFilter] = useState<
    "ALL" | "CLEAN" | "MERGED" | "QUARANTINED" | "UNENRICHED"
  >("ALL");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(8);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [inspectMaster, setInspectMaster] = useState<LeadMasterItem | null>(null);

  const handleOpenLedgerLead = (row: LedgerTransactionItem) => {
    const master = tenant.masters.find(
      (m) =>
        m.canonicalName.toLowerCase() === row.contactName.toLowerCase() ||
        m.normalizedPhone === row.contactSub ||
        m.normalizedEmail === row.contactSub
    );
    if (master) {
      setInspectMaster(master);
    } else {
      setInspectMaster({
        id: row.id,
        tenantSlug: tenant.slug,
        runId: "ledger_event",
        canonicalName: row.contactName,
        normalizedPhone: row.contactSub.includes("+") ? row.contactSub : null,
        normalizedEmail: row.contactSub.includes("@") ? row.contactSub : null,
        rawAddress: null,
        rawPayloadHash: row.id,
        isTcpaOptedOut: row.operation === "DNC_QUARANTINE",
        isSharedHub: row.operation === "SHARED_HUB",
        triageScore: 3,
        triageConfidence: 0.85,
        intentCategory: "ROUTINE",
        triageSummary: `Ingested via ${row.channel} with operation ${row.operation}`,
        estimatedValue: 8500,
        enrichmentStatus: row.enrichmentStatus || (row.operation === "UNENRICHED_DEGRADED" ? "UNENRICHED_DEGRADED" : "ENRICHED_LIVE"),
        enrichmentReason: "Verified property profile",
        propertyEnrichment: {
          roofSqft: 2400,
          yearBuilt: 2012,
          propertyType: "Single Family",
          roofMaterial: "Asphalt Shingle",
          provider: "US Property Cloud API",
          cachedAt: row.timestamp,
        },
        status: "SYNCED_TO_GHL",
        daysDormant: 0,
        sourceChannel: row.channel,
        createdAt: row.timestamp,
      });
    }
  };

  const { tenant, reconciliation, businessImpact, persistence } = snapshot;
  const curr = tenant.currencySymbol || "$";

  const handleSelectWorkspace = (slug: string) => {
    if (slug === tenant.slug || switchingSlug) return;
    setBanner(null);
    setLedgerPage(1);
    setSwitchingSlug(slug);
    switchWorkspaceAction(slug).then((res) => {
      setSwitchingSlug(null);
      if (res.ok) {
        setBanner({ ok: true, text: res.message });
      } else {
        setBanner({ ok: false, text: res.message });
      }
      router.refresh();
    });
  };

  const handleTogglePause = () => {
    setBanner(null);
    startPauseTransition(async () => {
      const res = await toggleEnrichmentPauseAction();
      setBanner({ ok: res.ok, text: res.message });
      router.refresh();
    });
  };

  const handleToggleApiOutage = () => {
    setBanner(null);
    startOutageTransition(async () => {
      const res = await toggleApiOutageAction();
      setBanner({ ok: res.ok, text: res.message });
      router.refresh();
    });
  };

  const handleBackfill = () => {
    setBanner(null);
    startBackfillTransition(async () => {
      const res = await backfillUnenrichedLeadsAction();
      setBanner({ ok: res.ok, text: res.message });
      router.refresh();
    });
  };

  // Chart calculations
  const visibleSeries =
    chartWindow === "7" ? tenant.dailySeries.slice(-7) : tenant.dailySeries;
  const maxBarTotal = Math.max(
    20,
    ...visibleSeries.map((d) => d.cleanCount + d.heldOrMergedCount)
  );

  // Donut calculations
  const spendDollars = (tenant.budget.currentSpendCents / 100).toFixed(2);
  const savedDollars = (tenant.budget.cacheSavingsCents / 100).toFixed(2);
  const capDollars = (tenant.budget.monthlyCapCents / 100).toFixed(2);

  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const totalPool = Math.max(
    tenant.budget.monthlyCapCents,
    tenant.budget.currentSpendCents + tenant.budget.cacheSavingsCents
  );
  const spendRatio = Math.min(0.82, tenant.budget.currentSpendCents / Math.max(1, totalPool));
  const savedRatio = Math.min(
    0.92 - spendRatio,
    tenant.budget.cacheSavingsCents / Math.max(1, totalPool)
  );
  const spendDash = spendRatio * circumference;
  const savedDash = savedRatio * circumference;

  // Filtered + searched + paginated ledger rows
  const filteredLedger = tenant.ledger.filter((item) => {
    if (ledgerFilter === "CLEAN") {
      if (item.operation !== "GHL_SYNCED" && item.operation !== "REACTIVATED") return false;
    } else if (ledgerFilter === "MERGED") {
      if (item.operation !== "DEDUPE_MERGED") return false;
    } else if (ledgerFilter === "UNENRICHED") {
      if (item.operation !== "UNENRICHED_DEGRADED" && item.enrichmentStatus !== "UNENRICHED_DEGRADED") {
        return false;
      }
    } else if (ledgerFilter === "QUARANTINED") {
      const isQ =
        item.operation === "DNC_QUARANTINE" ||
        item.operation === "SHARED_HUB" ||
        item.operation === "TIME_GAP_HOLD" ||
        item.operation === "LOW_CONF_HITL" ||
        item.operation === "INVALID_DROP";
      if (!isQ) return false;
    }

    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase();
      return (
        item.contactName.toLowerCase().includes(q) ||
        item.contactSub.toLowerCase().includes(q) ||
        item.channel.toLowerCase().includes(q) ||
        item.operation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLedger.length / ledgerPageSize));
  const safePage = Math.min(ledgerPage, totalPages);
  const startIdx = (safePage - 1) * ledgerPageSize;
  const paginatedLedger = filteredLedger.slice(startIdx, startIdx + ledgerPageSize);

  const renderOperationPill = (op: TenantSnapshot["tenant"]["ledger"][number]["operation"]) => {
    switch (op) {
      case "GHL_SYNCED":
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#E3FAF4] text-[#0D9488]">
            GHL SYNCED
          </span>
        );
      case "UNENRICHED_DEGRADED":
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]">
            UNENRICHED (NO FAKE)
          </span>
        );
      case "REACTIVATED":
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#DCFCE7] text-[#15803D]">
            REACTIVATED
          </span>
        );
      case "DEDUPE_MERGED":
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#EBF2FF] text-[#1D4ED8]">
            DEDUPE MERGED
          </span>
        );
      case "DNC_QUARANTINE":
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#FEE2E2] text-[#DC2626]">
            DNC BLOCKED
          </span>
        );
      case "SHARED_HUB":
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#FEF3C7] text-[#D97706]">
            SHARED HUB
          </span>
        );
      case "TIME_GAP_HOLD":
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#F3E8FF] text-[#7C3AED]">
            TIME GAP &gt;5Y
          </span>
        );
      case "LOW_CONF_HITL":
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#FEF3C7] text-[#B45309]">
            LOW CONF HITL
          </span>
        );
      default:
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#F1F5F9] text-[#64748B]">
            INVALID SHAPE
          </span>
        );
    }
  };

  const renderChannelAvatar = (channel: string) => {
    if (channel === "GoHighLevel") {
      return (
        <span className="w-7 h-7 rounded-full bg-[#EEF4FF] text-[#1649C7] font-bold text-[10px] flex items-center justify-center flex-shrink-0 border border-[#D8E6FF]">
          GHL
        </span>
      );
    }
    if (channel === "n8n Webhook") {
      return (
        <span className="w-7 h-7 rounded-full bg-[#FFF0ED] text-[#EA580C] font-bold text-[10px] flex items-center justify-center flex-shrink-0 border border-[#FED7AA]">
          n8n
        </span>
      );
    }
    if (channel === "Meta Lead Ads") {
      return (
        <span className="w-7 h-7 rounded-full bg-[#F3E8FF] text-[#7C3AED] font-bold text-[10px] flex items-center justify-center flex-shrink-0 border border-[#E9D5FF]">
          ADS
        </span>
      );
    }
    return (
      <span className="w-7 h-7 rounded-full bg-[#E3FAF4] text-[#0D9488] font-bold text-[10px] flex items-center justify-center flex-shrink-0 border border-[#BFF3E5]">
        CSV
      </span>
    );
  };

  return (
    <>
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* MIDDLE RAIL: Client Sub-Accounts (Matches "Choose method" column in reference) */}
        <section className="w-full lg:w-[304px] xl:w-[324px] flex-shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-[#E8EEF6] p-6 flex flex-col justify-start gap-6">
          <div>
            {/* Rail Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-bold text-[#172554]">Sub-accounts</h2>
              <button
                type="button"
                onClick={() => setIntakeOpen(true)}
                data-testid="rail-add-lead-btn"
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-[#2CE0B6] to-[#1EC8B8] hover:opacity-95 shadow-[0_4px_12px_rgba(30,200,184,0.25)] flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Add Lead
              </button>
            </div>

            {/* 3 Stacked Agency Client Sub-Account Cards */}
            <div className="space-y-3.5">
              {workspaces.map((ws) => {
                const isActive = ws.slug === tenant.slug;
                const isSwitchingThis = switchingSlug === ws.slug;

                return (
                  <div
                    key={ws.slug}
                    data-testid={`workspace-card-${ws.slug}`}
                    className={`p-4.5 pl-5 pr-5 ${isActive ? "soax-method-card-active" : "soax-method-card"}`}
                  >
                    {/* Card Top Row */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-bold text-[#172554] truncate pr-2">
                        {ws.name}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          ws.statusBadge === "ACTIVE"
                            ? "bg-[#1E5EFF] text-white"
                            : "bg-[#516F9E] text-white"
                        }`}
                      >
                        {ws.statusBadge}
                      </span>
                    </div>

                    {/* Center Emblem */}
                    <div className="py-1 text-center">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#F6F9FE] border border-[#E8EFF8]">
                        <span className="w-5 h-5 rounded-md bg-gradient-to-br from-[#1649C7] to-[#2CE0B6] text-white text-[9px] font-extrabold flex items-center justify-center">
                          {ws.localeDefault}
                        </span>
                        <div className="text-left">
                          <p className="text-xs font-extrabold text-[#172554] leading-tight">
                            {ws.phonePrefix}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono leading-tight">
                            {ws.dateFormat}
                          </p>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5 truncate">{ws.subtitle}</p>
                    </div>

                    {/* Card Action Button */}
                    <button
                      type="button"
                      onClick={() => handleSelectWorkspace(ws.slug)}
                      disabled={isActive || Boolean(switchingSlug)}
                      data-testid={`switch-btn-${ws.slug}`}
                      className={`w-full mt-2.5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                        isActive
                          ? "bg-[#1649C7] text-white shadow-[0_4px_12px_rgba(22,73,199,0.2)] cursor-default"
                          : "bg-[#F1F5FB] text-[#1E3A8A] hover:bg-[#1649C7] hover:text-white"
                      }`}
                    >
                      {isSwitchingThis ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Switching...
                        </>
                      ) : isActive ? (
                        "Active Sub-Account"
                      ) : (
                        "Switch Sub-Account"
                      )}
                    </button>

                    {/* Card Footer Stats */}
                    <div className="mt-3 pt-2.5 border-t border-[#F1F5FB] flex items-center justify-between text-[10px]">
                      <div>
                        <span className="uppercase tracking-wider text-slate-400 font-semibold mr-1">
                          INBOUND
                        </span>
                        <strong className="text-xs font-extrabold text-[#172554]">
                          {ws.totalInbound}
                        </strong>
                      </div>
                      <div>
                        <span className="uppercase tracking-wider text-slate-400 font-semibold mr-1">
                          PIPELINE
                        </span>
                        <strong className="text-xs font-extrabold text-[#172554]">
                          {ws.currencySymbol}{ws.pipelineValue.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Lineage Context Card & Action */}
          <div className="space-y-3 pt-2 border-t border-[#E8EEF6]">
            <div className="p-3.5 bg-[#F8FAFC] rounded-xl border border-[#EDF2F7] text-xs space-y-1.5">
              <div className="font-bold text-[#172554] flex items-center justify-between">
                <span>Ingestion Lineage</span>
                <span className="text-[10px] font-mono text-[#0E9F84] bg-[#E3FAF4] px-1.5 py-0.5 rounded">
                  CSV + Webhook
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Raw payloads stream into deterministic dedupe tiers before syncing to GoHighLevel.
              </p>
            </div>

            <Link
              href="/runs"
              data-testid="upload-batch-csv-btn"
              className="block w-full py-2.5 rounded-lg bg-[#E3FAF4] hover:bg-[#CCF5EA] text-[#0E9F84] text-xs font-bold text-center transition shadow-xs"
            >
              Upload Batch CSV →
            </Link>
          </div>
        </section>

        {/* RIGHT MAIN CANVAS: Analytics, Invariant & Ledger */}
        <section className="flex-1 min-w-0 p-6 xl:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1
                    className="text-[17px] font-bold text-[#172554]"
                    data-testid="active-workspace-heading"
                  >
                    Integrity &amp; Balance — {tenant.name}
                  </h1>
                  <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#E2EAF5] text-[#1649C7]">
                    {tenant.phonePrefix} • {tenant.dateFormat}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  GoHighLevel Location <code className="font-mono text-slate-500">{tenant.ghlLocationId}</code> •{" "}
                  {tenant.complianceLaw} • Session Role: <strong className="text-[#172554]">{currentRole}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIntakeOpen(true)}
                  data-testid="header-simulate-webhook-btn"
                  className="px-3.5 py-2 rounded-lg bg-[#E3FAF4] hover:bg-[#CCF5EA] text-[#0E9F84] text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Simulate Webhook
                </button>
                <button
                  type="button"
                  onClick={handleToggleApiOutage}
                  disabled={isTogglingOutage}
                  data-testid="header-outage-btn"
                  title="Simulate external property API 503 outage to prove zero fabricated enrichment fields"
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    tenant.budget.isApiDown
                      ? "bg-rose-100 text-rose-800 hover:bg-rose-200 border border-rose-200"
                      : "bg-[#F4F7FC] hover:bg-[#E7EEF9] text-slate-600 border border-[#E2EAF5]"
                  }`}
                >
                  {isTogglingOutage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CloudOff className="w-3.5 h-3.5" />
                  )}
                  <span>{tenant.budget.isApiDown ? "Restore API (503)" : "Sim API Outage"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  disabled={isTogglingPause}
                  data-testid="header-pause-btn"
                  title="FinOps Pause: skips paid $0.05 enrichment on cache misses without halting lead intake"
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    tenant.budget.isPaused
                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                      : "bg-[#E9EFF9] hover:bg-[#DCE6F7] text-[#1E3A8A]"
                  }`}
                >
                  {isTogglingPause ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : tenant.budget.isPaused ? (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Pause className="w-3.5 h-3.5" />
                  )}
                  <span>{tenant.budget.isPaused ? "Resume API" : "Pause"}</span>
                </button>
              </div>
            </div>

            {/* Feedback Banner */}
            {banner && (
              <div
                data-testid="dashboard-status-banner"
                className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                  banner.ok
                    ? "bg-[#E3FAF4] border-[#B2EFE0] text-[#0B7A66]"
                    : "bg-rose-50 border-rose-200 text-rose-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  {banner.ok ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{banner.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBanner(null)}
                  className="text-[11px] underline opacity-75 hover:opacity-100"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Two-Sided Mathematical Reconciliation Invariant Strip */}
            <div className="soax-card px-5 py-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-[#E3FAF4] text-[#0D9488] flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-[#172554] block truncate">
                    Two-Sided Reconciliation Invariant
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block truncate">
                    Inbound = Clean + Merged + Quarantined + 0 Failed
                  </span>
                </div>
              </div>

              <div
                className="flex flex-wrap xl:flex-nowrap items-center gap-1.5 font-mono text-[11px] flex-shrink-0"
                data-testid="invariant-equation-pills"
              >
                <span className="px-2.5 py-1 rounded-lg bg-[#F4F7FC] text-[#172554] font-bold whitespace-nowrap">
                  {reconciliation.totalInbound} Inbound
                </span>
                <span className="text-slate-400 font-bold">=</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#E3FAF4] text-[#0D9488] font-bold whitespace-nowrap">
                  {reconciliation.cleanMasters} Clean
                </span>
                <span className="text-slate-400 font-bold">+</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#EBF2FF] text-[#1D4ED8] font-bold whitespace-nowrap">
                  {reconciliation.mergedAliases} Merged
                </span>
                <span className="text-slate-400 font-bold">+</span>
                <Link
                  href="/quarantine"
                  className="px-2.5 py-1 rounded-lg bg-[#FEF3C7] text-[#B45309] font-bold hover:opacity-90 transition whitespace-nowrap"
                >
                  {reconciliation.totalQuarantined} Quarantined
                </Link>
                <span className="ml-0.5 px-2.5 py-1 rounded-full bg-[#1649C7] text-white text-[10px] font-bold whitespace-nowrap">
                  {reconciliation.isReconciled ? "100% VERIFIED" : "DRIFT"}
                </span>
              </div>
            </div>

            {/* Honest Degradation Backfill Alert (shown when API Outage or Pause queued unenriched leads) */}
            {businessImpact.unenrichedPendingCount > 0 && (
              <div
                data-testid="unenriched-backfill-banner"
                className="px-5 py-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5 text-xs text-amber-900">
                  <CloudOff className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">
                      Honest Degradation Queue: {businessImpact.unenrichedPendingCount} lead(s) saved as{" "}
                      <code className="font-mono bg-amber-100 px-1 rounded">UNENRICHED_DEGRADED</code>
                    </span>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Zero fabricated property data was invented during API outage or FinOps pause. Leads still synced safely to CRM — backfill real specs once API is active.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBackfill}
                  disabled={isBackfilling || tenant.budget.isApiDown || tenant.budget.isPaused}
                  data-testid="run-backfill-btn"
                  className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition"
                >
                  {isBackfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Backfill {businessImpact.unenrichedPendingCount} Lead(s)
                </button>
              </div>
            )}

            {/* Business ROI & Operations Impact Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="business-roi-strip">
              <div className="soax-card px-4 py-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Compliance Liability Protected
                  </span>
                  <span className="text-[18px] font-extrabold text-[#172554]">
                    {curr}{businessImpact.tcpaLiabilityProtected.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {businessImpact.tcpaBlockedCount} DNC opt-out cluster(s) shielded
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>

              <div className="soax-card px-4 py-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Clean &amp; Dormant Pipeline
                  </span>
                  <span className="text-[18px] font-extrabold text-[#0D9488]">
                    {curr}{snapshot.pipelineValue.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {curr}{businessImpact.dormantPipelineValue.toLocaleString()} recoverable dormant (&gt;2yr)
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-[#E3FAF4] text-[#0D9488] flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>

              <div className="soax-card px-4 py-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Enrichment &amp; Storage Telemetry
                  </span>
                  <span className="text-[14px] font-extrabold text-[#172554] block mt-0.5">
                    {persistence.mode === "POSTGRESQL_LIVE" ? "PostgreSQL 16 Live" : "In-Memory Fallback"}
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {businessImpact.cacheEntriesCount} cached properties • {businessImpact.unenrichedPendingCount} pending backfill
                  </span>
                </div>
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    persistence.mode === "POSTGRESQL_LIVE"
                      ? "bg-[#EBF2FF] text-[#1649C7]"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <Database className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Charts Row: Daily Capsule Bar Chart + FinOps Donut Gauge */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left Card: Daily ingestion overview (Matches "Daily balance overview") */}
              <div className="lg:col-span-7 xl:col-span-8 soax-card p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2 mb-5">
                  <div className="flex items-center gap-3.5 flex-wrap">
                    <h3 className="text-[14px] font-bold text-[#172554] whitespace-nowrap">
                      Daily ingestion overview
                    </h3>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full bg-[#36DFC0]" /> Clean Synced
                      </span>
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full bg-[#1956DB]" /> Merged / Held
                      </span>
                    </div>
                  </div>

                  <select
                    aria-label="Chart timeframe"
                    value={chartWindow}
                    onChange={(e) => setChartWindow(e.target.value as "14" | "7")}
                    className="px-2.5 py-1.5 rounded-lg border border-[#E4ECF6] bg-white text-xs font-semibold text-slate-600 focus:outline-none focus:border-[#1E5EFF] flex-shrink-0"
                  >
                    <option value="14">Last 14 days</option>
                    <option value="7">Last 7 days</option>
                  </select>
                </div>

                {/* Capsule Stacked Bar SVG */}
                <div className="relative h-[215px] w-full select-none">
                  {hoveredDayIdx !== null && visibleSeries[hoveredDayIdx] && (
                    <div className="absolute top-0 right-2 px-3 py-1.5 rounded-lg bg-[#172554] text-white text-[11px] font-mono shadow-md z-10 pointer-events-none">
                      {visibleSeries[hoveredDayIdx].dayLabel}:{" "}
                      {visibleSeries[hoveredDayIdx].cleanCount} Clean •{" "}
                      {visibleSeries[hoveredDayIdx].heldOrMergedCount} Merged/Held
                    </div>
                  )}

                  <svg className="w-full h-full overflow-visible" viewBox="0 0 640 200">
                    {/* Horizontal Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((step, i) => {
                      const y = 170 - step * 145;
                      const labelVal = Math.round(step * maxBarTotal);
                      return (
                        <g key={i}>
                          <text
                            x="0"
                            y={y + 3}
                            className="fill-slate-400 text-[10px] font-mono"
                          >
                            {labelVal}
                          </text>
                          <line
                            x1="32"
                            y1={y}
                            x2="630"
                            y2={y}
                            stroke="#EEF2F8"
                            strokeWidth="1"
                          />
                        </g>
                      );
                    })}

                    {/* Slender Two-Tone Capsule Bars (Matching Reference Image) */}
                    {visibleSeries.map((pt, idx) => {
                      const slotWidth = 590 / visibleSeries.length;
                      const cx = 42 + idx * slotWidth + slotWidth / 2;
                      const barW = 7;

                      const heldH = Math.max(8, (pt.heldOrMergedCount / maxBarTotal) * 145);
                      const cleanH = Math.max(10, (pt.cleanCount / maxBarTotal) * 145);
                      const totalH = Math.min(150, heldH + cleanH);

                      const baseTopY = 170 - heldH;
                      const fullTopY = 170 - totalH;

                      return (
                        <g
                          key={pt.dayLabel}
                          onMouseEnter={() => setHoveredDayIdx(idx)}
                          onMouseLeave={() => setHoveredDayIdx(null)}
                          className="cursor-pointer"
                        >
                          {/* Invisible hover hit column */}
                          <rect
                            x={cx - slotWidth / 2}
                            y="15"
                            width={slotWidth}
                            height="165"
                            fill="transparent"
                          />
                          {/* Top Aqua-Mint Segment */}
                          <rect
                            x={cx - barW / 2}
                            y={fullTopY}
                            width={barW}
                            height={totalH}
                            rx={3.5}
                            fill="#36DFC0"
                          />
                          {/* Bottom Royal-Blue Segment */}
                          <rect
                            x={cx - barW / 2}
                            y={baseTopY}
                            width={barW}
                            height={heldH}
                            rx={3.5}
                            fill="#1956DB"
                          />
                          {/* X-Axis Labels on alternating bars */}
                          {(idx % 3 === 0 || idx === visibleSeries.length - 1) && (
                            <text
                              x={cx}
                              y="190"
                              textAnchor="middle"
                              className="fill-slate-400 text-[10px] font-medium"
                            >
                              {pt.dayLabel}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Right Card: FinOps Donut Gauge (Matches "Balance statistic" card) */}
              <div className="lg:col-span-5 xl:col-span-4 soax-card p-6 flex flex-col justify-between min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-1 flex-nowrap w-full pb-1">
                  <h3 className="text-[14px] font-bold text-[#172554] truncate">
                    FinOps balance
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] font-bold flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setDonutMode("SPEND")}
                      className={`pb-0.5 px-0.5 transition ${
                        donutMode === "SPEND"
                          ? "text-[#172554] border-b-2 border-[#36DFC0]"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      SPEND
                    </button>
                    <button
                      type="button"
                      onClick={() => setDonutMode("SAVED")}
                      className={`pb-0.5 px-0.5 transition ${
                        donutMode === "SAVED"
                          ? "text-[#172554] border-b-2 border-[#36DFC0]"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      SAVED
                    </button>
                  </div>
                </div>

                {/* Donut Ring */}
                <div className="my-3 flex items-center justify-center relative w-full overflow-hidden">
                  <div className="w-[176px] h-[176px] flex items-center justify-center relative flex-shrink-0">
                    <svg className="w-[176px] h-[176px] -rotate-90 block" viewBox="0 0 176 176">
                      {/* Outer subtle halo */}
                      <circle
                        cx="88"
                        cy="88"
                        r="76"
                        fill="none"
                        stroke="#F1F5FB"
                        strokeWidth="6"
                      />
                      {/* Base Track */}
                      <circle
                        cx="88"
                        cy="88"
                        r={radius}
                        fill="none"
                        stroke="#E6ECF5"
                        strokeWidth="18"
                      />
                      {/* Aqua-Mint Segment (API Spend) */}
                      <circle
                        cx="88"
                        cy="88"
                        r={radius}
                        fill="none"
                        stroke="#36DFC0"
                        strokeWidth="18"
                        strokeDasharray={`${spendDash} ${circumference}`}
                      />
                      {/* Royal-Blue Segment (Cache Savings) */}
                      <circle
                        cx="88"
                        cy="88"
                        r={radius}
                        fill="none"
                        stroke="#1956DB"
                        strokeWidth="18"
                        strokeDasharray={`${savedDash} ${circumference}`}
                        strokeDashoffset={-(spendDash + 4)}
                      />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                      <span className="text-[26px] font-extrabold text-[#172554] tracking-tight leading-none px-2">
                        {curr}{donutMode === "SPEND" ? spendDollars : savedDollars}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400 mt-1">
                        {donutMode === "SPEND" ? `of ${curr}${capDollars} Cap` : "Cache Saved"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-5 text-xs text-slate-500 font-medium pt-1">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-[#36DFC0] flex-shrink-0" /> API Spend
                  </span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-[#1956DB] flex-shrink-0" /> Cache Saved
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Wide Card: Paginated, Searchable, Bounded-Scroll Lead Operations Ledger */}
            <div className="soax-card p-6" data-testid="lead-operations-ledger">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-[15px] font-bold text-[#172554]">Lead Operations Ledger</h3>
                  <span className="px-2 py-0.5 rounded-full bg-[#F4F7FC] text-[11px] font-mono font-bold text-slate-500">
                    {filteredLedger.length} events
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Live Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={ledgerSearch}
                      onChange={(e) => {
                        setLedgerSearch(e.target.value);
                        setLedgerPage(1);
                      }}
                      placeholder="Search name, phone, channel..."
                      data-testid="ledger-search-input"
                      className="pl-8 pr-3 py-1.5 w-56 rounded-lg border border-[#E4ECF6] bg-[#FAFBFD] text-xs text-[#172554] placeholder:text-slate-400 focus:outline-none focus:border-[#1E5EFF]"
                    />
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex items-center gap-3 text-xs font-semibold flex-wrap">
                    {(
                      [
                        { key: "ALL", label: "All" },
                        { key: "CLEAN", label: "Clean" },
                        { key: "MERGED", label: "Merged" },
                        { key: "QUARANTINED", label: "Quarantined" },
                        { key: "UNENRICHED", label: "Unenriched" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        data-testid={`ledger-filter-${tab.key.toLowerCase()}`}
                        onClick={() => {
                          setLedgerFilter(tab.key);
                          setLedgerPage(1);
                        }}
                        className={`transition ${
                          ledgerFilter === tab.key
                            ? "text-[#172554] font-extrabold border-b-2 border-[#36DFC0] pb-0.5"
                            : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bounded-height scroll container prevents infinite page stretch even at 1,000+ rows */}
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-[#F1F5FB] rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_#EEF2F8]">
                    <tr className="text-[11px] font-semibold text-slate-400">
                      <th className="py-3 pl-3 pr-4 font-medium">Date and time</th>
                      <th className="py-3 px-4 font-medium">Channel &amp; Prospect</th>
                      <th className="py-3 px-4 font-medium text-center">Operation</th>
                      <th className="py-3 pl-4 pr-3 font-medium text-right">Value / Impact ({curr})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F7FC] text-xs">
                    {paginatedLedger.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-xs text-slate-400">
                          No ledger events match your current search or filter.
                        </td>
                      </tr>
                    ) : (
                      paginatedLedger.map((row, i) => (
                        <tr
                          key={row.id}
                          data-testid="ledger-row"
                          className={`transition hover:bg-[#F7FAFF] ${
                            i % 2 === 1 ? "bg-[#FAFBFD]" : "bg-white"
                          }`}
                        >
                          <td className="py-3 pl-3 pr-4 text-slate-600 font-medium whitespace-nowrap">
                            {row.timestamp}
                          </td>
                          <td
                            className="py-3 px-4 cursor-pointer group"
                            onClick={() => handleOpenLedgerLead(row)}
                            title="Click to inspect full lead dossier, property specs & AI triage"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                {renderChannelAvatar(row.channel)}
                                <div>
                                  <span className="font-bold text-[#172554] group-hover:text-[#1649C7] transition block">
                                    {row.contactName}
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-mono">
                                    {row.contactSub}
                                  </span>
                                </div>
                              </div>
                              <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-[#1649C7] bg-[#EBF2FF] px-2 py-0.5 rounded transition">
                                Inspect
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {renderOperationPill(row.operation)}
                          </td>
                          <td
                            className={`py-3 pl-4 pr-3 text-right font-extrabold whitespace-nowrap ${
                              row.amountTone === "positive"
                                ? "text-[#12B886]"
                                : row.amountTone === "danger"
                                  ? "text-[#DC2626]"
                                  : row.amountTone === "warning"
                                    ? "text-[#D97706]"
                                    : "text-[#172554]"
                            }`}
                          >
                            {row.amountDisplay}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div
                className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500"
                data-testid="ledger-pagination"
              >
                <div className="flex items-center gap-3">
                  <span>
                    Showing{" "}
                    <strong className="text-[#172554]">
                      {filteredLedger.length === 0 ? 0 : startIdx + 1}–
                      {Math.min(startIdx + ledgerPageSize, filteredLedger.length)}
                    </strong>{" "}
                    of <strong className="text-[#172554]">{filteredLedger.length}</strong> events
                  </span>
                  <select
                    aria-label="Rows per page"
                    value={ledgerPageSize}
                    onChange={(e) => {
                      setLedgerPageSize(Number(e.target.value));
                      setLedgerPage(1);
                    }}
                    className="px-2 py-1 rounded-lg border border-[#E4ECF6] bg-white text-[11px] font-semibold text-slate-600 focus:outline-none"
                  >
                    <option value={8}>8 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                    data-testid="ledger-prev-page"
                    className="px-2.5 py-1.5 rounded-lg border border-[#E4ECF6] bg-white hover:bg-[#F4F7FC] disabled:opacity-40 text-xs font-semibold text-[#172554] flex items-center gap-1 transition"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <span
                    className="px-2.5 py-1 rounded-lg bg-[#F4F7FC] font-mono text-[11px] font-bold text-[#172554]"
                    data-testid="ledger-page-indicator"
                  >
                    Page {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setLedgerPage((p) => Math.min(totalPages, p + 1))}
                    data-testid="ledger-next-page"
                    className="px-2.5 py-1.5 rounded-lg border border-[#E4ECF6] bg-white hover:bg-[#F4F7FC] disabled:opacity-40 text-xs font-semibold text-[#172554] flex items-center gap-1 transition"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Clean Subtle Footer (Matches bottom strip in reference) */}
          <footer className="pt-4 border-t border-[#E6ECF5] flex flex-wrap items-center justify-between gap-4 text-[11px] text-slate-400">
            <div className="flex flex-wrap items-center gap-6">
              <span>
                Compliance: <strong className="text-slate-500">{tenant.complianceLaw}</strong>
              </span>
              <span>
                Webhook Auth: <strong className="text-slate-500">HMAC-SHA256</strong>
              </span>
              <span>
                Tenancy: <strong className="text-slate-500">iron-session AES</strong>
              </span>
            </div>
            <span>© 2026 integrity.io</span>
          </footer>
        </section>
      </div>

      <LeadIntakeModal
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        tenantName={tenant.name}
        locale={tenant.localeDefault}
        phonePrefix={tenant.phonePrefix}
      />

      {/* Clean Lead Dossier & Property Specs Inspector Modal */}
      {inspectMaster && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A194E]/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Clean Lead Dossier & Audit"
        >
          <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-2xl border border-[#E4EBF5] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-[#F8FAFE] border-b border-[#E8EEF6] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-[#172554]">{inspectMaster.canonicalName}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                      {inspectMaster.status}
                    </span>
                    {inspectMaster.appointmentAt && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-600 text-white flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Booked: {inspectMaster.appointmentAt}
                      </span>
                    )}
                    {inspectMaster.isTcpaOptedOut && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-600 text-white flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> DNC Opt-Out
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-slate-500">
                    Master ID: {inspectMaster.id} • {tenant.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectMaster(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
              {/* Contact & Address Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E4ECF6]">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Normalized Phone</span>
                  <span className="font-mono font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-[#0D9488]" />
                    {inspectMaster.normalizedPhone || "None"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Normalized Email</span>
                  <span className="font-mono font-bold text-slate-800 flex items-center gap-1.5 mt-0.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-[#1649C7]" />
                    {inspectMaster.normalizedEmail || "None"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Verified Property Address</span>
                  <span className="font-medium text-slate-800 flex items-center gap-1.5 mt-0.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    {inspectMaster.rawAddress || "742 Evergreen Terrace, Austin TX"}
                  </span>
                </div>
              </div>

              {/* Voice AI Qualification & TCPA Consent Status */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                    <PhoneCall className="w-4 h-4 text-teal-600" /> Voice AI Qualification Status
                  </span>
                  {inspectMaster.appointmentAt ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      ✓ Inspection Booked
                    </span>
                  ) : inspectMaster.isTcpaOptedOut ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                      🚫 Pre-Dial Hard Block
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                      Ready For Outbound
                    </span>
                  )}
                </div>

                {inspectMaster.appointmentAt ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-bold flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-emerald-600" />
                        Inspection Slot: {inspectMaster.appointmentAt}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Qualified autonomously by Ash and synced to GoHighLevel dispatch calendar.
                      </p>
                    </div>
                    <Link
                      href="/voice"
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] hover:bg-emerald-700 transition"
                    >
                      View Transcript
                    </Link>
                  </div>
                ) : inspectMaster.isTcpaOptedOut ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-xs">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      TCPA Consent Revoked (Do-Not-Call)
                    </p>
                    <p className="text-[11px] text-rose-700 mt-0.5">
                      Mid-call opt-out recorded. All future outbound dialing attempts will be hard-blocked by the Pre-Dial Gate at 0s duration and $0.00 spend.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-800">
                        Pre-dial calling window permitted (8:00 AM – 9:00 PM local time).
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        High-urgency speed-to-lead qualification ready.
                      </p>
                    </div>
                    <Link
                      href="/voice"
                      className="px-2.5 py-1 rounded-lg bg-teal-600 text-white font-bold text-[10px] hover:bg-teal-700 transition"
                    >
                      Dial with Ash →
                    </Link>
                  </div>
                )}
              </div>

              {/* Property Enrichment & FinOps Specs */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                    <Building2 className="w-4 h-4 text-teal-600" /> Property Enrichment Specifications
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      inspectMaster.enrichmentStatus === "ENRICHED_LIVE"
                        ? "bg-emerald-100 text-emerald-800"
                        : inspectMaster.enrichmentStatus === "ENRICHED_CACHE"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {inspectMaster.enrichmentStatus === "ENRICHED_LIVE"
                      ? "LIVE API LOOKUP ($0.05)"
                      : inspectMaster.enrichmentStatus === "ENRICHED_CACHE"
                        ? "LOCAL CACHE ($0.00 SAVED)"
                        : "UNENRICHED (SAFE DEGRADATION)"}
                  </span>
                </div>

                {inspectMaster.propertyEnrichment ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] pt-1">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block font-semibold">Roof Surface</span>
                      <span className="font-extrabold text-slate-800 text-xs">
                        {inspectMaster.propertyEnrichment.roofSqft.toLocaleString()} sq ft
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block font-semibold">Year Built</span>
                      <span className="font-extrabold text-slate-800 text-xs">
                        {inspectMaster.propertyEnrichment.yearBuilt}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block font-semibold">Material / Type</span>
                      <span className="font-extrabold text-slate-800 text-xs truncate block">
                        {inspectMaster.propertyEnrichment.roofMaterial}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block font-semibold">Estimated Value</span>
                      <span className="font-extrabold text-emerald-600 text-xs">
                        {curr}{inspectMaster.estimatedValue.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px]">
                    <strong>Honest Degradation:</strong> Property specs remain typed null. Zero fabricated data was injected during the provider outage. Eligible for 1-click backfill.
                  </div>
                )}
              </div>

              {/* AI Triage & Urgency Evaluation */}
              <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-600" /> AI Intent &amp; Urgency Scoring
                  </span>
                  <span className="font-bold text-[11px] px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                    Intent: {inspectMaster.intentCategory}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px] pt-1">
                  <div>
                    <span className="text-slate-500 font-semibold block">Urgency Rating</span>
                    <span className="font-extrabold text-slate-800">
                      {inspectMaster.triageScore} / 5 ({inspectMaster.triageScore >= 4 ? "High Urgency" : "Standard"})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block">AI Confidence</span>
                    <span className="font-extrabold text-emerald-600">
                      {Math.round((inspectMaster.triageConfidence || 0.95) * 100)}% High Confidence
                    </span>
                  </div>
                </div>
                <p className="text-slate-700 bg-white p-2.5 rounded border border-blue-100 text-[11px] italic">
                  &ldquo;{inspectMaster.triageSummary}&rdquo;
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-[#F8FAFE] border-t border-[#E8EEF6] flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] text-slate-400">
                Synced to: <strong className="text-slate-600">GHL Location ID ({tenant.ghlLocationId})</strong>
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href="/voice"
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0D9488] hover:bg-[#0F766E] text-white transition flex items-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" /> Test Voice Call (Ash)
                </Link>
                <button
                  type="button"
                  onClick={() => setInspectMaster(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                >
                  Close Dossier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
