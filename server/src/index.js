import "./loadEnv.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import consumerRoutes from "./routes/consumer.js";
import portalRoutes from "./routes/portal.js";
import adminRoutes from "./routes/admin.js";

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "fpc-server" }));

app.use("/api", consumerRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`fpc-server listening on http://0.0.0.0:${PORT} (reachable via your machine's LAN IP too)`);
});
