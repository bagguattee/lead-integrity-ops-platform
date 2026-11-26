"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  hangUpInteractiveVoiceCallAction,
  resetVoiceLimitsAction,
  sendInteractiveVoiceReplyAction,
  setVoiceClockModeAction,
  startInteractiveVoiceCallAction,
  triggerVoiceCallAction,
} from "@/app/actions";
import { UserRole } from "@/contracts/lead-contracts";
import { CallRecord, ClockMode, VoiceScenario, VOICE_POLICY } from "@/lib/voice";
import {
  unlockAudioAndSpeech,
  playTelephoneRing,
  playCallConnected,
  playHangupTone,
  speakAgentVoice,
  cancelSpeech,
} from "@/lib/audio-effects";
import {
  PhoneCall,
  PhoneOff,
  ShieldAlert,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Volume2,
  VolumeX,
  Calendar,
  Sparkles,
  Info,
  Key,
  Send,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Bot,
  RotateCcw,
} from "lucide-react";

interface VoiceClientProps {
  tenantName: string;
  tenantSlug: string;
  locale: "US" | "AU" | "UK";
  currencySymbol: "$" | "A$" | "£";
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
  locale,
  currencySymbol,
  complianceLaw,
  currentRole,
  envStatus,
  clockMode: initialClockMode,
  agentConfig,
  calls,
  masters,
}: VoiceClientProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"INTERACTIVE" | "QA_REPLAY">("INTERACTIVE");
  const [clockMode, setClockMode] = useState<ClockMode>(initialClockMode);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isAgentThinking, setIsAgentThinking] = useState(false);

  const [selectedScenario, setSelectedScenario] = useState<VoiceScenario>("INTERESTED_BOOKS");
  const [targetContactName, setTargetContactName] = useState(masters[0]?.canonicalName || "");
  const [targetPhone, setTargetPhone] = useState(masters[0]?.normalizedPhone || "");
  const [targetMasterId, setTargetMasterId] = useState<string | null>(masters[0]?.id || null);

  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(calls[0] || null);
  const [customerReply, setCustomerReply] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 6;

  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    tone: "positive" | "warning" | "danger";
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const policy = VOICE_POLICY[locale];
  const selectedMaster = masters.find((m) => m.id === targetMasterId) || null;
  const isLiveCallActive = selectedCall?.status === "IN_PROGRESS";

  const [liveElapsedSec, setLiveElapsedSec] = useState(0);
  const [isDialing, setIsDialing] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  // Live wall-clock timer for active or replaying calls
  useEffect(() => {
    if (!isLiveCallActive && !isReplaying) {
      setLiveElapsedSec(0);
      return;
    }
    const timer = setInterval(() => {
      setLiveElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isLiveCallActive, isReplaying]);

  // Keep selectedCall synchronized with fresh server props when router refreshes
  useEffect(() => {
    if (isReplaying) return;
    if (!selectedCall) {
      if (calls[0]) setSelectedCall(calls[0]);
      return;
    }
    const fresh = calls.find((c) => c.id === selectedCall.id);
    if (fresh) setSelectedCall(fresh);
  }, [calls, selectedCall, isReplaying]);

  const handleSelectLead = (leadId: string) => {
    const lead = masters.find((m) => m.id === leadId);
    if (!lead) {
      setTargetMasterId(null);
      return;
    }
    setTargetMasterId(lead.id);
    setTargetContactName(lead.canonicalName);
    setTargetPhone(lead.normalizedPhone || "");
  };

  const handleClockModeChange = (nextMode: ClockMode) => {
    setClockMode(nextMode);
    startTransition(async () => {
      const res = await setVoiceClockModeAction(nextMode);
      setStatusMessage({
        text: res.message,
        tone: res.ok ? "positive" : "danger",
      });
      router.refresh();
    });
  };

  const handleStartInteractiveCall = () => {
    // 1. Synchronously unlock browser audio & speech policies during user click
    unlockAudioAndSpeech();

    const contactName = targetContactName.trim() || "Test Homeowner";
    const phone =
      targetPhone.trim() ||
      (locale === "AU" ? "+61 411 222 333" : locale === "UK" ? "+44 7700 900123" : "+1 512 555 0199");

    setStatusMessage(null);
    setIsDialing(true);

    startTransition(async () => {
      if (audioEnabled) {
        await playTelephoneRing(locale);
      }
      setIsDialing(false);

      const res = await startInteractiveVoiceCallAction({
        masterId: targetMasterId,
        contactName,
        phone,
      });
      const rec = res.data as CallRecord | undefined;
      if (rec) setSelectedCall(rec);

      if (res.ok && rec) {
        if (audioEnabled) playCallConnected();
        setStatusMessage({ text: res.message, tone: "positive" });
        const opener = rec.transcript[0]?.text;
        if (opener && audioEnabled) {
          speakAgentVoice(opener, {
            onStart: () => setIsAgentThinking(true),
            onEnd: () => setIsAgentThinking(false),
          });
        }
      } else {
        if (audioEnabled) playHangupTone();
        setStatusMessage({ text: `Pre-Dial Gate Blocked: ${res.message}`, tone: "danger" });
      }
      router.refresh();
    });
  };

  const handleResetLimits = () => {
    unlockAudioAndSpeech();
    setStatusMessage(null);
    startTransition(async () => {
      const res = await resetVoiceLimitsAction({
        phone: targetPhone,
        masterId: targetMasterId,
      });
      setStatusMessage({
        text: res.message,
        tone: res.ok ? "positive" : "danger",
      });
      router.refresh();
    });
  };

  const handleSendCustomerReply = (overrideText?: string) => {
    unlockAudioAndSpeech();
    if (!selectedCall || selectedCall.status !== "IN_PROGRESS") return;
    const text = (overrideText ?? customerReply).trim();
    if (!text) return;

    // Production Barge-In: Immediately cut off agent speech when user speaks mid-sentence
    cancelSpeech();
    setIsAgentThinking(false);

    setCustomerReply("");
    setStatusMessage(null);
    setIsAgentThinking(true);

    startTransition(async () => {
      const res = await sendInteractiveVoiceReplyAction({
        callId: selectedCall.id,
        customerMessage: text,
      });
      const rec = res.data as CallRecord | undefined;
      if (rec) {
        setSelectedCall(rec);
        setIsAgentThinking(false);
        const lastAgentTurn = [...rec.transcript].reverse().find((t) => t.role === "agent");
        if (lastAgentTurn && audioEnabled) {
          speakAgentVoice(lastAgentTurn.text, {
            onStart: () => setIsAgentThinking(true),
            onEnd: () => setIsAgentThinking(false),
          });
        }
        if (rec.status === "COMPLETED" && audioEnabled) {
          playHangupTone();
        }
      } else {
        setIsAgentThinking(false);
      }
      setStatusMessage({
        text: res.message,
        tone: res.ok
          ? rec?.optOutDetected
            ? "warning"
            : "positive"
          : "danger",
      });
      router.refresh();
    });
  };

  const handleHangUp = () => {
    unlockAudioAndSpeech();
    cancelSpeech();
    setIsAgentThinking(false);
    if (!selectedCall || selectedCall.status !== "IN_PROGRESS") return;
    if (audioEnabled) playHangupTone();
    startTransition(async () => {
      const res = await hangUpInteractiveVoiceCallAction(selectedCall.id);
      const rec = res.data as CallRecord | undefined;
      if (rec) setSelectedCall(rec);
      setStatusMessage({ text: res.message, tone: res.ok ? "positive" : "danger" });
      router.refresh();
    });
  };

  const handleDispatchQaReplay = () => {
    unlockAudioAndSpeech();
    const contactName = targetContactName.trim() || "Test Homeowner";
    const phone =
      targetPhone.trim() ||
      (locale === "AU" ? "+61 411 222 333" : locale === "UK" ? "+44 7700 900123" : "+1 512 555 0199");

    setStatusMessage(null);
    setIsDialing(true);

    startTransition(async () => {
      if (audioEnabled) {
        await playTelephoneRing(locale);
      }
      setIsDialing(false);

      const res = await triggerVoiceCallAction({
        masterId: targetMasterId,
        contactName,
        phone,
        scenario: selectedScenario,
      });

      const fullRec = res.data as CallRecord | undefined;
      if (!res.ok || !fullRec) {
        if (audioEnabled) playHangupTone();
        setStatusMessage({
          text: `Blocked: ${res.message}`,
          tone: "danger",
        });
        router.refresh();
        return;
      }

      if (audioEnabled) playCallConnected();

      // Progressive Live Playback of turns with audio!
      setIsReplaying(true);
      const turns = fullRec.transcript;

      const tempCall: CallRecord = {
        ...fullRec,
        status: "IN_PROGRESS",
        transcript: turns.slice(0, 1),
      };
      setSelectedCall(tempCall);

      // Play Turn 1 (Ash speaks aloud)
      if (turns[0] && audioEnabled) {
        setIsAgentThinking(true);
        await speakAgentVoice(turns[0].text, {
          onStart: () => setIsAgentThinking(true),
          onEnd: () => setIsAgentThinking(false),
        });
      }

      // Progressively step through subsequent dialogue turns
      for (let i = 1; i < turns.length; i++) {
        const turn = turns[i];
        await new Promise((r) => setTimeout(r, 1200));
        tempCall.transcript = turns.slice(0, i + 1);
        setSelectedCall({ ...tempCall });

        if (turn.role === "agent" && audioEnabled) {
          setIsAgentThinking(true);
          await speakAgentVoice(turn.text, {
            onStart: () => setIsAgentThinking(true),
            onEnd: () => setIsAgentThinking(false),
          });
        }
      }

      setIsReplaying(false);
      setSelectedCall(fullRec);
      if (audioEnabled) playHangupTone();
      setStatusMessage({
        text: `Automated call simulation completed (${fullRec.outcome})`,
        tone: "positive",
      });
      router.refresh();
    });
  };

  const historyTotalPages = Math.max(1, Math.ceil(calls.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const pagedCalls = calls.slice(
    (safeHistoryPage - 1) * historyPageSize,
    safeHistoryPage * historyPageSize
  );

  return (
    <div className="p-6 xl:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Banner: Status & Audio Toggle */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-600 flex-shrink-0">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-bold text-slate-900 tracking-tight">
                Voice AI Qualification Console — {tenantName}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  envStatus.configured
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-sky-100 text-sky-800"
                }`}
              >
                {envStatus.configured ? "Vapi Live Connected" : "Interactive 2-Way Simulator"}
              </span>
            </div>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Live 2-way outbound qualification calls (not voicemail blasts) with deterministic pre-dial {complianceLaw} gating and autonomous calendar booking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleResetLimits}
            disabled={isPending}
            title="Reset max attempt counters & clear test DNC flags for unlimited evaluation"
            className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
            Reset Dials &amp; DNC
          </button>
          <button
            type="button"
            onClick={() => setAudioEnabled((v) => !v)}
            data-testid="voice-audio-toggle"
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              audioEnabled
                ? "bg-teal-50 border-teal-200 text-teal-700"
                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {audioEnabled ? "Browser Audio ON" : "Browser Audio OFF"}
          </button>
          <div
            className={`p-2.5 rounded-xl border ${
              envStatus.configured
                ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                : "bg-slate-50 border-slate-200 text-slate-500"
            }`}
            title={
              envStatus.configured
                ? "Vapi live telephony configured"
                : "Vapi API + Assistant loaded; zero-cost interactive telephony sandbox active"
            }
          >
            <Key className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Crystal-Clear Explanation of How Interactive Voice + Pre-Dial vs Mid-Call DNC Works */}
      <div className="bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-100 rounded-2xl p-4 text-xs text-sky-900 flex items-start gap-3">
        <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold flex items-center gap-2 flex-wrap">
            <span>How This Works: Interactive 2-Way Call Sandbox + Real Vapi Webhook Endpoint</span>
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
              POST /api/webhooks/vapi Ready
            </span>
          </div>
          <p className="text-sky-800/90 leading-relaxed">
            <strong>In Interactive Mode (below), YOU act as the homeowner</strong> while <strong>{agentConfig.agentName}</strong> runs the real compliance &amp; tool-calling engine. Already-opted-out leads are <strong>hard-blocked BEFORE dialing (0s, {currencySymbol}0.00)</strong>. Only previously opted-in leads can be dialed — and if a homeowner revokes consent <em>mid-call</em> (&ldquo;stop calling me&rdquo;), {agentConfig.agentName} fires <code className="bg-white/80 px-1 rounded font-mono">flag_do_not_call</code>, ends the call, and permanently blocks all future dials.
          </p>
        </div>
      </div>

      {/* Status Toast */}
      {statusMessage && (
        <div
          data-testid="voice-status-banner"
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            statusMessage.tone === "positive"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : statusMessage.tone === "warning"
                ? "bg-amber-50 text-amber-900 border-amber-200"
                : "bg-rose-50 text-rose-900 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span>{statusMessage.text}</span>
            {statusMessage.tone === "danger" && (
              <button
                type="button"
                onClick={handleResetLimits}
                className="ml-2 px-2 py-0.5 rounded bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 font-bold text-[11px] transition"
              >
                Reset Dial Counters &amp; Retry
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-700 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Pre-Dial Gate & Mode Selector (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-5">
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                data-testid="voice-mode-interactive"
                onClick={() => setMode("INTERACTIVE")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  mode === "INTERACTIVE"
                    ? "bg-white text-[#172554] shadow-xs"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-teal-600" /> You Play Customer
              </button>
              <button
                type="button"
                data-testid="voice-mode-qa"
                onClick={() => setMode("QA_REPLAY")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  mode === "QA_REPLAY"
                    ? "bg-white text-[#172554] shadow-xs"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-[#1649C7]" /> Automated QA Replay
              </button>
            </div>

            {/* Select Workspace Lead */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Target Workspace Lead
              </label>
              <select
                aria-label="Select Workspace Lead"
                data-testid="voice-lead-select"
                value={targetMasterId || ""}
                onChange={(e) => handleSelectLead(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- Choose Lead or Type Custom Below --</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.isTcpaOptedOut ? "🚫 [PRE-DIAL DNC BLOCKED] " : "✓ "}
                    {m.canonicalName} ({m.normalizedPhone || "No Phone"})
                  </option>
                ))}
              </select>

              {selectedMaster?.isTcpaOptedOut && (
                <p
                  data-testid="voice-dnc-warning"
                  className="mt-2 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"
                >
                  This contact already revoked consent. Attempting to dial will trigger a hard Pre-Dial DNC Block (0s, {currencySymbol}0.00).
                </p>
              )}
            </div>

            {/* Manual Inputs - Only visible when playing as customer */}
            {mode === "INTERACTIVE" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                    Contact Name (You Play As)
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
                    placeholder={
                      locale === "AU"
                        ? "+61 411 222 333"
                        : locale === "UK"
                          ? "+44 7700 900123"
                          : "+1 512 555 0199"
                    }
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            )}

            {/* Mode-Specific Controls */}
            {mode === "QA_REPLAY" && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                  Automated Regression Scenario (AI Plays Both Sides)
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Used to verify webhook settlement &amp; mid-call compliance revocations automatically.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      id: "INTERESTED_BOOKS",
                      label: "Books Inspection",
                      icon: Calendar,
                      tone: "text-emerald-600 bg-emerald-50 border-emerald-200",
                    },
                    {
                      id: "OPT_OUT",
                      label: "Mid-Call Opt-Out",
                      icon: ShieldAlert,
                      tone: "text-rose-600 bg-rose-50 border-rose-200",
                    },
                    {
                      id: "NOT_INTERESTED",
                      label: "Declines Offer",
                      icon: AlertTriangle,
                      tone: "text-amber-600 bg-amber-50 border-amber-200",
                    },
                    {
                      id: "VOICEMAIL",
                      label: "Voicemail Left",
                      icon: Volume2,
                      tone: "text-indigo-600 bg-indigo-50 border-indigo-200",
                    },
                  ].map((sc) => {
                    const Icon = sc.icon;
                    const isSel = selectedScenario === sc.id;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        data-testid={`qa-scenario-${sc.id}`}
                        onClick={() => setSelectedScenario(sc.id as VoiceScenario)}
                        className={`text-left p-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 ${
                          isSel
                            ? `${sc.tone} ring-2 ring-teal-500`
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{sc.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pre-Dial Calling Window Policy Gate */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" /> Pre-Dial Calling Window Gate
                </span>
                <span className="font-mono text-[11px] text-slate-500">{policy.timeZone}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Statutory window: <span className="font-medium text-slate-700">{policy.label}</span>
              </p>
              <div className="grid grid-cols-3 gap-1 pt-1">
                {(["FORCE_OPEN", "LIVE", "FORCE_CLOSED"] as ClockMode[]).map((cm) => (
                  <button
                    key={cm}
                    type="button"
                    data-testid={`clock-mode-${cm}`}
                    onClick={() => handleClockModeChange(cm)}
                    className={`py-1 px-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                      clockMode === cm
                        ? "bg-teal-500 text-white border-teal-600 shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {cm === "FORCE_OPEN" ? "Permitted" : cm === "FORCE_CLOSED" ? "After Hours" : "Live Clock"}
                  </button>
                ))}
              </div>
            </div>

            {/* Launch Button */}
            {mode === "INTERACTIVE" ? (
              <button
                type="button"
                disabled={isPending || isDialing || currentRole === "VIEWER"}
                onClick={handleStartInteractiveCall}
                data-testid="start-interactive-call-btn"
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#00D2A0] to-[#0A4D68] text-white font-bold text-xs uppercase tracking-wider shadow-sm hover:opacity-95 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <PhoneCall className="w-4 h-4" />
                {isDialing
                  ? "Dialing Outbound Call (Ringing...)..."
                  : isPending
                    ? "Checking Pre-Dial Gate..."
                    : "Start Live Call (You Play Customer)"}
              </button>
            ) : (
              <button
                type="button"
                disabled={isPending || isDialing || isReplaying || currentRole === "VIEWER"}
                onClick={handleDispatchQaReplay}
                data-testid="run-qa-replay-btn"
                className="w-full py-3 px-4 rounded-xl bg-[#1649C7] hover:bg-[#1E5EFF] text-white font-bold text-xs uppercase tracking-wider shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                {isDialing
                  ? "Dialing..."
                  : isReplaying
                    ? "Playing Live Audio Simulation..."
                    : isPending
                      ? "Connecting..."
                      : "Run Automated QA Replay"}
              </button>
            )}

            {currentRole === "VIEWER" && (
              <p className="text-[11px] text-amber-600 text-center font-medium">
                403 Read-Only: Switch role to Reviewer or Admin to initiate calls.
              </p>
            )}
          </div>

          {/* Agent Blueprint */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-3 text-xs">
            <h4 className="font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-teal-500" /> Vapi Assistant Blueprint
            </h4>
            <div className="grid grid-cols-2 gap-2 text-slate-600">
              <div>
                <span className="text-slate-400">Agent:</span>{" "}
                <strong className="text-slate-800">{agentConfig.agentName}</strong>
              </div>
              <div>
                <span className="text-slate-400">Model:</span> {agentConfig.model}
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">Voice:</span> {agentConfig.voiceLabel}
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">Warm Transfer:</span> {agentConfig.transferNumber}
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600">
              <span className="font-semibold text-slate-800">Mandatory AI Disclosure:</span> &ldquo;
              {agentConfig.disclosure}&rdquo;
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Call Stage + Paginated History (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {selectedCall ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-5">
              {/* Call Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4 gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[16px] font-bold text-slate-900">
                      {selectedCall.contactName}
                    </span>
                    <span
                      data-testid="selected-call-outcome"
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        selectedCall.status === "IN_PROGRESS"
                          ? "bg-teal-100 text-teal-800 animate-pulse"
                          : selectedCall.outcome === "APPOINTMENT_BOOKED"
                            ? "bg-emerald-100 text-emerald-800"
                            : selectedCall.outcome === "OPTED_OUT"
                              ? "bg-rose-100 text-rose-800"
                              : selectedCall.outcome === "BLOCKED_BY_GATE"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {selectedCall.status === "IN_PROGRESS" ? "LIVE CALL ACTIVE" : selectedCall.outcome}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedCall.phone} • Duration:{" "}
                    <strong className="text-slate-600 font-mono">
                      {isLiveCallActive || isReplaying ? `${liveElapsedSec}s (live)` : `${selectedCall.durationSec}s`}
                    </strong>{" "}
                    • Cost: {currencySymbol}
                    {(selectedCall.costCents / 100).toFixed(2)}
                  </p>
                </div>

                {isLiveCallActive ? (
                  <button
                    type="button"
                    onClick={handleHangUp}
                    disabled={isPending}
                    data-testid="hangup-call-btn"
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <PhoneOff className="w-3.5 h-3.5" /> End Call
                  </button>
                ) : (
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Sentiment
                    </div>
                    <div
                      className={`text-xs font-bold ${
                        selectedCall.sentiment === "POSITIVE"
                          ? "text-emerald-600"
                          : selectedCall.sentiment === "NEGATIVE"
                            ? "text-rose-600"
                            : "text-slate-600"
                      }`}
                    >
                      {selectedCall.sentiment}
                    </div>
                  </div>
                )}
              </div>

              {/* Synthesis Banner */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                <div className="font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-teal-600" /> Call Synthesis &amp; Disposition
                </div>
                <p className="text-slate-600 leading-relaxed">{selectedCall.summary}</p>
                {selectedCall.appointmentAt && (
                  <div
                    data-testid="booked-slot-badge"
                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-semibold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Booked Slot:{" "}
                    {selectedCall.appointmentAt}
                  </div>
                )}
                {selectedCall.optOutDetected && (
                  <div
                    data-testid="dnc-enforced-badge"
                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 text-xs font-semibold"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> DNC Enforced: Household
                    cluster quarantined &amp; future calls blocked
                  </div>
                )}
              </div>

              {/* Multi-Turn Transcript */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  Dialogue Transcript ({selectedCall.transcript.length} turns)
                </h4>
                <div
                  data-testid="voice-transcript-box"
                  className="space-y-2 max-h-[280px] overflow-y-auto pr-1"
                >
                  {selectedCall.transcript.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      No transcript turns recorded (Blocked pre-dial — {selectedCall.status})
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
                            {turn.role === "agent"
                              ? `AI (${agentConfig.agentName})`
                              : `${selectedCall.contactName} (You)`}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">{turn.atSec}s</span>
                        </div>
                        <p className="leading-relaxed">{turn.text}</p>
                      </div>
                    ))
                  )}

                  {/* Animated Agent Evaluation / Speaking Waveform */}
                  {isAgentThinking && (
                    <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 mr-8 flex items-center gap-2.5 text-xs animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-teal-500 animate-ping" />
                      <span className="font-bold">{agentConfig.agentName} (AI) is evaluating &amp; speaking...</span>
                      <span className="font-mono text-teal-700 text-xs font-bold tracking-widest">ılılıllı</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Interactive Customer Reply Controls (ONLY visible in INTERACTIVE mode while LIVE call is active!) */}
              {mode === "INTERACTIVE" && isLiveCallActive && (
                <div
                  data-testid="interactive-reply-panel"
                  className="p-4 rounded-xl bg-[#F4F9FF] border border-[#D7E6FA] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#172554]">
                      Respond as {selectedCall.contactName} (Homeowner):
                    </span>
                    <span className="text-[10px] font-mono text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full font-bold">
                      2-Way Live (Barge-In Enabled)
                    </span>
                  </div>

                  {/* 1-Click Realistic Homeowner Quick Replies (Barge-In capable: always active during call) */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "Yes, what times are open?", text: "Yes, I have a minute. What times do you have available?" },
                      { label: "Is it completely free?", text: "Wait, is this inspection completely free with no obligation?" },
                      { label: "Do I need to be home?", text: "Do I need to be home for the technician to inspect the roof?" },
                      { label: "How much does a new roof cost?", text: "Can you just give me a ballpark quote over the phone?" },
                      { label: "First slot works, book it", text: "The first slot works for me, please book it." },
                      { label: "Speak to human specialist", text: "I'd prefer to speak directly with a human specialist." },
                      { label: "Stop calling me (Test DNC)", text: "Please stop calling me and remove my number from your list." },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        disabled={isPending}
                        onClick={() => handleSendCustomerReply(chip.text)}
                        className="px-2.5 py-1 rounded-full bg-white border border-[#DCE6F7] hover:border-[#1649C7] text-[11px] font-semibold text-[#1649C7] transition hover:bg-slate-50 disabled:opacity-40"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom Customer Text Input (Can type or send mid-speech to interrupt agent) */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendCustomerReply();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={customerReply}
                      onChange={(e) => setCustomerReply(e.target.value)}
                      disabled={isPending}
                      placeholder="Type anything a real homeowner would say... (interrupts AI speech)"
                      data-testid="voice-customer-input"
                      className="flex-1 text-xs bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={isPending || !customerReply.trim()}
                      data-testid="voice-send-reply-btn"
                      className="px-4 py-2.5 rounded-xl bg-[#1649C7] hover:bg-[#1E5EFF] disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      <Send className="w-3.5 h-3.5" /> Reply
                    </button>
                  </form>
                </div>
              )}

              {/* Automated QA Replay Status Banner (Strictly shown in QA Replay mode during execution) */}
              {mode === "QA_REPLAY" && (isReplaying || isLiveCallActive) && (
                <div
                  data-testid="qa-replay-active-banner"
                  className="p-3.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping" />
                    <span>Automated QA Regression Replay in Progress (Synthetic Prospect ↔ AI Agent)</span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-800 bg-white border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                    Scenario: {selectedScenario}
                  </span>
                </div>
              )}

              {/* Executed Autonomous Tool Calls */}
              {selectedCall.toolEvents.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Autonomous Tool Invocations
                  </h4>
                  <div className="flex flex-wrap gap-2" data-testid="voice-tool-events">
                    {selectedCall.toolEvents.map((t, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-mono"
                      >
                        {t.name}({JSON.stringify(t.args)})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center text-slate-400 text-xs">
              Click <strong>Start Live Call (You Play Customer)</strong> on the left to talk directly with {agentConfig.agentName} and test real-time booking &amp; DNC compliance.
            </div>
          )}

          {/* Paginated Voice Engagement History */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-slate-800">
                Voice Engagement History ({calls.length})
              </h3>
              {historyTotalPages > 1 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    disabled={safeHistoryPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className="p-1 rounded border border-slate-200 disabled:opacity-40"
                    aria-label="Previous call history page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-[11px] text-slate-500">
                    {safeHistoryPage}/{historyTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeHistoryPage >= historyTotalPages}
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                    className="p-1 rounded border border-slate-200 disabled:opacity-40"
                    aria-label="Next call history page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
              {pagedCalls.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  No outbound calls placed in this workspace yet.
                </div>
              ) : (
                pagedCalls.map((call) => (
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
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            call.status === "IN_PROGRESS"
                              ? "bg-teal-100 text-teal-800"
                              : call.outcome === "APPOINTMENT_BOOKED"
                                ? "bg-emerald-100 text-emerald-700"
                                : call.outcome === "OPTED_OUT"
                                  ? "bg-rose-100 text-rose-700"
                                  : call.outcome === "BLOCKED_BY_GATE"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {call.status === "IN_PROGRESS" ? "LIVE" : call.outcome}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {call.phone} • {call.durationSec}s • {call.provider}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-semibold text-slate-700">
                        {currencySymbol}
                        {(call.costCents / 100).toFixed(2)}
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
