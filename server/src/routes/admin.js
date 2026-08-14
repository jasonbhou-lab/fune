import { Router } from "express";
import { supabase, requireSupabase } from "../supabaseClient.js";
import { OFFERING_COLUMNS, ORG_COLUMNS, LOCATION_COLUMNS, appendAudit } from "../db.js";
import { priceDisplay, disclosureCompleteness } from "../serialize.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use((req, res, next) => (requireSupabase(res) ? next() : undefined));

const EVENT_TYPES = ["search", "offer_view", "comparison_view", "lead_submitted"];

router.use(requireAuth("platform_admin"));

router.get("/orgs", async (_req, res) => {
  const { data: orgs, error } = await supabase.from("orgs").select(ORG_COLUMNS);
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

router.get("/offerings", async (req, res) => {
  let query = supabase.from("offerings").select(`${OFFERING_COLUMNS}, location:locations(name, org:orgs(name))`);
  if (req.query.status) query = query.eq("status", req.query.status);
  const { data, error } = await query;
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
  const { status } = req.body || {};
  if (!["published", "unpublished"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'published' or 'unpublished'." });
  }
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
  const { id, label, examples } = req.body || {};
  if (!id || !label) return res.status(400).json({ error: "An id and label are required." });
  const { data: existing } = await supabase.from("taxonomy").select("id").eq("id", id).maybeSingle();
  if (existing) return res.status(400).json({ error: "A category with that id already exists." });

  const { data: category, error } = await supabase
    .from("taxonomy")
    .insert({ id, label, examples: examples || "" })
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
  if (req.body?.label !== undefined) patch.label = req.body.label;
  if (req.body?.examples !== undefined) patch.examples = req.body.examples;
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
    .order("created_at", { ascending: false });
  if (req.query.status) query = query.eq("status", req.query.status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Couldn't load reports." });
  res.json(data);
});

router.patch("/reports/:id", async (req, res) => {
  const { data: report, error: findError } = await supabase.from("pricing_reports").select("id, status").eq("id", req.params.id).maybeSingle();
  if (findError || !report) return res.status(404).json({ error: "Report not found." });
  const { status } = req.body || {};
  if (!["open", "resolved", "dismissed"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'open', 'resolved', or 'dismissed'." });
  }
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
    .order("at", { ascending: false });
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

  const { data, error } = await supabase.from("analytics_events").select("type, at").in("type", EVENT_TYPES);
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
    .gte("at", thirtyDaysAgo);
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
