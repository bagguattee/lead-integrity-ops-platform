import { getCurrentSession } from "@/lib/auth";
import { getTenantSnapshot } from "@/lib/store";
import { SettingsClient } from "@/components/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  const snapshot = getTenantSnapshot(session.tenantSlug);

  return (
    <SettingsClient
      snapshot={snapshot}
      currentRole={session.role}
      currentUserName={session.userName}
    />
  );
}
