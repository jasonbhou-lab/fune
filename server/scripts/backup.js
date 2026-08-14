import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data.json");
const BACKUP_DIR = path.join(__dirname, "..", "backups");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`No data file found at ${DATA_FILE}. Nothing to back up.`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  JSON.parse(raw); // fail fast if data.json is somehow corrupt — never back up garbage

  const dest = path.join(BACKUP_DIR, `data-${timestamp()}.json`);
  fs.writeFileSync(dest, raw);

  const sizeKb = (fs.statSync(dest).size / 1024).toFixed(1);
  console.log(`Backed up ${DATA_FILE} -> ${dest} (${sizeKb} KB)`);
}

main();
