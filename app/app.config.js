// Dynamic wrapper around app.json. Everything static still lives there; this
// file only layers on the one setting that has to vary per deployment.
//
// Hostinger's Git tool clones into a SUBFOLDER of the document root rather than
// the root itself, so the site is served from e.g. https://example.com/glp/.
// An Expo web export writes absolute asset URLs (/_expo/static/js/web/...),
// which resolve against the domain root and therefore 404 from a subfolder —
// the page would load blank. experiments.baseUrl prepends the subpath to those
// URLs so they resolve correctly.
//
// Set WEB_BASE_PATH at build time to the subfolder, with a leading slash and no
// trailing slash (e.g. "/glp"). Leave it unset to build for the domain root.
// The GitHub Actions workflow passes it through from the repository variable of
// the same name, so the value lives in repo settings rather than in git.

const rawBasePath = (process.env.WEB_BASE_PATH || "").trim();

function normalizeBasePath(value) {
  if (!value || value === "/") return "";

  let path = value.replace(/\/+$/, ""); // drop trailing slashes
  if (!path.startsWith("/")) path = `/${path}`; // Expo warns without a leading slash

  // Fail the build rather than emit a site whose asset URLs are quietly wrong —
  // the symptom of that is a blank white page with 404s in the console, which is
  // slow to diagnose. This catches a Windows path leaking in (a shell can
  // rewrite a leading-slash value into "C:/..."), directory traversal, and
  // anything else that isn't a plain URL subpath.
  if (!/^(\/[A-Za-z0-9._~-]+)+$/.test(path) || path.includes("..")) {
    throw new Error(
      `WEB_BASE_PATH is not a valid URL subpath: ${JSON.stringify(value)} (normalized to ${JSON.stringify(path)}).\n` +
        'Use a simple path like "/glp", or leave it unset to build for the domain root.'
    );
  }

  return path;
}

const baseUrl = normalizeBasePath(rawBasePath);

module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    // Empty string is Expo's default and means "served from the domain root".
    baseUrl,
  },
});
