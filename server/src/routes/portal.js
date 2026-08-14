import { Router } from "express";
import { supabase, requireSupabase } from "../supabaseClient.js";
import { OFFERING_COLUMNS, ORG_COLUMNS, LOCATION_COLUMNS } from "../db.js";
import { priceDisplay, disclosureCompleteness, daysSince, ATTRIBUTE_KEYS } from "../serialize.js";
import { requireAuth } from "../auth.js";
import { offeringsToCsv, parseCsv } from "../csv.js";

const router = Router();
router.use((req, res, next) => (requireSupabase(res) ? next() : undefined));

const STALE_REVIEW_DAYS = 90;
const LEAD_STATUSES = ["new", "contacted", "appointment_scheduled", "quoted", "converted", "closed_lost", "do_not_contact"];
const VALID_PRICE_TYPES = ["fixed", "starting_at", "range", "quote_required", "included_in_package"];
const VALID_OFFERING_STATUSES = ["draft", "pending_review", "published", "unpublished"];

const ATTRIBUTE_COLUMN_MAP = {
  veteranSupport: "veteran_support",
  greenOptions: "green_options",
  accessibility: "accessibility",
  livestreaming: "livestreaming",
  onlineArrangement: "online_arrangement",
  receptionFacilities: "reception_facilities",
};

const LEAD_DETAIL_COLUMNS = `
  id, clientRequestId:client_request_id, consumerId:consumer_id, locationId:location_id, offeringId:offering_id,
  offeringSnapshot:offering_snapshot, firstName:first_name, lastName:last_name, contactMethod:contact_method,
  phone, email, needType:need_type, timeframe, message,
  consentToContact:consent_to_contact, marketingOptIn:marketing_opt_in, consentVersion:consent_version, consentTimestamp:consent_timestamp,
  status, owner, createdAt:created_at,
  statusHistory:lead_status_history(status, at)
`;

function withSortedHistory(lead) {
  if (!lead) return lead;
  lead.statusHistory = (lead.statusHistory || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
  return lead;
}

async function orgLocationIds(orgId) {
  const { data, error } = await supabase.from("locations").select("id").eq("org_id", orgId);
  if (error) throw new Error(error.message);
  return (data || []).map((l) => l.id);
}

async function assertOwnsLocation(orgId, locationId) {
  const { data } = await supabase.from("locations").select("id").eq("org_id", orgId).eq("id", locationId).maybeSingle();
  return Boolean(data);
}

router.use(requireAuth("provider"));

router.get("/dashboard", async (req, res) => {
  const { orgId } = req.user;
  const { data: org } = await supabase.from("orgs").select(ORG_COLUMNS).eq("id", orgId).maybeSingle();
  const locIds = await orgLocationIds(orgId);

  let orgLeads = [];
  let orgOfferings = [];
  if (locIds.length > 0) {
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, firstName:first_name, lastName:last_name, createdAt:created_at, statusHistory:lead_status_history(status, at)")
      .in("location_id", locIds);
    orgLeads = leadsData || [];

    const { data: offeringsData } = await supabase.from("offerings").select(OFFERING_COLUMNS).in("location_id", locIds);
    orgOfferings = offeringsData || [];
  }

  const weekAgo = Date.now() - 7 * 86400000;
  const leadsThisWeek = orgLeads.filter((l) => new Date(l.createdAt).getTime() >= weekAgo).length;

  const responseHours = orgLeads
    .map((l) => {
      const history = (l.statusHistory || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
      if (history.length < 2) return null;
      const first = new Date(history[0].at).getTime();
      const second = new Date(history[1].at).getTime();
      return (second - first) / 3600000;
    })
    .filter((h) => h !== null)
    .sort((a, b) => a - b);
  const medianResponseHours = responseHours.length === 0 ? null : responseHours[Math.floor(responseHours.length / 2)];

  const publishedOfferings = orgOfferings.filter((o) => o.status === "published");
  const reviewedRecently = publishedOfferings.filter((o) => disclosureCompleteness(o).complete === disclosureCompleteness(o).total);
  const catalogCompletenessPct = publishedOfferings.length
    ? Math.round((reviewedRecently.length / publishedOfferings.length) * 100)
    : 100;
  const incompleteOffering = publishedOfferings.find((o) => disclosureCompleteness(o).complete < disclosureCompleteness(o).total);

  const activity = [
    ...orgLeads.map((l) => ({ type: "lead", label: `New lead — ${l.firstName} ${l.lastName}`, at: l.createdAt })),
    ...orgOfferings.map((o) => ({ type: "offering", label: `Price reviewed — ${o.name}`, at: o.reviewedDate })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 6);

  res.json({
    orgName: org?.name,
    leadsThisWeek,
    medianResponseHours: medianResponseHours === null ? null : Math.round(medianResponseHours * 10) / 10,
    catalogCompletenessPct,
    offeringsReviewed: `${reviewedRecently.length} of ${publishedOfferings.length}`,
    incompleteOfferingName: incompleteOffering ? incompleteOffering.name : null,
    activity,
  });
});

router.get("/locations", async (req, res) => {
  const { data, error } = await supabase.from("locations").select(LOCATION_COLUMNS).eq("org_id", req.user.orgId);
  if (error) return res.status(500).json({ error: "Couldn't load locations." });
  res.json(data);
});

router.patch("/locations/:id", async (req, res) => {
  if (!(await assertOwnsLocation(req.user.orgId, req.params.id))) {
    return res.status(404).json({ error: "Location not found." });
  }
  const patch = {};
  for (const key of ATTRIBUTE_KEYS) {
    if (key in (req.body || {})) patch[ATTRIBUTE_COLUMN_MAP[key]] = Boolean(req.body[key]);
  }
  const { data, error } = await supabase.from("locations").update(patch).eq("id", req.params.id).select(LOCATION_COLUMNS).single();
  if (error) return res.status(500).json({ error: "Couldn't update location." });
  res.json(data);
});

router.get("/catalog", async (req, res) => {
  const locIds = await orgLocationIds(req.user.orgId);
  if (locIds.length === 0) return res.json([]);
  const { data, error } = await supabase.from("offerings").select(OFFERING_COLUMNS).in("location_id", locIds);
  if (error) return res.status(500).json({ error: "Couldn't load catalog." });
  const items = data.map((o) => {
    const reviewedDaysAgo = daysSince(o.reviewedDate);
    return {
      ...o,
      price: priceDisplay(o),
      reviewedDaysAgo,
      stale: o.status === "published" && reviewedDaysAgo !== null && reviewedDaysAgo > STALE_REVIEW_DAYS,
    };
  });
  res.json(items);
});

router.post("/catalog", async (req, res) => {
  const { locationId, category, name, description, priceType } = req.body || {};
  if (!(await assertOwnsLocation(req.user.orgId, locationId))) {
    return res.status(403).json({ error: "That location does not belong to your organization." });
  }
  if (!category || !name || !priceType) {
    return res.status(400).json({ error: "Category, name, and price type are required to create an offering." });
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("offerings")
    .insert({
      location_id: locationId,
      category,
      name,
      description: description || "",
      price_type: priceType,
      amount: req.body.amount ?? null,
      amount_min: req.body.amountMin ?? null,
      amount_max: req.body.amountMax ?? null,
      currency: "USD",
      effective_date: now,
      reviewed_date: now,
      included: req.body.included || [],
      excluded: req.body.excluded || [],
      third_party: req.body.thirdParty || [],
      status: "draft",
    })
    .select(OFFERING_COLUMNS)
    .single();
  if (error) return res.status(500).json({ error: "Couldn't create offering." });
  res.status(201).json(data);
});

router.put("/catalog/:id", async (req, res) => {
  const { data: existing, error: findError } = await supabase.from("offerings").select(OFFERING_COLUMNS).eq("id", req.params.id).maybeSingle();
  if (findError || !existing || !(await assertOwnsLocation(req.user.orgId, existing.locationId))) {
    return res.status(404).json({ error: "Offering not found." });
  }

  const next = { ...existing, ...req.body };
  if (next.status === "published") {
    const missing = [];
    if (!next.category) missing.push("category");
    if (!next.name) missing.push("name");
    if (!next.priceType) missing.push("price type");
    if (!next.effectiveDate) missing.push("effective date");
    if ((next.included || []).length === 0 && (next.excluded || []).length === 0) {
      missing.push("inclusion/exclusion data");
    }
    if (missing.length > 0) {
      return res.status(400).json({ error: `Cannot publish — missing ${missing.join(", ")}.` });
    }
    if ((next.priceType === "fixed" || next.priceType === "starting_at") && !next.amount) {
      return res.status(400).json({ error: "Currency and amount are required for a fixed or starting-at price." });
    }
  }

  const now = new Date().toISOString();
  await supabase.from("offering_history").insert({ offering_id: existing.id, snapshot: existing, versioned_at: now });

  const { data: updated, error } = await supabase
    .from("offerings")
    .update({
      category: next.category,
      name: next.name,
      description: next.description,
      price_type: next.priceType,
      amount: next.amount,
      amount_min: next.amountMin,
      amount_max: next.amountMax,
      effective_date: next.effectiveDate,
      reviewed_date: now,
      included: next.included || [],
      excluded: next.excluded || [],
      third_party: next.thirdParty || [],
      status: next.status,
    })
    .eq("id", req.params.id)
    .select(OFFERING_COLUMNS)
    .single();
  if (error) return res.status(500).json({ error: "Couldn't update offering." });
  res.json(updated);
});

router.get("/catalog/export", async (req, res) => {
  const locIds = await orgLocationIds(req.user.orgId);
  let items = [];
  if (locIds.length > 0) {
    const { data, error } = await supabase.from("offerings").select(OFFERING_COLUMNS).in("location_id", locIds);
    if (error) return res.status(500).json({ error: "Couldn't export catalog." });
    items = data;
  }
  res.setHeader("Content-Type", "text/csv");
  res.send(offeringsToCsv(items));
});

router.post("/catalog/import", async (req, res) => {
  const { csv } = req.body || {};
  if (!csv || !String(csv).trim()) {
    return res.status(400).json({ error: "No CSV content provided." });
  }
  const rows = parseCsv(csv);
  const locIds = await orgLocationIds(req.user.orgId);

  let created = 0;
  let updated = 0;
  const errors = [];
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // account for the header row
    const locationId = (row.locationId || "").trim();
    const category = (row.category || "").trim();
    const name = (row.name || "").trim();
    const priceType = (row.priceType || "").trim();

    if (!locIds.includes(locationId)) {
      errors.push({ row: rowNum, error: `Location '${locationId || "(blank)"}' does not belong to your organization.` });
      continue;
    }
    const missing = [];
    if (!category) missing.push("category");
    if (!name) missing.push("name");
    if (!priceType) missing.push("priceType");
    if (missing.length) {
      errors.push({ row: rowNum, error: `Missing required field(s): ${missing.join(", ")}.` });
      continue;
    }
    if (!VALID_PRICE_TYPES.includes(priceType)) {
      errors.push({ row: rowNum, error: `Invalid priceType '${priceType}'. Must be one of: ${VALID_PRICE_TYPES.join(", ")}.` });
      continue;
    }
    const status = (row.status || "").trim();
    if (status && !VALID_OFFERING_STATUSES.includes(status)) {
      errors.push({ row: rowNum, error: `Invalid status '${status}'. Must be one of: ${VALID_OFFERING_STATUSES.join(", ")}.` });
      continue;
    }

    const fields = {
      location_id: locationId,
      category,
      name,
      description: row.description || "",
      price_type: priceType,
      amount: row.amount ? Number(row.amount) : null,
      amount_min: row.amountMin ? Number(row.amountMin) : null,
      amount_max: row.amountMax ? Number(row.amountMax) : null,
      effective_date: row.effectiveDate || now,
      included: (row.included || "").split(";").map((s) => s.trim()).filter(Boolean),
      excluded: (row.excluded || "").split(";").map((s) => s.trim()).filter(Boolean),
    };
    if (status === "published" && (fields.price_type === "fixed" || fields.price_type === "starting_at") && !fields.amount) {
      errors.push({ row: rowNum, error: "Currency and amount are required to publish a fixed or starting-at price." });
      continue;
    }

    const existingId = (row.id || "").trim();
    let existing = null;
    if (existingId) {
      const { data } = await supabase.from("offerings").select(OFFERING_COLUMNS).eq("id", existingId).maybeSingle();
      if (data && locIds.includes(data.locationId)) existing = data;
    }

    if (existing) {
      await supabase.from("offering_history").insert({ offering_id: existing.id, snapshot: existing, versioned_at: now });
      const { error } = await supabase
        .from("offerings")
        .update({ ...fields, status: status || existing.status, reviewed_date: now })
        .eq("id", existing.id);
      if (error) {
        errors.push({ row: rowNum, error: `Database error: ${error.message}` });
        continue;
      }
      updated += 1;
    } else {
      const { error } = await supabase
        .from("offerings")
        .insert({ ...fields, currency: "USD", reviewed_date: now, third_party: [], status: status || "draft" });
      if (error) {
        errors.push({ row: rowNum, error: `Database error: ${error.message}` });
        continue;
      }
      created += 1;
    }
  }

  res.json({ created, updated, errors });
});

router.get("/leads", async (req, res) => {
  const locIds = await orgLocationIds(req.user.orgId);
  if (locIds.length === 0) return res.json([]);

  let query = supabase
    .from("leads")
    .select(
      "id, firstName:first_name, lastName:last_name, needType:need_type, locationId:location_id, offeringId:offering_id, offeringSnapshot:offering_snapshot, createdAt:created_at, status, owner"
    )
    .in("location_id", locIds);

  const { status, locationId, needType, offeringId, owner, from, to } = req.query;
  if (status) query = query.eq("status", status);
  if (locationId) query = query.eq("location_id", locationId);
  if (needType) query = query.eq("need_type", needType);
  if (offeringId) query = query.eq("offering_id", offeringId);
  if (owner) query = query.eq("owner", owner);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Couldn't load leads." });

  const leads = data.map((l) => ({
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    needType: l.needType,
    locationId: l.locationId,
    offeringId: l.offeringId,
    offeringName: l.offeringSnapshot?.name || "—",
    createdAt: l.createdAt,
    status: l.status,
    owner: l.owner,
  }));
  res.json(leads);
});

router.get("/leads/:id", async (req, res) => {
  const { data: lead, error } = await supabase.from("leads").select(LEAD_DETAIL_COLUMNS).eq("id", req.params.id).maybeSingle();
  if (error || !lead || !(await assertOwnsLocation(req.user.orgId, lead.locationId))) {
    return res.status(404).json({ error: "Lead not found." });
  }
  res.json(withSortedHistory(lead));
});

router.patch("/leads/:id", async (req, res) => {
  const { data: lead, error: findError } = await supabase
    .from("leads")
    .select("id, locationId:location_id, status")
    .eq("id", req.params.id)
    .maybeSingle();
  if (findError || !lead || !(await assertOwnsLocation(req.user.orgId, lead.locationId))) {
    return res.status(404).json({ error: "Lead not found." });
  }
  const { status, owner } = req.body || {};
  if (status && !LEAD_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${LEAD_STATUSES.join(", ")}.` });
  }
  const patch = {};
  if (status && status !== lead.status) {
    patch.status = status;
    await supabase.from("lead_status_history").insert({ lead_id: lead.id, status, at: new Date().toISOString() });
  }
  if (owner !== undefined) patch.owner = owner;

  const { data: updated, error } = await supabase.from("leads").update(patch).eq("id", req.params.id).select(LEAD_DETAIL_COLUMNS).single();
  if (error) return res.status(500).json({ error: "Couldn't update lead." });
  res.json(withSortedHistory(updated));
});

export default router;
