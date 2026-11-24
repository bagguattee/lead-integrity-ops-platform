"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ingestSingleLeadFromUiAction } from "@/app/actions";
import { SupportedLocale } from "@/contracts/lead-contracts";
import {
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
  GitMerge,
  ArrowRight,
} from "lucide-react";

interface LeadIntakeModalProps {
  open: boolean;
  onClose: () => void;
  tenantName: string;
  locale: SupportedLocale;
  phonePrefix: string;
}

export function LeadIntakeModal({
  open,
  onClose,
  tenantName,
  locale,
  phonePrefix,
}: LeadIntakeModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const samplePlaceholderPhone =
    locale === "AU" ? "0412 901 445" : locale === "UK" ? "07700 900552" : "(512) 555-0194";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("16500");
  const [notes, setNotes] = useState("");
  const [isDnc, setIsDnc] = useState(false);
  const [sourceChannel, setSourceChannel] = useState("GoHighLevel");

  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    outcome?: string;
    normalizedPhone?: string | null;
    normalizedEmail?: string | null;
  } | null>(null);

  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setEstimatedValue("16500");
    setNotes("");
    setIsDnc(false);
    setSourceChannel("GoHighLevel");
    setStageMessage(null);
    setFeedback(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!open) return null;

  const applyPreset = (preset: "STORM" | "DUP" | "DNC" | "TRASH") => {
    setFeedback(null);
    if (preset === "STORM") {
      setName(locale === "AU" ? "Cooper Walsh" : locale === "UK" ? "Clara Sterling" : "Hannah Montgomery");
      setPhone(samplePlaceholderPhone);
      setEmail("hannah.m@gmial.com"); // Demonstrates typo correction -> @gmail.com
      setAddress(
        locale === "AU"
          ? "88 Pitt St, Sydney NSW"
          : locale === "UK"
            ? "14 Baker St, London"
            : "712 Congress Ave, Austin, TX"
      );
      setEstimatedValue("22400");
      setNotes("Emergency storm damage, active water leak through ceiling! Ready for immediate repair.");
      setIsDnc(false);
      setSourceChannel("GoHighLevel");
    } else if (preset === "DUP") {
      setName(locale === "AU" ? "Lachlan Murdoch" : locale === "UK" ? "Beatrice Holloway" : "David Miller");
      setPhone(locale === "AU" ? "0412 345 678" : locale === "UK" ? "07700 900885" : "512-555-0199");
      setEmail(
        locale === "AU"
          ? "lachlan@sydneyenergy.com.au"
          : locale === "UK"
            ? "beatrice@canarywharfops.co.uk"
            : "david.miller@gmail.com"
      );
      setAddress("Duplicate Submission Check");
      setEstimatedValue("14500");
      setNotes("Submitting second form inquiry — should hit local payload cache ($0.00)");
      setIsDnc(false);
      setSourceChannel("n8n Webhook");
    } else if (preset === "DNC") {
      setName("Victor Vance (TCPA Test)");
      setPhone(locale === "AU" ? "0409 771 330" : locale === "UK" ? "07700 900661" : "512-555-0144");
      setEmail("victor.dnc@outlook.com");
      setAddress("High-Risk Opt-Out Household");
      setEstimatedValue("42000");
      setNotes("High-ticket $42k project, but opted out of SMS/calls — Compliance must override revenue.");
      setIsDnc(true);
      setSourceChannel("n8n Webhook");
    } else {
      setName("Unverified Ad Click");
      setPhone("idk");
      setEmail("n/a");
      setAddress("none");
      setEstimatedValue("0");
      setNotes("Testing garbage placeholder token sanitization");
      setIsDnc(false);
      setSourceChannel("Meta Lead Ads");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setStageMessage("Step 1/3: Sanitizing strings & formatting E.164 phone...");

    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 220));
      setStageMessage("Step 2/3: Checking SHA-256 idempotency, DNC clusters & FinOps cap...");
      await new Promise((r) => setTimeout(r, 220));
      setStageMessage("Step 3/3: Committing two-sided reconciliation ledger...");

      const res = await ingestSingleLeadFromUiAction({
        name: name || "Unnamed Prospect",
        phone,
        email,
        address,
        estimatedValue,
        notes,
        isDnc,
        sourceChannel,
      });

      setStageMessage(null);
      const rowData = (res.data as { outcome?: string; row?: { normalizedPhone?: string | null; normalizedEmail?: string | null } } | undefined);
      setFeedback({
        ok: res.ok,
        message: res.message,
        outcome: rowData?.outcome,
        normalizedPhone: rowData?.row?.normalizedPhone,
        normalizedEmail: rowData?.row?.normalizedEmail,
      });
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A194E]/45 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Ingest Lead Payload"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl border border-[#E4EBF5] shadow-[0_24px_60px_rgba(10,36,114,0.22)] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#F8FAFE] border-b border-[#E8EEF6] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#172554]">Live Lead Ingestion & Webhook Simulator</h3>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#E3FAF4] text-[#0D9488]">
                {phonePrefix}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Target Sub-Account: <strong className="text-[#172554]">{tenantName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Quick Test Scenarios (or type custom data below)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => applyPreset("STORM")}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#E3FAF4] text-[#0D9488] hover:bg-[#CCF5EA] transition text-center"
              >
                + Clean Storm Lead
              </button>
              <button
                type="button"
                onClick={() => applyPreset("DUP")}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#EEF4FF] text-[#1D4ED8] hover:bg-[#DCE8FF] transition text-center"
              >
                Duplicate ($0 Cache)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("DNC")}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA] transition text-center"
              >
                DNC $42k Trap
              </button>
              <button
                type="button"
                onClick={() => applyPreset("TRASH")}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#FEF3C7] text-[#B45309] hover:bg-[#FDE68A] transition text-center"
              >
                Dirty (&quot;idk&quot; / &quot;n/a&quot;)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-semibold text-[#172554] block mb-1">Prospect Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hannah Montgomery"
                className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs text-[#172554] focus:outline-none focus:border-[#1E5EFF] focus:bg-white transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#172554] block mb-1">
                Raw Phone ({locale} format)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={samplePlaceholderPhone}
                className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs font-mono text-[#172554] focus:outline-none focus:border-[#1E5EFF] focus:bg-white transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#172554] block mb-1">Raw Email Address</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prospect@gmial.com"
                className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs font-mono text-[#172554] focus:outline-none focus:border-[#1E5EFF] focus:bg-white transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#172554] block mb-1">Estimated Deal Value ($)</label>
              <input
                type="number"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                placeholder="15000"
                className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs font-mono text-[#172554] focus:outline-none focus:border-[#1E5EFF] focus:bg-white transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-semibold text-[#172554] block mb-1">Source Channel</label>
              <select
                value={sourceChannel}
                onChange={(e) => setSourceChannel(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs text-[#172554] focus:outline-none focus:border-[#1E5EFF] focus:bg-white"
              >
                <option value="GoHighLevel">GoHighLevel Inbound</option>
                <option value="n8n Webhook">n8n Webhook Bridge</option>
                <option value="Meta Lead Ads">Meta Lead Ads</option>
                <option value="CSV Batch">Manual Entry</option>
              </select>
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={isDnc}
                  onChange={(e) => setIsDnc(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1649C7] focus:ring-[#1649C7]"
                />
                <span>Flag as TCPA / DNC Opted-Out</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#172554] block mb-1">
              Unstructured Prospect Notes (Evaluated by AI Triage)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Water leaking into attic after hail storm, need urgent inspection..."
              className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs text-[#172554] focus:outline-none focus:border-[#1E5EFF] focus:bg-white transition"
            />
          </div>

          {/* Live Pipeline Stepper / Loading Indicator */}
          {isPending && stageMessage && (
            <div className="p-3.5 rounded-xl bg-[#EEF4FF] border border-[#C7DCFF] flex items-center gap-3 text-xs font-medium text-[#1649C7]">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>{stageMessage}</span>
            </div>
          )}

          {/* Pipeline Output Banner */}
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                !feedback.ok
                  ? "bg-rose-50 border-rose-200 text-rose-700"
                  : feedback.outcome === "QUARANTINED"
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : feedback.outcome === "MERGED_DUPLICATE"
                      ? "bg-blue-50 border-blue-200 text-blue-800"
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {!feedback.ok || feedback.outcome === "QUARANTINED" ? (
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                ) : feedback.outcome === "MERGED_DUPLICATE" ? (
                  <GitMerge className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
              {feedback.ok && (
                <p className="font-mono text-[11px] opacity-85 pl-6">
                  Normalized Phone: {feedback.normalizedPhone ?? "null"} • Email:{" "}
                  {feedback.normalizedEmail ?? "null"}
                </p>
              )}
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#EEF2F8]">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-[#F1F5FB] hover:bg-[#E4ECF7] transition"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#1649C7] to-[#1E5EFF] hover:opacity-95 shadow-[0_6px_18px_rgba(22,73,199,0.28)] flex items-center gap-2 transition disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" /> Run Through Pipeline <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
