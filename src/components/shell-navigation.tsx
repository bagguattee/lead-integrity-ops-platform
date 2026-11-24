"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Building2, 
  Check, 
  ChevronDown, 
  Globe2, 
  Sparkles,
  LayoutDashboard,
  Layers,
  AlertTriangle,
  RefreshCw,
  Settings,
  ShieldCheck,
  DollarSign
} from "lucide-react";
import { useState } from "react";

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  localeDefault: string;
}

interface NavProps {
  currentTenantId: string;
  currentTenantName: string;
  currentRole: string;
  userName: string;
  spendCents: number;
  capCents: number;
  allTenants: TenantItem[];
}

export function ShellNavigation({
  currentTenantId,
  currentTenantName,
  currentRole,
  userName,
  spendCents,
  capCents,
  allTenants,
}: NavProps) {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const spendDollars = (spendCents / 100).toFixed(2);
  const capDollars = (capCents / 100).toFixed(2);
  const spendPct = Math.min(100, Math.round((spendCents / capCents) * 100));

  const navItems = [
    { href: "/dashboard", label: "Executive Overview", icon: LayoutDashboard },
    { href: "/runs", label: "Ingestion Runs", icon: Layers, badge: "Live" },
    { href: "/quarantine", label: "HITL Quarantine", icon: AlertTriangle, badge: "Safety" },
    { href: "/reactivation", label: "Dormant Reactivation", icon: RefreshCw },
    { href: "/settings", label: "FinOps & Security", icon: Settings },
  ];

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col justify-between border-r border-white/5 bg-[#0b0f19] select-none z-20">
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 p-[1px] shadow-sm shadow-blue-500/20">
              <div className="w-full h-full bg-[#0b0f19] rounded-[7px] flex items-center justify-center text-blue-400">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-xs tracking-tight text-white">INTEGRITY OPS</span>
                <span className="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">v4.2</span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono tracking-tight">Enterprise Lead OS</p>
            </div>
          </div>
        </div>

        {/* Tenant Switcher (Figma-grade dropdown) */}
        <div className="p-3 border-b border-white/5">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-[#111726] hover:bg-[#161f33] border border-white/5 transition text-left group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-slate-300 flex-shrink-0">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-slate-200 truncate">{currentTenantName}</p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                    <Globe2 className="w-2.5 h-2.5" />
                    <span>{currentTenantName.includes("Solar") ? "AU-LOCALE" : "US-LOCALE"}</span>
                    <span>•</span>
                    <span className="text-blue-400 font-semibold">{currentRole}</span>
                  </div>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform group-hover:text-slate-200" />
            </button>

            {dropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 py-1.5 bg-[#121929] border border-white/10 rounded-xl shadow-2xl shadow-black/80 z-50">
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 border-b border-white/5 mb-1">
                  Select Workspace
                </div>
                {allTenants.map((t) => {
                  const isActive = t.name === currentTenantName || t.id === currentTenantId;
                  return (
                    <a
                      key={t.id}
                      href={`/api/auth/switch?tenant=${t.slug}`}
                      className={`flex items-center justify-between px-3 py-2 text-xs transition ${
                        isActive
                          ? "bg-blue-600/10 text-blue-400 font-medium"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-blue-400" : "bg-slate-600"}`} />
                        <span>{t.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">{t.localeDefault}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="p-3 space-y-1">
          <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
            Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? "bg-blue-600/15 text-blue-400 border border-blue-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? "text-blue-400" : "text-slate-500"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    isActive ? "bg-blue-500/20 text-blue-300" : "bg-slate-800 text-slate-400"
                  }`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer FinOps Telemetry */}
      <div className="p-3 border-t border-white/5 space-y-3">
        <div className="p-3 rounded-lg bg-[#111726] border border-white/5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
              <DollarSign className="w-3 h-3 text-emerald-400" /> MONTHLY FINOPS
            </span>
            <span className="font-mono text-[11px] text-slate-200">${spendDollars}</span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mb-1">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                spendPct >= 80 ? "bg-amber-400" : "bg-blue-500"
              }`}
              style={{ width: `${spendPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Cap: ${capDollars}</span>
            <span className={spendPct >= 80 ? "text-amber-400 font-medium" : "text-emerald-400"}>
              {spendPct}% consumed
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 ring-4 ring-emerald-500/10 animate-pulse" />
            <span className="text-[11px] text-slate-400 truncate max-w-[140px]">{userName}</span>
          </div>
          <span className="text-[9px] font-mono text-slate-500">LIVE</span>
        </div>
      </div>
    </aside>
  );
}
