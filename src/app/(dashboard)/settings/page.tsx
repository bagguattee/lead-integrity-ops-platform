import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateBudgetPolicyAction } from "@/app/actions";
import { Settings, Shield, DollarSign, Key } from "lucide-react";

export default async function SettingsPage() {
  const session = await getCurrentSession();

  let tenant: any = { webhookSecret: "whsec_apex_tx_secret_key_998877" };
  let budget: any = { monthlyCapCents: 5000, currentSpendCents: 125, warningThreshold: 80 };
  let members: any[] = [
    { id: "m1", user: { name: "Marcus Vance (Ops Lead)", email: "admin@apexroofing.com" }, role: "ADMIN" },
    { id: "m2", user: { name: "Sarah Jenkins (Lead Triage)", email: "reviewer@apexroofing.com" }, role: "REVIEWER" },
    { id: "m3", user: { name: "Alex Auditor (Read-Only)", email: "viewer@apexroofing.com" }, role: "VIEWER" },
  ];

  try {
    const [t, b, m] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: session.tenantId } }),
      prisma.budgetPolicy.findUnique({ where: { tenantId: session.tenantId } }),
      prisma.membership.findMany({
        where: { tenantId: session.tenantId },
        include: { user: true },
      }),
    ]);
    if (t) tenant = t;
    if (b) budget = b;
    if (m.length > 0) members = m;
  } catch (e) {
    // Graceful fallback
  }

  const spendDollars = ((budget?.currentSpendCents || 0) / 100).toFixed(2);
  const capDollars = ((budget?.monthlyCapCents || 5000) / 100).toFixed(2);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-400" />
          Workspace & FinOps Policy Configuration
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Manage team RBAC roles, monthly API spend caps, and secure webhook credentials.
        </p>
      </div>

      {/* Webhook API Key Card */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Key className="w-4 h-4 text-blue-400" /> Inbound HMAC-SHA256 Secret Key
        </h3>
        <p className="text-xs text-slate-400">
          Pass this secret in your n8n workflow HMAC node or HTTP header (<code className="text-blue-300">x-n8n-signature</code>).
        </p>
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 flex items-center justify-between">
          <span>{tenant?.webhookSecret}</span>
          <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 uppercase">ACTIVE</span>
        </div>
      </div>

      {/* FinOps Pre-Flight Circuit Breaker Controls */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" /> Monthly FinOps Circuit Breaker
        </h3>
        <p className="text-xs text-slate-400">
          When monthly third-party lookup spend reaches this ceiling, all enrichment and paid AI nodes immediately degrade to zero-cost local cache.
        </p>

        <form action={async (formData: FormData) => {
          "use server";
          const cap = Math.round(parseFloat(formData.get("cap") as string) * 100);
          const threshold = parseInt(formData.get("threshold") as string, 10);
          await updateBudgetPolicyAction(cap, threshold);
        }} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Monthly Spend Cap ($ USD)</label>
            <input
              type="number"
              name="cap"
              defaultValue={capDollars}
              step="5"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Warning Threshold (%)</label>
            <input
              type="number"
              name="threshold"
              defaultValue={budget?.warningThreshold || 80}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition"
            >
              Save FinOps Policy
            </button>
          </div>
        </form>
      </div>

      {/* Team RBAC Table */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-400" /> Team Access & Role-Based Access Control (RBAC)
        </h3>
        <div className="divide-y divide-slate-800">
          {members.map((m) => (
            <div key={m.id} className="py-3 flex items-center justify-between text-sm">
              <div>
                <p className="font-semibold text-white">{m.user.name}</p>
                <p className="text-xs text-slate-500 font-mono">{m.user.email}</p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-bold border border-slate-700">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
