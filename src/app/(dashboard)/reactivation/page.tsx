import { getCurrentSession } from "@/lib/auth";
import { getTenantSnapshot } from "@/lib/store";
import { ReactivationClient } from "@/components/reactivation-client";

export const dynamic = "force-dynamic";

export default async function ReactivationPage() {
  const session = await getCurrentSession();
  const snapshot = getTenantSnapshot(session.tenantSlug);

  return <ReactivationClient snapshot={snapshot} currentRole={session.role} />;
}
