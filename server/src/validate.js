// Shared request-input validation.
//
// Every value in here originates from an untrusted client. Two things matter:
// type (a JSON body can send an object or array where a string is expected,
// which then reaches PostgREST as something it wasn't meant to be) and length
// (nothing capped the size of free-text fields before, so any client could
// write megabytes per request into leads/reports/taxonomy indefinitely).

export const LIMITS = {
  name: 120,
  email: 254, // RFC 5321 maximum
  phone: 40,
  shortText: 200,
  message: 4000,
  details: 4000,
  id: 64,
  zip: 16,
  query: 200,
  csv: 2 * 1024 * 1024, // 2 MB of CSV text
  comparisonItems: 20,
};

// Deliberately permissive — the goal is to reject obvious junk and anything
// that isn't plausibly an address, not to police valid-but-unusual addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
// Digits plus the usual formatting characters; 7-20 digits after stripping.
const PHONE_RE = /^[+()\-.\s0-9]{7,40}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Coerce an untrusted value to a trimmed string, rejecting non-primitives.
 * Objects/arrays/functions are refused outright rather than stringified, so
 * `{"name":{"$ne":null}}` style payloads can't slip through as "[object Object]".
 */
export function asString(value, { field, max, required = false, allowEmpty = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} is required.`);
    return null;
  }
  if (typeof value === "number" || typeof value === "boolean") value = String(value);
  if (typeof value !== "string") throw new ValidationError(`${field} must be text.`);

  const trimmed = value.trim();
  if (!trimmed && !allowEmpty) {
    if (required) throw new ValidationError(`${field} is required.`);
    return null;
  }
  if (max && trimmed.length > max) {
    throw new ValidationError(`${field} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

export function asEmail(value, { field = "Email", required = false } = {}) {
  const s = asString(value, { field, max: LIMITS.email, required });
  if (s === null) return null;
  if (!EMAIL_RE.test(s)) throw new ValidationError(`${field} must be a valid email address.`);
  return s.toLowerCase();
}

export function asPhone(value, { field = "Phone number", required = false } = {}) {
  const s = asString(value, { field, max: LIMITS.phone, required });
  if (s === null) return null;
  if (!PHONE_RE.test(s) || (s.match(/\d/g) || []).length < 7) {
    throw new ValidationError(`${field} must be a valid phone number.`);
  }
  return s;
}

/** Slug-style identifiers (taxonomy ids, which are client-chosen text keys). */
export function asSlug(value, { field = "Id", required = false } = {}) {
  const s = asString(value, { field, max: LIMITS.id, required });
  if (s === null) return null;
  if (!ID_RE.test(s)) {
    throw new ValidationError(`${field} may only contain letters, numbers, hyphens, and underscores.`);
  }
  return s;
}

export function asEnum(value, allowed, { field, required = false } = {}) {
  const s = asString(value, { field, max: LIMITS.shortText, required });
  if (s === null) return null;
  if (!allowed.includes(s)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return s;
}

/** Bounded array of strings — used for offering ids, included/excluded lists. */
export function asStringArray(value, { field, maxItems, maxItemLength = LIMITS.shortText, required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} is required.`);
    return [];
  }
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be a list.`);
  if (required && value.length === 0) throw new ValidationError(`${field} must have at least one entry.`);
  if (maxItems && value.length > maxItems) {
    throw new ValidationError(`${field} may have at most ${maxItems} entries.`);
  }
  return value.map((item, i) =>
    asString(item, { field: `${field}[${i}]`, max: maxItemLength, required: true })
  );
}

export function asNumber(value, { field, min, max } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number.`);
  if (min !== undefined && n < min) throw new ValidationError(`${field} must be at least ${min}.`);
  if (max !== undefined && n > max) throw new ValidationError(`${field} must be at most ${max}.`);
  return n;
}

/** ISO-8601-ish date string, normalized. Rejects unparseable input. */
export function asDate(value, { field, required = false } = {}) {
  const s = asString(value, { field, max: 64, required });
  if (s === null) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new ValidationError(`${field} must be a valid date.`);
  return new Date(t).toISOString();
}

/**
 * Express error middleware that turns ValidationError into a 400 with the
 * (safe, author-written) message, and anything else into an opaque 500.
 */
export function validationErrorHandler(err, _req, res, next) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
}
