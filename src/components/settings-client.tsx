"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchRoleAction, updateBudgetPolicyAction } from "@/app/actions";
import { TenantSnapshot } from "@/lib/store";
import { UserRole } from "@/contracts/lead-contracts";
import {
  Check,
  CheckCircle2,
  Copy,
  DollarSign,
  Key,
  Loader2,
  Shield,
  ShieldAlert,
} from "lucide-react";

interface SettingsClientProps {
  snapshot: TenantSnapshot;
  currentRole: UserRole;
  currentUserName: string;
}

export function SettingsClient({
  snapshot,
  currentRole,
  currentUserName,
}: SettingsClientProps) {
  const router = useRouter();
  const { tenant } = snapshot;

  const [isPending, startTransition] = useTransition();
  const [capInput, setCapInput] = useState((tenant.budget.monthlyCapCents / 100).toFixed(2));
  const [thresholdInput, setThresholdInput] = useState(String(tenant.budget.warningThreshold));
  const [copied, setCopied] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 180));
      const cents = Math.round(parseFloat(capInput || "0") * 100);
      const thresh = parseInt(thresholdInput || "80", 10);
      const res = await updateBudgetPolicyAction(cents, thresh);
      setBanner({ ok: res.ok, text: res.message });
      router.refresh();
    });
  };

  const handleRoleSwitch = (role: UserRole) => {
    setBanner(null);
    startTransition(async () => {
      const res = await switchRoleAction(role);
      setBanner({ ok: res.ok, text: res.message });
      router.refresh();
    });
  };

  const copySecret = () => {
    navigator.clipboard?.writeText(tenant.webhookSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="p-6 xl:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#172554]">
          RBAC Governance, FinOps &amp; Webhook Security — {tenant.name}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure monthly FinOps spend caps, test action-level RBAC roles live, and inspect HMAC-SHA256 signing secrets.
        </p>
      </div>

      {banner && (
        <div
          data-testid="settings-status-banner"
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

      {/* Interactive RBAC Session Simulator */}
      <div className="soax-card p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EBF2FF] text-[#1649C7] flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#172554]">
                Live Action-Level RBAC Simulator
              </h2>
              <p className="text-[11px] text-slate-400">
                Active Actor: <strong className="text-[#172554]">{currentUserName}</strong> ({currentRole}). Switch to{" "}
                <code className="font-mono">VIEWER</code> to test 403 Forbidden server-action enforcement.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(["OWNER", "ADMIN", "REVIEWER", "VIEWER"] as UserRole[]).map((role) => {
            const active = currentRole === role;
            return (
              <button
                key={role}
                type="button"
                disabled={isPending}
                onClick={() => handleRoleSwitch(role)}
                data-testid={`set-role-${role}`}
                className={`p-3 rounded-xl border text-left transition ${
                  active
                    ? "border-[#38D9C0] bg-[#E3FAF4]/50 shadow-xs"
                    : "border-[#E6ECF5] bg-[#FAFBFD] hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-extrabold text-[#172554] font-mono">{role}</span>
                  {active && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#1649C7] text-white flex-shrink-0">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {role === "OWNER" || role === "ADMIN"
                    ? "Full FinOps & HITL access"
                    : role === "REVIEWER"
                      ? "Quarantine & Dispatch only"
                      : "Read-only (403 on writes)"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* FinOps Pre-Flight Circuit Breaker */}
      <form onSubmit={handleSaveBudget} className="soax-card p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#E3FAF4] text-[#0D9488] flex items-center justify-center">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#172554]">
              Monthly FinOps Circuit Breaker Cap
            </h2>
            <p className="text-[11px] text-slate-400">
              Current Spend: <strong>${(tenant.budget.currentSpendCents / 100).toFixed(2)}</strong> • Cache Saved:{" "}
              <strong className="text-[#0D9488]">
                ${(tenant.budget.cacheSavingsCents / 100).toFixed(2)}
              </strong>{" "}
              (Requires OWNER or ADMIN role)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-[#172554] block mb-1">
              Monthly Spend Cap ($ USD)
            </label>
            <input
              type="number"
              step="1"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              data-testid="finops-cap-input"
              className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs font-mono text-[#172554] focus:outline-none focus:border-[#1E5EFF]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#172554] block mb-1">
              Warning Threshold (%)
            </label>
            <input
              type="number"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs font-mono text-[#172554] focus:outline-none focus:border-[#1E5EFF]"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isPending}
              data-testid="save-finops-btn"
              className="w-full py-2.5 rounded-xl bg-[#1649C7] hover:bg-[#1E5EFF] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save FinOps Policy
            </button>
          </div>
        </div>
      </form>

      {/* Webhook HMAC Key + Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="soax-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#172554] flex items-center gap-2">
              <Key className="w-4 h-4 text-[#1649C7]" /> Inbound HMAC-SHA256 Secret
            </h3>
            <button
              type="button"
              onClick={copySecret}
              className="px-2.5 py-1 rounded-lg bg-[#F1F5FB] hover:bg-[#E2EAF7] text-[#1649C7] text-[11px] font-bold inline-flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Endpoint: <code className="font-mono text-[#1649C7]">POST /api/webhooks/n8n-ingest?tenant={tenant.slug}</code>
          </p>
          <div className="p-3 rounded-xl bg-[#F4F7FC] border border-[#E4ECF6] font-mono text-xs text-[#172554] break-all">
            {tenant.webhookSecret}
          </div>
        </div>

        <div className="soax-card p-6 space-y-3">
          <h3 className="text-sm font-bold text-[#172554]">Immutable Governance Audit Trail</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {tenant.audits.slice(0, 8).map((a) => (
              <div
                key={a.id}
                className="p-2.5 rounded-xl bg-[#F8FAFE] border border-[#EEF2F8] text-xs"
              >
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="font-bold text-[#1649C7]">{a.action}</span>
                  <span className="text-slate-400">{a.actorRole}</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">{a.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
