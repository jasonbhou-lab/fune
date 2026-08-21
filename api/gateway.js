import app from "../server/src/app.js";

// The single Vercel Function that serves the whole Express API.
//
// The path arrives as an explicit ?__p= query parameter, put there by a rewrite
// in vercel.json, and this handler turns it back into the URL Express expects.
// That indirection exists because filename-based catch-all routing did not work
// here, twice:
//
//   api/[[...path]].js  — a Next.js-only optional-catch-all convention. Plain
//                         Vercel Functions treated it as one dynamic segment.
//   api/[...path].js    — the documented convention, and it behaved the same
//                         way: /api/health and /api/search reached Express while
//                         /api/offerings/:id, /api/orgs/:id/reviews,
//                         /api/portal/leads and /api/admin/orgs all returned
//                         Vercel's own plain-text NOT_FOUND without the function
//                         ever running.
//
// Both failures look identical from the app: a 404 whose body is text/plain, so
// the client's response.json() finds nothing and every screen reports a generic
// "Something went wrong".
//
// A plain filename plus an explicit rewrite depends on nothing undocumented.
// The filename carries no routing meaning, so there is no convention left to
// get wrong.
export default function handler(req, res) {
  const incoming = new URL(req.url || "/", "http://gateway.invalid");

  // Vercel merges the original request's query string into the rewrite
  // destination, so __p sits alongside the caller's real parameters. Take it
  // out before rebuilding, or it would leak through to the route handlers.
  const path = incoming.searchParams.get("__p") || "";
  incoming.searchParams.delete("__p");
  const search = incoming.searchParams.toString();

  // Trim any leading slash from the captured path so the join can't produce
  // "/api//foo", which Express treats as a different route.
  const clean = path.replace(/^\/+/, "");

  req.url = `/api${clean ? `/${clean}` : ""}${search ? `?${search}` : ""}`;

  return app(req, res);
}
