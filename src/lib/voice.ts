import crypto from "crypto";
import { SupportedLocale } from "../contracts/lead-contracts";

/* ──────────────────────────────────────────────────────────────────────────
 * Voice AI domain layer (pure, framework-free, deterministic where it matters)
 *
 *  - Pre-dial compliance gate  : DETERMINISTIC (DNC, calling hours, attempts, FinOps)
 *  - Provider abstraction      : MOCK (no key) | VAPI (live, needs API key)
 *  - Post-call analysis        : DETERMINISTIC rules first (opt-out, booking), AI summary second
 *
 * NOTE: calling windows below are *configured policy defaults*, not legal advice.
 * ────────────────────────────────────────────────────────────────────────── */

export const VOICE_COST_CENTS_PER_MIN = 12; // blended STT + LLM + TTS + telephony estimate
export const EST_CALL_MINUTES = 2;

export type VoiceProviderMode = "MOCK" | "VAPI";
export type ClockMode = "LIVE" | "FORCE_OPEN" | "FORCE_CLOSED";
export type VoiceScenario = "INTERESTED_BOOKS" | "VOICEMAIL" | "NOT_INTERESTED" | "OPT_OUT";
export type CallDirection = "OUTBOUND" | "INBOUND";
export type CallStatus = "IN_PROGRESS" | "COMPLETED" | "VOICEMAIL" | "NO_ANSWER" | "FAILED" | "BLOCKED";
export type CallOutcome =
  | "APPOINTMENT_BOOKED"
  | "FOLLOW_UP_NEEDED"
  | "NOT_INTERESTED"
  | "VOICEMAIL_LEFT"
  | "OPTED_OUT"
  | "NO_ANSWER"
  | "BLOCKED_BY_GATE"
  | "PENDING";

export interface TranscriptTurn {
  role: "agent" | "customer";
  text: string;
  atSec: number;
}

export interface ToolEvent {
  name: "check_availability" | "book_appointment" | "flag_do_not_call" | "transfer_to_human" | string;
  args: Record<string, unknown>;
  result: string;
}

export interface VoiceAgentConfig {
  agentName: string;
  provider: VoiceProviderMode;
  voiceLabel: string;
  model: string;
  firstMessage: string;
  systemPrompt: string;
  disclosure: string;
  maxAttempts: number;
  recordCalls: boolean;
  transferNumber: string;
}

export interface CallRecord {
  id: string;
  tenantSlug: string;
  direction: CallDirection;
  provider: VoiceProviderMode;
  providerCallId: string | null;
  masterId: string | null;
  contactName: string;
  phone: string | null;
  scenario: VoiceScenario | null;
  status: CallStatus;
  outcome: CallOutcome;
  durationSec: number;
  costCents: number;
  startedAt: string;
  endedAt: string | null;
  endedReason: string;
  transcript: TranscriptTurn[];
  toolEvents: ToolEvent[];
  summary: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  appointmentAt: string | null;
  optOutDetected: boolean;
  gateLocalTime: string;
}

export interface VoiceState {
  config: VoiceAgentConfig;
  clockMode: ClockMode;
  calls: CallRecord[];
  liveToolEvents: Record<string, ToolEvent[]>;
}

export interface CallReportInput {
  provider: VoiceProviderMode;
  providerCallId: string | null;
  direction: CallDirection;
  masterId: string | null;
  contactName: string;
  phone: string | null;
  scenario: VoiceScenario | null;
  status: CallStatus;
  durationSec: number;
  costCents: number;
  startedAt: string;
  endedReason: string;
  transcript: TranscriptTurn[];
  toolEvents: ToolEvent[];
  summaryOverride?: string | null;
  gateLocalTime?: string;
}

/* ───────────────────────── Policy windows (local time) ───────────────────── */

interface VoicePolicy {
  timeZone: string;
  label: string;
  // 0 = Sun … 6 = Sat ; [startHourInclusive, endHourExclusive] or null = closed
  windows: Record<number, [number, number] | null>;
}

const ALL_DAYS = (w: [number, number]): Record<number, [number, number] | null> => ({
  0: w, 1: w, 2: w, 3: w, 4: w, 5: w, 6: w,
});

export const VOICE_POLICY: Record<SupportedLocale, VoicePolicy> = {
  US: {
    timeZone: "America/Chicago",
    label: "8:00–21:00 local daily (TCPA default)",
    windows: ALL_DAYS([8, 21]),
  },
  AU: {
    timeZone: "Australia/Sydney",
    label: "Mon–Fri 9:00–20:00, Sat 9:00–17:00, closed Sun (DNCR Act default)",
    windows: { 0: null, 1: [9, 20], 2: [9, 20], 3: [9, 20], 4: [9, 20], 5: [9, 20], 6: [9, 17] },
  },
  UK: {
    timeZone: "Europe/London",
    label: "8:00–21:00 local daily (PECR practice default)",
    windows: ALL_DAYS([8, 21]),
  },
};

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const weekdayName = get("weekday");
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  return {
    weekday: WEEKDAY_INDEX[weekdayName] ?? 0,
    weekdayName,
    hour,
    minute,
    label: `${weekdayName} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function findInstantAtLocal(locale: SupportedLocale, from: Date, weekday: number, hour: number, minute: number): Date {
  const tz = VOICE_POLICY[locale].timeZone;
  const start = Math.floor(from.getTime() / (30 * 60 * 1000)) * 30 * 60 * 1000;
  for (let i = 0; i < 14 * 48; i++) {
    const candidate = new Date(start + i * 30 * 60 * 1000);
    const c = localClock(candidate, tz);
    if (c.weekday === weekday && c.hour === hour && c.minute === minute) return candidate;
  }
  return from;
}

/** Demo clock override. Production should run LIVE. */
export function resolveClock(mode: ClockMode, locale: SupportedLocale, real: Date = new Date()): Date {
  if (mode === "FORCE_OPEN") return findInstantAtLocal(locale, real, 3, 10, 30); // Wed 10:30 local
  if (mode === "FORCE_CLOSED") return findInstantAtLocal(locale, real, 3, 3, 0); // Wed 03:00 local
  return real;
}

/* ───────────────────────── Pre-dial compliance gate ──────────────────────── */

export type GateCode =
  | "OK"
  | "NO_PHONE"
  | "DNC_OPTED_OUT"
  | "OUTSIDE_CALLING_WINDOW"
  | "MAX_ATTEMPTS"
  | "FINOPS_PAUSED"
  | "BUDGET_CAPPED"
  | "ROLE_FORBIDDEN";

export interface PreDialInput {
  now?: Date;
  clockMode?: ClockMode;
  locale: SupportedLocale;
  phone: string | null;
  isOptedOut: boolean;
  priorAttempts: number;
  maxAttempts: number;
  isPaused: boolean;
  budgetRemainingCents: number;
}

export interface GateResult {
  allowed: boolean;
  code: GateCode;
  reason: string;
  localTime: string;
  timeZone: string;
}

export function evaluatePreDialGate(input: PreDialInput): GateResult {
  const policy = VOICE_POLICY[input.locale];
  const targetDate = input.clockMode === "FORCE_CLOSED"
    ? new Date("2026-11-24T03:00:00Z") // Night time in all locales
    : (input.now || new Date());
  
  const clock = localClock(targetDate, policy.timeZone);
  const base = { localTime: `${clock.label} ${policy.timeZone}`, timeZone: policy.timeZone };
  const block = (code: GateCode, reason: string): GateResult => ({ allowed: false, code, reason, ...base });

  if (!input.phone) return block("NO_PHONE", "No valid E.164 phone on file for this contact.");
  if (input.isOptedOut)
    return block("DNC_OPTED_OUT", "Contact (or household cluster) is opted out — outbound voice is blocked.");

  if (input.clockMode !== "FORCE_OPEN") {
    const win = policy.windows[clock.weekday];
    if (!win || clock.hour < win[0] || clock.hour >= win[1]) {
      return block(
        "OUTSIDE_CALLING_WINDOW",
        `Outside permitted calling window (${policy.label}). Local time is ${clock.label}.`
      );
    }
  }

  if (input.priorAttempts >= input.maxAttempts)
    return block("MAX_ATTEMPTS", `Max attempts reached (${input.priorAttempts}/${input.maxAttempts}).`);

  if (input.isPaused)
    return block("FINOPS_PAUSED", "FinOps Cache-Only mode is active — paid voice minutes are blocked.");

  const est = EST_CALL_MINUTES * VOICE_COST_CENTS_PER_MIN;
  if (input.budgetRemainingCents < est)
    return block("BUDGET_CAPPED", `Monthly FinOps cap would be exceeded (est. $${(est / 100).toFixed(2)} per call).`);

  return { allowed: true, code: "OK", reason: "All pre-dial gates passed.", ...base };
}

/* ───────────────────────────── Default agent config ──────────────────────── */

const SERVICE_BY_LOCALE: Record<SupportedLocale, string> = {
  US: "roof inspection",
  AU: "commercial solar assessment",
  UK: "heat pump survey",
};

export function serviceLabel(locale: SupportedLocale): string {
  return SERVICE_BY_LOCALE[locale];
}

export function defaultVoiceConfig(tenantName: string, locale: SupportedLocale): VoiceAgentConfig {
  const transfer = locale === "AU" ? "+61 2 5550 0142" : locale === "UK" ? "+44 20 7946 0142" : "+1 512 555 0142";
  return {
    agentName: "Ash",
    provider: "MOCK",
    voiceLabel: "Vapi • Elliot",
    model: "gpt-4.1",
    firstMessage: `Hi {{first_name}}, this is {{agent_name}}, an AI assistant calling from ${tenantName} about the ${SERVICE_BY_LOCALE[locale]} you asked about. Do you have a quick minute?`,
    systemPrompt: [
      `You are {{agent_name}}, an AI voice qualification representative for ${tenantName}.`,
      "GOAL: qualify the lead and book a free on-site appointment. Never quote prices.",
      "COMPLIANCE: disclose you are an AI and that the call may be recorded. If the person says stop calling / remove me / do not call, call the tool flag_do_not_call IMMEDIATELY, apologise once, and end the call.",
      "TOOLS: check_availability → offer two slots → book_appointment. Use transfer_to_human for billing disputes, legal threats, or an angry caller.",
      "Never invent facts about warranties, insurance, or availability — use tools.",
    ].join("\n"),
    disclosure: "I'm an AI assistant and this call may be recorded for quality.",
    maxAttempts: 3,
    recordCalls: true,
    transferNumber: transfer,
  };
}

export function createVoiceState(tenantName: string, locale: SupportedLocale): VoiceState {
  return {
    config: defaultVoiceConfig(tenantName, locale),
    clockMode: "FORCE_OPEN",
    calls: [],
    liveToolEvents: {},
  };
}

/* ───────────────────────────── Slots & mock provider ─────────────────────── */

export function buildSlots(now: Date, locale: SupportedLocale): string[] {
  const tz = VOICE_POLICY[locale].timeZone;
  const slots: string[] = [];
  let cursor = new Date(now.getTime());
  const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" });
  for (let i = 0; i < 10 && slots.length < 2; i++) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const c = localClock(cursor, tz);
    if (c.weekday === 0 || c.weekday === 6) continue;
    slots.push(`${c.weekdayName} ${monthFmt.format(cursor)}, ${slots.length === 0 ? "10:00" : "14:00"}`);
  }
  return slots;
}

export interface MockCallBuild {
  transcript: TranscriptTurn[];
  toolEvents: ToolEvent[];
  durationSec: number;
  status: CallStatus;
  endedReason: string;
}

export function buildMockCall(params: {
  scenario: VoiceScenario;
  contactName: string;
  tenantName: string;
  locale: SupportedLocale;
  config: VoiceAgentConfig;
  now: Date;
}): MockCallBuild {
  const first = params.contactName.split(/\s+/)[0] || "there";
  const service = serviceLabel(params.locale);
  const agent = params.config.agentName;
  const [slotA, slotB] = buildSlots(params.now, params.locale);
  const opener = params.config.firstMessage
    .replace(/\{\{first_name\}\}/g, first)
    .replace(/\{\{agent_name\}\}/g, agent);

  const T = (role: "agent" | "customer", text: string, atSec: number): TranscriptTurn => ({ role, text, atSec });

  switch (params.scenario) {
    case "INTERESTED_BOOKS":
      return {
        durationSec: 94,
        status: "COMPLETED",
        endedReason: "customer-ended-call",
        transcript: [
          T("agent", opener, 0),
          T("customer", `Yes, this is ${first}. Go ahead.`, 9),
          T("agent", `${params.config.disclosure} I can send a technician out for a free ${service}. Would ${slotA} or ${slotB} suit you better?`, 14),
          T("customer", `${slotA} works for me.`, 33),
          T("agent", `Perfect — you're booked for ${slotA}. You'll receive a confirmation message shortly. Anything else I can help with?`, 41),
          T("customer", "No, that's everything. Thanks.", 62),
          T("agent", `Thanks ${first}, talk soon.`, 68),
        ],
        toolEvents: [
          { name: "check_availability", args: {}, result: `Slots: ${slotA}; ${slotB}` },
          { name: "book_appointment", args: { slot: slotA, name: params.contactName }, result: `Confirmed ${slotA}` },
        ],
      };
    case "NOT_INTERESTED":
      return {
        durationSec: 41,
        status: "COMPLETED",
        endedReason: "customer-ended-call",
        transcript: [
          T("agent", opener, 0),
          T("customer", `Hi. Actually we already hired someone for that, so we're not interested.`, 8),
          T("agent", `Understood — thanks for letting me know, ${first}. I'll note that on your file. Have a great day.`, 17),
          T("customer", "You too.", 29),
        ],
        toolEvents: [],
      };
    case "OPT_OUT":
      return {
        durationSec: 23,
        status: "COMPLETED",
        endedReason: "customer-ended-call",
        transcript: [
          T("agent", opener, 0),
          T("customer", "Please stop calling me and take me off your list.", 7),
          T("agent", "Of course — I'm removing your number from our call list right now. I apologise for the interruption.", 13),
        ],
        toolEvents: [
          { name: "flag_do_not_call", args: { reason: "customer_request" }, result: "DNC recorded" },
        ],
      };
    default:
      return {
        durationSec: 28,
        status: "VOICEMAIL",
        endedReason: "voicemail",
        transcript: [
          T(
            "agent",
            `[Voicemail detected] Hi ${first}, this is ${agent}, an AI assistant from ${params.tenantName}, following up on your ${service} enquiry. Call us back on ${params.config.transferNumber} whenever suits. Thanks!`,
            0
          ),
        ],
        toolEvents: [],
      };
  }
}

export function costForDuration(durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.max(1, Math.ceil((durationSec / 60) * VOICE_COST_CENTS_PER_MIN));
}

/* ─────────────────────────── Post-call analysis ──────────────────────────── */

const OPT_OUT_RE =
  /(stop calling|do not call|don't call|dont call|remove (me|my number)|take me off|unsubscribe|stop (texting|contacting) me|never call)/i;
const NOT_INTERESTED_RE = /(not interested|no thanks|no thank you|already hired|already have (someone|a))/i;
const CALLBACK_RE = /(call (me )?back|later today|another time|not a good time|busy right now)/i;
const POSITIVE_RE = /(works for me|sounds good|perfect|great|thanks|yes)/i;
const NEGATIVE_RE = /(stop calling|annoy|angry|ridiculous|not interested|take me off|never call)/i;

export interface CallAnalysis {
  outcome: CallOutcome;
  optOutDetected: boolean;
  appointmentAt: string | null;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  summary: string;
}

export function analyzeCall(
  transcript: TranscriptTurn[],
  toolEvents: ToolEvent[],
  status: CallStatus,
  contactName: string
): CallAnalysis {
  const customerText = transcript.filter((t) => t.role === "customer").map((t) => t.text).join(" ");
  const optOutTool = toolEvents.some((e) => e.name === "flag_do_not_call");
  const optOutDetected = optOutTool || OPT_OUT_RE.test(customerText);

  const bookEvent = toolEvents.find((e) => e.name === "book_appointment");
  const appointmentAt =
    bookEvent && typeof bookEvent.args.slot === "string" ? (bookEvent.args.slot as string) : null;

  let outcome: CallOutcome;
  if (optOutDetected) outcome = "OPTED_OUT";
  else if (appointmentAt) outcome = "APPOINTMENT_BOOKED";
  else if (status === "VOICEMAIL") outcome = "VOICEMAIL_LEFT";
  else if (status === "NO_ANSWER" || status === "FAILED") outcome = "NO_ANSWER";
  else if (NOT_INTERESTED_RE.test(customerText)) outcome = "NOT_INTERESTED";
  else if (CALLBACK_RE.test(customerText)) outcome = "FOLLOW_UP_NEEDED";
  else outcome = "FOLLOW_UP_NEEDED";

  let sentiment: CallAnalysis["sentiment"] = "NEUTRAL";
  if (NEGATIVE_RE.test(customerText)) sentiment = "NEGATIVE";
  else if (appointmentAt || POSITIVE_RE.test(customerText)) sentiment = "POSITIVE";

  const summaryMap: Record<CallOutcome, string> = {
    APPOINTMENT_BOOKED: `${contactName} accepted a free on-site visit — booked for ${appointmentAt}.`,
    OPTED_OUT: `${contactName} asked not to be contacted. Number flagged Do-Not-Call and the household cluster is now blocked from outbound.`,
    NOT_INTERESTED: `${contactName} declined (not interested / already covered). No further outreach scheduled.`,
    VOICEMAIL_LEFT: `Voicemail left for ${contactName} with a callback number. Counts as 1 attempt.`,
    NO_ANSWER: `No answer from ${contactName}. Counts as 1 attempt.`,
    FOLLOW_UP_NEEDED: `Spoke with ${contactName}; no booking yet — follow-up recommended.`,
    BLOCKED_BY_GATE: `Call blocked by the pre-dial compliance gate.`,
    PENDING: `Call in progress…`,
  };

  return { outcome, optOutDetected, appointmentAt, sentiment, summary: summaryMap[outcome] };
}

export function outcomeLabel(o: CallOutcome): string {
  const map: Record<CallOutcome, string> = {
    APPOINTMENT_BOOKED: "Appointment booked",
    FOLLOW_UP_NEEDED: "Follow-up needed",
    NOT_INTERESTED: "Not interested",
    VOICEMAIL_LEFT: "Voicemail left",
    OPTED_OUT: "Opted out → DNC",
    NO_ANSWER: "No answer",
    BLOCKED_BY_GATE: "Blocked by gate",
    PENDING: "In progress",
  };
  return map[o];
}

/* ───────────────────── Interactive 2-Way Customer Simulator ──────────────── */

export interface InteractiveTurnResult {
  agentReply: string;
  newToolEvents: ToolEvent[];
  shouldEndCall: boolean;
  endedReason?: string;
}

const HUMAN_TRANSFER_RE = /(human|manager|supervisor|real person|speak to someone|billing|dispute|lawyer|attorney|sue)/i;
const PRICING_RE = /(how much|price|cost|quote|expensive|estimate|ballpark|\$)/i;
const CONFIRM_SLOT_RE = /(first|10:00|10 am|morning|second|14:00|2:00|2 pm|afternoon|works for me|sounds good|book it|confirm|yes please|sure|let's do|that works)/i;
const GREET_OR_OPEN_RE = /(yes|yeah|sure|go ahead|who is this|speaking|available|slots|times|when|schedule|inspect|book|hello|hi)/i;

/**
 * Real-time interactive agent response engine for 2-way call testing
 * where the human reviewer plays the homeowner/customer.
 *
 * Enforces deterministic compliance guardrails FIRST (mid-call opt-out revocation,
 * human escalation, no fabricated pricing), then slot lookup & booking tools.
 */
export function evaluateInteractiveCustomerTurn(params: {
  customerMessage: string;
  contactName: string;
  tenantName: string;
  locale: SupportedLocale;
  config: VoiceAgentConfig;
  existingToolEvents: ToolEvent[];
  now: Date;
}): InteractiveTurnResult {
  const msg = params.customerMessage.trim();
  const first = params.contactName.split(/\s+/)[0] || "there";
  const service = serviceLabel(params.locale);
  const [slotA, slotB] = buildSlots(params.now, params.locale);
  const hasCheckedAvailability = params.existingToolEvents.some((e) => e.name === "check_availability");
  const hasBooked = params.existingToolEvents.some((e) => e.name === "book_appointment");

  // 1. DETERMINISTIC COMPLIANCE GUARD #1: Mid-Call Consent Revocation (TCPA / DNCR / PECR)
  if (OPT_OUT_RE.test(msg)) {
    return {
      agentReply: `Understood, ${first} — I am flagging your number Do-Not-Call right now and removing your household from all future outreach. I apologize for the interruption. Have a good day.`,
      newToolEvents: [
        {
          name: "flag_do_not_call",
          args: { reason: "mid_call_customer_revocation", utterance: msg.slice(0, 80) },
          result: "DNC flag applied + household cluster quarantined",
        },
      ],
      shouldEndCall: true,
      endedReason: "customer-revoked-consent-dnc",
    };
  }

  // 2. DETERMINISTIC COMPLIANCE GUARD #2: Human Escalation / Dispute
  if (HUMAN_TRANSFER_RE.test(msg)) {
    return {
      agentReply: `Of course, ${first}. Let me warm-transfer you directly to a licensed specialist at ${params.tenantName} on ${params.config.transferNumber}. One moment please.`,
      newToolEvents: [
        {
          name: "transfer_to_human",
          args: { targetNumber: params.config.transferNumber, reason: "customer_requested_specialist" },
          result: `Warm transfer initiated to ${params.config.transferNumber}`,
        },
      ],
      shouldEndCall: true,
      endedReason: "transferred-to-human",
    };
  }

  // 3. Not interested / polite decline
  if (NOT_INTERESTED_RE.test(msg)) {
    return {
      agentReply: `No problem at all, ${first} — thanks for letting me know. I'll close out this inquiry so we don't bother you. Have a great day!`,
      newToolEvents: [],
      shouldEndCall: true,
      endedReason: "customer-declined",
    };
  }

  // 4. Pricing guard (Prompt rule: NEVER fabricate/quote prices)
  if (PRICING_RE.test(msg)) {
    const tools: ToolEvent[] = [];
    if (!hasCheckedAvailability) {
      tools.push({ name: "check_availability", args: {}, result: `Slots: ${slotA}; ${slotB}` });
    }
    return {
      agentReply: `Great question, ${first}. Because every property is different, I never guess or quote prices over the phone — our licensed technician does a free on-site ${service} and gives you an exact written quote. Would ${slotA} or ${slotB} work better for a quick 15-minute visit?`,
      newToolEvents: tools,
      shouldEndCall: false,
    };
  }

  // 5. Slot confirmation -> Book Appointment tool!
  if (hasCheckedAvailability && !hasBooked && CONFIRM_SLOT_RE.test(msg)) {
    const pickedSecond = /(second|14:00|2:00|2 pm|afternoon)/i.test(msg);
    const chosenSlot = pickedSecond ? slotB : slotA;
    return {
      agentReply: `Awesome — you're officially booked for ${chosenSlot} with ${params.tenantName}! I've synced your confirmation straight into our dispatch calendar. Anything else I can help with today, ${first}?`,
      newToolEvents: [
        {
          name: "book_appointment",
          args: { slot: chosenSlot, name: params.contactName },
          result: `Confirmed ${chosenSlot}`,
        },
      ],
      shouldEndCall: false,
    };
  }

  // 6. Post-booking wrap-up
  if (hasBooked) {
    return {
      agentReply: `Thanks so much, ${first}! We'll see you then. Have a wonderful day.`,
      newToolEvents: [],
      shouldEndCall: true,
      endedReason: "appointment-confirmed-ended",
    };
  }

  // 7. Callback requested
  if (CALLBACK_RE.test(msg)) {
    return {
      agentReply: `Totally understand, ${first}. I'll note your file for a follow-up later during normal business hours. Thanks for your time!`,
      newToolEvents: [],
      shouldEndCall: true,
      endedReason: "callback-requested",
    };
  }

  // 8. Opening / Availability inquiry -> check_availability tool
  if (GREET_OR_OPEN_RE.test(msg) || !hasCheckedAvailability) {
    const tools: ToolEvent[] = [];
    if (!hasCheckedAvailability) {
      tools.push({ name: "check_availability", args: {}, result: `Slots: ${slotA}; ${slotB}` });
    }
    return {
      agentReply: `${params.config.disclosure} I checked our technician schedule for your free ${service}. We have ${slotA} or ${slotB} open — which of those works better for you?`,
      newToolEvents: tools,
      shouldEndCall: false,
    };
  }

  return {
    agentReply: `Got it, ${first}. Would you like me to lock in ${slotA} or ${slotB} for the free on-site ${service}?`,
    newToolEvents: [],
    shouldEndCall: false,
  };
}

/* ───────────────────────────── Vapi (live provider) ──────────────────────── */

export interface VapiEnvStatus {
  configured: boolean;
  missing: string[];
}

export function getVapiEnvStatus(): VapiEnvStatus {
  const required = ["VAPI_API_KEY", "VAPI_ASSISTANT_ID", "VAPI_PHONE_NUMBER_ID"];
  const missing = required.filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
}

export interface VapiPlaceResult {
  ok: boolean;
  providerCallId?: string;
  error?: string;
  status?: number;
}

/**
 * Places an outbound call through Vapi's REST API.
 * Requires: VAPI_API_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID.
 * Request shape follows Vapi's public "Create Call" endpoint; verify against your account before production.
 */
export async function placeVapiCall(params: {
  phone: string;
  contactName: string;
  tenantSlug: string;
  masterId: string | null;
  config: VoiceAgentConfig;
  tenantName: string;
}): Promise<VapiPlaceResult> {
  const env = getVapiEnvStatus();
  if (!env.configured) return { ok: false, error: `Missing env: ${env.missing.join(", ")}` };

  const first = params.contactName.split(/\s+/)[0] || "there";
  const body = {
    assistantId: process.env.VAPI_ASSISTANT_ID,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    customer: { number: params.phone, name: params.contactName },
    metadata: { tenantSlug: params.tenantSlug, masterId: params.masterId },
    assistantOverrides: {
      firstMessage: params.config.firstMessage
        .replace(/\{\{first_name\}\}/g, first)
        .replace(/\{\{agent_name\}\}/g, params.config.agentName),
      variableValues: { first_name: first, company: params.tenantName, agent_name: params.config.agentName },
    },
  };

  try {
    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string | string[] };
    if (!res.ok) {
      const msg = Array.isArray(json.message) ? json.message.join("; ") : json.message;
      return { ok: false, status: res.status, error: msg || `Vapi responded ${res.status}` };
    }
    return { ok: true, providerCallId: json.id, status: res.status };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error calling Vapi" };
  }
}

/* ───────────────────────── Webhook auth & payload parsing ────────────────── */

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function verifyVoiceSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!/^[0-9a-fA-F]+$/.test(provided) || provided.length !== expected.length) return false;
  return safeEqual(provided.toLowerCase(), expected);
}

export function verifySharedSecret(headerValue: string | null, expected: string | undefined): boolean {
  if (!headerValue || !expected) return false;
  return safeEqual(headerValue, expected);
}

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

export interface ParsedEndOfCall {
  providerCallId: string | null;
  direction: CallDirection;
  phone: string | null;
  tenantSlug: string | null;
  masterId: string | null;
  durationSec: number;
  costCents: number;
  endedReason: string;
  status: CallStatus;
  transcript: TranscriptTurn[];
  toolEvents: ToolEvent[];
  summary: string | null;
}

/** Defensive parser for an end-of-call-report style payload (Vapi-shaped). */
export function parseVapiEndOfCall(body: unknown): ParsedEndOfCall | null {
  const root = asObj(body);
  const message = asObj(root.message ?? root);
  if (asStr(message.type) !== "end-of-call-report") return null;

  const call = asObj(message.call);
  const customer = asObj(call.customer ?? message.customer);
  const metadata = asObj(call.metadata);
  const artifact = asObj(message.artifact);
  const analysis = asObj(message.analysis);
  const messages = Array.isArray(artifact.messages) ? (artifact.messages as unknown[]) : [];

  const transcript: TranscriptTurn[] = [];
  const toolEvents: ToolEvent[] = [];

  for (const raw of messages) {
    const m = asObj(raw);
    const role = asStr(m.role);
    const at = typeof m.secondsFromStart === "number" ? Math.round(m.secondsFromStart) : 0;
    if ((role === "assistant" || role === "bot") && asStr(m.message)) {
      transcript.push({ role: "agent", text: asStr(m.message), atSec: at });
    } else if (role === "user" && asStr(m.message)) {
      transcript.push({ role: "customer", text: asStr(m.message), atSec: at });
    }
    if (Array.isArray(m.toolCalls)) {
      for (const tc of m.toolCalls as unknown[]) {
        const fn = asObj(asObj(tc).function);
        let args: Record<string, unknown> = {};
        const rawArgs = fn.arguments;
        if (typeof rawArgs === "string") {
          try { args = JSON.parse(rawArgs) as Record<string, unknown>; } catch { args = {}; }
        } else if (rawArgs && typeof rawArgs === "object") {
          args = rawArgs as Record<string, unknown>;
        }
        if (asStr(fn.name)) toolEvents.push({ name: asStr(fn.name), args, result: "recorded" });
      }
    }
  }

  const endedReason = asStr(message.endedReason) || "unknown";
  const durationSec = Math.round(Number(message.durationSeconds ?? 0)) || 0;
  const usd = Number(message.cost ?? 0);
  const callType = asStr(call.type);

  let status: CallStatus = "COMPLETED";
  if (/voicemail/i.test(endedReason)) status = "VOICEMAIL";
  else if (/no-answer|did-not-answer|busy/i.test(endedReason)) status = "NO_ANSWER";
  else if (/error|failed/i.test(endedReason)) status = "FAILED";

  return {
    providerCallId: asStr(call.id) || null,
    direction: /inbound/i.test(callType) ? "INBOUND" : "OUTBOUND",
    phone: asStr(customer.number) || null,
    tenantSlug: asStr(metadata.tenantSlug) || null,
    masterId: asStr(metadata.masterId) || null,
    durationSec,
    costCents: usd > 0 ? Math.max(1, Math.round(usd * 100)) : costForDuration(durationSec),
    endedReason,
    status,
    transcript,
    toolEvents,
    summary: asStr(analysis.summary) || null,
  };
}

export interface ParsedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export function parseVapiToolCalls(body: unknown): { callId: string | null; phone: string | null; tenantSlug: string | null; calls: ParsedToolCall[] } | null {
  const root = asObj(body);
  const message = asObj(root.message ?? root);
  if (asStr(message.type) !== "tool-calls") return null;
  const call = asObj(message.call);
  const customer = asObj(call.customer);
  const metadata = asObj(call.metadata);
  const list = Array.isArray(message.toolCallList)
    ? (message.toolCallList as unknown[])
    : Array.isArray(message.toolWithToolCallList)
      ? (message.toolWithToolCallList as unknown[]).map((x) => asObj(x).toolCall)
      : [];

  const calls: ParsedToolCall[] = [];
  for (const raw of list) {
    const tc = asObj(raw);
    const fn = asObj(tc.function);
    const name = asStr(tc.name) || asStr(fn.name);
    let args: Record<string, unknown> = {};
    const rawArgs = tc.arguments ?? fn.arguments;
    if (typeof rawArgs === "string") {
      try { args = JSON.parse(rawArgs) as Record<string, unknown>; } catch { args = {}; }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, unknown>;
    }
    if (name) calls.push({ id: asStr(tc.id) || name, name, args });
  }

  return {
    callId: asStr(call.id) || null,
    phone: asStr(customer.number) || null,
    tenantSlug: asStr(metadata.tenantSlug) || null,
    calls,
  };
}
