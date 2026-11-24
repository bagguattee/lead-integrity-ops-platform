"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dispatchReactivationAction } from "@/app/actions";
import { TenantSnapshot } from "@/lib/store";
import { UserRole } from "@/contracts/lead-contracts";
import { CheckCircle2, Loader2, Send, ShieldAlert, ShieldCheck } from "lucide-react";

interface ReactivationClientProps {
  snapshot: TenantSnapshot;
  currentRole: UserRole;
}

export function ReactivationClient({ snapshot, currentRole }: ReactivationClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const { tenant } = snapshot;

  const handleDispatch = (masterId: string) => {
    setBanner(null);
    setDispatchingId(masterId);
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 240));
      const res = await dispatchReactivationAction(masterId);
      setDispatchingId(null);
      setBanner({ ok: res.ok, text: res.message });
      router.refresh();
    });
  };

  return (
    <div className="p-6 xl:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172554]">
            Dormant Lead Reactivation &amp; GHL Dispatch — {tenant.name}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Surfaces clean, {tenant.complianceLaw}-verified contacts (highlighting dormant estimates &gt;730 days) for 1-click dispatch to GoHighLevel location{" "}
            <code className="font-mono text-[#1649C7]">{tenant.ghlLocationId}</code>.
          </p>
        </div>
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

      <div className="soax-card p-6 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="text-[11px] font-semibold text-slate-400 border-b border-[#EEF2F8]">
              <th className="py-3 pr-4">Canonical Prospect</th>
              <th className="py-3 px-3">E.164 Phone &amp; Email</th>
              <th className="py-3 px-3">Segment &amp; Age</th>
              <th className="py-3 px-3">Compliance</th>
              <th className="py-3 px-3 text-right">Est. Value</th>
              <th className="py-3 pl-4 text-right">GHL Sync</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F4F7FC]">
            {tenant.masters.map((m) => {
              const isBusy = dispatchingId === m.id && isPending;
              const isSynced = m.status === "SYNCED_TO_GHL";
              return (
                <tr key={m.id} className="hover:bg-[#F8FAFF] transition">
                  <td className="py-4 pr-4">
                    <span className="font-bold text-[#172554] block">{m.canonicalName}</span>
                    <span className="text-[11px] text-slate-400">{m.rawAddress || m.sourceChannel}</span>
                  </td>
                  <td className="py-4 px-3 font-mono text-[11px]">
                    <span className="text-[#172554] font-semibold block">
                      {m.normalizedPhone || "No Phone"}
                    </span>
                    <span className="text-slate-400 block">{m.normalizedEmail || "No Email"}</span>
                  </td>
                  <td className="py-4 px-3">
                    {m.daysDormant >= 730 ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#F3E8FF] text-[#7C3AED]">
                        DORMANT ({m.daysDormant}d)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#EBF2FF] text-[#1D4ED8]">
                        {m.intentCategory} ({m.triageScore}/5)
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0D9488]">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verified Safe
                    </span>
                  </td>
                  <td className="py-4 px-3 text-right font-mono font-extrabold text-[#12B886]">
                    ${m.estimatedValue.toLocaleString()}
                  </td>
                  <td className="py-4 pl-4 text-right whitespace-nowrap">
                    {isSynced ? (
                      <span className="px-3 py-1.5 rounded-lg bg-[#E3FAF4] text-[#0D9488] font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Synced to GHL
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDispatch(m.id)}
                        data-testid={`dispatch-lead-${m.id}`}
                        className="px-3.5 py-1.5 rounded-lg bg-[#1649C7] hover:bg-[#1E5EFF] text-white font-bold inline-flex items-center gap-1.5 shadow-xs transition disabled:opacity-60"
                      >
                        {isBusy ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing...
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" /> Dispatch GHL
                          </>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
