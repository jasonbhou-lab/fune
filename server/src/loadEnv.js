import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Must be imported before anything that reads process.env at module-load
// time (e.g. supabaseClient.js). ES module imports are hoisted, so calling
// dotenv.config() directly in index.js — even as the first statement — would
// still run after other modules imported further down the same file have
// already been evaluated. Isolating the side effect in its own module and
// importing *that* first avoids the ordering trap.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
