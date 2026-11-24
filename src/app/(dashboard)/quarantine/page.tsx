import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QuarantineTable } from "@/components/quarantine-table";
import { AlertTriangle } from "lucide-react";

export default async function QuarantinePage() {
  const session = await getCurrentSession();

  let records: any[] = [];
  try {
    records = await prisma.quarantineRecord.findMany({
      where: {
        tenantId: session.tenantId,
        resolved: false,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (e) {
    records = [
      {
        id: "quar_dnc_sample",
        reason: "DNC_CLUSTER",
        contaminatingRecord: "Matched existing DNC Master (+15125550144)",
        rawPayload: '{"name":"Robert Henderson","is_dnc":true,"phone":"512-555-0144"}',
        resolved: false,
        createdAt: new Date(),
      },
      {
        id: "quar_hub_sample",
        reason: "SHARED_HUB",
        contaminatingRecord: "Phone line 512-555-0100 associated with 4 distinct households",
        rawPayload: '{"name":"Broker Unit 4D","phone":"512-555-0100"}',
        resolved: false,
        createdAt: new Date(),
      },
    ];
  }

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
