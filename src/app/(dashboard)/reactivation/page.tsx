import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RefreshCw, Send, ShieldCheck } from "lucide-react";
import { dispatchReactivationAction } from "@/app/actions";

export default async function ReactivationPage() {
  const session = await getCurrentSession();

  // Find clean, non-DNC leads
  const eligibleLeads = await prisma.leadMaster.findMany({
    where: {
      tenantId: session.tenantId,
      isTcpaOptedOut: false,
      status: "CLEAN_MASTER",
    },
    take: 10,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-purple-400" />
            Dormant Lead Reactivation Engine
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Re-engage high-value, TCPA-compliant opportunities without risking compliance fines.
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/80 text-xs uppercase font-mono text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-6 py-3.5">Prospect Name</th>
              <th className="px-6 py-3.5">E.164 Phone & Email</th>
              <th className="px-6 py-3.5">Intent / Score</th>
              <th className="px-6 py-3.5">Est. Value</th>
              <th className="px-6 py-3.5 text-right">Dispatch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {eligibleLeads.map((m) => (
              <tr key={m.id} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-semibold text-white">{m.canonicalName}</td>
                <td className="px-6 py-4 font-mono text-xs">
                  <span className="text-slate-200 block">{m.normalizedPhone || "No Phone"}</span>
                  <span className="text-slate-500 block">{m.normalizedEmail || "No Email"}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                    {m.intentCategory} ({m.triageScore}/5)
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-emerald-400 font-bold">
                  ${m.estimatedValue.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <form action={async () => {
                    "use server";
                    await dispatchReactivationAction(m.id);
                  }}>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 ml-auto transition"
                    >
                      <Send className="w-3.5 h-3.5" /> Dispatch GHL
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
