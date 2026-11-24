import { getCurrentSession } from "@/lib/auth";
import { getTenantSnapshot } from "@/lib/store";
import { RunsClient } from "@/components/runs-client";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const session = await getCurrentSession();
  const snapshot = getTenantSnapshot(session.tenantSlug);

  return <RunsClient snapshot={snapshot} currentRole={session.role} />;
}
