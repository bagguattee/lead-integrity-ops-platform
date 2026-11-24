"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function resolveQuarantineAction(
  quarantineId: string,
  action: "APPROVED_SYNC" | "SPLIT_MASTER" | "EDITED_FIELDS" | "PERMANENT_QUARANTINE",
  notes?: string
) {
  const session = await getCurrentSession();

  // Action-Level RBAC check: Only OWNER, ADMIN, or REVIEWER can resolve quarantine
  if (session.role === "VIEWER") {
    throw new Error("403 Forbidden: Viewers cannot mutate quarantine records");
  }

  const record = await prisma.quarantineRecord.findFirst({
    where: {
      id: quarantineId,
      tenantId: session.tenantId, // Tenancy isolation
    },
  });

  if (!record) {
    throw new Error("Quarantine record not found");
  }

  await prisma.quarantineRecord.update({
    where: { id: quarantineId },
    data: {
      resolved: true,
      resolutionAction: action,
      resolvedByUserId: session.userId,
      resolutionNotes: notes || null,
    },
  });

  // Log immutable audit event
  await prisma.auditEvent.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: `quarantine:resolve:${action.toLowerCase()}`,
      targetId: quarantineId,
      metadata: JSON.stringify({ notes }),
    },
  });

  revalidatePath("/quarantine");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateBudgetPolicyAction(monthlyCapCents: number, warningThreshold: number) {
  const session = await getCurrentSession();

  // RBAC: Only OWNER or ADMIN can change budget policies
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    throw new Error("403 Forbidden: Insufficient permissions to update budget policy");
  }

  await prisma.budgetPolicy.upsert({
    where: { tenantId: session.tenantId },
    create: {
      tenantId: session.tenantId,
      monthlyCapCents,
      warningThreshold,
    },
    update: {
      monthlyCapCents,
      warningThreshold,
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: "budget:update",
      metadata: JSON.stringify({ monthlyCapCents, warningThreshold }),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function dispatchReactivationAction(masterId: string) {
  const session = await getCurrentSession();

  if (session.role === "VIEWER") {
    throw new Error("403 Forbidden: Viewers cannot trigger outreach dispatches");
  }

  const master = await prisma.leadMaster.findFirst({
    where: {
      id: masterId,
      tenantId: session.tenantId,
    },
  });

  if (!master) throw new Error("Lead Master not found");

  if (master.isTcpaOptedOut) {
    throw new Error("Compliance Gate: Cannot dispatch to DNC/TCPA opted out prospect");
  }

  await prisma.leadMaster.update({
    where: { id: masterId },
    data: {
      status: "SYNCED_TO_GHL",
      lastInteractionAt: new Date(),
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: "dispatch:reactivate",
      targetId: masterId,
    },
  });

  revalidatePath("/reactivation");
  return { success: true, message: `Dispatched ${master.canonicalName} to GHL workflow` };
}
