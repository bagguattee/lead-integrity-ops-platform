import { getCurrentSession } from "@/lib/auth";
import { getTenantSnapshot } from "@/lib/store";
import { QuarantineTable } from "@/components/quarantine-table";

export const dynamic = "force-dynamic";

export default async function QuarantinePage() {
  const session = await getCurrentSession();
  const snapshot = getTenantSnapshot(session.tenantSlug);

  return (
    <div className="p-6 xl:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#172554]">
          Human-in-the-Loop (HITL) Quarantine Queue — {snapshot.tenant.name}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Safety firewall holding DNC clusters ({snapshot.tenant.complianceLaw}), commercial broker lines (&gt;3 households), 5-year stale matches, and low-confidence AI predictions.
        </p>
      </div>

      <QuarantineTable
        initialRecords={snapshot.tenant.quarantine}
        tenantName={snapshot.tenant.name}
        complianceLaw={snapshot.tenant.complianceLaw}
        currentRole={session.role}
      />
    </div>
  );
}
