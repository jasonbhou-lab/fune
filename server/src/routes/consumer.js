import { createRouter } from "../router.js";
import { supabase, requireSupabase } from "../supabaseClient.js";
import { OFFERING_COLUMNS, LOCATION_COLUMNS, ORG_COLUMNS, findLocation, findOffering, appendAudit, trackEvent } from "../db.js";
import { geocodeZip } from "../geo.js";
import {
  serializeForSearch,
  serializeOfferingDetail,
  serializeLocation,
  thirdPartyCell,
  priceDisplay,
  ATTRIBUTE_KEYS,
} from "../serialize.js";
import { requireAuth, optionalAuth } from "../auth.js";
import { leadLimiter, reportLimiter, searchLimiter } from "../rateLimit.js";
import { asString, asEnum, asEmail, asPhone, asStringArray, LIMITS } from "../validate.js";

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
  res.json({
    origin,
    count: page.length,
    truncated: serialized.length > page.length,
    results: page,
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
  res.json(serializeOfferingDetail(found));
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
