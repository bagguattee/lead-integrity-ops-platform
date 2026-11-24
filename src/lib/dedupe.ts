import { NormalizedLead, QuarantineReason } from "../contracts/lead-contracts";

export interface ExistingLeadRecord {
  id: string;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  canonicalName: string;
  isTcpaOptedOut: boolean;
  isSharedHub: boolean;
  createdAt: Date;
  rawPayloadHash: string;
}

export interface DedupeClassification {
  type: "NEW_MASTER" | "MERGE_ALIAS" | "QUARANTINE";
  matchTier?: "TIER_1_EXACT" | "TIER_2_FUZZY" | "SHARED_HOUSEHOLD";
  matchedMasterId?: string;
  quarantineReason?: QuarantineReason;
  contaminatingRecord?: string;
}

/**
 * Evaluates whether an inbound normalized lead should be:
 * 1. QUARANTINED (Invalid shape, DNC Cluster contamination, Shared Commercial Hub >3 households, Time-Gap >5 years, Low AI Confidence <0.70).
 * 2. MERGED into an existing Master (Exact Phone or Email match).
 * 3. Created as a NEW Master.
 */
export function classifyLeadDedupe(
  incoming: NormalizedLead,
  existingMasters: ExistingLeadRecord[],
  phoneHouseholdCountMap: Map<string, number>
): DedupeClassification {
  // Gate 1: Minimum valid shape (Must have at least a valid phone OR valid email)
  if (!incoming.normalizedPhone && !incoming.normalizedEmail) {
    return {
      type: "QUARANTINE",
      quarantineReason: "INVALID_SHAPE",
      contaminatingRecord: "Missing both valid E.164 phone and normalized email",
    };
  }

  // Gate 2: Direct Inbound TCPA / DNC Opt-Out Check
  if (incoming.isTcpaOptedOut) {
    return {
      type: "QUARANTINE",
      quarantineReason: "DNC_CLUSTER",
      contaminatingRecord: `Inbound lead flagged as DNC/Opt-Out: ${incoming.normalizedPhone || incoming.normalizedEmail}`,
    };
  }

  // Gate 3: Shared Commercial Hub Check (>3 distinct households sharing the exact same phone line)
  if (incoming.normalizedPhone) {
    const householdCount = phoneHouseholdCountMap.get(incoming.normalizedPhone) || 0;
    const exactSamePersonExists = existingMasters.some(
      (m) =>
        m.normalizedPhone === incoming.normalizedPhone &&
        m.canonicalName.toLowerCase() === incoming.canonicalName.toLowerCase()
    );
    if (householdCount >= 3 && !exactSamePersonExists) {
      return {
        type: "QUARANTINE",
        quarantineReason: "SHARED_HUB",
        contaminatingRecord: `Phone line ${incoming.normalizedPhone} associated with ${householdCount + 1} distinct households (Commercial Hub sandbox)`,
      };
    }
  }

  // Gate 4: Search for existing master matches
  const referenceTime = incoming.dateParsed ? incoming.dateParsed.getTime() : Date.now();

  for (const master of existingMasters) {
    const phoneMatch = Boolean(incoming.normalizedPhone && master.normalizedPhone === incoming.normalizedPhone);
    const emailMatch = Boolean(incoming.normalizedEmail && master.normalizedEmail === incoming.normalizedEmail);

    if (phoneMatch || emailMatch) {
      // Gate 4a: DNC Cluster Quarantine Propagation (Compliance Overrides Revenue)
      if (master.isTcpaOptedOut) {
        return {
          type: "QUARANTINE",
          quarantineReason: "DNC_CLUSTER",
          contaminatingRecord: `Matched existing DNC Master ID: ${master.id} (${master.normalizedPhone || master.normalizedEmail})`,
        };
      }

      // Gate 4b: 5-Year Time-Gap Demotion
      const masterTime = new Date(master.createdAt).getTime();
      const diffYears = Math.abs(referenceTime - masterTime) / (1000 * 60 * 60 * 24 * 365.25);

      if (diffYears >= 5.0) {
        return {
          type: "QUARANTINE",
          quarantineReason: "TIME_GAP_REVIEW",
          contaminatingRecord: `Time-gap match > 5 years (${diffYears.toFixed(1)} yrs) against Master ID: ${master.id}`,
        };
      }

      // Determine exact vs household match tier
      const sameName = master.canonicalName.toLowerCase() === incoming.canonicalName.toLowerCase();
      return {
        type: "MERGE_ALIAS",
        matchTier: phoneMatch ? (sameName ? "TIER_1_EXACT" : "SHARED_HOUSEHOLD") : "TIER_2_FUZZY",
        matchedMasterId: master.id,
      };
    }
  }

  // Gate 5: Low AI Confidence Score (< 0.70) routes to HITL Review Queue
  if (incoming.triageConfidence < 0.7) {
    return {
      type: "QUARANTINE",
      quarantineReason: "LOW_CONFIDENCE_HITL",
      contaminatingRecord: `Low AI triage confidence (${incoming.triageConfidence.toFixed(2)}) for "${incoming.canonicalName}"`,
    };
  }

  return {
    type: "NEW_MASTER",
  };
}
