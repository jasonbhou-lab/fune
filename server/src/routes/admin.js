import { createRouter } from "../router.js";
import { supabase, requireSupabase } from "../supabaseClient.js";
import { OFFERING_COLUMNS, ORG_COLUMNS, LOCATION_COLUMNS, appendAudit } from "../db.js";
import { priceDisplay, disclosureCompleteness } from "../serialize.js";
import { requireAuth } from "../auth.js";
import { asString, asSlug, asEnum, LIMITS } from "../validate.js";

const router = createRouter();
router.use((req, res, next) => (requireSupabase(res) ? next() : undefined));

const EVENT_TYPES = ["search", "offer_view", "comparison_view", "lead_submitted"];
const OFFERING_STATUSES = ["draft", "pending_review", "published", "unpublished"];
const REPORT_STATUSES = ["open", "resolved", "dismissed"];

// These endpoints returned entire tables. The audit log and analytics_events
// tables grow with every request the platform serves, so an unbounded select
// is both an availability problem for the admin UI and an easy way to make the
// server allocate the whole table into memory.
const MAX_ROWS = 500;
const MAX_ANALYTICS_ROWS = 50000;

router.use(requireAuth("platform_admin"));

router.get("/orgs", async (_req, res) => {
  const { data: orgs, error } = await supabase.from("orgs").select(ORG_COLUMNS).limit(MAX_ROWS);
  if (error) return res.status(500).json({ error: "Couldn't load organizations." });
  const { data: locations } = await supabase.from("locations").select("id, orgId:org_id");
  const { data: providerProfiles } = await supabase.from("profiles").select("id, orgId:org_id").eq("role", "provider");

  const result = orgs.map((org) => ({
    ...org,
    locationCount: (locations || []).filter((l) => l.orgId === org.id).length,
    userCount: (providerProfiles || []).filter((u) => u.orgId === org.id).length,
  }));
  res.json(result);
});

router.get("/orgs/:id", async (req, res) => {
  const { data: org, error } = await supabase.from("orgs").select(ORG_COLUMNS).eq("id", req.params.id).maybeSingle();
  if (error || !org) return res.status(404).json({ error: "Organization not found." });
  const { data: locations } = await supabase.from("locations").select(LOCATION_COLUMNS).eq("org_id", org.id);
  const { data: users } = await supabase
    .from("profiles")
    .select("id, name, email, role:provider_role")
    .eq("role", "provider")
    .eq("org_id", org.id);
  res.json({ ...org, locations: locations || [], users: users || [] });
});

router.patch("/orgs/:id/verify", async (req, res) => {
  const { data: org, error: findError } = await supabase.from("orgs").select(ORG_COLUMNS).eq("id", req.params.id).maybeSingle();
  if (findError || !org) return res.status(404).json({ error: "Organization not found." });
  const next = Boolean(req.body?.verified);
  const from = org.verified;
  const { data: updated, error } = await supabase.from("orgs").update({ verified: next }).eq("id", req.params.id).select(ORG_COLUMNS).single();
  if (error) return res.status(500).json({ error: "Couldn't update organization." });
  await appendAudit({
    actor: req.user.name,
    action: "verification_set",
    entity: org.id,
    from: from ? "verified" : "unverified",
    to: next ? "verified" : "unverified",
  });
  res.json(updated);
});

// Provider roles an approver may assign. 'owner' is included because whoever
// registers an organization that isn't listed yet becomes its first owner.
const PROVIDER_ROLES = ["owner", "administrator", "lead_manager"];

const CLAIM_COLUMNS =
  "id, name, email, requestedOrgId:requested_org_id, requestedOrgName:requested_org_name, status:org_claim_status, createdAt:created_at";

/**
 * Provider accounts waiting to be attached to an organization.
 *
 * Approving one is the only path from "claims to work at X" to actually reading
 * X's leads, so it is deliberately a human decision. Verify employment out of
 * band before approving — the claim itself is just something the person typed.
 */
router.get("/org-claims", async (_req, res) => {
  const { data: claims, error } = await supabase
    .from("profiles")
    .select(CLAIM_COLUMNS)
    .eq("role", "provider")
    .eq("org_claim_status", "pending")
    .is("org_id", null)
    .order("created_at")
    .limit(MAX_ROWS);
  if (error) return res.status(500).json({ error: "Couldn't load organization claims." });

  // Resolve the claimed organization's name for the ones naming an existing org.
  const orgIds = [...new Set((claims || []).map((c) => c.requestedOrgId).filter(Boolean))];
  let orgsById = new Map();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase.from("orgs").select(ORG_COLUMNS).in("id", orgIds);
    orgsById = new Map((orgs || []).map((o) => [o.id, o]));
  }

  res.json(
    (claims || []).map((c) => ({
      ...c,
      // Either an organization already on the platform, or one to be created.
      claimedOrg: c.requestedOrgId ? orgsById.get(c.requestedOrgId) || null : null,
      isNewOrg: !c.requestedOrgId,
    }))
  );
});

router.post("/org-claims/:profileId/approve", async (req, res) => {
  const providerRole = asEnum(req.body?.providerRole, PROVIDER_ROLES, {
    field: "providerRole",
    required: false,
  });

  const { data: profile, error: findError } = await supabase
    .from("profiles")
    .select(CLAIM_COLUMNS + ", orgId:org_id")
    .eq("id", req.params.profileId)
    .maybeSingle();
  if (findError || !profile) return res.status(404).json({ error: "Claim not found." });
  if (profile.status !== "pending" || profile.orgId) {
    return res.status(409).json({ error: "That claim is no longer pending." });
  }

  let orgId = profile.requestedOrgId;
  let createdOrg = false;

  if (!orgId) {
    // A claim on an organization that isn't listed yet. Create it unverified —
    // verification is a separate decision, made on the Organizations screen.
    const name = asString(profile.requestedOrgName, { field: "requestedOrgName", max: LIMITS.shortText, required: true });
    const { data: org, error: createError } = await supabase.from("orgs").insert({ name }).select(ORG_COLUMNS).single();
    if (createError) return res.status(500).json({ error: "Couldn't create the organization." });
    orgId = org.id;
    createdOrg = true;
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({
      org_id: orgId,
      // First member of a brand new organization owns it; anyone joining an
      // existing one gets the least-privileged role unless told otherwise.
      provider_role: providerRole || (createdOrg ? "owner" : "lead_manager"),
      org_claim_status: "none",
      requested_org_id: null,
      requested_org_name: null,
    })
    .eq("id", req.params.profileId)
    .eq("org_claim_status", "pending")
    .select(CLAIM_COLUMNS + ", orgId:org_id, providerRole:provider_role")
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Couldn't approve the claim." });
  if (!updated) return res.status(409).json({ error: "That claim is no longer pending." });

  await appendAudit({
    actor: req.user.name,
    action: "org_claim_approved",
    entity: req.params.profileId,
    from: createdOrg ? `new org "${profile.requestedOrgName}"` : `org ${profile.requestedOrgId}`,
    to: `${orgId} as ${updated.providerRole}`,
  });

  res.json(updated);
});

router.post("/org-claims/:profileId/reject", async (req, res) => {
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ org_claim_status: "rejected", requested_org_id: null, requested_org_name: null })
    .eq("id", req.params.profileId)
    .eq("org_claim_status", "pending")
    .is("org_id", null)
    .select(CLAIM_COLUMNS)
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Couldn't reject the claim." });
  if (!updated) return res.status(409).json({ error: "That claim is no longer pending." });

  await appendAudit({
    actor: req.user.name,
    action: "org_claim_rejected",
    entity: req.params.profileId,
    from: "pending",
    to: "rejected",
  });

  res.json(updated);
});

router.get("/offerings", async (req, res) => {
  const statusFilter = asEnum(req.query.status, OFFERING_STATUSES, { field: "Status" });
  let query = supabase.from("offerings").select(`${OFFERING_COLUMNS}, location:locations(name, org:orgs(name))`);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error } = await query.limit(MAX_ROWS);
  if (error) return res.status(500).json({ error: "Couldn't load offerings." });

  const items = data.map(({ location, ...offering }) => ({
    id: offering.id,
    name: offering.name,
    category: offering.category,
    status: offering.status,
    price: priceDisplay(offering),
    disclosure: disclosureCompleteness(offering),
    locationName: location?.name || "Unknown location",
    providerName: location?.org?.name || "Unknown provider",
  }));
  res.json(items);
});

router.patch("/offerings/:id", async (req, res) => {
  const { data: offering, error: findError } = await supabase.from("offerings").select(OFFERING_COLUMNS).eq("id", req.params.id).maybeSingle();
  if (findError || !offering) return res.status(404).json({ error: "Offering not found." });
  const status = asEnum(req.body?.status, ["published", "unpublished"], { field: "Status", required: true });
  const from = offering.status;
  const { data: updated, error } = await supabase.from("offerings").update({ status }).eq("id", req.params.id).select(OFFERING_COLUMNS).single();
  if (error) return res.status(500).json({ error: "Couldn't update offering." });
  await appendAudit({ actor: req.user.name, action: "listing_status_set", entity: offering.id, from, to: status });
  res.json(updated);
});

router.get("/taxonomy", async (_req, res) => {
  const { data, error } = await supabase.from("taxonomy").select("id, label, examples");
  if (error) return res.status(500).json({ error: "Couldn't load taxonomy." });
  res.json(data);
});

router.post("/taxonomy", async (req, res) => {
  const id = asSlug(req.body?.id, { field: "Id", required: true });
  const label = asString(req.body?.label, { field: "Label", max: LIMITS.name, required: true });
  const examples = asString(req.body?.examples, { field: "Examples", max: LIMITS.shortText, allowEmpty: true }) || "";

  const { data: existing } = await supabase.from("taxonomy").select("id").eq("id", id).maybeSingle();
  if (existing) return res.status(400).json({ error: "A category with that id already exists." });

  const { data: category, error } = await supabase
    .from("taxonomy")
    .insert({ id, label, examples })
    .select("id, label, examples")
    .single();
  if (error) return res.status(500).json({ error: "Couldn't add category." });
  await appendAudit({ actor: req.user.name, action: "taxonomy_added", entity: id, to: label });
  res.status(201).json(category);
});

router.patch("/taxonomy/:id", async (req, res) => {
  const { data: category, error: findError } = await supabase.from("taxonomy").select("id, label, examples").eq("id", req.params.id).maybeSingle();
  if (findError || !category) return res.status(404).json({ error: "Category not found." });
  const from = category.label;
  const patch = {};
  if (req.body?.label !== undefined) {
    patch.label = asString(req.body.label, { field: "Label", max: LIMITS.name, required: true });
  }
  if (req.body?.examples !== undefined) {
    patch.examples = asString(req.body.examples, { field: "Examples", max: LIMITS.shortText, allowEmpty: true }) || "";
  }
  const { data: updated, error } = await supabase.from("taxonomy").update(patch).eq("id", req.params.id).select("id, label, examples").single();
  if (error) return res.status(500).json({ error: "Couldn't update category." });
  await appendAudit({ actor: req.user.name, action: "taxonomy_updated", entity: category.id, from, to: updated.label });
  res.json(updated);
});

router.delete("/taxonomy/:id", async (req, res) => {
  const { data: category, error: findError } = await supabase.from("taxonomy").select("id, label").eq("id", req.params.id).maybeSingle();
  if (findError || !category) return res.status(404).json({ error: "Category not found." });
  const { count } = await supabase.from("offerings").select("id", { count: "exact", head: true }).eq("category", category.id);
  const { error } = await supabase.from("taxonomy").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Couldn't remove category." });
  await appendAudit({ actor: req.user.name, action: "taxonomy_removed", entity: category.id, from: category.label });
  res.json({ removed: category.id, offeringsAffected: count || 0 });
});

router.get("/reports", async (req, res) => {
  let query = supabase
    .from("pricing_reports")
    .select("id, offeringId:offering_id, offeringName:offering_name, providerName:provider_name, reason, details, status, createdAt:created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  const reportStatus = asEnum(req.query.status, REPORT_STATUSES, { field: "Status" });
  if (reportStatus) query = query.eq("status", reportStatus);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Couldn't load reports." });
  res.json(data);
});

router.patch("/reports/:id", async (req, res) => {
  const { data: report, error: findError } = await supabase.from("pricing_reports").select("id, status").eq("id", req.params.id).maybeSingle();
  if (findError || !report) return res.status(404).json({ error: "Report not found." });
  const status = asEnum(req.body?.status, REPORT_STATUSES, { field: "Status", required: true });
  const from = report.status;
  const { data: updated, error } = await supabase
    .from("pricing_reports")
    .update({ status })
    .eq("id", req.params.id)
    .select("id, offeringId:offering_id, offeringName:offering_name, providerName:provider_name, reason, details, status, createdAt:created_at")
    .single();
  if (error) return res.status(500).json({ error: "Couldn't update report." });
  await appendAudit({ actor: req.user.name, action: "pricing_report_status_set", entity: report.id, from, to: status });
  res.json(updated);
});

router.get("/audit-log", async (_req, res) => {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor, action, entity, from:from_value, to:to_value, at")
    .order("at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) return res.status(500).json({ error: "Couldn't load audit log." });
  res.json(data);
});

router.get("/analytics/funnel", async (_req, res) => {
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const counts = { allTime: {}, last30Days: {} };
  for (const type of EVENT_TYPES) {
    counts.allTime[type] = 0;
    counts.last30Days[type] = 0;
  }

  const { data, error } = await supabase
    .from("analytics_events")
    .select("type, at")
    .in("type", EVENT_TYPES)
    .order("at", { ascending: false })
    .limit(MAX_ANALYTICS_ROWS);
  if (error) return res.status(500).json({ error: "Couldn't load analytics." });
  for (const evt of data) {
    counts.allTime[evt.type] += 1;
    if (new Date(evt.at).getTime() >= thirtyDaysAgo) counts.last30Days[evt.type] += 1;
  }
  res.json(counts);
});

router.get("/analytics/top-categories", async (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await supabase
    .from("analytics_events")
    .select("category:meta->>category, zip:meta->>zip")
    .eq("type", "search")
    .gte("at", thirtyDaysAgo)
    .limit(MAX_ANALYTICS_ROWS);
  if (error) return res.status(500).json({ error: "Couldn't load analytics." });

  const byCategory = {};
  const byZip = {};
  for (const evt of data) {
    const cat = evt.category || "all_categories";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (evt.zip) byZip[evt.zip] = (byZip[evt.zip] || 0) + 1;
  }
  const toSortedList = (obj) =>
    Object.entries(obj)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);

  res.json({ windowDays: 30, categories: toSortedList(byCategory), zips: toSortedList(byZip) });
});

export default router;
