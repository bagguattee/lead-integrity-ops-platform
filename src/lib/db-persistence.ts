import { prisma } from "./prisma";

export interface PersistenceHealth {
  mode: "POSTGRESQL_LIVE" | "IN_MEMORY_FALLBACK";
  connected: boolean;
  lastSyncedAt: string | null;
  error: string | null;
}

const SNAPSHOT_KEY = "global_store_v2";

const globalPersistence = globalThis as unknown as {
  __integrityPersistenceHealth?: PersistenceHealth;
  __integrityHydrated?: boolean;
};

function isPostgresUrlConfigured(): boolean {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

export function getPersistenceHealth(): PersistenceHealth {
  if (!globalPersistence.__integrityPersistenceHealth) {
    globalPersistence.__integrityPersistenceHealth = {
      mode: isPostgresUrlConfigured() ? "POSTGRESQL_LIVE" : "IN_MEMORY_FALLBACK",
      connected: false,
      lastSyncedAt: null,
      error: isPostgresUrlConfigured() ? null : "DATABASE_URL is not a PostgreSQL connection string",
    };
  }
  return globalPersistence.__integrityPersistenceHealth;
}

export async function loadSnapshotFromPostgres<T>(): Promise<T | null> {
  if (!isPostgresUrlConfigured()) {
    globalPersistence.__integrityPersistenceHealth = {
      mode: "IN_MEMORY_FALLBACK",
      connected: false,
      lastSyncedAt: null,
      error: "Running in zero-config in-memory demo mode",
    };
    return null;
  }

  try {
    const row = await prisma.workspaceSnapshot.findUnique({
      where: { key: SNAPSHOT_KEY },
    });
    globalPersistence.__integrityPersistenceHealth = {
      mode: "POSTGRESQL_LIVE",
      connected: true,
      lastSyncedAt: row?.updatedAt?.toISOString() || new Date().toISOString(),
      error: null,
    };
    if (!row) return null;
    return JSON.parse(row.payload) as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "PostgreSQL unavailable";
    globalPersistence.__integrityPersistenceHealth = {
      mode: "IN_MEMORY_FALLBACK",
      connected: false,
      lastSyncedAt: null,
      error: msg.slice(0, 140),
    };
    return null;
  }
}

export async function saveSnapshotToPostgres(
  storeState: unknown,
  relationalSync?: {
    tenantSlug: string;
    tenantName: string;
    localeDefault: string;
    webhookSecret: string;
    budget: {
      monthlyCapCents: number;
      currentSpendCents: number;
      cacheSavingsCents: number;
      warningThreshold: number;
      cacheOnlyOnCap: boolean;
      isPaused: boolean;
      isApiDown: boolean;
    };
    latestAudit?: {
      action: string;
      targetId: string | null;
      detail: string;
      actorName: string;
      actorRole: string;
    };
    latestVoiceCall?: {
      id: string;
      tenantSlug: string;
      direction: string;
      provider: string;
      providerCallId: string | null;
      masterId: string | null;
      contactName: string;
      phone: string | null;
      status: string;
      outcome: string;
      durationSec: number;
      costCents: number;
      sentiment: string;
      appointmentAt: string | null;
      optOutDetected: boolean;
      summary: string;
      transcript: unknown[];
      toolEvents: unknown[];
    };
  }
): Promise<boolean> {
  if (!isPostgresUrlConfigured()) return false;

  try {
    const serialized = JSON.stringify(storeState);
    await prisma.workspaceSnapshot.upsert({
      where: { key: SNAPSHOT_KEY },
      create: { key: SNAPSHOT_KEY, payload: serialized },
      update: { payload: serialized },
    });

    if (relationalSync) {
      const dbTenant = await prisma.tenant.upsert({
        where: { slug: relationalSync.tenantSlug },
        create: {
          slug: relationalSync.tenantSlug,
          name: relationalSync.tenantName,
          localeDefault: relationalSync.localeDefault,
          webhookSecret: relationalSync.webhookSecret,
        },
        update: {
          name: relationalSync.tenantName,
          localeDefault: relationalSync.localeDefault,
        },
      });

      await prisma.budgetPolicy.upsert({
        where: { tenantId: dbTenant.id },
        create: {
          tenantId: dbTenant.id,
          monthlyCapCents: relationalSync.budget.monthlyCapCents,
          currentSpendCents: relationalSync.budget.currentSpendCents,
          cacheSavingsCents: relationalSync.budget.cacheSavingsCents,
          warningThreshold: relationalSync.budget.warningThreshold,
          cacheOnlyOnCap: relationalSync.budget.cacheOnlyOnCap,
          isPaused: relationalSync.budget.isPaused,
          isApiDown: relationalSync.budget.isApiDown,
        },
        update: {
          monthlyCapCents: relationalSync.budget.monthlyCapCents,
          currentSpendCents: relationalSync.budget.currentSpendCents,
          cacheSavingsCents: relationalSync.budget.cacheSavingsCents,
          warningThreshold: relationalSync.budget.warningThreshold,
          cacheOnlyOnCap: relationalSync.budget.cacheOnlyOnCap,
          isPaused: relationalSync.budget.isPaused,
          isApiDown: relationalSync.budget.isApiDown,
        },
      });

      if (relationalSync.latestAudit) {
        await prisma.auditEvent.create({
          data: {
            tenantId: dbTenant.id,
            action: relationalSync.latestAudit.action,
            targetId: relationalSync.latestAudit.targetId,
            metadata: JSON.stringify({
              actorName: relationalSync.latestAudit.actorName,
              actorRole: relationalSync.latestAudit.actorRole,
              detail: relationalSync.latestAudit.detail,
            }),
          },
        });
      }

      if (relationalSync.latestVoiceCall) {
        const vc = relationalSync.latestVoiceCall;
        await prisma.voiceCallRecord.upsert({
          where: { id: vc.id },
          create: {
            id: vc.id,
            tenantSlug: vc.tenantSlug,
            direction: vc.direction,
            provider: vc.provider,
            providerCallId: vc.providerCallId,
            masterId: vc.masterId,
            contactName: vc.contactName,
            phone: vc.phone,
            status: vc.status,
            outcome: vc.outcome,
            durationSec: vc.durationSec,
            costCents: vc.costCents,
            sentiment: vc.sentiment,
            appointmentAt: vc.appointmentAt,
            optOutDetected: vc.optOutDetected,
            summary: vc.summary,
            transcriptJson: JSON.stringify(vc.transcript),
            toolEventsJson: JSON.stringify(vc.toolEvents),
          },
          update: {
            status: vc.status,
            outcome: vc.outcome,
            durationSec: vc.durationSec,
            costCents: vc.costCents,
            sentiment: vc.sentiment,
            appointmentAt: vc.appointmentAt,
            optOutDetected: vc.optOutDetected,
            summary: vc.summary,
            transcriptJson: JSON.stringify(vc.transcript),
            toolEventsJson: JSON.stringify(vc.toolEvents),
          },
        });
      }
    }

    globalPersistence.__integrityPersistenceHealth = {
      mode: "POSTGRESQL_LIVE",
      connected: true,
      lastSyncedAt: new Date().toISOString(),
      error: null,
    };
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "PostgreSQL sync failed";
    globalPersistence.__integrityPersistenceHealth = {
      mode: "IN_MEMORY_FALLBACK",
      connected: false,
      lastSyncedAt: globalPersistence.__integrityPersistenceHealth?.lastSyncedAt || null,
      error: msg.slice(0, 140),
    };
    return false;
  }
}

export async function resetPostgresSnapshot(): Promise<void> {
  if (!isPostgresUrlConfigured()) return;
  try {
    await prisma.workspaceSnapshot.deleteMany({ where: { key: SNAPSHOT_KEY } });
  } catch {
    // ignore
  }
}
