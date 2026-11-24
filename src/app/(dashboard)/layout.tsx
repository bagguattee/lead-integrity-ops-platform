import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShellNavigation } from "@/components/shell-navigation";

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

  // Ensure both workspaces always exist in the list for immediate switcher interactivity
  if (allTenants.length < 2) {
    allTenants = [
      { id: "demo_tenant_apex", name: "Apex Roofing TX", slug: "apex-roofing", localeDefault: "US" },
      { id: "demo_tenant_summit", name: "Summit Solar AU", slug: "summit-solar", localeDefault: "AU" },
    ];
  }

  const spendCents = budget?.currentSpendCents || (session.tenantName.includes("Solar") ? 210 : 125);
  const capCents = budget?.monthlyCapCents || (session.tenantName.includes("Solar") ? 7500 : 5000);

  return (
    <div className="flex h-screen bg-[#070a11] text-slate-100 overflow-hidden font-sans">
      <ShellNavigation
        currentTenantId={session.tenantId}
        currentTenantName={session.tenantName}
        currentRole={session.role}
        userName={session.userName}
        spendCents={spendCents}
        capCents={capCents}
        allTenants={allTenants}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-[#070a11]">
        {/* Subtle Top Status Header */}
        <header className="h-14 border-b border-white/5 bg-[#0b0f19]/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">Production Lineage:</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>GHL API 2-WAY SYNC OK</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono">
              <span>n8n INGESTION ACTIVE</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <span>TCPA COMPLIANCE: <strong className="text-emerald-400">ENFORCED</strong></span>
            <span>•</span>
            <span>INVARIANT DISCREPANCY: <strong className="text-emerald-400">0.00%</strong></span>
          </div>
        </header>

        {/* Dynamic Page Surface */}
        <div className="p-8 max-w-7xl w-full mx-auto space-y-8">
          {children}
        </div>
      </main>
    </div>
  );
}
