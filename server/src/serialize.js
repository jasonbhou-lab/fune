import { milesBetween } from "./geo.js";

// Any of these amounts can be null in the database. Reading .toLocaleString()
// off null threw a TypeError, and because priceDisplay runs inside /api/search
// for every result, a single malformed row took down search for every user —
// publish validation only requires an amount for fixed/starting_at, so a
// published "range" offering with no min/max was enough to do it.
function money(amount) {
  return typeof amount === "number" && Number.isFinite(amount) ? `$${amount.toLocaleString()}` : null;
}

export function priceDisplay(offering) {
  switch (offering.priceType) {
    case "fixed":
      return { label: "Fixed", text: money(offering.amount) ?? "—" };
    case "starting_at": {
      const amount = money(offering.amount);
      return { label: "Starting at", text: amount ? `from ${amount}` : "—" };
    }
    case "range": {
      const min = money(offering.amountMin);
      const max = money(offering.amountMax);
      return { label: "Range", text: min && max ? `${min}–${max}` : min || max || "—" };
    }
    case "quote_required":
      return { label: "Quote required", text: "Price on request" };
    default:
      return { label: offering.priceType || "Unknown", text: "—" };
  }
}

export function disclosureCompleteness(offering) {
  const checks = [
    Array.isArray(offering.included) && offering.included.length > 0,
    Array.isArray(offering.excluded) || (Array.isArray(offering.thirdParty) && offering.thirdParty.length >= 0),
    Boolean(offering.effectiveDate),
    Boolean(offering.reviewedDate) &&
      new Date(offering.reviewedDate) > new Date(Date.now() - 90 * 86400000),
  ];
  const complete = checks.filter(Boolean).length;
  return { complete, total: checks.length };
}

export function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export const ATTRIBUTE_KEYS = [
  "veteranSupport",
  "greenOptions",
  "accessibility",
  "livestreaming",
  "onlineArrangement",
  "receptionFacilities",
];

export function attributesOf(location) {
  const attrs = {};
  for (const key of ATTRIBUTE_KEYS) {
    attrs[key] = Boolean(location[key]);
  }
  return attrs;
}

export function serializeForSearch({ offering, location, org, origin }) {
  return {
    offeringId: offering.id,
    locationId: location.id,
    orgId: org.id,
    providerName: org.name,
    verified: org.verified,
    distanceMiles: milesBetween(origin, location),
    lat: location.lat,
    lng: location.lng,
    category: offering.category,
    name: offering.name,
    status: offering.status,
    price: priceDisplay(offering),
    effectiveDate: offering.effectiveDate,
    reviewedDate: offering.reviewedDate,
    reviewedDaysAgo: daysSince(offering.reviewedDate),
    disclosure: disclosureCompleteness(offering),
    attributes: attributesOf(location),
  };
}

export function serializeOfferingDetail({ offering, location, org }) {
  return {
    id: offering.id,
    category: offering.category,
    name: offering.name,
    description: offering.description,
    status: offering.status,
    price: priceDisplay(offering),
    effectiveDate: offering.effectiveDate,
    reviewedDate: offering.reviewedDate,
    reviewedDaysAgo: daysSince(offering.reviewedDate),
    included: offering.included || [],
    excluded: offering.excluded || [],
    thirdParty: offering.thirdParty || [],
    location: serializeLocation({ location, org }),
  };
}

export function serializeLocation({ location, org }) {
  return {
    id: location.id,
    orgId: org.id,
    orgName: org.name,
    verified: org.verified,
    name: location.name,
    address: location.address,
    city: location.city,
    state: location.state,
    zip: location.zip,
    lat: location.lat,
    lng: location.lng,
    phone: location.phone,
    hours: location.hours,
    attributes: attributesOf(location),
  };
}

export function thirdPartyCell(offering) {
  const tp = offering.thirdParty || [];
  if (tp.length === 0) return { text: "Included", state: "included" };
  const anyUnknown = tp.some((t) => t.status === "unknown");
  if (anyUnknown) return { text: "Unknown", state: "unknown" };
  const total = tp.reduce((sum, t) => sum + (t.amount || 0), 0);
  return { text: `Est. $${total.toLocaleString()}`, state: "estimated" };
}
