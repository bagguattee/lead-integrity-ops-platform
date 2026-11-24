import { getCurrentSession } from "@/lib/auth";
import { getTenantSnapshot, listWorkspaceSummaries } from "@/lib/store";
import { DashboardClient } from "@/components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  const snapshot = getTenantSnapshot(session.tenantSlug);
  const workspaces = listWorkspaceSummaries();

  return (
    <DashboardClient
      snapshot={snapshot}
      workspaces={workspaces}
      currentRole={session.role}
    />
  );
}
