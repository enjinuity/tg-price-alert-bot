// Simple JSON file storage for alerts.
// This keeps the project beginner-friendly: no database needed.

const fs = require("fs/promises");
const path = require("path");

const configuredAlertsFile = String(process.env.ALERTS_FILE || "").trim();
const configuredDataDir = String(process.env.DATA_DIR || "").trim();

const DATA_DIR = configuredAlertsFile
  ? path.dirname(path.resolve(configuredAlertsFile))
  : configuredDataDir
    ? path.resolve(configuredDataDir)
    : path.join(__dirname, "..", "data");

const ALERTS_FILE = configuredAlertsFile
  ? path.resolve(configuredAlertsFile)
  : path.join(DATA_DIR, "alerts.json");

async function ensureStorageExists() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(ALERTS_FILE);
  } catch {
    await fs.writeFile(ALERTS_FILE, "[]\n", "utf8");
  }
}

async function loadAlerts() {
  await ensureStorageExists();

  const raw = await fs.readFile(ALERTS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAlerts(alerts) {
  await ensureStorageExists();
  await fs.writeFile(ALERTS_FILE, JSON.stringify(alerts, null, 2) + "\n", "utf8");
}

module.exports = {
  loadAlerts,
  saveAlerts,
  ALERTS_FILE
};
