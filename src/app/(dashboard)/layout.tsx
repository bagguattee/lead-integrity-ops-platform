import Link from "next/link";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { 
  ShieldCheck, 
  LayoutDashboard, 
  Layers, 
  AlertTriangle, 
  RefreshCw, 
  Settings, 
  LogOut,
  Building2,
  DollarSign
} from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  let allTenants: { id: string; name: string; slug: string; localeDefault: string }[] = [];
  let budget: { currentSpendCents: number; monthlyCapCents: number } | null = null;

  try {
    allTenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, localeDefault: true },
    });
    budget = await prisma.budgetPolicy.findUnique({
      where: { tenantId: session.tenantId },
    });
  } catch (e) {
    allTenants = [
      { id: "demo_tenant_apex", name: "Apex Roofing TX", slug: "apex-roofing", localeDefault: "US" },
      { id: "demo_tenant_summit", name: "Summit Solar AU", slug: "summit-solar", localeDefault: "AU" },
    ];
    budget = { currentSpendCents: 125, monthlyCapCents: 5000 };
  }

  const spendCents = budget?.currentSpendCents || 0;
  const capCents = budget?.monthlyCapCents || 5000;
  const spendPct = Math.min(100, Math.round((spendCents / capCents) * 100));

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col justify-between p-4">
        <div className="space-y-6">
          {/* Logo & Platform Name */}
          <div className="flex items-center space-x-3 px-2 py-1">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white">LEAD INTEGRITY</h1>
              <p className="text-xs text-slate-400 font-mono">OPS SAAS // v4.0</p>
            </div>
          </div>

          {/* Tenant Switcher Card */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-medium">
              <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-blue-400" /> ACTIVE WORKSPACE</span>
              <span className="text-[10px] bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded uppercase border border-blue-700/50 font-mono">
                {session.role}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-200 truncate">{session.tenantName}</p>
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Switch Tenant:</span>
              <div className="flex gap-1.5">
                {allTenants.map((t) => (
                  <Link
                    key={t.id}
                    href={`/api/auth/switch?tenant=${t.slug}`}
                    className={`text-[11px] px-2 py-0.5 rounded transition ${
                      t.id === session.tenantId
                        ? "bg-blue-600 text-white font-medium"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {t.localeDefault}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-800/60 hover:text-white transition"
            >
              <LayoutDashboard className="w-4 h-4 text-blue-400" />
              <span>Dashboard & KPI</span>
            </Link>
            <Link
              href="/runs"
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-800/60 hover:text-white transition"
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Ingestion Runs</span>
            </Link>
            <Link
              href="/quarantine"
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-800/60 hover:text-white transition"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>HITL Quarantine</span>
            </Link>
            <Link
              href="/reactivation"
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-800/60 hover:text-white transition"
            >
              <RefreshCw className="w-4 h-4 text-purple-400" />
              <span>Dormant Reactivation</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-800/60 hover:text-white transition"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Workspace & FinOps</span>
            </Link>
          </nav>
        </div>

        {/* Bottom FinOps Telemetry Pill */}
        <div className="space-y-3 pt-3 border-t border-slate-800">
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1 font-mono text-[11px]"><DollarSign className="w-3.5 h-3.5 text-emerald-400" /> FINOPS BUDGET</span>
              <span className="font-mono text-slate-300 text-[11px]">${(spendCents / 100).toFixed(2)} / ${(capCents / 100).toFixed(2)}</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  spendPct >= 80 ? "bg-amber-500" : "bg-blue-500"
                }`}
                style={{ width: `${spendPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-2 text-xs text-slate-400">
            <span className="truncate">{session.userName}</span>
            <span className="text-[10px] text-emerald-400 font-mono">LIVE OK</span>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 overflow-y-auto bg-slate-950 p-8">
        {children}
      </main>
    </div>
  );
}
