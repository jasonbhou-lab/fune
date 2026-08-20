import app from "./app.js";

// Local / self-hosted entry point. The app itself lives in app.js so it can
// also be imported by the Vercel function at api/, which must not open a port.

// Safety net. Request-scoped async errors are already routed to the error
// handler by createRouter(), so anything landing here is a bug outside a
// request — worth logging loudly, but not worth taking the whole API down for
// every other user, which is exactly the availability failure this replaces.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

// An uncaught exception, by contrast, leaves the process in an unknown state,
// so the correct move is to log it and let the supervisor start a clean one.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception — exiting:", err);
  process.exit(1);
});

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`fpc-server listening on http://0.0.0.0:${PORT} (reachable via your machine's LAN IP too)`);
});

server.on("error", (err) => {
  console.error(`Could not start server on port ${PORT}:`, err.message);
  process.exit(1);
});
