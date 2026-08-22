import { createRouter } from "../router.js";
import { supabase, requireSupabase } from "../supabaseClient.js";
import {
  OFFERING_COLUMNS,
  LOCATION_COLUMNS,
  ORG_COLUMNS,
  REVIEW_COLUMNS,
  findLocation,
  findOffering,
  appendAudit,
  trackEvent,
  reviewStatsFor,
} from "../db.js";
import { geocodeZip } from "../geo.js";
import {
  serializeForSearch,
  serializeOfferingDetail,
  serializeLocation,
  thirdPartyCell,
  priceDisplay,
  ratingSummary,
  serializeReview,
  ATTRIBUTE_KEYS,
} from "../serialize.js";
import { requireAuth, optionalAuth } from "../auth.js";
import { leadLimiter, reportLimiter, searchLimiter, reviewLimiter } from "../rateLimit.js";
import { asString, asEnum, asEmail, asPhone, asNumber, asStringArray, ValidationError, LIMITS } from "../validate.js";

const router = createRouter();
router.use((req, res, next) => (requireSupabase(res) ? next() : undefined));

// Hard ceilings on how much work one request can ask the database and this
// process to do. Search previously selected every published offering with two
// levels of nested joins and filtered the whole set in memory, with no cap on
// either the scan or the response — cost grew without bound as the catalog
// grew, and it was reachable unauthenticated.
const MAX_SEARCH_SCAN = 2000;
const MAX_SEARCH_RESULTS = 200;
const MAX_COMPARE_IDS = 4;

// These mirror the option lists the app actually sends — LeadFormScreen's
// CONTACT_METHODS, WelcomeScreen's NEED_OPTIONS, and OfferDetailScreen's
// REPORT_REASONS. Keep them in sync if those lists change. "timeframe" has no
// picker in the UI yet, so it stays bounded free text rather than an enum.
const CONTACT_METHODS = ["call", "text", "email", "no_preference"];
const NEED_TYPES = ["immediate_need", "planning_ahead", "research"];
const REPORT_REASONS = ["price_seems_wrong", "listing_outdated", "other"];

// How many organizations the signup picker will list at once.
const MAX_ORG_DIRECTORY = 50;

// Reviews are the one list that grows without limit for a popular provider, so
// it is paged rather than capped-and-truncated.
const REVIEWS_PAGE_SIZE = 10;
const MAX_REVIEWS_PAGE_SIZE = 50;
const REVIEW_SORTS = ["recent", "highest", "lowest"];
const REVIEW_REPORT_REASONS = ["spam", "off_topic", "not_a_customer", "offensive", "privacy", "other"];

/**
 * Public reviews for one organization, plus the rating summary.
 *
 * Unauthenticated because reviews are public, like Google's. optionalAuth is
 * used only so a signed-in reader's own review can be marked `mine`, and so the
 * app knows whether to offer "write a review" or "edit yours" — a failure to
 * resolve the token degrades to anonymous rather than erroring.
 */
router.get("/orgs/:orgId/reviews", searchLimiter, optionalAuth, async (req, res) => {
  const sort = asEnum(req.query.sort, REVIEW_SORTS, { field: "sort" }) || "recent";
  const ratingFilter = asNumber(req.query.rating, { field: "rating", min: 1, max: 5 });
  const page = asNumber(req.query.page, { field: "page", min: 0, max: 1000 }) || 0;
  const size = asNumber(req.query.pageSize, { field: "pageSize", min: 1, max: MAX_REVIEWS_PAGE_SIZE }) || REVIEWS_PAGE_SIZE;

  const { data: org, error: orgError } = await supabase
    .from("orgs")
    .select(ORG_COLUMNS)
    .eq("id", req.params.orgId)
    .maybeSingle();
  if (orgError || !org) return res.status(404).json({ error: "Organization not found." });

  let query = supabase
    .from("reviews")
    .select(`${REVIEW_COLUMNS}, author:profiles!reviews_author_id_fkey(name)`, { count: "exact" })
    // Admin takedowns are invisible here, and they are already excluded from the
    // stats view, so the list and the average always agree.
    .eq("org_id", org.id)
    .eq("status", "published");

  if (ratingFilter !== null) query = query.eq("rating", Math.trunc(ratingFilter));

  if (sort === "highest") query = query.order("rating", { ascending: false }).order("created_at", { ascending: false });
  else if (sort === "lowest") query = query.order("rating", { ascending: true }).order("created_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const from = Math.trunc(page) * Math.trunc(size);
  const { data, error, count } = await query.range(from, from + Math.trunc(size) - 1);
  if (error) return res.status(500).json({ error: "Couldn't load reviews." });

  const stats = await reviewStatsFor([org.id]);
  const viewerId = req.user?.id || null;

  // Asked for directly rather than picked out of the page above. The viewer's
  // own review may well not be on this page — page 2, or filtered out by a star
  // filter — and inferring "you haven't reviewed this" from its absence would
  // offer them a "write a review" button that then silently overwrote the review
  // they had already left.
  let myReview = null;
  if (viewerId) {
    const { data: mine } = await supabase
      .from("reviews")
      .select("id, rating, body")
      .eq("org_id", org.id)
      .eq("author_id", viewerId)
      .maybeSingle();
    if (mine) myReview = { id: mine.id, rating: mine.rating, body: mine.body || "" };
  }

  res.json({
    org: { id: org.id, name: org.name, verified: org.verified },
    summary: ratingSummary(stats.get(org.id)),
    // The filtered total, so the app knows whether another page exists.
    matched: count ?? 0,
    page: Math.trunc(page),
    pageSize: Math.trunc(size),
    reviews: (data || []).map((r) => serializeReview(r, { viewerId })),
    myReview,
  });
});

/** The signed-in consumer's own review of an organization, if any. */
router.get("/orgs/:orgId/reviews/mine", requireAuth("consumer"), async (req, res) => {
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .eq("org_id", req.params.orgId)
    .eq("author_id", req.user.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Couldn't load your review." });
  if (!data) return res.json(null);
  res.json({ id: data.id, rating: data.rating, body: data.body || "", status: data.status });
});

/**
 * Write or replace the consumer's review of an organization.
 *
 * Upsert rather than insert: one review per person per organization is enforced
 * by a unique constraint, and posting again is how Google's "edit your review"
 * works, so a second POST should update rather than 409.
 */
router.post("/orgs/:orgId/reviews", reviewLimiter, requireAuth("consumer"), async (req, res) => {
  const rating = asNumber(req.body?.rating, { field: "rating", min: 1, max: 5 });
  if (rating === null) throw new ValidationError("rating is required.");
  if (!Number.isInteger(rating)) throw new ValidationError("rating must be a whole number of stars.");
  const body = asString(req.body?.body, { field: "body", max: LIMITS.message, allowEmpty: true });

  const { data: org, error: orgError } = await supabase
    .from("orgs")
    .select("id")
    .eq("id", req.params.orgId)
    .maybeSingle();
  if (orgError || !org) return res.status(404).json({ error: "Organization not found." });

  const { data, error } = await supabase
    .from("reviews")
    .upsert(
      { org_id: org.id, author_id: req.user.id, rating, body: body || null },
      { onConflict: "org_id,author_id" }
    )
    .select(`${REVIEW_COLUMNS}, author:profiles!reviews_author_id_fkey(name)`)
    .single();
  if (error) return res.status(500).json({ error: "Couldn't save your review." });

  // An edit does not clear an existing provider response, matching Google, where
  // the reply stays attached to the review it answered.
  res.status(201).json(serializeReview(data, { viewerId: req.user.id }));
});

/** Delete the consumer's own review. Scoped by author so it can only be theirs. */
router.delete("/orgs/:orgId/reviews/mine", requireAuth("consumer"), async (req, res) => {
  const { data, error } = await supabase
    .from("reviews")
    .delete()
    .eq("org_id", req.params.orgId)
    .eq("author_id", req.user.id)
    .select("id")
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Couldn't remove your review." });
  if (!data) return res.status(404).json({ error: "You haven't reviewed this provider." });
  res.json({ ok: true });
});

/**
 * Report a review. Anyone can, signed in or not, because the person most likely
 * to spot a fake review about a funeral home is a member of the public reading
 * it, and requiring an account would suppress exactly that.
 */
router.post("/reviews/:id/report", reportLimiter, optionalAuth, async (req, res) => {
  const reason = asEnum(req.body?.reason, REVIEW_REPORT_REASONS, { field: "reason", required: true });
  const details = asString(req.body?.details, { field: "details", max: LIMITS.message, allowEmpty: true });

  const { data: review, error: findError } = await supabase
    .from("reviews")
    .select("id")
    .eq("id", req.params.id)
    .eq("status", "published")
    .maybeSingle();
  if (findError || !review) return res.status(404).json({ error: "Review not found." });

  // One open report per person per review. Without this, a single account could
  // file the same complaint repeatedly and bury the moderation queue — and
  // because a queue full of duplicates looks like a review many people object
  // to, it also distorts the judgement it exists to inform. Anonymous reports
  // cannot be deduplicated this way; the per-connection rate limit is all that
  // bounds those.
  if (req.user?.id) {
    const { data: existing } = await supabase
      .from("review_reports")
      .select("id")
      .eq("review_id", review.id)
      .eq("reporter_id", req.user.id)
      .eq("status", "open")
      .maybeSingle();
    // Same response as a fresh report: whether a previous one is still open is
    // moderation state, not the reporter's business.
    if (existing) return res.status(201).json({ ok: true });
  }

  const { error } = await supabase.from("review_reports").insert({
    review_id: review.id,
    reporter_id: req.user?.id || null,
    reason,
    details: details || "",
  });
  if (error) return res.status(500).json({ error: "Couldn't submit that report." });

  // Deliberately says nothing about what happens next: a reporter learning the
  // outcome would tell them whether the review was judged fake, which is not
  // theirs to know.
  res.status(201).json({ ok: true });
});

/**
 * Organization names, for the "which organization do you work for?" picker on
 * the provider signup form.
 *
 * Unauthenticated by necessity: it is used before the account exists. That is
 * acceptable because it returns only what the public search results already
 * show — an organization's name and whether it is verified — and nothing that
 * depends on being a member. It is rate limited like search, and the response
 * is capped, so it cannot be used to walk the whole table cheaply.
 *
 * Selecting from this list does NOT grant access to the organization; it records
 * a claim for a platform admin to approve. See handle_new_user() and
 * claim_account_type() in supabase/schema.sql.
 */
router.get("/orgs/directory", searchLimiter, async (req, res) => {
  const q = asString(req.query.q, { field: "q", max: LIMITS.query, allowEmpty: true });

  let query = supabase.from("orgs").select("id, name, verified").order("name").limit(MAX_ORG_DIRECTORY);
  if (q) {
    // Escape the LIKE metacharacters so a query of "%" doesn't turn into
    // "match everything" and a literal underscore stays literal.
    query = query.ilike("name", `%${q.replace(/([\\%_])/g, "\\$1")}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Couldn't load organizations." });
  res.json(data);
});

router.get("/categories", async (_req, res) => {
  const { data, error } = await supabase.from("taxonomy").select("id, label, examples");
  if (error) return res.status(500).json({ error: "Couldn't load categories." });
  res.json(data);
});

router.get("/search", searchLimiter, async (req, res) => {
  const zip = asString(req.query.zip, { field: "ZIP code", max: LIMITS.zip });
  const category = asString(req.query.category, { field: "Category", max: LIMITS.shortText });
  const q = asString(req.query.q, { field: "Search text", max: LIMITS.query });
  const verifiedOnly = req.query.verifiedOnly === "true";

  const effectiveZip = zip || "77494";
  const origin = geocodeZip(effectiveZip);
  await trackEvent("search", { zip: effectiveZip, category: category || null });

  let query = supabase
    .from("offerings")
    .select(`${OFFERING_COLUMNS}, location:locations(${LOCATION_COLUMNS}, org:orgs(${ORG_COLUMNS}))`)
    .eq("status", "published");

  // Push what the database can do down to the database instead of fetching
  // everything and discarding most of it here.
  if (category) query = query.eq("category", category);
  query = query.limit(MAX_SEARCH_SCAN);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Search failed." });

  let results = data
    .map(({ location, ...offering }) => {
      if (!location || !location.org) return null;
      const { org, ...loc } = location;
      return { offering, location: loc, org };
    })
    .filter(Boolean);

  if (verifiedOnly) {
    results = results.filter((r) => r.org.verified);
  }
  for (const key of ATTRIBUTE_KEYS) {
    if (req.query[key] === "true") {
      results = results.filter((r) => Boolean(r.location[key]));
    }
  }
  if (q) {
    const needle = q.toLowerCase();
    results = results.filter(
      (r) => r.offering.name.toLowerCase().includes(needle) || r.org.name.toLowerCase().includes(needle)
    );
  }

  const serialized = results
    .map(({ offering, location, org }) => serializeForSearch({ offering, location, org, origin }))
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999));

  const page = serialized.slice(0, MAX_SEARCH_RESULTS);

  // Ratings are attached after paging, so the stats query is bounded by what is
  // actually being returned rather than by everything that matched.
  const stats = await reviewStatsFor(page.map((r) => r.orgId));

  res.json({
    origin,
    count: page.length,
    truncated: serialized.length > page.length,
    results: page.map((r) => ({ ...r, rating: ratingSummary(stats.get(r.orgId)) })),
  });
});

router.get("/locations/:id", async (req, res) => {
  const found = await findLocation(req.params.id);
  if (!found) return res.status(404).json({ error: "Provider location not found." });

  const { data, error } = await supabase
    .from("offerings")
    .select(OFFERING_COLUMNS)
    .eq("location_id", found.location.id)
    .eq("status", "published");
  if (error) return res.status(500).json({ error: "Couldn't load offerings." });

  const offerings = data.map((offering) => serializeOfferingDetail({ offering, ...found }));
  res.json({ ...serializeLocation(found), offerings });
});

router.get("/offerings/:id", async (req, res) => {
  const found = await findOffering(req.params.id);
  if (!found) return res.status(404).json({ error: "Offering not found." });
  await trackEvent("offer_view", { offeringId: found.offering.id, category: found.offering.category });

  const stats = await reviewStatsFor([found.org.id]);
  res.json({ ...serializeOfferingDetail(found), rating: ratingSummary(stats.get(found.org.id)) });
});

router.get("/compare", async (req, res) => {
  const ids = asString(req.query.ids, { field: "Offering ids", max: LIMITS.shortText * 2 }) || "";
  const idList = ids
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE_IDS);

  const items = (await Promise.all(idList.map((id) => findOffering(id)))).filter(Boolean);
  if (items.length === 0) {
    return res.status(400).json({ error: "No valid offering ids provided." });
  }
  await trackEvent("comparison_view", { offeringIds: items.map(({ offering }) => offering.id) });

  const rows = items.map(({ offering, location, org }) => ({
    offeringId: offering.id,
    providerName: org.name,
    locationId: location.id,
    name: offering.name,
    price: priceDisplay(offering),
    transferPreparation: offering.included && offering.included.length > 0 ? "Included" : "Not included",
    thirdParty: thirdPartyCell(offering),
  }));

  const partialTotal = items.some(
    ({ offering }) =>
      offering.priceType === "quote_required" || (offering.thirdParty || []).some((t) => t.status === "unknown")
  );

  res.json({
    rows,
    partialTotal,
    reason: partialTotal
      ? "At least one selected offering requires a quote or has an unknown mandatory charge."
      : null,
  });
});

router.post("/leads", leadLimiter, optionalAuth, async (req, res) => {
  const body = req.body || {};

  // This endpoint takes consumer PII while unauthenticated. Every field is
  // now type-checked and length-capped: previously any of them could be an
  // arbitrary-length string (or a nested object), and contact_method /
  // timeframe / need_type were free text written straight into the row.
  const firstName = asString(body.firstName, { field: "First name", max: LIMITS.name, required: true });
  const lastName = asString(body.lastName, { field: "Last name", max: LIMITS.name, required: true });
  const phone = asPhone(body.phone, { field: "Phone number" });
  const email = asEmail(body.email, { field: "Email" });
  const contactMethod = asEnum(body.contactMethod, CONTACT_METHODS, { field: "Contact method" }) || "no_preference";
  const needType = asEnum(body.needType, NEED_TYPES, { field: "Need type", required: true });
  const timeframe = asString(body.timeframe, { field: "Timeframe", max: LIMITS.shortText });
  const message = asString(body.message, { field: "Message", max: LIMITS.message, allowEmpty: true }) || "";
  const clientRequestId = asString(body.clientRequestId, { field: "Client request id", max: LIMITS.id });
  const locationId = asString(body.locationId, { field: "Location id", max: LIMITS.id, required: true });
  const offeringId = asString(body.offeringId, { field: "Offering id", max: LIMITS.id });

  if (!phone && !email) return res.status(400).json({ error: "A phone number or email is required." });
  if (!body.consentToContact) return res.status(400).json({ error: "Consent to contact is required to submit a request." });

  const found = await findLocation(locationId);
  if (!found) return res.status(404).json({ error: "Provider location not found." });

  if (clientRequestId) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id, status, createdAt:created_at")
      .eq("client_request_id", clientRequestId)
      .maybeSingle();
    if (existing) {
      return res
        .status(200)
        .json({ leadId: existing.id, status: existing.status, providerName: found.org.name, createdAt: existing.createdAt, duplicate: true });
    }
  }

  let offeringSnapshot = null;
  if (offeringId) {
    const offeringFound = await findOffering(offeringId);
    if (offeringFound) offeringSnapshot = offeringFound.offering;
  }

  const now = new Date().toISOString();
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      client_request_id: clientRequestId || null,
      consumer_id: req.user?.id || null,
      location_id: found.location.id,
      offering_id: offeringSnapshot ? offeringSnapshot.id : null,
      offering_snapshot: offeringSnapshot,
      first_name: firstName,
      last_name: lastName,
      contact_method: contactMethod,
      phone: phone || null,
      email: email || null,
      need_type: needType,
      timeframe: timeframe || null,
      message,
      consent_to_contact: true,
      marketing_opt_in: Boolean(body.marketingOptIn),
      consent_version: "v2.1",
      consent_timestamp: now,
      status: "new",
    })
    .select("id, status, createdAt:created_at")
    .single();
  if (error) return res.status(500).json({ error: "Couldn't submit your request." });

  await supabase.from("lead_status_history").insert({ lead_id: lead.id, status: "new", at: now });
  await trackEvent("lead_submitted", { leadId: lead.id, locationId: found.location.id, offeringId: offeringSnapshot?.id || null });

  const { data: providerProfiles } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "provider")
    .eq("org_id", found.org.id);
  for (const p of providerProfiles || []) {
    if (p.email) await appendAudit({ actor: "System", action: "lead_email_notification", entity: lead.id, to: p.email });
  }

  res.status(201).json({ leadId: lead.id, status: lead.status, providerName: found.org.name, createdAt: lead.createdAt });
});

router.get("/leads", requireAuth("consumer"), async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .select("id, status, createdAt:created_at, offeringSnapshot:offering_snapshot, location:locations(org:orgs(name))")
    .eq("consumer_id", req.user.id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "Couldn't load your requests." });

  const leads = data.map((l) => ({
    id: l.id,
    providerName: l.location?.org?.name || "Unknown provider",
    offeringName: l.offeringSnapshot?.name || null,
    status: l.status,
    createdAt: l.createdAt,
  }));
  res.json(leads);
});

router.get("/saved", requireAuth("consumer"), async (req, res) => {
  const { data: savedRows, error: savedError } = await supabase
    .from("saved_providers")
    .select(`location:locations(${LOCATION_COLUMNS}, org:orgs(${ORG_COLUMNS}))`)
    .eq("consumer_id", req.user.id);
  if (savedError) return res.status(500).json({ error: "Couldn't load saved providers." });

  const providers = savedRows
    .filter((r) => r.location && r.location.org)
    .map((r) => {
      const { org, ...location } = r.location;
      return serializeLocation({ location, org });
    });

  const { data: comparisons, error: compError } = await supabase
    .from("saved_comparisons")
    .select("id, name, offeringIds:offering_ids, createdAt:created_at")
    .eq("consumer_id", req.user.id)
    .order("created_at", { ascending: false });
  if (compError) return res.status(500).json({ error: "Couldn't load saved comparisons." });

  res.json({ providers, comparisons });
});

router.post("/saved/providers", requireAuth("consumer"), async (req, res) => {
  const locationId = asString(req.body?.locationId, { field: "Location id", max: LIMITS.id, required: true });
  const found = await findLocation(locationId);
  if (!found) return res.status(404).json({ error: "Provider location not found." });
  const { error } = await supabase
    .from("saved_providers")
    .upsert({ consumer_id: req.user.id, location_id: found.location.id }, { onConflict: "consumer_id,location_id", ignoreDuplicates: true });
  if (error) return res.status(500).json({ error: "Couldn't save provider." });
  res.status(201).json({ saved: true });
});

router.delete("/saved/providers/:locationId", requireAuth("consumer"), async (req, res) => {
  const { error } = await supabase
    .from("saved_providers")
    .delete()
    .eq("consumer_id", req.user.id)
    .eq("location_id", req.params.locationId);
  if (error) return res.status(500).json({ error: "Couldn't remove saved provider." });
  res.json({ saved: false });
});

router.post("/saved/comparisons", requireAuth("consumer"), async (req, res) => {
  const name = asString(req.body?.name, { field: "Name", max: LIMITS.name, required: true });
  const offeringIds = asStringArray(req.body?.offeringIds, {
    field: "Offering ids",
    maxItems: LIMITS.comparisonItems,
    maxItemLength: LIMITS.id,
    required: true,
  });

  const { data, error } = await supabase
    .from("saved_comparisons")
    .insert({ consumer_id: req.user.id, name, offering_ids: offeringIds })
    .select("id, name, offeringIds:offering_ids, createdAt:created_at")
    .single();
  if (error) return res.status(500).json({ error: "Couldn't save comparison." });
  res.status(201).json(data);
});

router.post("/saved/comparisons/:id/duplicate", requireAuth("consumer"), async (req, res) => {
  const { data: original, error: findError } = await supabase
    .from("saved_comparisons")
    .select("id, name, offeringIds:offering_ids")
    .eq("id", req.params.id)
    .eq("consumer_id", req.user.id)
    .maybeSingle();
  if (findError || !original) return res.status(404).json({ error: "Saved comparison not found." });

  const { data: copy, error } = await supabase
    .from("saved_comparisons")
    .insert({
      consumer_id: req.user.id,
      name: `${original.name} (copy)`.slice(0, LIMITS.name),
      offering_ids: original.offeringIds,
    })
    .select("id, name, offeringIds:offering_ids, createdAt:created_at")
    .single();
  if (error) return res.status(500).json({ error: "Couldn't duplicate comparison." });
  res.status(201).json(copy);
});

router.delete("/saved/comparisons/:id", requireAuth("consumer"), async (req, res) => {
  const { error } = await supabase.from("saved_comparisons").delete().eq("id", req.params.id).eq("consumer_id", req.user.id);
  if (error) return res.status(500).json({ error: "Couldn't remove comparison." });
  res.json({ removed: true });
});

router.post("/reports", reportLimiter, optionalAuth, async (req, res) => {
  const offeringId = asString(req.body?.offeringId, { field: "Offering id", max: LIMITS.id, required: true });
  const reason = asEnum(req.body?.reason, REPORT_REASONS, { field: "Reason", required: true });
  const details = asString(req.body?.details, { field: "Details", max: LIMITS.details, allowEmpty: true }) || "";

  const found = await findOffering(offeringId);
  if (!found) return res.status(404).json({ error: "Offering not found." });

  const { data: report, error } = await supabase
    .from("pricing_reports")
    .insert({
      offering_id: found.offering.id,
      offering_name: found.offering.name,
      provider_name: found.org.name,
      reason,
      details,
      consumer_id: req.user?.id || null,
      status: "open",
    })
    .select(
      "id, offeringId:offering_id, offeringName:offering_name, providerName:provider_name, reason, details, status, createdAt:created_at"
    )
    .single();
  if (error) return res.status(500).json({ error: "Couldn't submit report." });
  res.status(201).json(report);
});

export default router;
