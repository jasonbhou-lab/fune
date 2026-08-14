import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data.json");
const BACKUP_DIR = path.join(__dirname, "..", "backups");

const REQUIRED_KEYS = ["orgs", "locations", "offerings", "providerUsers", "consumers", "leads", "auditLog"];

function latestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("data-") && f.endsWith(".json"))
    .sort();
  return files.length ? path.join(BACKUP_DIR, files[files.length - 1]) : null;
}

function main() {
  const arg = process.argv[2];
  const sourcePath = !arg || arg === "latest" ? latestBackup() : path.isAbsolute(arg) ? arg : path.join(BACKUP_DIR, arg);

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    console.error(`Backup not found: ${arg || "(no backups exist)"}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(sourcePath, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`Refusing to restore — ${sourcePath} is not valid JSON.`);
    process.exit(1);
  }
  const missing = REQUIRED_KEYS.filter((k) => !(k in parsed));
  if (missing.length) {
    console.error(`Refusing to restore — ${sourcePath} is missing expected keys: ${missing.join(", ")}.`);
    process.exit(1);
  }

  if (fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const safety = path.join(BACKUP_DIR, `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.copyFileSync(DATA_FILE, safety);
    console.log(`Saved current data.json to ${safety} before overwriting.`);
  }

  fs.writeFileSync(DATA_FILE, raw);
  console.log(`Restored ${DATA_FILE} from ${sourcePath}.`);
  console.log(`Restart the server for the restored data to take effect.`);
}

main();
