const ZIP_COORDS = {
  "77494": { lat: 29.7858, lng: -95.8245, city: "Katy", state: "TX" },
  "77450": { lat: 29.7752, lng: -95.8399, city: "Katy", state: "TX" },
  "77002": { lat: 29.7589, lng: -95.3677, city: "Houston", state: "TX" },
  "77024": { lat: 29.7699, lng: -95.4816, city: "Houston", state: "TX" },
};

const DEFAULT_ZIP = "77494";

export function geocodeZip(zip) {
  // Plain bracket indexing walked the prototype chain, so a request for
  // ?zip=constructor or ?zip=__proto__ returned Object.prototype members
  // instead of falling back to the default. hasOwn confines the lookup to the
  // table's real entries.
  if (typeof zip === "string" && Object.hasOwn(ZIP_COORDS, zip)) return ZIP_COORDS[zip];
  return ZIP_COORDS[DEFAULT_ZIP];
}

// Haversine distance in miles
export function milesBetween(a, b) {
  if (!a || !b) return null;
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c * 10) / 10;
}
