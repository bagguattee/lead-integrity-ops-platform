"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveQuarantineAction } from "@/app/actions";
import { QuarantineItem } from "@/lib/store";
import { UserRole } from "@/contracts/lead-contracts";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Loader2,
  Search,
  ShieldAlert,
  Split,
  Trash2,
  X,
} from "lucide-react";

interface QuarantineTableProps {
  initialRecords: QuarantineItem[];
  tenantName: string;
  complianceLaw: string;
  currentRole: UserRole;
}

export function QuarantineTable({
  initialRecords,
  tenantName,
  complianceLaw,
  currentRole,
}: QuarantineTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const [optimisticRecords, markOptimisticallyResolved] = useOptimistic(
    initialRecords,
    (state: QuarantineItem[], resolvedId: string) =>
      state.map((r) => (r.id === resolvedId ? { ...r, resolved: true } : r))
  );

  const [inspectItem, setInspectItem] = useState<QuarantineItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const openInspector = (item: QuarantineItem) => {
    setInspectItem(item);
    setEditName(item.normalizedPreview.canonicalName || "");
    setEditPhone(item.normalizedPreview.normalizedPhone || "");
    setEditEmail(item.normalizedPreview.normalizedEmail || "");
  };

  const handleResolve = (
    id: string,
    action: "APPROVED_SYNC" | "SPLIT_MASTER" | "EDITED_FIELDS" | "PERMANENT_QUARANTINE",
    customFields?: { editedName?: string; editedPhone?: string; editedEmail?: string }
  ) => {
    setBanner(null);
    setLoadingId(id);
    startTransition(async () => {
      if (currentRole !== "VIEWER") {
        markOptimisticallyResolved(id);
      }
      const res = await resolveQuarantineAction(id, action, customFields);
      setLoadingId(null);
      setBanner({ ok: res.ok, text: res.message });
      if (res.ok && inspectItem?.id === id) {
        setInspectItem(null);
      }
      router.refresh();
    });
  };

  const unresolved = optimisticRecords.filter((r) => !r.resolved);
  const filtered = unresolved.filter((r) => {
    const matchesReason = reasonFilter === "ALL" || r.reason === reasonFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      r.normalizedPreview.canonicalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.contaminatingRecord.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.rawPayload.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesReason && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedFiltered = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const renderReasonPill = (reason: string) => {
    switch (reason) {
      case "DNC_CLUSTER":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-[#FEE2E2] text-[#DC2626]">
            DNC CLUSTER
          </span>
        );
      case "SHARED_HUB":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-[#FEF3C7] text-[#D97706]">
            SHARED HUB &gt;3
          </span>
        );
      case "TIME_GAP_REVIEW":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-[#F3E8FF] text-[#7C3AED]">
            TIME GAP &gt;5Y
          </span>
        );
      case "LOW_CONFIDENCE_HITL":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-[#EBF2FF] text-[#1D4ED8]">
            LOW AI CONF
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-[#F1F5F9] text-[#64748B]">
            INVALID SHAPE
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Inline Status / RBAC Banner */}
      {banner && (
        <div
          data-testid="quarantine-status-banner"
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

      {/* Search & Reason Filter Bar */}
      <div className="soax-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search quarantined contacts or phones..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-[#E2EAF5] bg-[#FAFBFD] text-xs text-[#172554] focus:outline-none focus:border-[#1E5EFF]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
          {[
            { key: "ALL", label: `All (${unresolved.length})` },
            { key: "DNC_CLUSTER", label: "DNC Cluster" },
            { key: "SHARED_HUB", label: "Shared Hub" },
            { key: "TIME_GAP_REVIEW", label: "Time-Gap" },
            { key: "LOW_CONFIDENCE_HITL", label: "Low AI Conf" },
            { key: "INVALID_SHAPE", label: "Invalid Shape" },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setReasonFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg transition ${
                reasonFilter === f.key
                  ? "bg-[#1649C7] text-white"
                  : "bg-[#F1F5FB] text-slate-600 hover:bg-[#E4ECF8]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quarantine Queue Table */}
      {filtered.length === 0 ? (
        <div className="soax-card p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#E3FAF4] text-[#0D9488] flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#172554]">Quarantine Queue Clear</h3>
          <p className="text-xs text-slate-400 mt-1">
            No unresolved items match your active filter in {tenantName}.
          </p>
        </div>
      ) : (
        <div className="soax-card p-6 space-y-4">
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto border border-[#F1F5FB] rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_#EEF2F8]">
                <tr className="text-[11px] font-semibold text-slate-400">
                  <th className="py-3 pl-3 pr-4">Safety Gate</th>
                  <th className="py-3 px-3">Prospect &amp; Normalized Preview</th>
                  <th className="py-3 px-3">Contaminating Dimension</th>
                  <th className="py-3 pl-4 pr-3 text-right">HITL Resolution ({currentRole})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F7FC]">
                {pagedFiltered.map((item) => {
                const isBusy = loadingId === item.id && isPending;
                return (
                  <tr key={item.id} className="hover:bg-[#F8FAFF] transition">
                    <td className="py-4 pr-4 whitespace-nowrap">
                      {renderReasonPill(item.reason)}
                      <span className="block text-[10px] font-mono text-slate-400 mt-1">
                        {item.id}
                      </span>
                    </td>
                    <td
                      className="py-4 px-3 cursor-pointer"
                      onClick={() => openInspector(item)}
                      title="Click to view full lead dossier & AI triage breakdown"
                    >
                      <span className="font-bold text-[#172554] hover:text-[#1649C7] transition block">
                        {item.normalizedPreview.canonicalName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 block">
                        {item.normalizedPreview.normalizedPhone ||
                          item.normalizedPreview.normalizedEmail ||
                          "No valid phone/email"}
                      </span>
                      {item.normalizedPreview.estimatedValue > 0 && (
                        <span className="text-[11px] font-bold text-[#0D9488]">
                          Est. ${item.normalizedPreview.estimatedValue.toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-3 text-slate-600 max-w-xs">
                      <p className="text-xs">{item.contaminatingRecord}</p>
                    </td>
                    <td className="py-4 pl-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openInspector(item)}
                          data-testid={`edit-quarantine-${item.id}`}
                          className="px-2.5 py-1.5 rounded-lg bg-[#F1F5FB] hover:bg-[#E2EAF7] text-[#1E3A8A] font-bold inline-flex items-center gap-1 transition"
                          title="Inspect & Edit Normalized Fields"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit / Diff
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleResolve(item.id, "APPROVED_SYNC")}
                          data-testid={`approve-quarantine-${item.id}`}
                          className="px-2.5 py-1.5 rounded-lg bg-[#E3FAF4] hover:bg-[#2CE0B6] text-[#0D9488] hover:text-white font-bold inline-flex items-center gap-1 transition disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleResolve(item.id, "SPLIT_MASTER")}
                          data-testid={`split-quarantine-${item.id}`}
                          className="px-2.5 py-1.5 rounded-lg bg-[#EBF2FF] hover:bg-[#1649C7] text-[#1D4ED8] hover:text-white font-bold inline-flex items-center gap-1 transition disabled:opacity-50"
                        >
                          <Split className="w-3.5 h-3.5" /> Split
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleResolve(item.id, "PERMANENT_QUARANTINE")}
                          data-testid={`reject-quarantine-${item.id}`}
                          className="px-2.5 py-1.5 rounded-lg bg-[#FEE2E2] hover:bg-[#DC2626] text-[#DC2626] hover:text-white font-bold inline-flex items-center gap-1 transition disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing{" "}
              <strong className="text-[#172554]">
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)}
              </strong>{" "}
              of <strong className="text-[#172554]">{filtered.length}</strong> unresolved exceptions
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
      )}

      {/* Comprehensive HITL Lead Dossier & Audit Inspector Modal */}
      {inspectItem && (() => {
        let parsedPayload: Record<string, any> = {};
        try {
          parsedPayload = JSON.parse(inspectItem.rawPayload);
        } catch {
          parsedPayload = {};
        }

        const notes =
          parsedPayload.notes ||
          parsedPayload.message ||
          parsedPayload.inquiry ||
          parsedPayload.comment ||
          "No customer notes or description submitted with raw payload.";
        const rawAddress =
          parsedPayload.address ||
          parsedPayload.street ||
          [parsedPayload.street, parsedPayload.city, parsedPayload.state, parsedPayload.zip]
            .filter(Boolean)
            .join(", ") ||
          "No street address provided in raw payload";
        const sourceChannel =
          parsedPayload.source_channel || parsedPayload.source || "Web Form / Meta Ads";
        const confidencePct = Math.round(
          (inspectItem.normalizedPreview.triageConfidence || 0.65) * 100
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A194E]/60 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-label="Inspect and Audit Quarantined Lead Dossier"
          >
            <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white rounded-2xl border border-[#E4EBF5] shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 bg-[#F8FAFE] border-b border-[#E8EEF6] flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1649C7]/10 flex items-center justify-center text-[#1649C7]">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#172554]">
                        {inspectItem.normalizedPreview.canonicalName || "Quarantined Prospect"}
                      </h3>
                      {renderReasonPill(inspectItem.reason)}
                    </div>
                    <p className="text-[11px] font-mono text-slate-500">
                      ID: {inspectItem.id} • {complianceLaw} Compliance Boundary
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectItem(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Audit Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
                {/* 1. Safety Gate & AI Triage Diagnostic Box */}
                <div
                  className={`p-4 rounded-xl border space-y-2.5 ${
                    inspectItem.reason === "LOW_CONFIDENCE_HITL"
                      ? "bg-blue-50/70 border-blue-200"
                      : inspectItem.reason === "DNC_CLUSTER"
                        ? "bg-rose-50/70 border-rose-200"
                        : inspectItem.reason === "SHARED_HUB"
                          ? "bg-amber-50/70 border-amber-200"
                          : "bg-purple-50/70 border-purple-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-[#1649C7]" />
                      Safety Gate Audit: {inspectItem.reason}
                    </span>
                    {inspectItem.reason === "LOW_CONFIDENCE_HITL" && (
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        AI Confidence: {confidencePct}% (Threshold: &ge;70%)
                      </span>
                    )}
                  </div>

                  <p className="text-slate-700 leading-relaxed">
                    <strong>Contaminating Trigger:</strong> {inspectItem.contaminatingRecord}
                  </p>

                  {/* AI Triage Guidance Card */}
                  {inspectItem.reason === "LOW_CONFIDENCE_HITL" && (
                    <div className="p-3 bg-white rounded-lg border border-blue-100 text-slate-600 space-y-2">
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 block font-semibold">Stated Intent</span>
                          <span className="font-bold text-slate-800">
                            {inspectItem.normalizedPreview.intentCategory || "UNCERTAIN"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-semibold">Confidence Rating</span>
                          <span className="font-bold text-amber-600">{confidencePct}% (Low)</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-semibold">Estimated Value</span>
                          <span className="font-bold text-emerald-600">
                            ${(inspectItem.normalizedPreview.estimatedValue || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider mb-0.5">
                          Prospect Submitted Notes / Inquiry:
                        </span>
                        <p className="italic text-slate-800 font-medium bg-slate-50 p-2 rounded">
                          &ldquo;{notes}&rdquo;
                        </p>
                      </div>
                      <p className="text-[11px] text-blue-900 bg-blue-50/80 p-2 rounded border border-blue-100">
                        <strong>Auditor Guidance:</strong> AI triage scored this record at {confidencePct}% confidence because the inquiry is ambiguous or missing timeframe details. Review the contact info below. If legitimate, click <strong>Approve</strong> or <strong>Save Edits</strong> to sync cleanly to GoHighLevel CRM.
                      </p>
                    </div>
                  )}

                  {inspectItem.reason === "DNC_CLUSTER" && (
                    <p className="text-[11px] text-rose-800 bg-white p-2.5 rounded border border-rose-200">
                      <strong>Statutory Legal Block:</strong> This phone or email is flagged on the Do-Not-Call list or belongs to an opted-out household cluster. Syncing is prohibited under {complianceLaw}. Confirm Permanent Quarantine below.
                    </p>
                  )}
                  {inspectItem.reason === "SHARED_HUB" && (
                    <p className="text-[11px] text-amber-800 bg-white p-2.5 rounded border border-amber-200">
                      <strong>Broker Hub Detection:</strong> This telephone line has appeared under &gt;3 distinct customer surnames within 60 days. Quarantined to prevent lead broker list recycling.
                    </p>
                  )}
                </div>

                {/* 2. Side-by-Side: Raw Ingested Data vs Normalized Lead Dossier */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Left: Raw Ingested Data */}
                  <div className="space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Raw Inbound Submission
                    </span>
                    <div className="p-3.5 rounded-xl bg-[#F4F7FC] border border-[#E4ECF6] space-y-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 font-semibold block">Source Channel</span>
                        <span className="text-slate-800 font-medium">{sourceChannel}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block">Raw Address</span>
                        <span className="text-slate-800 font-medium">{rawAddress}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block">Raw Notes</span>
                        <span className="text-slate-800 italic block">{notes}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block">Full Payload JSON</span>
                        <pre className="p-2 rounded bg-white border border-[#E2EAF5] font-mono text-[10px] text-slate-700 max-h-36 overflow-auto">
                          {JSON.stringify(parsedPayload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* Right: Editable Canonical Fields */}
                  <div className="space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0D9488] block">
                      Editable Normalized Fields
                    </span>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-[#172554] block mb-1">
                          Canonical Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[#DCE4F0] text-xs text-[#172554] focus:outline-none focus:border-[#1E5EFF]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[#172554] block mb-1">
                          Phone (Auto-formats to E.164)
                        </label>
                        <input
                          type="text"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="e.g. +1 512 555 0199"
                          className="w-full px-3 py-2 rounded-xl border border-[#DCE4F0] text-xs font-mono text-[#172554] focus:outline-none focus:border-[#1E5EFF]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[#172554] block mb-1">
                          Email Address
                        </label>
                        <input
                          type="text"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="prospect@example.com"
                          className="w-full px-3 py-2 rounded-xl border border-[#DCE4F0] text-xs font-mono text-[#172554] focus:outline-none focus:border-[#1E5EFF]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div className="px-6 py-4 bg-[#F8FAFE] border-t border-[#E8EEF6] flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleResolve(inspectItem.id, "PERMANENT_QUARANTINE")}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#FEE2E2] hover:bg-[#FECACA] text-[#DC2626] transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Confirm Permanent Block
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleResolve(inspectItem.id, "SPLIT_MASTER")}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#EBF2FF] hover:bg-[#D7E6FA] text-[#1D4ED8] transition flex items-center gap-1.5"
                  >
                    <Split className="w-3.5 h-3.5" /> Split Cluster
                  </button>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      handleResolve(inspectItem.id, "EDITED_FIELDS", {
                        editedName: editName,
                        editedPhone: editPhone,
                        editedEmail: editEmail,
                      })
                    }
                    data-testid="modal-save-sync-btn"
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1649C7] hover:bg-[#1E5EFF] text-white flex items-center gap-1.5 transition"
                  >
                    {isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Save Edits &amp; Sync to GHL
                  </button>

                  <button
                    type="button"
                    disabled={isPending || inspectItem.reason === "DNC_CLUSTER"}
                    onClick={() => handleResolve(inspectItem.id, "APPROVED_SYNC")}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0D9488] hover:bg-[#0F766E] text-white flex items-center gap-1.5 transition disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve &amp; Sync
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
