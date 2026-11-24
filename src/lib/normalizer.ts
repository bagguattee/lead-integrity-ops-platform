import crypto from "crypto";
import { RawInboundLead, NormalizedLead } from "../contracts/lead-contracts";

const INVALID_TOKENS = new Set([
  "idk",
  "n/a",
  "na",
  "none",
  "null",
  "nil",
  "unknown",
  "test",
  "asdf",
  "no phone",
  "fake",
  "0000000000",
  "1234567890",
  "noemail@email.com",
  "no@no.com",
]);

/**
 * Sanitizes dirty string fields, converting placeholder garbage to null.
 */
export function sanitizeString(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s || s.length === 0) return null;
  if (INVALID_TOKENS.has(s.toLowerCase())) return null;
  return s;
}

/**
 * Formats phone number into standard E.164 (+1... for US, +61... for AU).
 */
export function normalizePhone(rawPhone: unknown, locale: "US" | "AU" = "US"): string | null {
  const sanitized = sanitizeString(rawPhone);
  if (!sanitized) return null;

  // Strip all non-digits
  const digits = sanitized.replace(/\D/g, "");

  if (locale === "US") {
    // US numbers: 10 digits or 11 digits starting with 1
    if (digits.length === 10) {
      if (digits.startsWith("0") || digits.startsWith("1")) return null; // Invalid area codes
      return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      const areaCode = digits.slice(1, 4);
      if (areaCode.startsWith("0") || areaCode.startsWith("1")) return null;
      return `+${digits}`;
    }
    return null;
  }

  if (locale === "AU") {
    // Australian numbers: e.g. 0412345678 -> +61412345678, or 61412345678
    if (digits.startsWith("0") && digits.length === 10) {
      return `+61${digits.slice(1)}`;
    }
    if (digits.startsWith("61") && digits.length === 11) {
      return `+${digits}`;
    }
    if (digits.length === 9) {
      return `+61${digits}`;
    }
    return null;
  }

  return null;
}

/**
 * Validates and normalizes email strings, stripping dirty trailing periods or typo characters.
 */
export function normalizeEmail(rawEmail: unknown): string | null {
  const sanitized = sanitizeString(rawEmail);
  if (!sanitized) return null;

  const trimmed = sanitized.toLowerCase().replace(/^[<"']+|[>"',.]+$/g, "");
  // Stricter email regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) return null;

  // Domain typo corrections
  let corrected = trimmed;
  corrected = corrected.replace("@gmai.com", "@gmail.com");
  corrected = corrected.replace("@gmial.com", "@gmail.com");
  corrected = corrected.replace("@yaho.com", "@yahoo.com");
  corrected = corrected.replace("@hotmial.com", "@hotmail.com");

  return corrected;
}

/**
 * Parses US or AU formatted dates safely.
 */
export function parseLocaleDate(rawDate: unknown, locale: "US" | "AU" = "US"): Date | null {
  const sanitized = sanitizeString(rawDate);
  if (!sanitized) return null;

  // Check DD/MM/YYYY vs MM/DD/YYYY
  const slashMatch = sanitized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);

    if (locale === "AU") {
      // Day is p1, Month is p2
      const d = new Date(Date.UTC(year, p2 - 1, p1));
      if (!isNaN(d.getTime())) return d;
    } else {
      // US: Month is p1, Day is p2
      const d = new Date(Date.UTC(year, p1 - 1, p2));
      if (!isNaN(d.getTime())) return d;
    }
  }

  const standard = new Date(sanitized);
  return isNaN(standard.getTime()) ? null : standard;
}

/**
 * Computes deterministic SHA-256 payload hash for idempotency and duplicate checking.
 */
export function computePayloadHash(raw: Record<string, any>): string {
  // Sort keys deterministically
  const sortedKeys = Object.keys(raw).sort();
  const sortedObj: Record<string, any> = {};
  for (const k of sortedKeys) {
    const v = raw[k];
    if (v !== undefined && v !== null && v !== "") {
      sortedObj[k] = typeof v === "string" ? v.trim().toLowerCase() : v;
    }
  }
  return crypto.createHash("sha256").update(JSON.stringify(sortedObj)).digest("hex");
}

/**
 * Master Lead Normalizer: converts dirty input lead into normalized representation.
 */
export function normalizeLead(raw: RawInboundLead, locale: "US" | "AU" = "US"): NormalizedLead {
  const rawPhone = raw.phone || raw.phone_number;
  const rawEmail = raw.email;
  const normalizedPhone = normalizePhone(rawPhone, locale);
  const normalizedEmail = normalizeEmail(rawEmail);

  let firstName = sanitizeString(raw.first_name);
  let lastName = sanitizeString(raw.last_name);
  const fullName = sanitizeString(raw.name);

  if (!firstName && !lastName && fullName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] || null;
    lastName = parts.slice(1).join(" ") || null;
  }

  const canonicalName = fullName || [firstName, lastName].filter(Boolean).join(" ") || "Unknown Prospect";

  const rawAddress = sanitizeString(raw.address);
  const street = sanitizeString(raw.street) || rawAddress;
  const city = sanitizeString(raw.city);
  const state = sanitizeString(raw.state);
  const zip = sanitizeString(raw.zip);

  let estimatedValue = 0;
  if (raw.estimated_value) {
    const num = typeof raw.estimated_value === "number" 
      ? raw.estimated_value 
      : parseFloat(String(raw.estimated_value).replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) estimatedValue = num;
  }

  // TCPA opt-out check
  let isTcpaOptedOut = false;
  if (raw.is_dnc === true || String(raw.is_dnc).toLowerCase() === "true" || String(raw.is_dnc) === "1") {
    isTcpaOptedOut = true;
  }
  if (raw.tcpa_consent === false || String(raw.tcpa_consent).toLowerCase() === "false" || String(raw.tcpa_consent) === "0") {
    isTcpaOptedOut = true;
  }

  const payloadHash = computePayloadHash(raw as Record<string, any>);
  const dateParsed = parseLocaleDate(raw.created_at, locale);

  return {
    canonicalName,
    firstName,
    lastName,
    normalizedPhone,
    normalizedEmail,
    rawAddress,
    street,
    city,
    state,
    zip,
    estimatedValue,
    isTcpaOptedOut,
    payloadHash,
    isSharedHub: false,
    sharedHubCount: 1,
    triageScore: 1,
    triageConfidence: 1.0,
    intentCategory: "ROUTINE",
    dateParsed,
  };
}
