import crypto from "crypto";
import { RawInboundLead, NormalizedLead, SupportedLocale } from "../contracts/lead-contracts";

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
  "tbd",
  "-",
  "--",
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
 * Formats phone number into standard E.164:
 * - US: +1XXXXXXXXXX
 * - AU: +61XXXXXXXXX
 * - UK: +44XXXXXXXXXX
 */
export function normalizePhone(rawPhone: unknown, locale: SupportedLocale = "US"): string | null {
  const sanitized = sanitizeString(rawPhone);
  if (!sanitized) return null;

  const digits = sanitized.replace(/\D/g, "");
  if (!digits || /^(\d)\1{8,}$/.test(digits)) return null; // Reject repeated digits like 9999999999

  if (locale === "US") {
    if (digits.length === 10) {
      if (digits.startsWith("0") || digits.startsWith("1")) return null;
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
    // Australian landline/mobile: 0412 345 678 -> +61412345678, or 61412345678 -> +61412345678
    if (digits.startsWith("0") && digits.length === 10) {
      return `+61${digits.slice(1)}`;
    }
    if (digits.startsWith("61") && digits.length === 11) {
      return `+${digits}`;
    }
    if (digits.length === 9 && /^[23478]/.test(digits)) {
      return `+61${digits}`;
    }
    return null;
  }

  if (locale === "UK") {
    // UK mobile/landline: 07700 900123 (11 digits) -> +447700900123, or 447700900123 (12 digits)
    if (digits.startsWith("0") && (digits.length === 10 || digits.length === 11)) {
      return `+44${digits.slice(1)}`;
    }
    if (digits.startsWith("44") && (digits.length === 11 || digits.length === 12)) {
      return `+${digits}`;
    }
    if (digits.length === 10 && digits.startsWith("7")) {
      return `+44${digits}`;
    }
    return null;
  }

  return null;
}

/**
 * Validates and normalizes email strings, stripping dirty trailing punctuation and fixing common domain typos.
 */
export function normalizeEmail(rawEmail: unknown): string | null {
  const sanitized = sanitizeString(rawEmail);
  if (!sanitized) return null;

  const trimmed = sanitized.toLowerCase().replace(/^[<"'\s]+|[>"',.\s]+$/g, "");
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) return null;

  return trimmed
    .replace(/@gmai\.com$/, "@gmail.com")
    .replace(/@gmial\.com$/, "@gmail.com")
    .replace(/@yaho\.com$/, "@yahoo.com")
    .replace(/@hotmial\.com$/, "@hotmail.com")
    .replace(/@outlok\.com$/, "@outlook.com");
}

/**
 * Parses US (MM/DD/YYYY) vs AU/UK (DD/MM/YYYY) formatted dates deterministically.
 */
export function parseLocaleDate(rawDate: unknown, locale: SupportedLocale = "US"): Date | null {
  const sanitized = sanitizeString(rawDate);
  if (!sanitized) return null;

  const slashMatch = sanitized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);

    const day = locale === "US" ? p2 : p1;
    const month = locale === "US" ? p1 : p2;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (!isNaN(d.getTime()) && d.getUTCMonth() === month - 1) return d;
    }
    return null;
  }

  const standard = new Date(sanitized);
  return isNaN(standard.getTime()) ? null : standard;
}

/**
 * Computes deterministic order-independent SHA-256 payload hash for idempotency.
 */
export function computePayloadHash(raw: Record<string, unknown>): string {
  const sortedKeys = Object.keys(raw).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    const v = raw[k];
    if (v !== undefined && v !== null && v !== "") {
      sortedObj[k] = typeof v === "string" ? v.trim().toLowerCase() : v;
    }
  }
  return crypto.createHash("sha256").update(JSON.stringify(sortedObj)).digest("hex");
}

/**
 * Master Lead Normalizer: converts dirty input lead into canonical representation.
 */
export function normalizeLead(raw: RawInboundLead, locale: SupportedLocale = "US"): NormalizedLead {
  const effectiveLocale = raw.locale || locale;
  const rawPhone = raw.phone || raw.phone_number;
  const rawEmail = raw.email;
  const normalizedPhone = normalizePhone(rawPhone, effectiveLocale);
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
  if (raw.estimated_value !== undefined && raw.estimated_value !== null) {
    const num =
      typeof raw.estimated_value === "number"
        ? raw.estimated_value
        : parseFloat(String(raw.estimated_value).replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) estimatedValue = num;
  }

  let isTcpaOptedOut = false;
  if (
    raw.is_dnc === true ||
    String(raw.is_dnc).toLowerCase() === "true" ||
    String(raw.is_dnc).toLowerCase() === "yes" ||
    String(raw.is_dnc) === "1"
  ) {
    isTcpaOptedOut = true;
  }
  if (
    raw.tcpa_consent === false ||
    String(raw.tcpa_consent).toLowerCase() === "false" ||
    String(raw.tcpa_consent).toLowerCase() === "no" ||
    String(raw.tcpa_consent) === "0"
  ) {
    isTcpaOptedOut = true;
  }

  const payloadHash = computePayloadHash(raw as Record<string, unknown>);
  const dateParsed = parseLocaleDate(raw.created_at, effectiveLocale);

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
