import { createRouter } from "../router.js";
import { supabase, requireSupabase } from "../supabaseClient.js";
import { OFFERING_COLUMNS, ORG_COLUMNS, LOCATION_COLUMNS, REVIEW_COLUMNS, appendAudit } from "../db.js";
import { priceDisplay, disclosureCompleteness, serializeReview } from "../serialize.js";
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

const ASSIGNABLE_ROLES = ["consumer", "provider", "platform_admin"];

const USER_COLUMNS = `
  id, name, email, role, orgId:org_id, providerRole:provider_role,
  rolePending:role_pending, orgClaimStatus:org_claim_status,
  requestedOrgId:requested_org_id, requestedOrgName:requested_org_name, createdAt:created_at
`;

/**
 * Every account on the platform.
 *
 * The one screen from which a platform admin can see who exists and fix a role
 * or an organization by hand, rather than only through the claim queue. Capped
 * and searchable rather than unbounded, for the same reason as every other admin
 * list: this table grows with the platform.
 */
router.get("/users", async (req, res) => {
  const q = asString(req.query.q, { field: "q", max: LIMITS.query, allowEmpty: true });
  const role = asEnum(req.query.role, ASSIGNABLE_ROLES, { field: "role" });

  const base = () => {
    let q2 = supabase.from("profiles").select(USER_COLUMNS).order("created_at", { ascending: false }).limit(MAX_ROWS);
    if (role) q2 = q2.eq("role", role);
    return q2;
  };

  let users;
  let error;

  if (q) {
    // Deliberately two parameterised queries merged here rather than one
    // .or("name.ilike.%x%,email.ilike.%x%").
    //
    // That string is a PostgREST filter GRAMMAR, not a value: commas separate
    // conditions and parentheses group them, so a search term containing them
    // injects extra conditions. Verified against the live API — a term of
    // `x,nosuchcol.eq.1` comes back as `column profiles.nosuchcol does not
    // exist`, which proves the text was parsed as a filter and also turns 400s
    // into a column-name oracle. Escaping only the LIKE metacharacters, as this
    // did, does not touch the grammar characters.
    //
    // .ilike(column, value) passes the value as a parameter, so there is no
    // grammar to escape at all.
    const like = `%${q.replace(/([\\%_])/g, "\\$1")}%`;
    const [byName, byEmail] = await Promise.all([base().ilike("name", like), base().ilike("email", like)]);
    error = byName.error || byEmail.error;
    const merged = new Map();
    for (const row of [...(byName.data || []), ...(byEmail.data || [])]) merged.set(row.id, row);
    users = [...merged.values()].slice(0, MAX_ROWS);
  } else {
    const result = await base();
    users = result.data;
    error = result.error;
  }

  if (error) return res.status(500).json({ error: "Couldn't load users." });

  const orgIds = [...new Set((users || []).map((u) => u.orgId).filter(Boolean))];
  let orgsById = new Map();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase.from("orgs").select("id, name, verified").in("id", orgIds);
    orgsById = new Map((orgs || []).map((o) => [o.id, o]));
  }

  res.json((users || []).map((u) => ({ ...u, org: u.orgId ? orgsById.get(u.orgId) || null : null })));
});

/**
 * Change an account's role, organization, or provider role.
 *
 * This is the deliberate back door that the rest of the system refuses to
 * provide: role is not writable by the account itself at any privilege level
 * (see the column grants on profiles), and claim_account_type() will not grant
 * platform_admin to anyone. Both of those exist to stop self-promotion. An admin
 * doing it explicitly, from an authenticated admin session, with an audit entry,
 * is the intended path.
 *
 * Two invariants are enforced regardless of what is asked for: the platform
 * cannot be left with no admins, and only a provider may belong to an
 * organization.
 */
router.patch("/users/:id", async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from("profiles")
    .select(USER_COLUMNS)
    .eq("id", req.params.id)
    .maybeSingle();
  if (findError || !existing) return res.status(404).json({ error: "User not found." });

  const role = asEnum(req.body?.role, ASSIGNABLE_ROLES, { field: "role" }) || existing.role;
  const providerRoleGiven = Object.prototype.hasOwnProperty.call(req.body || {}, "providerRole");
  const orgIdGiven = Object.prototype.hasOwnProperty.call(req.body || {}, "orgId");

  const providerRole = providerRoleGiven
    ? asEnum(req.body.providerRole, PROVIDER_ROLES, { field: "providerRole" })
    : existing.providerRole;
  const orgId = orgIdGiven ? asString(req.body.orgId, { field: "orgId", max: LIMITS.id }) : existing.orgId;

  // Losing the last admin means losing the admin area, including this endpoint,
  // with no way back in short of direct database access.
  if (existing.role === "platform_admin" && role !== "platform_admin") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "platform_admin");
    if ((count || 0) <= 1) {
      return res.status(409).json({ error: "This is the only platform admin. Promote someone else first." });
    }
  }

  const patch = { role };

  if (role === "provider") {
    if (orgId) {
      const { data: org } = await supabase.from("orgs").select("id").eq("id", orgId).maybeSingle();
      if (!org) return res.status(404).json({ error: "Organization not found." });
      patch.org_id = orgId;
      patch.provider_role = providerRole || existing.providerRole || "lead_manager";
    } else {
      patch.org_id = null;
      patch.provider_role = null;
    }
  } else {
    // A consumer or a platform admin belongs to no organization. Clearing this
    // matters: a stale org_id on a demoted account would still scope portal
    // queries if the role were ever restored.
    patch.org_id = null;
    patch.provider_role = null;
  }

  // Attaching someone by hand answers whatever they had asked for, and a settled
  // account should never be sent back to the role prompt.
  patch.role_pending = false;
  patch.org_claim_status = "none";
  patch.requested_org_id = null;
  patch.requested_org_name = null;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", req.params.id)
    .select(USER_COLUMNS)
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Couldn't update the user." });
  if (!updated) return res.status(404).json({ error: "User not found." });

  await appendAudit({
    actor: req.user.name,
    action: "user_updated",
    entity: req.params.id,
    from: `${existing.role}${existing.orgId ? ` @ ${existing.orgId}` : ""}`,
    to: `${updated.role}${updated.orgId ? ` @ ${updated.orgId}` : ""}`,
  });

  res.json(updated);
});

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

const REVIEW_REPORT_STATUSES = ["open", "resolved", "dismissed"];
const REVIEW_STATUSES = ["published", "hidden"];

/**
 * Reported reviews, newest first.
 *
 * The review is embedded rather than referenced so the decision can be made on
 * one screen: judging whether a review should come down without reading it is
 * not a decision anyone should be asked to make.
 */
router.get("/review-reports", async (req, res) => {
  const status = asEnum(req.query.status, REVIEW_REPORT_STATUSES, { field: "status" });

  let query = supabase
    .from("review_reports")
    .select(
      `id, reason, details, status, createdAt:created_at,
       review:reviews!review_reports_review_id_fkey(
         ${REVIEW_COLUMNS},
         author:profiles!reviews_author_id_fkey(name),
         org:orgs!reviews_org_id_fkey(id, name)
       )`
    )
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Couldn't load review reports." });

  res.json(
    (data || []).map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details || "",
      status: r.status,
      createdAt: r.createdAt,
      review: r.review
        ? {
            // Moderation: the reviewer's full name stays visible here, because
            // acting on a report can mean acting on the account behind it.
            ...serializeReview(r.review, { revealAuthor: true }),
            hidden: r.review.status === "hidden",
            orgId: r.review.org?.id || null,
            orgName: r.review.org?.name || null,
          }
        : null,
    }))
  );
});

/**
 * Take a review down, or put it back.
 *
 * Hiding removes it from every consumer response and from the rating average, so
 * this both silences and un-skews. It is recorded in the audit log because it is
 * the platform overriding what a member of the public said about a business.
 */
router.patch("/reviews/:id", async (req, res) => {
  const status = asEnum(req.body?.status, REVIEW_STATUSES, { field: "status", required: true });
  const reason = asString(req.body?.reason, { field: "reason", max: LIMITS.shortText, allowEmpty: true });

  const { data: existing, error: findError } = await supabase
    .from("reviews")
    .select("id, status")
    .eq("id", req.params.id)
    .maybeSingle();
  if (findError || !existing) return res.status(404).json({ error: "Review not found." });

  const { data: updated, error } = await supabase
    .from("reviews")
    .update({ status, hidden_reason: status === "hidden" ? reason || null : null })
    .eq("id", req.params.id)
    .select(`${REVIEW_COLUMNS}, author:profiles!reviews_author_id_fkey(name)`)
    .single();
  if (error) return res.status(500).json({ error: "Couldn't update the review." });

  await appendAudit({
    actor: req.user.name,
    action: "review_status_set",
    entity: req.params.id,
    from: existing.status,
    to: reason ? `${status} (${reason})` : status,
  });

  // Same moderation queue, so the row must not change name format when the
  // admin hides or restores it.
  res.json({ ...serializeReview(updated, { revealAuthor: true }), hidden: updated.status === "hidden" });
});

router.patch("/review-reports/:id", async (req, res) => {
  const status = asEnum(req.body?.status, REVIEW_REPORT_STATUSES, { field: "status", required: true });

  const { data, error } = await supabase
    .from("review_reports")
    .update({ status })
    .eq("id", req.params.id)
    .select("id, status")
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Couldn't update the report." });
  if (!data) return res.status(404).json({ error: "Report not found." });

  await appendAudit({
    actor: req.user.name,
    action: "review_report_status_set",
    entity: req.params.id,
    to: status,
  });

  res.json(data);
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
