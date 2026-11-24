"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  switchWorkspaceAction,
  toggleEnrichmentPauseAction,
} from "@/app/actions";
import { TenantSnapshot, WorkspaceSummary } from "@/lib/store";
import { UserRole } from "@/contracts/lead-contracts";
import { LeadIntakeModal } from "./lead-intake-modal";
import {
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  Plus,
  ShieldAlert,
  Sparkles,
  Webhook,
  FileSpreadsheet,
  Globe,
  Building2,
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
  const [intakeOpen, setIntakeOpen] = useState(false);

  const [chartWindow, setChartWindow] = useState<"14" | "7">("14");
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);
  const [donutMode, setDonutMode] = useState<"SPEND" | "SAVED">("SPEND");
  const [ledgerFilter, setLedgerFilter] = useState<"ALL" | "CLEAN" | "MERGED" | "QUARANTINED">("ALL");
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const { tenant, reconciliation } = snapshot;

  const handleSelectWorkspace = (slug: string) => {
    if (slug === tenant.slug || switchingSlug) return;
    setBanner(null);
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

  // Filtered ledger rows
  const filteredLedger = tenant.ledger.filter((item) => {
    if (ledgerFilter === "CLEAN") {
      return item.operation === "GHL_SYNCED" || item.operation === "REACTIVATED";
    }
    if (ledgerFilter === "MERGED") {
      return item.operation === "DEDUPE_MERGED";
    }
    if (ledgerFilter === "QUARANTINED") {
      return (
        item.operation === "DNC_QUARANTINE" ||
        item.operation === "SHARED_HUB" ||
        item.operation === "TIME_GAP_HOLD" ||
        item.operation === "LOW_CONF_HITL" ||
        item.operation === "INVALID_DROP"
      );
    }
    return true;
  });

  const renderOperationPill = (op: TenantSnapshot["tenant"]["ledger"][number]["operation"]) => {
    switch (op) {
      case "GHL_SYNCED":
        return (
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#E3FAF4] text-[#0D9488]">
            GHL SYNCED
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
        <section className="w-full lg:w-[304px] xl:w-[324px] flex-shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-[#E8EEF6] p-6 flex flex-col justify-between">
          <div>
            {/* Rail Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[15px] font-bold text-[#172554]">Sub-accounts</h2>
              <button
                type="button"
                onClick={() => setIntakeOpen(true)}
                data-testid="rail-add-lead-btn"
                className="px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-[#2CE0B6] to-[#1EC8B8] hover:opacity-95 shadow-[0_6px_16px_rgba(30,200,184,0.3)] flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Add Lead
              </button>
            </div>

            {/* 3 Stacked Agency Client Sub-Account Cards */}
            <div className="space-y-4">
              {workspaces.map((ws) => {
                const isActive = ws.slug === tenant.slug;
                const isSwitchingThis = switchingSlug === ws.slug;

                return (
                  <div
                    key={ws.slug}
                    data-testid={`workspace-card-${ws.slug}`}
                    className={`p-5 ${isActive ? "soax-method-card-active" : "soax-method-card"}`}
                  >
                    {/* Card Top Row */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[13px] font-bold text-[#172554] truncate pr-2">
                        {ws.name}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                          ws.statusBadge === "ACTIVE"
                            ? "bg-[#1E5EFF] text-white"
                            : "bg-[#516F9E] text-white"
                        }`}
                      >
                        {ws.statusBadge}
                      </span>
                    </div>

                    {/* Center Emblem */}
                    <div className="py-2 text-center">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F6F9FE] border border-[#E8EFF8]">
                        <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1649C7] to-[#2CE0B6] text-white text-[10px] font-extrabold flex items-center justify-center">
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
                      <p className="text-[11px] text-slate-400 mt-2 truncate">{ws.subtitle}</p>
                    </div>

                    {/* Card Action Button */}
                    <button
                      type="button"
                      onClick={() => handleSelectWorkspace(ws.slug)}
                      disabled={isActive || Boolean(switchingSlug)}
                      data-testid={`switch-btn-${ws.slug}`}
                      className={`w-full mt-3 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                        isActive
                          ? "bg-[#1649C7] text-white shadow-[0_6px_16px_rgba(22,73,199,0.24)] cursor-default"
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
                    <div className="mt-4 pt-3 border-t border-[#F1F5FB] flex items-center justify-between text-[10px]">
                      <div>
                        <span className="uppercase tracking-wider text-slate-400 font-semibold mr-1.5">
                          INBOUND
                        </span>
                        <strong className="text-xs font-extrabold text-[#172554]">
                          {ws.totalInbound}
                        </strong>
                      </div>
                      <div>
                        <span className="uppercase tracking-wider text-slate-400 font-semibold mr-1.5">
                          PIPELINE
                        </span>
                        <strong className="text-xs font-extrabold text-[#172554]">
                          ${ws.pipelineValue.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Mint Action Bar (Matches "Show more" in reference) */}
          <div className="pt-5">
            <Link
              href="/runs"
              className="block w-full py-2.5 rounded-lg bg-[#E3FAF4] hover:bg-[#CCF5EA] text-[#0E9F84] text-xs font-bold text-center transition"
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

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIntakeOpen(true)}
                  data-testid="header-simulate-webhook-btn"
                  className="px-4 py-2 rounded-lg bg-[#E3FAF4] hover:bg-[#CCF5EA] text-[#0E9F84] text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Simulate Webhook
                </button>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  disabled={isTogglingPause}
                  data-testid="header-pause-btn"
                  className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
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

            {/* Charts Row: Daily Capsule Bar Chart + FinOps Donut Gauge */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Left Card: Daily ingestion overview (Matches "Daily balance overview") */}
              <div className="xl:col-span-8 soax-card p-6 flex flex-col justify-between">
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
              <div className="xl:col-span-4 soax-card p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[14px] font-bold text-[#172554] whitespace-nowrap">
                    FinOps balance
                  </h3>
                  <div className="flex items-center gap-2.5 text-[11px] font-bold flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setDonutMode("SPEND")}
                      className={`pb-1 transition ${
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
                      className={`pb-1 transition ${
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
                <div className="my-3 flex items-center justify-center relative">
                  <svg className="w-[176px] h-[176px] -rotate-90" viewBox="0 0 176 176">
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

                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[28px] font-extrabold text-[#172554] tracking-tight leading-none">
                      ${donutMode === "SPEND" ? spendDollars : savedDollars}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400 mt-1">
                      {donutMode === "SPEND" ? `of $${capDollars} Cap` : "Cache Saved"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-5 text-xs text-slate-500 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#36DFC0]" /> API Spend
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#1956DB]" /> Cache Saved
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Wide Card: Lead Operations Ledger (Matches "Transactions" table) */}
            <div className="soax-card p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <h3 className="text-[15px] font-bold text-[#172554]">Lead Operations Ledger</h3>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  {(
                    [
                      { key: "ALL", label: "All Events" },
                      { key: "CLEAN", label: "Clean Synced" },
                      { key: "MERGED", label: "Dedupe Merged" },
                      { key: "QUARANTINED", label: "Quarantined" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setLedgerFilter(tab.key)}
                      className={`transition ${
                        ledgerFilter === tab.key
                          ? "text-[#172554] font-extrabold"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-semibold text-slate-400 border-b border-[#F1F5FB]">
                      <th className="py-3 pr-4 font-medium">Date and time</th>
                      <th className="py-3 px-4 font-medium">Channel &amp; Prospect</th>
                      <th className="py-3 px-4 font-medium text-center">Operation</th>
                      <th className="py-3 pl-4 font-medium text-right">Value / Impact ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F7FC] text-xs">
                    {filteredLedger.slice(0, 10).map((row, i) => (
                      <tr
                        key={row.id}
                        className={`transition hover:bg-[#F7FAFF] ${
                          i === 3 ? "bg-[#F8FBFF]" : ""
                        }`}
                      >
                        <td className="py-3.5 pr-4 text-slate-600 font-medium whitespace-nowrap">
                          {row.timestamp}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {renderChannelAvatar(row.channel)}
                            <div>
                              <span className="font-bold text-[#172554] block">
                                {row.contactName}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {row.contactSub}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {renderOperationPill(row.operation)}
                        </td>
                        <td
                          className={`py-3.5 pl-4 text-right font-extrabold whitespace-nowrap ${
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
                    ))}
                  </tbody>
                </table>
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
    </>
  );
}
