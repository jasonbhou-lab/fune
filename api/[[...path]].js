import app from "../server/src/app.js";

// Vercel Function that serves the whole Express API.
//
// A catch-all filename is used so that every /api/** path reaches one function
// and the Express router does the routing, rather than splitting the API into
// dozens of separate functions. The double bracket form also matches bare /api.
//
// The URL normalisation below is deliberate. Vercel's own Express guide does not
// state whether the function receives the full original path (/api/categories)
// or a rewritten one, and the routers in this app are mounted under /api. Rather
// than depend on undocumented behaviour, force the shape Express expects: if the
// incoming path has already lost the /api prefix, put it back. Both cases then
// land on the same route.
export default function handler(req, res) {
  const original = req.url || "/";

  if (!original.startsWith("/api/") && original !== "/api") {
    // Preserve the query string while re-prefixing only the path.
    const split = original.indexOf("?");
    const pathname = split === -1 ? original : original.slice(0, split);
    const search = split === -1 ? "" : original.slice(split);
    req.url = `/api${pathname === "/" ? "" : pathname}${search}`;
  }

  return app(req, res);
}
