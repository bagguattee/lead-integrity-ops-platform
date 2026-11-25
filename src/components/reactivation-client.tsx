"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { backfillUnenrichedLeadsAction, dispatchReactivationAction } from "@/app/actions";
import { TenantSnapshot } from "@/lib/store";
import { UserRole } from "@/contracts/lead-contracts";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

interface ReactivationClientProps {
  snapshot: TenantSnapshot;
  currentRole: UserRole;
}

export function ReactivationClient({ snapshot, currentRole }: ReactivationClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [enrichmentFilter, setEnrichmentFilter] = useState<"ALL" | "ENRICHED" | "UNENRICHED">("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const { tenant, businessImpact } = snapshot;
  const curr = tenant.currencySymbol || "$";

  const handleDispatch = (masterId: string) => {
    setBanner(null);
    setDispatchingId(masterId);
    startTransition(async () => {
      const res = await dispatchReactivationAction(masterId);
      setDispatchingId(null);
      setBanner({ ok: res.ok, text: res.message });
      router.refresh();
    });
  };

  const handleBackfill = () => {
    setBanner(null);
    startTransition(async () => {
      const res = await backfillUnenrichedLeadsAction();
      setBanner({ ok: res.ok, text: res.message });
      router.refresh();
    });
  };

  const filtered = tenant.masters.filter((m) => {
    if (enrichmentFilter === "UNENRICHED" && m.enrichmentStatus !== "UNENRICHED_DEGRADED") return false;
    if (enrichmentFilter === "ENRICHED" && m.enrichmentStatus === "UNENRICHED_DEGRADED") return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.canonicalName.toLowerCase().includes(q) ||
        (m.normalizedPhone || "").toLowerCase().includes(q) ||
        (m.normalizedEmail || "").toLowerCase().includes(q) ||
        (m.rawAddress || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedMasters = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="p-6 xl:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172554]">
            Clean Masters, Enrichment Specs &amp; Dormant Revival — {tenant.name}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Surfaces clean, {tenant.complianceLaw}-verified contacts with honest property enrichment status for 1-click GoHighLevel dispatch (location{" "}
            <code className="font-mono text-[#1649C7]">{tenant.ghlLocationId}</code>).
          </p>
        </div>
        {businessImpact.unenrichedPendingCount > 0 && (
          <button
            type="button"
            disabled={isPending || tenant.budget.isApiDown || tenant.budget.isPaused}
            onClick={handleBackfill}
            data-testid="reactivation-backfill-btn"
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 flex-shrink-0 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Backfill {businessImpact.unenrichedPendingCount} Unenriched
          </button>
        )}
      </div>

      {banner && (
        <div
          data-testid="reactivation-status-banner"
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            banner.ok
              ? "bg-[#E3FAF4] border-[#B2EFE0] text-[#0B7A66]"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.ok ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            <span>{banner.text}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="text-[11px] underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Enrichment Filter Bar */}
      <div className="soax-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search contact, phone, email, address..."
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#E4ECF6] bg-[#FAFBFD] text-xs text-[#172554] focus:outline-none focus:border-[#1E5EFF]"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            {(
              [
                { k: "ALL", label: `All (${tenant.masters.length})` },
                { k: "ENRICHED", label: "Verified Enriched" },
                { k: "UNENRICHED", label: `Pending Backfill (${businessImpact.unenrichedPendingCount})` },
              ] as const
            ).map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => {
                  setEnrichmentFilter(f.k);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg transition ${
                  enrichmentFilter === f.k
                    ? "bg-[#1649C7] text-white"
                    : "bg-[#F4F7FC] text-slate-600 hover:bg-[#E7EEF9]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px] overflow-y-auto border border-[#F1F5FB] rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_#EEF2F8]">
              <tr className="text-[11px] font-semibold text-slate-400">
                <th className="py-3 pl-3 pr-4">Canonical Prospect</th>
                <th className="py-3 px-3">E.164 Phone &amp; Email</th>
                <th className="py-3 px-3">Property Enrichment (Honest Status)</th>
                <th className="py-3 px-3">Compliance</th>
                <th className="py-3 px-3 text-right">Est. Value</th>
                <th className="py-3 pl-4 pr-3 text-right">GHL Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F7FC]">
              {pagedMasters.map((m) => {
                const isBusy = dispatchingId === m.id && isPending;
                const isSynced = m.status === "SYNCED_TO_GHL";
                return (
                  <tr key={m.id} className="hover:bg-[#F8FAFF] transition">
                    <td className="py-3.5 pl-3 pr-4">
                      <span className="font-bold text-[#172554] block">{m.canonicalName}</span>
                      <span className="text-[11px] text-slate-400">
                        {m.rawAddress || m.sourceChannel}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-[11px]">
                      <span className="text-[#172554] font-semibold block">
                        {m.normalizedPhone || "No Phone"}
                      </span>
                      <span className="text-slate-400 block">{m.normalizedEmail || "No Email"}</span>
                    </td>
                    <td className="py-3.5 px-3">
                      {m.enrichmentStatus === "UNENRICHED_DEGRADED" || !m.propertyEnrichment ? (
                        <div>
                          <span
                            data-testid="master-unenriched-badge"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"
                          >
                            <CloudOff className="w-3 h-3" /> UNENRICHED (NO FAKE DATA)
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Queued for backfill — specs intentionally null
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E3FAF4] text-[#0D9488]">
                            {m.enrichmentStatus === "ENRICHED_CACHE" ? "CACHE HIT ($0.00)" : "LIVE ENRICHED ($0.05)"}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                            {m.propertyEnrichment.roofSqft} sqft • {m.propertyEnrichment.roofMaterial} ({m.propertyEnrichment.yearBuilt})
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-3">
                      {m.isTcpaOptedOut ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600">
                          <ShieldAlert className="w-3.5 h-3.5" /> DNC Opt-Out
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0D9488]">
                          <ShieldCheck className="w-3.5 h-3.5" /> Verified Safe
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-extrabold text-[#12B886]">
                      {curr}{m.estimatedValue.toLocaleString()}
                    </td>
                    <td className="py-3.5 pl-4 pr-3 text-right whitespace-nowrap">
                      {isSynced ? (
                        <span className="px-3 py-1.5 rounded-lg bg-[#E3FAF4] text-[#0D9488] font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Synced
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy || m.isTcpaOptedOut || currentRole === "VIEWER"}
                          onClick={() => handleDispatch(m.id)}
                          className="px-3 py-1.5 rounded-lg bg-[#1649C7] hover:bg-[#1E5EFF] disabled:opacity-40 text-white font-bold inline-flex items-center gap-1 transition"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
                          Dispatch
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing{" "}
            <strong className="text-[#172554]">
              {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, filtered.length)}
            </strong>{" "}
            of <strong className="text-[#172554]">{filtered.length}</strong> clean masters
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-lg border border-[#E4ECF6] disabled:opacity-40 flex items-center gap-1 font-semibold"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="font-mono text-[11px] font-bold text-[#172554]">
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded-lg border border-[#E4ECF6] disabled:opacity-40 flex items-center gap-1 font-semibold"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
