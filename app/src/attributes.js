export const ATTRIBUTES = [
  { key: "veteranSupport", label: "Veteran / military support" },
  { key: "greenOptions", label: "Green / natural options" },
  { key: "accessibility", label: "Accessibility" },
  { key: "livestreaming", label: "Livestreaming" },
  { key: "onlineArrangement", label: "Online arrangement available" },
  { key: "receptionFacilities", label: "Reception facilities" },
];

export const DEFAULT_FILTERS = {
  category: null,
  verifiedOnly: false,
  veteranSupport: false,
  greenOptions: false,
  accessibility: false,
  livestreaming: false,
  onlineArrangement: false,
  receptionFacilities: false,
};

export function activeFilterCount(filters) {
  let count = 0;
  if (filters.category) count += 1;
  if (filters.verifiedOnly) count += 1;
  for (const { key } of ATTRIBUTES) {
    if (filters[key]) count += 1;
  }
  return count;
}
