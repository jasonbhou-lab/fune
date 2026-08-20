import "./loadEnv.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import consumerRoutes from "./routes/consumer.js";
import portalRoutes from "./routes/portal.js";
import adminRoutes from "./routes/admin.js";
import { globalLimiter } from "./rateLimit.js";
import { validationErrorHandler } from "./validate.js";

const app = express();

// Behind a reverse proxy (Hostinger/Passenger, nginx, Cloudflare, a load
// balancer) every request arrives from the proxy's own address, so
// express-rate-limit would bucket the entire internet into a single counter
// and lock out real users. TRUST_PROXY tells Express how many proxy hops to
// trust for X-Forwarded-For. It stays off by default: enabling it when the
// server is directly internet-facing would let clients spoof their own IP via
// a forged header and walk straight past the rate limits.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

app.use(helmet());

// CORS was previously wide open (`cors()` with no options reflects any
// origin). Browsers would then let any website on the internet call this API
// with the caller's cookies/credentials. Tokens here live in localStorage
// rather than cookies, which limits the damage, but an open API is still an
// open API. Set CORS_ORIGINS to a comma-separated allowlist in production.
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn(
    "CORS_ORIGINS is not set — allowing all origins. Set it to your app's origin(s) " +
      "(e.g. CORS_ORIGINS=https://app.example.com) before going to production."
  );
}

app.use(
  cors({
    origin(origin, callback) {
      // Requests with no Origin header (curl, native apps, server-to-server)
      // aren't subject to the browser same-origin model, so there's nothing
      // for CORS to protect against.
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  })
);

// An explicit cap, rather than relying on the library default, and a bigger
// one only where large payloads are legitimately expected (CSV import).
app.use("/api/portal/catalog/import", express.json({ limit: "2mb" }));
app.use(express.json({ limit: "100kb" }));

app.use(globalLimiter);

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "fpc-server" }));

app.use("/api", consumerRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/admin", adminRoutes);

app.use((_req, res) => res.status(404).json({ error: "Not found." }));

app.use(validationErrorHandler);

// Malformed JSON reaches here as a SyntaxError from body-parser; it's a client
// error, not a server fault, and shouldn't be logged as one.
app.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Request body is not valid JSON." });
  }
  return next(err);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  // Never echo the underlying error to the client: these messages carry
  // Postgres/PostgREST internals (table names, constraint names, SQL text).
  res.status(500).json({ error: "Internal server error." });
});

export default app;
