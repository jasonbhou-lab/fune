import { supabase } from "./supabaseClient.js";

// Column projections that alias Postgres's snake_case columns back to the
// camelCase shape the existing serialize.js / csv.js / frontend contract
// already expect, so that business logic didn't need to change during the
// Supabase migration — only where the data comes from.
export const ORG_COLUMNS = "id, name, verified, createdAt:created_at";

export const LOCATION_COLUMNS = `
  id, orgId:org_id, name, address, city, state, zip, lat, lng, phone, hours,
  veteranSupport:veteran_support, greenOptions:green_options, accessibility,
  livestreaming, onlineArrangement:online_arrangement, receptionFacilities:reception_facilities
`;

export const OFFERING_COLUMNS = `
  id, locationId:location_id, category, name, description,
  priceType:price_type, amount, amountMin:amount_min, amountMax:amount_max,
  currency, effectiveDate:effective_date, reviewedDate:reviewed_date,
  included, excluded, thirdParty:third_party, status
`;

export async function findLocation(locationId) {
  const { data, error } = await supabase
    .from("locations")
    .select(`${LOCATION_COLUMNS}, org:orgs(${ORG_COLUMNS})`)
    .eq("id", locationId)
    .maybeSingle();
  if (error || !data || !data.org) return null;
  const { org, ...location } = data;
  return { location, org };
}

export async function findOffering(offeringId) {
  const { data, error } = await supabase
    .from("offerings")
    .select(`${OFFERING_COLUMNS}, location:locations(${LOCATION_COLUMNS}, org:orgs(${ORG_COLUMNS}))`)
    .eq("id", offeringId)
    .maybeSingle();
  if (error || !data || !data.location || !data.location.org) return null;
  const { location: locWithOrg, ...offering } = data;
  const { org, ...location } = locWithOrg;
  return { offering, location, org };
}

export async function appendAudit({ actor, action, entity, from = null, to = null }) {
  const { error } = await supabase.from("audit_log").insert({ actor, action, entity, from_value: from, to_value: to });
  if (error) console.error("appendAudit failed:", error.message);
}

export async function trackEvent(type, meta = {}) {
  const { error } = await supabase.from("analytics_events").insert({ type, meta });
  if (error) console.error("trackEvent failed:", error.message);
}
