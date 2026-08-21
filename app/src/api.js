import { API_BASE } from "./config";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function requestText(path, { method = "GET", body, token } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  const text = await res.text();
  if (!res.ok) {
    let message = "Something went wrong.";
    try {
      message = JSON.parse(text)?.error || message;
    } catch {
      // not JSON
    }
    throw new ApiError(message, res.status);
  }
  return text;
}

async function request(path, { method = "GET", body, token } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) {
    throw new ApiError(data?.error || "Something went wrong.", res.status);
  }
  return data;
}

export const api = {
  // Public — used by the provider signup form before an account exists.
  orgDirectory: (q) => request(`/orgs/directory${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  // Consumer
  categories: () => request("/categories"),
  search: (params) => request(`/search?${new URLSearchParams(params).toString()}`),
  location: (id) => request(`/locations/${id}`),
  offering: (id) => request(`/offerings/${id}`),
  compare: (ids) => request(`/compare?ids=${ids.join(",")}`),
  submitLead: (payload, token) => request("/leads", { method: "POST", body: payload, token }),
  myLeads: (token) => request("/leads", { token }),
  saved: (token) => request("/saved", { token }),
  saveProvider: (token, locationId) => request("/saved/providers", { method: "POST", body: { locationId }, token }),
  unsaveProvider: (token, locationId) => request(`/saved/providers/${locationId}`, { method: "DELETE", token }),
  saveComparison: (token, payload) => request("/saved/comparisons", { method: "POST", body: payload, token }),
  duplicateComparison: (token, id) => request(`/saved/comparisons/${id}/duplicate`, { method: "POST", token }),

  // Provider portal
  portalDashboard: (token) => request("/portal/dashboard", { token }),
  portalLocations: (token) => request("/portal/locations", { token }),
  portalUpdateLocation: (token, id, payload) => request(`/portal/locations/${id}`, { method: "PATCH", body: payload, token }),
  portalCatalog: (token) => request("/portal/catalog", { token }),
  portalCreateOffering: (token, payload) => request("/portal/catalog", { method: "POST", body: payload, token }),
  portalUpdateOffering: (token, id, payload) => request(`/portal/catalog/${id}`, { method: "PUT", body: payload, token }),
  portalExportCatalog: (token) => requestText("/portal/catalog/export", { token }),
  portalImportCatalog: (token, csv) => request("/portal/catalog/import", { method: "POST", body: { csv }, token }),
  portalLeads: (token, params) => request(`/portal/leads${params ? `?${new URLSearchParams(params).toString()}` : ""}`, { token }),
  portalLead: (token, id) => request(`/portal/leads/${id}`, { token }),
  portalUpdateLead: (token, id, payload) => request(`/portal/leads/${id}`, { method: "PATCH", body: payload, token }),

  // Consumer pricing report
  submitReport: (payload, token) => request("/reports", { method: "POST", body: payload, token }),

  // Platform admin
  adminOrgs: (token) => request("/admin/orgs", { token }),
  adminOrg: (token, id) => request(`/admin/orgs/${id}`, { token }),
  adminSetVerified: (token, id, verified) => request(`/admin/orgs/${id}/verify`, { method: "PATCH", body: { verified }, token }),
  adminOfferings: (token, status) => request(`/admin/offerings${status ? `?status=${status}` : ""}`, { token }),
  adminSetOfferingStatus: (token, id, status) => request(`/admin/offerings/${id}`, { method: "PATCH", body: { status }, token }),
  adminTaxonomy: (token) => request("/admin/taxonomy", { token }),
  adminAddCategory: (token, payload) => request("/admin/taxonomy", { method: "POST", body: payload, token }),
  adminUpdateCategory: (token, id, payload) => request(`/admin/taxonomy/${id}`, { method: "PATCH", body: payload, token }),
  adminDeleteCategory: (token, id) => request(`/admin/taxonomy/${id}`, { method: "DELETE", token }),
  adminReports: (token, status) => request(`/admin/reports${status ? `?status=${status}` : ""}`, { token }),
  adminSetReportStatus: (token, id, status) => request(`/admin/reports/${id}`, { method: "PATCH", body: { status }, token }),
  adminOrgClaims: (token) => request("/admin/org-claims", { token }),
  adminApproveOrgClaim: (token, profileId, providerRole) =>
    request(`/admin/org-claims/${profileId}/approve`, { method: "POST", body: { providerRole }, token }),
  adminRejectOrgClaim: (token, profileId) => request(`/admin/org-claims/${profileId}/reject`, { method: "POST", token }),
  adminAuditLog: (token) => request("/admin/audit-log", { token }),
  adminFunnel: (token) => request("/admin/analytics/funnel", { token }),
  adminTopCategories: (token) => request("/admin/analytics/top-categories", { token }),
};

export { ApiError };
