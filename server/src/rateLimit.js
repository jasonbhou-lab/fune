import rateLimit from "express-rate-limit";

// Sign-in/sign-up brute-force protection is handled by Supabase Auth itself
// (that's the direct frontend->Supabase path, not through this server).
//
// Everything below protects *this* server. Before, only lead submission was
// limited, which left two problems: unauthenticated endpoints that write to
// the database on every call (search records an analytics_events row, pricing
// reports insert a row) could be driven in a loop to fill the database, and
// the read endpoints — /api/search in particular, which fans out into nested
// joins — could be hammered freely to exhaust CPU and Supabase quota.

const common = {
  standardHeaders: true,
  legacyHeaders: false,
};

const tooMany = { error: "Too many requests from this connection. Try again later." };

/** Backstop applied to every route. Generous — it only catches abuse. */
export const globalLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: tooMany,
});

/** Unauthenticated read endpoints that trigger DB writes or heavy queries. */
export const searchLimiter = rateLimit({
  ...common,
  windowMs: 5 * 60 * 1000,
  limit: 120,
  message: tooMany,
});

/** Unauthenticated inserts of consumer-supplied content. */
export const leadLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { error: "Too many requests submitted from this connection. Try again later." },
});

export const reportLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  message: tooMany,
});

/**
 * Writing and editing reviews. Tighter than leads because a review is public
 * content attached to a named business, so scripted posting is a reputation
 * attack rather than just noise. One person legitimately writes very few.
 */
export const reviewLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 15,
  message: { error: "Too many review submissions from this connection. Try again later." },
});

/** Authenticated bulk operations that are expensive per call. */
export const bulkLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  message: { error: "Too many bulk import/export requests. Try again later." },
});
