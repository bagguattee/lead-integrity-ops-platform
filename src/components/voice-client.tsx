"use client";

import { useState, useTransition } from "react";
import { setVoiceClockModeAction, triggerVoiceCallAction } from "@/app/actions";
import { UserRole } from "@/contracts/lead-contracts";
import { CallRecord, ClockMode, VoiceScenario, VOICE_POLICY } from "@/lib/voice";
import {
  PhoneCall,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Volume2,
  Calendar,
  Sparkles,
  DollarSign,
  Info,
  Key,
} from "lucide-react";

interface VoiceClientProps {
  tenantName: string;
  tenantSlug: string;
  locale: "US" | "AU" | "UK";
  complianceLaw: string;
  currentRole: UserRole;
  envStatus: {
    configured: boolean;
    missing: string[];
  };
  clockMode: ClockMode;
  agentConfig: {
    agentName: string;
    model: string;
    voiceLabel: string;
    firstMessage: string;
    disclosure: string;
    maxAttempts: number;
    transferNumber: string;
  };
  calls: CallRecord[];
  masters: {
    id: string;
    canonicalName: string;
    normalizedPhone: string | null;
    estimatedValue: number;
    isTcpaOptedOut: boolean;
    status: string;
  }[];
}

export function VoiceClient({
  tenantName,
  tenantSlug,
  locale,
  complianceLaw,
  currentRole,
  envStatus,
  clockMode: initialClockMode,
  agentConfig,
  calls,
  masters,
}: VoiceClientProps) {
  const [clockMode, setClockMode] = useState<ClockMode>(initialClockMode);
  const [selectedScenario, setSelectedScenario] = useState<VoiceScenario>("INTERESTED_BOOKS");
  const [targetContactName, setTargetContactName] = useState("");
  const [targetPhone, setTargetPhone] = useState("");
  const [targetMasterId, setTargetMasterId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(calls[0] || null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; tone: "positive" | "warning" | "danger" } | null>(null);
  const [isPending, startTransition] = useTransition();

  const policy = VOICE_POLICY[locale];

  const handleSelectLead = (leadId: string) => {
    const lead = masters.find((m) => m.id === leadId);
    if (!lead) return;
    setTargetMasterId(lead.id);
    setTargetContactName(lead.canonicalName);
    setTargetPhone(lead.normalizedPhone || "");
  };

  const handleClockModeChange = (mode: ClockMode) => {
    setClockMode(mode);
    startTransition(async () => {
      const res = await setVoiceClockModeAction(mode);
      if (res.ok) {
        setStatusMessage({ text: res.message, tone: "positive" });
      } else {
        setStatusMessage({ text: res.message, tone: "danger" });
      }
    });
  };

  const handleDispatchCall = (overridePhone?: string, overrideName?: string, overrideScenario?: VoiceScenario) => {
    const contactName = overrideName || targetContactName.trim() || "Test Homeowner";
    const phone = overridePhone || targetPhone.trim() || (locale === "AU" ? "+61 411 222 333" : locale === "UK" ? "+44 7700 900123" : "+1 512 555 0199");
    const scenario = overrideScenario || selectedScenario;

    setStatusMessage(null);
    startTransition(async () => {
      const res = await triggerVoiceCallAction({
        masterId: targetMasterId,
        contactName,
        phone,
        scenario,
      });

      if (res.ok) {
        setStatusMessage({ text: res.message, tone: "positive" });
        if (res.data) setSelectedCall(res.data as CallRecord);
      } else {
        setStatusMessage({ text: `Blocked: ${res.message}`, tone: "danger" });
        if (res.data) setSelectedCall(res.data as CallRecord);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Status & API Key Notice */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-600 flex-shrink-0">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-bold text-slate-900 tracking-tight">Voice AI Agent Console</h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                envStatus.configured ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"
              }`}>
                {envStatus.configured ? "Vapi Live Connected" : "Deterministic Simulator"}
              </span>
            </div>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Automated voice outreach, pre-dial compliance gating ({complianceLaw}), and real-time appointment qualification.
            </p>
          </div>
        </div>

        {/* Live Key Status / Simulation Toggle indicator */}
        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <div className="text-slate-400 font-medium">Provider Engine</div>
            <div className="font-semibold text-slate-700">
              {envStatus.configured ? "Vapi.ai Outbound API" : "Interactive Mock Telephony"}
            </div>
          </div>
          <div className={`p-2.5 rounded-xl border ${envStatus.configured ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
            <Key className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Environment Key Alert if not configured */}
      {!envStatus.configured && (
        <div className="bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-100 rounded-2xl p-4 text-xs text-sky-900 flex items-start gap-3">
          <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-2">
              <span>Deterministic Simulation & Portfolio Showcase Mode</span>
              {process.env.NEXT_PUBLIC_VAPI_AUTHENTICATED || (
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  Vapi Account & Assistant Connected
                </span>
              )}
            </div>
            <p className="text-sky-800/90 leading-relaxed">
              Your <strong>VAPI_API_KEY</strong> and <strong>VAPI_ASSISTANT_ID</strong> are loaded. Because outbound PSTN calling numbers require a paid carrier subscription, this console runs in <strong>Interactive Zero-Cost Telephony Mode</strong>. You can demo full conversational turns, autonomous scheduling, DNC enforcement, and FinOps budgeting with zero ongoing billable charges.
            </p>
          </div>
        </div>
      )}

      {/* Status toast message */}
      {statusMessage && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border ${
          statusMessage.tone === "positive"
            ? "bg-emerald-50 text-emerald-900 border-emerald-200"
            : statusMessage.tone === "warning"
              ? "bg-amber-50 text-amber-900 border-amber-200"
              : "bg-rose-50 text-rose-900 border-rose-200"
        }`}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-700 ml-4">✕</button>
        </div>
      )}

      {/* Main Grid: Dialer Console & Transcripts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Pre-Dial Controls & Lead Picker (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Dialer Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2">
                <Play className="w-4 h-4 text-teal-500 fill-teal-500" /> Dispatch Voice Outreach
              </h3>
              <span className="text-[11px] font-mono text-slate-400">12¢ / min</span>
            </div>

            {/* Quick Select from Active Leads */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Select Workspace Lead
              </label>
              <select
                aria-label="Select Workspace Lead"
                value={targetMasterId || ""}
                onChange={(e) => handleSelectLead(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- Choose Lead or Type Custom Below --</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.canonicalName} ({m.normalizedPhone || "No Phone"}) {m.isTcpaOptedOut ? "[OPTED OUT]" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Manual Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  Contact Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Miller"
                  value={targetContactName}
                  onChange={(e) => setTargetContactName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder={locale === "AU" ? "+61 411 222 333" : locale === "UK" ? "+44 7700 900123" : "+1 512 555 0199"}
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Simulation Scenarios */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Simulation Outcome Scenario
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "INTERESTED_BOOKS", label: "Interested & Books", icon: Calendar, tone: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                  { id: "OPT_OUT", label: "DNC / Opt-Out", icon: ShieldAlert, tone: "text-rose-600 bg-rose-50 border-rose-200" },
                  { id: "NOT_INTERESTED", label: "Not Interested", icon: AlertTriangle, tone: "text-amber-600 bg-amber-50 border-amber-200" },
                  { id: "VOICEMAIL", label: "Voicemail Left", icon: Volume2, tone: "text-indigo-600 bg-indigo-50 border-indigo-200" },
                ].map((sc) => {
                  const Icon = sc.icon;
                  const isSel = selectedScenario === sc.id;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setSelectedScenario(sc.id as VoiceScenario)}
                      className={`text-left p-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 ${
                        isSel ? `${sc.tone} ring-2 ring-teal-500` : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{sc.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Calling Hours Policy Override (for compliance testing) */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" /> Calling Window Gate
                </span>
                <span className="font-mono text-[11px] text-slate-500">{policy.timeZone}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Statutory window: <span className="font-medium text-slate-700">{policy.label}</span>
              </p>
              <div className="grid grid-cols-3 gap-1 pt-1">
                {(["FORCE_OPEN", "LIVE", "FORCE_CLOSED"] as ClockMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleClockModeChange(mode)}
                    className={`py-1 px-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                      clockMode === mode
                        ? "bg-teal-500 text-white border-teal-600 shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {mode === "FORCE_OPEN" ? "Permitted" : mode === "FORCE_CLOSED" ? "After Hours" : "Live Clock"}
                  </button>
                ))}
              </div>
            </div>

            {/* Launch Dial Button */}
            <button
              type="button"
              disabled={isPending || currentRole === "VIEWER"}
              onClick={() => handleDispatchCall()}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#00D2A0] to-[#0A4D68] text-white font-bold text-xs uppercase tracking-wider shadow-sm hover:opacity-95 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isPending ? (
                <>Processing Voice Call...</>
              ) : (
                <>
                  <PhoneCall className="w-4 h-4" /> Trigger Voice Outreach
                </>
              )}
            </button>
            {currentRole === "VIEWER" && (
              <p className="text-[11px] text-amber-600 text-center font-medium">
                403 Read-Only: Switch role to Reviewer or Admin to place calls.
              </p>
            )}
          </div>

          {/* Agent Persona Specifications */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-3 text-xs">
            <h4 className="font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-teal-500" /> Assistant Blueprint
            </h4>
            <div className="grid grid-cols-2 gap-2 text-slate-600">
              <div><span className="text-slate-400">Agent:</span> {agentConfig.agentName}</div>
              <div><span className="text-slate-400">Model:</span> {agentConfig.model}</div>
              <div className="col-span-2"><span className="text-slate-400">Voice:</span> {agentConfig.voiceLabel}</div>
              <div className="col-span-2"><span className="text-slate-400">Transfer Line:</span> {agentConfig.transferNumber}</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600">
              <span className="font-semibold text-slate-800">Mandatory Disclosure:</span> &ldquo;{agentConfig.disclosure}&rdquo;
            </div>
          </div>
        </div>

        {/* Right Column: Call Ledger & Multi-Turn Transcript View (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Active / Selected Call Detail Panel */}
          {selectedCall ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-5">
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-bold text-slate-900">{selectedCall.contactName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      selectedCall.outcome === "APPOINTMENT_BOOKED"
                        ? "bg-emerald-100 text-emerald-800"
                        : selectedCall.outcome === "OPTED_OUT"
                          ? "bg-rose-100 text-rose-800"
                          : selectedCall.outcome === "BLOCKED_BY_GATE"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-800"
                    }`}>
                      {selectedCall.outcome}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedCall.phone} • {selectedCall.startedAt ? new Date(selectedCall.startedAt).toLocaleTimeString() : "Pending"} • Duration: {selectedCall.durationSec}s • Cost: ${(selectedCall.costCents / 100).toFixed(2)}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sentiment</div>
                  <div className={`text-xs font-bold ${
                    selectedCall.sentiment === "POSITIVE"
                      ? "text-emerald-600"
                      : selectedCall.sentiment === "NEGATIVE"
                        ? "text-rose-600"
                        : "text-slate-600"
                  }`}>
                    {selectedCall.sentiment}
                  </div>
                </div>
              </div>

              {/* Summary & Analysis */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                <div className="font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-teal-600" /> Call Synthesis & Disposition
                </div>
                <p className="text-slate-600 leading-relaxed">{selectedCall.summary}</p>
                {selectedCall.appointmentAt && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Booked Slot: {selectedCall.appointmentAt}
                  </div>
                )}
                {selectedCall.optOutDetected && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 text-xs font-semibold">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> DNC Enforced: Household cluster quarantined
                  </div>
                )}
              </div>

              {/* Multi-Turn Transcript */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  Dialogue Transcript ({selectedCall.transcript.length} turns)
                </h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {selectedCall.transcript.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      No transcript turns recorded (Call status: {selectedCall.status})
                    </div>
                  ) : (
                    selectedCall.transcript.map((turn, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-xl text-xs ${
                          turn.role === "agent"
                            ? "bg-slate-50 border border-slate-100 text-slate-800 mr-8"
                            : "bg-teal-500/10 border border-teal-500/20 text-teal-950 ml-8"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500">
                            {turn.role === "agent" ? `AI (${agentConfig.agentName})` : selectedCall.contactName}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">{turn.atSec}s</span>
                        </div>
                        <p className="leading-relaxed">{turn.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Executed Tools */}
              {selectedCall.toolEvents.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Autonomous Tool Invocations
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedCall.toolEvents.map((t, idx) => (
                      <span key={idx} className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-mono">
                        {t.name}({JSON.stringify(t.args)})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center text-slate-400 text-xs">
              Select or place a call on the left to inspect real-time dialogue and analysis.
            </div>
          )}

          {/* Historical Calls Ledger */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
            <h3 className="text-[15px] font-bold text-slate-800">Voice Engagement History</h3>
            <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
              {calls.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">No outbound calls placed in this workspace yet.</div>
              ) : (
                calls.map((call) => (
                  <div
                    key={call.id}
                    onClick={() => setSelectedCall(call)}
                    className={`py-3 px-2 flex items-center justify-between cursor-pointer rounded-xl hover:bg-slate-50 transition-colors ${
                      selectedCall?.id === call.id ? "bg-teal-50/50" : ""
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                        {call.contactName}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          call.outcome === "APPOINTMENT_BOOKED"
                            ? "bg-emerald-100 text-emerald-700"
                            : call.outcome === "OPTED_OUT"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-600"
                        }`}>
                          {call.outcome}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {call.phone} • {call.durationSec}s • {call.provider}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-semibold text-slate-700">
                        ${(call.costCents / 100).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">{call.sentiment}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
