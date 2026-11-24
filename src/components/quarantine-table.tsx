"use client";

import { useState } from "react";
import { resolveQuarantineAction } from "@/app/actions";
import { CheckCircle2, Split, Edit3, Trash2 } from "lucide-react";

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

  const handleResolve = async (
    id: string,
    action: "APPROVED_SYNC" | "SPLIT_MASTER" | "EDITED_FIELDS" | "PERMANENT_QUARANTINE"
  ) => {
    setLoadingId(id);
    try {
      await resolveQuarantineAction(id, action);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to resolve quarantine record");
    } finally {
      setLoadingId(null);
    }
  };

  if (records.length === 0) {
    return (
      <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-white">Quarantine Queue Empty</h3>
        <p className="text-xs text-slate-400 mt-1">
          Zero leads currently flagged for DNC, shared hub sandboxing, or low AI confidence.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="bg-slate-950/80 text-xs uppercase font-mono text-slate-400 border-b border-slate-800">
          <tr>
            <th className="px-6 py-3.5">Quarantine Reason</th>
            <th className="px-6 py-3.5">Contaminating Dimension / Lineage</th>
            <th className="px-6 py-3.5">Raw Payload Preview</th>
            <th className="px-6 py-3.5 text-right">HITL Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {records.map((r) => (
            <tr key={r.id} className="hover:bg-slate-800/40 transition">
              <td className="px-6 py-4">
                <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-semibold block w-fit">
                  {r.reason}
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-1 block">ID: {r.id.slice(0, 12)}...</span>
              </td>
              <td className="px-6 py-4 text-xs font-mono text-slate-300 max-w-xs">
                {r.contaminatingRecord || "Unclassified error"}
              </td>
              <td className="px-6 py-4 text-[11px] font-mono text-slate-400 max-w-sm truncate">
                {r.rawPayload}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    disabled={loadingId === r.id}
                    onClick={() => handleResolve(r.id, "APPROVED_SYNC")}
                    className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    disabled={loadingId === r.id}
                    onClick={() => handleResolve(r.id, "SPLIT_MASTER")}
                    className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 transition disabled:opacity-50"
                  >
                    <Split className="w-3.5 h-3.5" /> Split
                  </button>
                  <button
                    disabled={loadingId === r.id}
                    onClick={() => handleResolve(r.id, "PERMANENT_QUARANTINE")}
                    className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-600/80 hover:bg-rose-600 text-white flex items-center gap-1 transition disabled:opacity-50"
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
  );
}
