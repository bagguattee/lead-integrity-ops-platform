"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetSandboxToBaseAction } from "@/app/actions";
import { UserRole } from "@/contracts/lead-contracts";
import { RotateCcw, Check } from "lucide-react";

interface TopDemoBannerProps {
  currentRole: UserRole;
  tenantName: string;
}

export function TopDemoBanner({ currentRole, tenantName }: TopDemoBannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleReset = () => {
    if (currentRole === "VIEWER") {
      alert("403 Forbidden: Switch to Reviewer or Admin to reset sandbox.");
      return;
    }
    startTransition(async () => {
      const res = await resetSandboxToBaseAction();
      setStatusMsg(res.message);
      setTimeout(() => setStatusMsg(null), 4000);
      router.refresh();
    });
  };

  return (
    <div
      data-testid="top-demo-banner"
      className="bg-gradient-to-r from-[#071B5C] via-[#0B2A7D] to-[#0A4D68] text-white px-4 py-2 border-b border-white/10 flex items-center justify-between gap-3 text-xs flex-shrink-0 z-30 select-none"
    >
      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-400/20 text-teal-300 font-bold text-[10px] uppercase tracking-wider border border-teal-400/30 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          Evaluation Sandbox
        </span>
        <span className="text-[11px] font-semibold text-white truncate">
          Active Client: <strong className="text-teal-200">{tenantName}</strong>
        </span>
        <span className="text-[11px] text-white/70 hidden md:inline">
          • Base dataset auto-cleanses test mutations every 12–24h
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {statusMsg ? (
          <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/40 animate-fade-in">
            <Check className="w-3.5 h-3.5 text-emerald-400" /> Reset to Baseline Seed Complete!
          </span>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending || currentRole === "VIEWER"}
            data-testid="top-reset-sandbox-btn"
            title="Wipe test leads & call events and restore the pristine 100% reconciled baseline seed"
            className="px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/40 text-teal-200 hover:text-white font-bold text-[11px] flex items-center gap-1.5 transition disabled:opacity-40 cursor-pointer shadow-xs"
          >
            <RotateCcw className={`w-3 h-3 text-teal-300 ${isPending ? "animate-spin" : ""}`} />
            {isPending ? "Resetting Seed..." : "Reset to Base Seed (1-Click)"}
          </button>
        )}
      </div>
    </div>
  );
}
