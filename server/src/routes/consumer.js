import { Router } from "express";
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
import { leadLimiter } from "../rateLimit.js";

const router = Router();
router.use((req, res, next) => (requireSupabase(res) ? next() : undefined));

router.get("/categories", async (_req, res) => {
  const { data, error } = await supabase.from("taxonomy").select("id, label, examples");
  if (error) return res.status(500).json({ error: "Couldn't load categories." });
  res.json(data);
});

router.get("/search", async (req, res) => {
  const { zip, category, q, verifiedOnly } = req.query;
  const origin = geocodeZip(zip || "77494");
  await trackEvent("search", { zip: zip || "77494", category: category || null });

  const { data, error } = await supabase
    .from("offerings")
    .select(`${OFFERING_COLUMNS}, location:locations(${LOCATION_COLUMNS}, org:orgs(${ORG_COLUMNS}))`)
    .eq("status", "published");
  if (error) return res.status(500).json({ error: "Search failed." });

  let results = data
    .map(({ location, ...offering }) => {
      if (!location || !location.org) return null;
      const { org, ...loc } = location;
      return { offering, location: loc, org };
    })
    .filter(Boolean);

  if (category) {
    results = results.filter((r) => r.offering.category === category);
  }
  if (verifiedOnly === "true") {
    results = results.filter((r) => r.org.verified);
  }
  for (const key of ATTRIBUTE_KEYS) {
    if (req.query[key] === "true") {
      results = results.filter((r) => Boolean(r.location[key]));
    }
  }
  if (q) {
    const needle = String(q).toLowerCase();
    results = results.filter(
      (r) => r.offering.name.toLowerCase().includes(needle) || r.org.name.toLowerCase().includes(needle)
    );
  }

  const serialized = results
    .map(({ offering, location, org }) => serializeForSearch({ offering, location, org, origin }))
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999));

  res.json({ origin, count: serialized.length, results: serialized });
});

router.get("/locations/:id", async (req, res) => {
  const found = await findLocation(req.params.id);
  if (!found) return res.status(404).json({ error: "Provider location not found." });

  const { data, error } = await supabase
    .from("offerings")
    .select(OFFERING_COLUMNS)
    .eq("location_id", req.params.id)
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
  const ids = String(req.query.ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  const items = (await Promise.all(ids.map((id) => findOffering(id)))).filter(Boolean);
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
  const {
    locationId,
    offeringId,
    firstName,
    lastName,
    contactMethod,
    phone,
    email,
    needType,
    timeframe,
    message,
    consentToContact,
    marketingOptIn,
    clientRequestId,
  } = req.body || {};

  if (!firstName || !lastName) return res.status(400).json({ error: "First and last name are required." });
  if (!phone && !email) return res.status(400).json({ error: "A phone number or email is required." });
  if (!consentToContact) return res.status(400).json({ error: "Consent to contact is required to submit a request." });
  if (!needType) return res.status(400).json({ error: "Need type is required." });

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
      offering_id: offeringId || null,
      offering_snapshot: offeringSnapshot,
      first_name: firstName,
      last_name: lastName,
      contact_method: contactMethod || "no_preference",
      phone: phone || null,
      email: email || null,
      need_type: needType,
      timeframe: timeframe || null,
      message: message || "",
      consent_to_contact: true,
      marketing_opt_in: Boolean(marketingOptIn),
      consent_version: "v2.1",
      consent_timestamp: now,
      status: "new",
    })
    .select("id, status, createdAt:created_at")
    .single();
  if (error) return res.status(500).json({ error: "Couldn't submit your request." });

  await supabase.from("lead_status_history").insert({ lead_id: lead.id, status: "new", at: now });
  await trackEvent("lead_submitted", { leadId: lead.id, locationId: found.location.id, offeringId: offeringId || null });

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
  const { locationId } = req.body || {};
  if (!(await findLocation(locationId))) return res.status(404).json({ error: "Provider location not found." });
  const { error } = await supabase
    .from("saved_providers")
    .upsert({ consumer_id: req.user.id, location_id: locationId }, { onConflict: "consumer_id,location_id", ignoreDuplicates: true });
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
  const { name, offeringIds } = req.body || {};
  if (!name || !Array.isArray(offeringIds) || offeringIds.length === 0) {
    return res.status(400).json({ error: "A name and at least one offering id are required." });
  }
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
    .insert({ consumer_id: req.user.id, name: `${original.name} (copy)`, offering_ids: original.offeringIds })
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

router.post("/reports", optionalAuth, async (req, res) => {
  const { offeringId, reason, details } = req.body || {};
  const found = await findOffering(offeringId);
  if (!found) return res.status(404).json({ error: "Offering not found." });
  if (!reason) return res.status(400).json({ error: "A reason is required." });

  const { data: report, error } = await supabase
    .from("pricing_reports")
    .insert({
      offering_id: found.offering.id,
      offering_name: found.offering.name,
      provider_name: found.org.name,
      reason,
      details: details || "",
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
