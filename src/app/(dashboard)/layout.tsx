import { getCurrentSession } from "@/lib/auth";
import { getTenantSnapshot, listWorkspaceSummaries } from "@/lib/store";
import { ShellNavigation } from "@/components/shell-navigation";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  const snapshot = getTenantSnapshot(session.tenantSlug);
  const workspaces = listWorkspaceSummaries();

  return (
    <div className="flex min-h-screen h-screen bg-[#F4F7FC] text-[#172554] overflow-hidden">
      <ShellNavigation
        currentTenantSlug={snapshot.tenant.slug}
        currentTenantName={snapshot.tenant.name}
        complianceLaw={snapshot.tenant.complianceLaw}
        currentRole={session.role}
        userName={session.userName}
        unresolvedQuarantineCount={snapshot.reconciliation.activeQuarantine}
        workspaces={workspaces}
      />

      <main className="flex-1 min-w-0 overflow-y-auto bg-[#F4F7FC]">
        {children}
      </main>
    </div>
  );
}
