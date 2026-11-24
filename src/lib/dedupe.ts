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
 * 1. QUARANTINED (Invalid shape, DNC Cluster contamination, Shared Commercial Hub >3 households, Time-Gap >5 years).
 * 2. MERGED into an existing Master (Exact Phone or Email match).
 * 3. Created as a NEW Master.
 */
export function classifyLeadDedupe(
  incoming: NormalizedLead,
  existingMasters: ExistingLeadRecord[],
  phoneHouseholdCountMap: Map<string, number>
): DedupeClassification {
  // Gate 1: Check minimum valid shape (Must have at least a valid phone OR valid email)
  if (!incoming.normalizedPhone && !incoming.normalizedEmail) {
    return {
      type: "QUARANTINE",
      quarantineReason: "INVALID_SHAPE",
      contaminatingRecord: "Missing both valid E.164 phone and normalized email",
    };
  }

  // Gate 2: TCPA Opt-Out Check
  if (incoming.isTcpaOptedOut) {
    return {
      type: "QUARANTINE",
      quarantineReason: "DNC_CLUSTER",
      contaminatingRecord: `Inbound lead flagged as DNC/TCPA Revoked: ${incoming.normalizedPhone || incoming.normalizedEmail}`,
    };
  }

  // Gate 3: Shared Commercial Hub Check (>3 distinct names/households sharing the exact same phone line)
  if (incoming.normalizedPhone) {
    const householdCount = phoneHouseholdCountMap.get(incoming.normalizedPhone) || 0;
    if (householdCount >= 3) {
      return {
        type: "QUARANTINE",
        quarantineReason: "SHARED_HUB",
        contaminatingRecord: `Phone line ${incoming.normalizedPhone} associated with ${householdCount + 1} distinct households (Commercial Hub sandbox)`,
      };
    }
  }

  // Gate 4: Search for existing master matches
  for (const master of existingMasters) {
    const phoneMatch = incoming.normalizedPhone && master.normalizedPhone === incoming.normalizedPhone;
    const emailMatch = incoming.normalizedEmail && master.normalizedEmail === incoming.normalizedEmail;

    if (phoneMatch || emailMatch) {
      // Gate 4a: DNC Cluster Quarantine Propagation
      // If the matched master was TCPA opted out, we quarantine the inbound lead to prevent illegal outreach
      if (master.isTcpaOptedOut) {
        return {
          type: "QUARANTINE",
          quarantineReason: "DNC_CLUSTER",
          contaminatingRecord: `Matched existing DNC Master ID: ${master.id} (${master.normalizedPhone || master.normalizedEmail})`,
        };
      }

      // Gate 4b: 5-Year Time-Gap Demotion
      // If contact occurred > 5 years ago (1825 days), demote to HITL review rather than auto-merging blindly
      const now = new Date().getTime();
      const masterCreated = new Date(master.createdAt).getTime();
      const diffYears = (now - masterCreated) / (1000 * 60 * 60 * 24 * 365.25);

      if (diffYears >= 5.0) {
        return {
          type: "QUARANTINE",
          quarantineReason: "TIME_GAP_REVIEW",
          contaminatingRecord: `Time-gap match > 5 years (${diffYears.toFixed(1)} yrs) against Master ID: ${master.id}`,
        };
      }

      // Exact match -> Merge as Alias
      return {
        type: "MERGE_ALIAS",
        matchTier: phoneMatch ? "TIER_1_EXACT" : "TIER_2_FUZZY",
        matchedMasterId: master.id,
      };
    }
  }

  // Gate 5: Check low confidence AI triage if already tagged
  if (incoming.triageConfidence < 0.70) {
    return {
      type: "QUARANTINE",
      quarantineReason: "LOW_CONFIDENCE_HITL",
      contaminatingRecord: `Low AI confidence score: ${incoming.triageConfidence.toFixed(2)}`,
    };
  }

  return {
    type: "NEW_MASTER",
  };
}
