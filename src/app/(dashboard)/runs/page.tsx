import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Layers, UploadCloud, Terminal, CheckCircle2, Clock } from "lucide-react";

export default async function RunsPage() {
  const session = await getCurrentSession();

  const runs = await prisma.ingestionRun.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Ingestion Runs & Webhook Inspector
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Trace incoming batches from CSV uploads and n8n webhook webhooks down to individual row-level lineage.
          </p>
        </div>
      </div>

      {/* Runs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/80 text-xs uppercase font-mono text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-6 py-3.5">Run ID & Source</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">Locale</th>
              <th className="px-6 py-3.5 text-center">Inbound</th>
              <th className="px-6 py-3.5 text-center">Clean</th>
              <th className="px-6 py-3.5 text-center">Merged</th>
              <th className="px-6 py-3.5 text-center">Quarantined</th>
              <th className="px-6 py-3.5 text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono text-xs">
                  <span className="font-semibold text-white block">{r.fileName || "Webhook Stream"}</span>
                  <span className="text-[10px] text-slate-500">{r.id}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    {r.status}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-xs text-slate-400">{r.locale}</td>
                <td className="px-6 py-4 text-center font-bold text-white">{r.totalInbound}</td>
                <td className="px-6 py-4 text-center font-bold text-emerald-400">{r.cleanMastersCount}</td>
                <td className="px-6 py-4 text-center font-bold text-blue-400">{r.mergedDuplicates}</td>
                <td className="px-6 py-4 text-center font-bold text-amber-400">{r.quarantinedCount}</td>
                <td className="px-6 py-4 text-right font-mono text-xs text-slate-400">
                  {new Date(r.createdAt).toLocaleDateString()} {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
