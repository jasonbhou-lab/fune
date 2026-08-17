import { createRouter } from "../router.js";
import { supabase, requireSupabase } from "../supabaseClient.js";
import { OFFERING_COLUMNS, ORG_COLUMNS, LOCATION_COLUMNS } from "../db.js";
import { priceDisplay, disclosureCompleteness, daysSince, ATTRIBUTE_KEYS } from "../serialize.js";
import { requireAuth } from "../auth.js";
import { offeringsToCsv, parseCsv } from "../csv.js";
import { bulkLimiter } from "../rateLimit.js";
import { asString, asEnum, asNumber, asStringArray, asDate, LIMITS } from "../validate.js";

const router = createRouter();
router.use((req, res, next) => (requireSupabase(res) ? next() : undefined));

const MAX_CSV_ROWS = 1000;

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
  if (!orgId || !locationId) return false;
  const { data } = await supabase.from("locations").select("id").eq("org_id", orgId).eq("id", locationId).maybeSingle();
  return Boolean(data);
}

/**
 * A lead's `owner` is a FK to profiles(id), and the FK is the only thing that
 * used to constrain it — so a provider could assign their own leads to any
 * profile in the database, including users at a competing organization or a
 * platform admin. That both leaks the existence of those accounts and writes
 * another org's user into this org's records. Owners must be provider users in
 * the caller's own org.
 */
async function assertOwnsMember(orgId, profileId) {
  if (!orgId || !profileId) return false;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("org_id", orgId)
    .eq("role", "provider")
    .maybeSingle();
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
  const body = req.body || {};
  const locationId = asString(body.locationId, { field: "Location id", max: LIMITS.id, required: true });
  if (!(await assertOwnsLocation(req.user.orgId, locationId))) {
    return res.status(403).json({ error: "That location does not belong to your organization." });
  }
  const category = asString(body.category, { field: "Category", max: LIMITS.shortText, required: true });
  const name = asString(body.name, { field: "Name", max: LIMITS.name, required: true });
  const priceType = asEnum(body.priceType, VALID_PRICE_TYPES, { field: "Price type", required: true });
  const description = asString(body.description, { field: "Description", max: LIMITS.message, allowEmpty: true }) || "";

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("offerings")
    .insert({
      location_id: locationId,
      category,
      name,
      description,
      price_type: priceType,
      amount: asNumber(body.amount, { field: "Amount", min: 0, max: 100000000 }),
      amount_min: asNumber(body.amountMin, { field: "Minimum amount", min: 0, max: 100000000 }),
      amount_max: asNumber(body.amountMax, { field: "Maximum amount", min: 0, max: 100000000 }),
      currency: "USD",
      effective_date: now,
      reviewed_date: now,
      included: asStringArray(body.included, { field: "Included", maxItems: 100 }),
      excluded: asStringArray(body.excluded, { field: "Excluded", maxItems: 100 }),
      third_party: Array.isArray(body.thirdParty) ? body.thirdParty.slice(0, 100) : [],
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

  // Spreading the raw body over the existing row is a mass-assignment shape:
  // build an explicit patch of only the fields a provider may change, each
  // validated. Notably `locationId` is not settable here — accepting it would
  // let a provider move an offering into another organization's location.
  const body = req.body || {};
  const next = {
    ...existing,
    // category / name / price_type are NOT NULL in the schema, so an empty
    // value has to be rejected here with a clear 400 rather than becoming a
    // null that the database refuses as an opaque 500.
    ...("category" in body && { category: asString(body.category, { field: "Category", max: LIMITS.shortText, required: true }) }),
    ...("name" in body && { name: asString(body.name, { field: "Name", max: LIMITS.name, required: true }) }),
    ...("description" in body && {
      description: asString(body.description, { field: "Description", max: LIMITS.message, allowEmpty: true }) || "",
    }),
    ...("priceType" in body && { priceType: asEnum(body.priceType, VALID_PRICE_TYPES, { field: "Price type", required: true }) }),
    ...("amount" in body && { amount: asNumber(body.amount, { field: "Amount", min: 0, max: 100000000 }) }),
    ...("amountMin" in body && { amountMin: asNumber(body.amountMin, { field: "Minimum amount", min: 0, max: 100000000 }) }),
    ...("amountMax" in body && { amountMax: asNumber(body.amountMax, { field: "Maximum amount", min: 0, max: 100000000 }) }),
    ...("effectiveDate" in body && { effectiveDate: asDate(body.effectiveDate, { field: "Effective date" }) }),
    ...("included" in body && { included: asStringArray(body.included, { field: "Included", maxItems: 100 }) }),
    ...("excluded" in body && { excluded: asStringArray(body.excluded, { field: "Excluded", maxItems: 100 }) }),
    ...("thirdParty" in body && { thirdParty: Array.isArray(body.thirdParty) ? body.thirdParty.slice(0, 100) : [] }),
    // Previously taken straight from the body with no check, leaving the
    // database CHECK constraint as the only guard against an arbitrary value.
    ...("status" in body && { status: asEnum(body.status, VALID_OFFERING_STATUSES, { field: "Status", required: true }) }),
  };

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

router.get("/catalog/export", bulkLimiter, async (req, res) => {
  const locIds = await orgLocationIds(req.user.orgId);
  let items = [];
  if (locIds.length > 0) {
    const { data, error } = await supabase.from("offerings").select(OFFERING_COLUMNS).in("location_id", locIds);
    if (error) return res.status(500).json({ error: "Couldn't export catalog." });
    items = data;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  // Force a download rather than letting a browser render the response inline.
  res.setHeader("Content-Disposition", 'attachment; filename="catalog-export.csv"');
  res.send(offeringsToCsv(items));
});

router.post("/catalog/import", bulkLimiter, async (req, res) => {
  const csv = asString(req.body?.csv, { field: "CSV content", max: LIMITS.csv, required: true });

  const rows = parseCsv(csv);
  if (rows.length > MAX_CSV_ROWS) {
    return res.status(400).json({ error: `Too many rows — import at most ${MAX_CSV_ROWS} at a time.` });
  }
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

    // Uploaded cells were previously written through with no bounds: names and
    // descriptions of any length, and `Number("abc")` silently becoming NaN.
    if (name.length > LIMITS.name || category.length > LIMITS.shortText) {
      errors.push({ row: rowNum, error: "Category or name is too long." });
      continue;
    }
    const numeric = {};
    let badNumber = null;
    for (const [csvKey, column] of [
      ["amount", "amount"],
      ["amountMin", "amount_min"],
      ["amountMax", "amount_max"],
    ]) {
      const raw = (row[csvKey] || "").trim();
      if (!raw) {
        numeric[column] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        badNumber = `Invalid ${csvKey} '${raw}'.`;
        break;
      }
      numeric[column] = n;
    }
    if (badNumber) {
      errors.push({ row: rowNum, error: badNumber });
      continue;
    }

    const effectiveRaw = (row.effectiveDate || "").trim();
    if (effectiveRaw && Number.isNaN(Date.parse(effectiveRaw))) {
      errors.push({ row: rowNum, error: `Invalid effectiveDate '${effectiveRaw}'.` });
      continue;
    }

    const splitList = (value) =>
      (value || "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 100)
        .map((s) => s.slice(0, LIMITS.shortText));

    const fields = {
      location_id: locationId,
      category,
      name,
      description: (row.description || "").slice(0, LIMITS.message),
      price_type: priceType,
      ...numeric,
      effective_date: effectiveRaw ? new Date(Date.parse(effectiveRaw)).toISOString() : now,
      included: splitList(row.included),
      excluded: splitList(row.excluded),
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
        // Postgres/PostgREST messages name tables, columns, and constraints;
        // logged server-side, generic to the client.
        console.error(`catalog import row ${rowNum} failed:`, error.message);
        errors.push({ row: rowNum, error: "Could not save this row." });
        continue;
      }
      updated += 1;
    } else {
      const { error } = await supabase
        .from("offerings")
        .insert({ ...fields, currency: "USD", reviewed_date: now, third_party: [], status: status || "draft" });
      if (error) {
        // Postgres/PostgREST messages name tables, columns, and constraints;
        // logged server-side, generic to the client.
        console.error(`catalog import row ${rowNum} failed:`, error.message);
        errors.push({ row: rowNum, error: "Could not save this row." });
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
  const body = req.body || {};
  const status = asEnum(body.status, LEAD_STATUSES, { field: "Status" });

  const patch = {};
  if (status && status !== lead.status) {
    patch.status = status;
  }
  if (body.owner !== undefined) {
    if (body.owner === null || body.owner === "") {
      patch.owner = null;
    } else {
      const owner = asString(body.owner, { field: "Owner", max: LIMITS.id, required: true });
      if (!(await assertOwnsMember(req.user.orgId, owner))) {
        return res.status(400).json({ error: "That owner is not a member of your organization." });
      }
      patch.owner = owner;
    }
  }

  if (Object.keys(patch).length === 0) {
    const { data: unchanged } = await supabase.from("leads").select(LEAD_DETAIL_COLUMNS).eq("id", lead.id).single();
    return res.json(withSortedHistory(unchanged));
  }

  const { data: updated, error } = await supabase.from("leads").update(patch).eq("id", req.params.id).select(LEAD_DETAIL_COLUMNS).single();
  if (error) return res.status(500).json({ error: "Couldn't update lead." });

  // Record history only after the status change actually persisted — the
  // previous order wrote the history row first, so a failed update left a
  // status-history entry for a transition that never happened.
  if (patch.status) {
    await supabase.from("lead_status_history").insert({ lead_id: lead.id, status: patch.status, at: new Date().toISOString() });
    const { data: refreshed } = await supabase.from("leads").select(LEAD_DETAIL_COLUMNS).eq("id", lead.id).single();
    return res.json(withSortedHistory(refreshed || updated));
  }

  res.json(withSortedHistory(updated));
});

export default router;
