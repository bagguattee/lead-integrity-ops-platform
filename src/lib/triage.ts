import { NormalizedLead } from "../contracts/lead-contracts";

export interface TriageResult {
  urgencyScore: number; // 1 to 5
  intentCategory: "EMERGENCY_STORM" | "HIGH_INTENT" | "ROUTINE" | "UNCERTAIN";
  confidence: number; // 0.0 to 1.0
  summary: string;
}

/**
 * Deterministic First AI Triage:
 * Evaluates prospect notes, damage indicators, and urgency keywords.
 * If live LLM is disabled or budget capped, uses rule-based heuristic scoring.
 */
export function triageLead(notes: string | null | undefined, estimatedValue: number = 0): TriageResult {
  if (!notes || notes.trim().length === 0) {
    return {
      urgencyScore: 1,
      intentCategory: "ROUTINE",
      confidence: 1.0,
      summary: "Standard routine submission (no special notes).",
    };
  }

  const lower = notes.toLowerCase();

  // Emergency Storm / Active Leak keywords
  const emergencyKeywords = ["leak", "water leaking", "caved in", "storm damage", "hail damage", "tarp", "flooding", "emergency"];
  const isEmergency = emergencyKeywords.some((kw) => lower.includes(kw));

  // High Intent keywords
  const highIntentKeywords = ["ready to buy", "insurance check", "quote", "replace entire roof", "asap", "immediate", "cash in hand"];
  const isHighIntent = highIntentKeywords.some((kw) => lower.includes(kw)) || estimatedValue >= 10000;

  // Ambiguous / Uncertain
  const uncertainKeywords = ["maybe", "curious", "just looking", "school project", "unsure", "not my house"];
  const isUncertain = uncertainKeywords.some((kw) => lower.includes(kw));

  if (isEmergency) {
    return {
      urgencyScore: 5,
      intentCategory: "EMERGENCY_STORM",
      confidence: 0.95,
      summary: "High urgency active leak/storm hazard detected in notes.",
    };
  }

  if (isHighIntent) {
    return {
      urgencyScore: 4,
      intentCategory: "HIGH_INTENT",
      confidence: 0.90,
      summary: "High buying intent and/or substantial estimated value.",
    };
  }

  if (isUncertain) {
    return {
      urgencyScore: 2,
      intentCategory: "UNCERTAIN",
      confidence: 0.65, // < 0.70 triggers HITL review
      summary: "Uncertain lead intent requiring human qualification.",
    };
  }

  return {
    urgencyScore: 3,
    intentCategory: "ROUTINE",
    confidence: 0.85,
    summary: "Routine maintenance or inspection request.",
  };
}
