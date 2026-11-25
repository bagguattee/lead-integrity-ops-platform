import { getCurrentSession } from "@/lib/auth";
import { ensureStoreHydrated, getTenantSnapshot, getTenantVoiceState } from "@/lib/store";
import { VoiceClient } from "@/components/voice-client";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  await ensureStoreHydrated();
  const session = await getCurrentSession();
  const snap = getTenantSnapshot(session.tenantSlug);
  const voiceState = getTenantVoiceState(session.tenantSlug);

  return (
    <VoiceClient
      tenantName={voiceState.tenant.name}
      tenantSlug={voiceState.tenant.slug}
      locale={voiceState.tenant.locale}
      currencySymbol={snap.tenant.currencySymbol}
      complianceLaw={voiceState.tenant.complianceLaw}
      currentRole={session.role}
      envStatus={voiceState.envStatus}
      clockMode={voiceState.voice.clockMode}
      agentConfig={voiceState.voice.config}
      calls={voiceState.voice.calls}
      masters={snap.tenant.masters.map((m) => ({
        id: m.id,
        canonicalName: m.canonicalName,
        normalizedPhone: m.normalizedPhone,
        estimatedValue: m.estimatedValue,
        isTcpaOptedOut: m.isTcpaOptedOut,
        status: m.status,
      }))}
    />
  );
}
