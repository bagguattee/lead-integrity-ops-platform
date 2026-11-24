"use client";

import { useState } from "react";
import { resolveQuarantineAction } from "@/app/actions";
import { CheckCircle2, Split, Trash2, ShieldAlert, Sparkles, AlertTriangle, Eye, X } from "lucide-react";

interface QuarantineItem {
  id: string;
  reason: string;
  contaminatingRecord: string | null;
  rawPayload: string;
  resolved: boolean;
  createdAt: string;
}

export function QuarantineTable({ initialRecords }: { initialRecords: QuarantineItem[] }) {
  const [records, setRecords] = useState(initialRecords);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeModalItem, setActiveModalItem] = useState<QuarantineItem | null>(null);

  const handleResolve = async (
    id: string,
    action: "APPROVED_SYNC" | "SPLIT_MASTER" | "EDITED_FIELDS" | "PERMANENT_QUARANTINE"
  ) => {
    setLoadingId(id);
    try {
      await resolveQuarantineAction(id, action);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (activeModalItem?.id === id) setActiveModalItem(null);
    } catch (err: any) {
      alert(err.message || "Failed to resolve quarantine record");
    } finally {
      setLoadingId(null);
    }
  };

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case "DNC_CLUSTER":
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">TCPA DNC CLUSTER</span>;
      case "SHARED_HUB":
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">SHARED HUB &gt;3 HOUSEHOLDS</span>;
      case "TIME_GAP_REVIEW":
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">TIME-GAP &gt;5 YEARS</span>;
      default:
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">{reason}</span>;
    }
  };

  if (records.length === 0) {
    return (
      <div className="p-16 text-center rounded-xl bg-[#0f172a]/40 border border-white/5">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-white">Quarantine Queue Clear</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
          All inbound leads passed automated TCPA compliance gates, commercial broker hub isolation, and AI confidence boundaries.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-white/5 bg-[#0b0f19] overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-[#080d18] text-[10px] uppercase font-mono text-slate-400 border-b border-white/5">
            <tr>
              <th className="px-5 py-3.5">Quarantine Classification</th>
              <th className="px-5 py-3.5">Violation / Lineage Contamination</th>
              <th className="px-5 py-3.5">Raw Ingestion Preview</th>
              <th className="px-5 py-3.5 text-right">HITL Resolution Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.02] transition">
                <td className="px-5 py-4">
                  {getReasonBadge(r.reason)}
                  <span className="text-[10px] text-slate-500 font-mono block mt-1">ID: {r.id.slice(0, 14)}...</span>
                </td>
                <td className="px-5 py-4 text-xs font-mono text-slate-300 max-w-xs">
                  {r.contaminatingRecord || "Unclassified boundary hit"}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-400 max-w-[280px] truncate block">
                      {r.rawPayload}
                    </span>
                    <button
                      onClick={() => setActiveModalItem(r)}
                      className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                      title="Inspect full JSON payload"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      disabled={loadingId === r.id}
                      onClick={() => handleResolve(r.id, "APPROVED_SYNC")}
                      className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white flex items-center gap-1 transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      disabled={loadingId === r.id}
                      onClick={() => handleResolve(r.id, "SPLIT_MASTER")}
                      className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-blue-600/90 hover:bg-blue-500 text-white flex items-center gap-1 transition disabled:opacity-50"
                    >
                      <Split className="w-3.5 h-3.5" /> Split
                    </button>
                    <button
                      disabled={loadingId === r.id}
                      onClick={() => handleResolve(r.id, "PERMANENT_QUARANTINE")}
                      className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-rose-600/80 hover:bg-rose-600 text-white flex items-center gap-1 transition disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* JSON Payload Inspector Modal */}
      {activeModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl bg-[#0f172a] border border-white/10 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Quarantine Record Lineage</h3>
              </div>
              <button
                onClick={() => setActiveModalItem(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-400 font-mono">Classification Reason: <span className="text-amber-400 font-bold">{activeModalItem.reason}</span></p>
              <p className="text-slate-400 font-mono">Offending Dimension: <span className="text-slate-200">{activeModalItem.contaminatingRecord}</span></p>
            </div>

            <div>
              <p className="text-xs text-slate-400 font-mono mb-1">Raw Ingested JSON:</p>
              <pre className="p-3 rounded-lg bg-[#070a11] border border-white/5 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-56">
                {JSON.stringify(JSON.parse(activeModalItem.rawPayload), null, 2)}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
              <button
                onClick={() => handleResolve(activeModalItem.id, "PERMANENT_QUARANTINE")}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white"
              >
                Reject & Delete
              </button>
              <button
                onClick={() => handleResolve(activeModalItem.id, "APPROVED_SYNC")}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white"
              >
                Override & Sync GHL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
