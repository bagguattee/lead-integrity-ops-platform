import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QuarantineTable } from "@/components/quarantine-table";
import { AlertTriangle } from "lucide-react";

export default async function QuarantinePage() {
  const session = await getCurrentSession();

  const records = await prisma.quarantineRecord.findMany({
    where: {
      tenantId: session.tenantId,
      resolved: false,
    },
    orderBy: { createdAt: "desc" },
  });

  const formatted = records.map((r) => ({
    id: r.id,
    reason: r.reason,
    contaminatingRecord: r.contaminatingRecord,
    rawPayload: r.rawPayload,
    resolved: r.resolved,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            Human-in-the-Loop (HITL) Quarantine Board
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Review edge-cases, TCPA/DNC cluster isolations, and low-confidence AI predictions before CRM dispatch.
          </p>
        </div>
      </div>

      <QuarantineTable initialRecords={formatted} />
    </div>
  );
}
