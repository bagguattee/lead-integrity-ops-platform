"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { switchRoleAction, switchWorkspaceAction, resetSandboxToBaseAction } from "@/app/actions";
import { UserRole } from "@/contracts/lead-contracts";
import { WorkspaceSummary } from "@/lib/store";
import { CopilotDrawer } from "./copilot-drawer";
import {
  Wallet,
  Layers,
  ShieldAlert,
  RefreshCw,
  Settings,
  MessageSquare,
  Link2,
  ChevronDown,
  Loader2,
  PhoneCall,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface ShellNavigationProps {
  currentTenantSlug: "apex-roofing" | "summit-solar" | "thames-heating";
  currentTenantName: string;
  complianceLaw: string;
  currentRole: UserRole;
  userName: string;
  unresolvedQuarantineCount: number;
  workspaces: WorkspaceSummary[];
}

export function ShellNavigation({
  currentTenantSlug,
  currentTenantName,
  complianceLaw,
  currentRole,
  userName,
  unresolvedQuarantineCount,
  workspaces,
}: ShellNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSwitching, startTransition] = useTransition();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const handleWorkspaceSelect = (slug: string) => {
    setWorkspaceMenuOpen(false);
    if (slug === currentTenantSlug) return;
    startTransition(async () => {
      await switchWorkspaceAction(slug);
      router.refresh();
    });
  };

  const handleCycleRole = () => {
    const order: UserRole[] = ["OWNER", "ADMIN", "REVIEWER", "VIEWER"];
    const nextRole = order[(order.indexOf(currentRole) + 1) % order.length];
    startTransition(async () => {
      await switchRoleAction(nextRole);
      router.refresh();
    });
  };

  const handleSelectRole = (nextRole: UserRole) => {
    if (nextRole === currentRole) return;
    startTransition(async () => {
      await switchRoleAction(nextRole);
      router.refresh();
    });
  };

  const handleResetSandbox = () => {
    startTransition(async () => {
      const res = await resetSandboxToBaseAction();
      alert(res.message);
      router.refresh();
    });
  };

  const manageLinks = [
    { href: "/dashboard", label: "Balance & Ledger", icon: Wallet },
    { href: "/runs", label: "Ingestion Runs", icon: Layers },
    { href: "/reactivation", label: "Dormant Revival", icon: RefreshCw },
    { href: "/voice", label: "Voice AI Agent", icon: PhoneCall },
  ];

  const governanceLinks = [
    {
      href: "/quarantine",
      label: "Quarantine",
      icon: ShieldAlert,
      count: unresolvedQuarantineCount,
    },
    { href: "/settings", label: "RBAC & FinOps", icon: Settings },
  ];

  return (
    <>
      <aside className="w-[232px] h-full flex-shrink-0 sidebar-ocean-gradient text-white flex flex-col justify-between select-none relative z-20 shadow-[4px_0_24px_rgba(8,30,107,0.12)] overflow-y-auto overflow-x-hidden">
        <div>
          {/* Brand Logo */}
          <div className="px-6 pt-7 pb-5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20">
              <Link2 className="w-4 h-4 text-white -rotate-45" />
            </div>
            <span className="text-[18px] font-bold tracking-tight text-white">integrity.io</span>
          </div>

          {/* Global Agency Sub-Account Switcher (works on every route) */}
          <div className="px-4 mb-6 relative">
            <button
              type="button"
              onClick={() => setWorkspaceMenuOpen((v) => !v)}
              disabled={isSwitching}
              data-testid="sidebar-tenant-switcher"
              className="w-full px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-between text-left transition"
            >
              <div className="min-w-0">
                <span className="text-[9px] uppercase tracking-[0.14em] text-white/60 block font-semibold">
                  Agency Sub-Account
                </span>
                <span className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                  {isSwitching && <Loader2 className="w-3 h-3 animate-spin text-[#5CE1C6]" />}
                  {currentTenantName}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
            </button>

            {workspaceMenuOpen && (
              <div className="absolute left-4 right-4 top-full mt-1.5 bg-white text-[#172554] rounded-xl shadow-2xl border border-[#E4ECF7] py-1.5 z-50">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  Switch Client Sub-Account
                </div>
                {workspaces.map((ws) => {
                  const active = ws.slug === currentTenantSlug;
                  return (
                    <button
                      key={ws.slug}
                      type="button"
                      onClick={() => handleWorkspaceSelect(ws.slug)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition ${
                        active
                          ? "bg-[#E3FAF4] text-[#0D9488] font-bold"
                          : "hover:bg-[#F4F7FC] text-[#172554] font-medium"
                      }`}
                    >
                      <span className="truncate">{ws.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {ws.localeDefault}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* MANAGE Section */}
          <div className="mb-6">
            <p className="px-6 mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
              MANAGE
            </p>
            <nav className="space-y-1 pr-4">
              {manageLinks.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 pl-6 pr-4 py-2.5 text-[13px] transition ${
                      active
                        ? "bg-[#5CE1C6] text-[#08255E] font-bold rounded-r-full shadow-[0_6px_18px_rgba(32,209,181,0.28)]"
                        : "text-white/80 hover:text-white hover:bg-white/8 rounded-r-full font-medium"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? "text-[#08255E]" : "text-white/70"}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* GOVERNANCE Section */}
          <div>
            <p className="px-6 mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
              GOVERNANCE
            </p>
            <nav className="space-y-1 pr-4">
              {governanceLinks.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between pl-6 pr-4 py-2.5 text-[13px] transition ${
                      active
                        ? "bg-[#5CE1C6] text-[#08255E] font-bold rounded-r-full shadow-[0_6px_18px_rgba(32,209,181,0.28)]"
                        : "text-white/80 hover:text-white hover:bg-white/8 rounded-r-full font-medium"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${active ? "text-[#08255E]" : "text-white/70"}`} />
                      <span>{item.label}</span>
                    </div>
                    {typeof item.count === "number" && item.count > 0 && (
                      <span className="bg-[#FFA000] text-white text-[11px] font-bold px-1.5 py-0.5 rounded-[5px] leading-none shadow-xs">
                        {item.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Section: Copilot & Reviewer Demo Persona Harness */}
        <div className="p-3 border-t border-white/10 space-y-2">
          {/* AI Copilot Quick Launcher */}
          <button
            type="button"
            onClick={() => setCopilotOpen(true)}
            data-testid="open-copilot-btn"
            title="Open Tenant-Scoped AI Ops Copilot"
            className="w-full px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-xs flex items-center justify-between text-white shadow-xs transition"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-[#5CE1C6]" />
              <span className="text-xs font-semibold">AI Ops Copilot</span>
            </div>
            <span className="text-[9px] font-mono bg-[#5CE1C6]/20 text-[#5CE1C6] px-1.5 py-0.5 rounded font-bold">RAG</span>
          </button>

          {/* Evaluator RBAC Test Harness */}
          <div className="rounded-xl bg-[#081E6B]/40 border border-white/15 p-2 text-left space-y-1.5">
            <button
              type="button"
              onClick={handleCycleRole}
              disabled={isSwitching}
              title="Click to cycle RBAC role"
              className="w-full flex items-center justify-between hover:opacity-90 transition text-left cursor-pointer"
            >
              <span className="text-[9px] font-bold tracking-wider uppercase text-white/80 hover:text-white flex items-center gap-1">
                RBAC Test Harness ↻
              </span>
              <span className="text-[8px] font-bold uppercase tracking-wider bg-emerald-400/25 text-emerald-200 px-1.5 py-0.5 rounded border border-emerald-400/30">
                Evaluation
              </span>
            </button>

            {/* Direct 1-Click Role Switcher Buttons */}
            <div className="grid grid-cols-4 gap-1">
              {(["OWNER", "ADMIN", "REVIEWER", "VIEWER"] as UserRole[]).map((r) => {
                const isActive = currentRole === r;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={isSwitching}
                    onClick={() => handleSelectRole(r)}
                    data-testid={`role-btn-${r.toLowerCase()}`}
                    title={`Switch active persona to ${r}`}
                    className={`py-1 text-[9px] font-bold rounded transition text-center ${
                      isActive
                        ? r === "OWNER"
                          ? "bg-purple-500 text-white shadow-xs"
                          : r === "ADMIN"
                            ? "bg-blue-500 text-white shadow-xs"
                            : r === "REVIEWER"
                              ? "bg-amber-500 text-white shadow-xs"
                              : "bg-rose-500 text-white shadow-xs"
                        : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                    }`}
                  >
                    {r.slice(0, 3)}
                  </button>
                );
              })}
            </div>

            {/* Active Persona Status Summary */}
            <button
              type="button"
              onClick={handleCycleRole}
              disabled={isSwitching}
              data-testid="role-cycle-btn"
              title="Click to cycle RBAC role for testing (OWNER / ADMIN / REVIEWER / VIEWER)"
              className="w-full px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-between transition group text-left"
            >
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5 truncate">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      currentRole === "OWNER"
                        ? "bg-purple-400"
                        : currentRole === "ADMIN"
                          ? "bg-blue-400"
                          : currentRole === "REVIEWER"
                            ? "bg-amber-400"
                            : "bg-rose-400"
                    }`}
                  />
                  {currentRole}
                  <span className="text-[9px] text-white/50 font-normal">({userName.split(" ")[0]})</span>
                </span>
                <span className="text-[8.5px] text-white/80 block leading-tight">
                  {currentRole === "VIEWER" ? "403 on mutations (Read-Only)" : "Full operational permissions"}
                </span>
              </div>
              <span className="text-xs text-white/60 group-hover:text-white transition ml-1 flex-shrink-0">
                ↻
              </span>
            </button>
            <p className="text-[8px] text-white/50 leading-tight">
              Reviewer tool: test 403 Server Action boundaries without re-login.
            </p>
          </div>

          {/* Evaluation Sandbox Status & Auto-Reset 12h */}
          <div className="rounded-xl bg-[#081E6B]/60 border border-white/15 p-2 text-left space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold tracking-wider uppercase text-teal-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                Demo Sandbox
              </span>
              <span className="text-[8px] font-bold uppercase tracking-wider bg-white/10 text-white/80 px-1.5 py-0.5 rounded">
                Auto-Reset 12H
              </span>
            </div>
            <p className="text-[8.5px] text-white/70 leading-snug">
              Mutate freely! Test leads and runs auto-clean back to baseline seed every 12 hours.
            </p>
            <button
              type="button"
              onClick={handleResetSandbox}
              disabled={isSwitching || currentRole === "VIEWER"}
              data-testid="reset-sandbox-seed-btn"
              title="Wipe test records and reset sandbox to clean 100% reconciled baseline seed"
              className="w-full py-1 px-2 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-white text-[9px] font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-teal-300" />
              Reset to Base Seed
            </button>
          </div>
        </div>
      </aside>

      <CopilotDrawer
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        tenantName={currentTenantName}
        complianceLaw={complianceLaw}
      />
    </>
  );
}
