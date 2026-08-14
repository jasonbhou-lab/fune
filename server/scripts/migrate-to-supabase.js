import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data.json");
// .env lives at the project root (funeralprice-compare-app/.env).
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "1. Run supabase/schema.sql against your project first (SQL Editor).\n" +
      "2. Fill in the project-root .env (see .env.example) with real values.\n" +
      "3. Re-run: npm run migrate:supabase"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fail(step, error) {
  console.error(`Failed during ${step}:`, error.message || error);
  process.exit(1);
}

async function getOrCreateAuthUser(email, password, metadata) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (!error) return data.user;

  // Already migrated on a previous run — look the existing user up instead.
  if (String(error.message || "").toLowerCase().includes("already")) {
    let page = 1;
    while (true) {
      const { data: list, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (listError) fail(`listing users to find ${email}`, listError);
      const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) return found;
      if (list.users.length < 200) break;
      page += 1;
    }
  }
  fail(`creating auth user for ${email}`, error);
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  console.log(`Loaded ${DATA_FILE}`);

  // --- taxonomy -----------------------------------------------------------
  const { error: taxError } = await supabase.from("taxonomy").upsert(
    raw.taxonomy.map((t) => ({ id: t.id, label: t.label, examples: t.examples || "" }))
  );
  if (taxError) fail("taxonomy insert", taxError);
  console.log(`Migrated ${raw.taxonomy.length} taxonomy categories.`);

  // --- orgs -----------------------------------------------------------------
  const orgIdMap = {};
  for (const org of raw.orgs) {
    const { data, error } = await supabase
      .from("orgs")
      .insert({ name: org.name, verified: org.verified, created_at: org.createdAt })
      .select("id")
      .single();
    if (error) fail(`org insert (${org.id})`, error);
    orgIdMap[org.id] = data.id;
  }
  console.log(`Migrated ${raw.orgs.length} orgs.`);

  // --- locations --------------------------------------------------------
  const locationIdMap = {};
  for (const loc of raw.locations) {
    const { data, error } = await supabase
      .from("locations")
      .insert({
        org_id: orgIdMap[loc.orgId],
        name: loc.name,
        address: loc.address,
        city: loc.city,
        state: loc.state,
        zip: loc.zip,
        lat: loc.lat,
        lng: loc.lng,
        phone: loc.phone,
        hours: loc.hours,
        veteran_support: Boolean(loc.veteranSupport),
        green_options: Boolean(loc.greenOptions),
        accessibility: Boolean(loc.accessibility),
        livestreaming: Boolean(loc.livestreaming),
        online_arrangement: Boolean(loc.onlineArrangement),
        reception_facilities: Boolean(loc.receptionFacilities),
      })
      .select("id")
      .single();
    if (error) fail(`location insert (${loc.id})`, error);
    locationIdMap[loc.id] = data.id;
  }
  console.log(`Migrated ${raw.locations.length} locations.`);

  // --- offerings + history ------------------------------------------------
  const offeringIdMap = {};
  for (const o of raw.offerings) {
    const { data, error } = await supabase
      .from("offerings")
      .insert({
        location_id: locationIdMap[o.locationId],
        category: o.category,
        name: o.name,
        description: o.description || "",
        price_type: o.priceType,
        amount: o.amount,
        amount_min: o.amountMin,
        amount_max: o.amountMax,
        currency: o.currency || "USD",
        effective_date: o.effectiveDate,
        reviewed_date: o.reviewedDate,
        included: o.included || [],
        excluded: o.excluded || [],
        third_party: o.thirdParty || [],
        status: o.status,
      })
      .select("id")
      .single();
    if (error) fail(`offering insert (${o.id})`, error);
    offeringIdMap[o.id] = data.id;

    if ((o.history || []).length > 0) {
      const rows = o.history.map((snapshot) => ({
        offering_id: data.id,
        snapshot,
        versioned_at: snapshot.versionedAt,
      }));
      const { error: histError } = await supabase.from("offering_history").insert(rows);
      if (histError) fail(`offering_history insert (${o.id})`, histError);
    }
  }
  console.log(`Migrated ${raw.offerings.length} offerings.`);

  // --- provider users -> Supabase Auth + profiles -------------------------
  const profileIdMap = {};
  for (const u of raw.providerUsers) {
    const authUser = await getOrCreateAuthUser(u.email, "password123", { name: u.name });
    profileIdMap[u.id] = authUser.id;
    const { error } = await supabase.from("profiles").upsert({
      id: authUser.id,
      role: "provider",
      name: u.name,
      email: u.email,
      org_id: orgIdMap[u.orgId],
      provider_role: u.role,
    });
    if (error) fail(`provider profile upsert (${u.email})`, error);
  }
  console.log(`Migrated ${raw.providerUsers.length} provider users (password: password123).`);

  // --- platform admins -> Supabase Auth + profiles ------------------------
  for (const a of raw.platformAdmins) {
    const authUser = await getOrCreateAuthUser(a.email, "admin123", { name: a.name });
    profileIdMap[a.id] = authUser.id;
    const { error } = await supabase.from("profiles").upsert({
      id: authUser.id,
      role: "platform_admin",
      name: a.name,
      email: a.email,
    });
    if (error) fail(`admin profile upsert (${a.email})`, error);
  }
  console.log(`Migrated ${raw.platformAdmins.length} platform admins (password: admin123).`);

  // --- consumers -> Supabase Auth + profiles -------------------------------
  const consumerIdMap = {};
  for (const c of raw.consumers || []) {
    const authUser = await getOrCreateAuthUser(c.email, "changeme123", { name: c.name });
    consumerIdMap[c.id] = authUser.id;
    const { error } = await supabase.from("profiles").upsert({
      id: authUser.id,
      role: "consumer",
      name: c.name,
      email: c.email,
      request_updates: c.commPrefs?.requestUpdates ?? true,
      planning_resources: c.commPrefs?.planningResources ?? false,
      provider_offers: c.commPrefs?.providerOffers ?? false,
      do_not_contact: c.commPrefs?.doNotContact ?? false,
    });
    if (error) fail(`consumer profile upsert (${c.email})`, error);

    for (const locId of c.savedLocationIds || []) {
      if (!locationIdMap[locId]) continue;
      await supabase.from("saved_providers").insert({ consumer_id: authUser.id, location_id: locationIdMap[locId] });
    }
    for (const comp of c.savedComparisons || []) {
      await supabase.from("saved_comparisons").insert({
        consumer_id: authUser.id,
        name: comp.name,
        offering_ids: (comp.offeringIds || []).map((id) => offeringIdMap[id]).filter(Boolean),
        created_at: comp.createdAt,
      });
    }
  }
  if ((raw.consumers || []).length > 0) {
    console.log(`Migrated ${raw.consumers.length} consumers (password: changeme123).`);
  }

  // --- leads + status history ----------------------------------------------
  for (const l of raw.leads) {
    const { data, error } = await supabase
      .from("leads")
      .insert({
        client_request_id: l.clientRequestId,
        consumer_id: l.consumerId ? consumerIdMap[l.consumerId] || null : null,
        location_id: locationIdMap[l.locationId],
        offering_id: l.offeringId ? offeringIdMap[l.offeringId] || null : null,
        offering_snapshot: l.offeringSnapshot,
        first_name: l.firstName,
        last_name: l.lastName,
        contact_method: l.contactMethod,
        phone: l.phone,
        email: l.email,
        need_type: l.needType,
        timeframe: l.timeframe,
        message: l.message || "",
        consent_to_contact: Boolean(l.consentToContact),
        marketing_opt_in: Boolean(l.marketingOptIn),
        consent_version: l.consentVersion,
        consent_timestamp: l.consentTimestamp,
        status: l.status,
        owner: l.owner ? profileIdMap[l.owner] || null : null,
        created_at: l.createdAt,
      })
      .select("id")
      .single();
    if (error) fail(`lead insert (${l.id})`, error);

    if ((l.statusHistory || []).length > 0) {
      const rows = l.statusHistory.map((h) => ({ lead_id: data.id, status: h.status, at: h.at }));
      const { error: histError } = await supabase.from("lead_status_history").insert(rows);
      if (histError) fail(`lead_status_history insert (${l.id})`, histError);
    }
  }
  console.log(`Migrated ${raw.leads.length} leads.`);

  // --- pricing reports ------------------------------------------------------
  if ((raw.pricingReports || []).length > 0) {
    const rows = raw.pricingReports.map((r) => ({
      offering_id: offeringIdMap[r.offeringId],
      offering_name: r.offeringName,
      provider_name: r.providerName,
      reason: r.reason,
      details: r.details || "",
      consumer_id: r.consumerId ? consumerIdMap[r.consumerId] || null : null,
      status: r.status,
      created_at: r.createdAt,
    }));
    const { error } = await supabase.from("pricing_reports").insert(rows);
    if (error) fail("pricing_reports insert", error);
    console.log(`Migrated ${raw.pricingReports.length} pricing reports.`);
  }

  // --- audit log --------------------------------------------------------
  if ((raw.auditLog || []).length > 0) {
    const rows = raw.auditLog.map((e) => ({
      actor: e.actor,
      action: e.action,
      entity: e.entity,
      from_value: e.from,
      to_value: e.to,
      at: e.at,
    }));
    const { error } = await supabase.from("audit_log").insert(rows);
    if (error) fail("audit_log insert", error);
    console.log(`Migrated ${raw.auditLog.length} audit log entries.`);
  }

  // --- analytics events ---------------------------------------------------
  if ((raw.analyticsEvents || []).length > 0) {
    const rows = raw.analyticsEvents.map(({ id, type, at, ...meta }) => ({ type, at, meta }));
    const { error } = await supabase.from("analytics_events").insert(rows);
    if (error) fail("analytics_events insert", error);
    console.log(`Migrated ${raw.analyticsEvents.length} analytics events.`);
  }

  console.log("\nMigration complete.");
}

main();
