// Backups: a full copy of every record (including people's accounts) saved as a file in the
// backups/ folder on the computer running the app. One is also made automatically each day.
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool, tx } from "./db.js";
import { HttpError, requireUser } from "./auth.js";

export const BACKUP_DIR = process.env.BACKUP_DIR || fileURLToPath(new URL("../backups", import.meta.url));
const KEEP = 60; // newest backups kept; older ones are removed automatically

// Restore order: a table comes after the tables it points to.
const TABLES = [
  "settings", "regions", "users", "products", "materials", "outlets", "user_regions", "user_outlets",
  "bom_items", "material_purchases", "batches", "batch_materials", "dispatches", "sales", "payments",
  "adjustments", "report_submissions",
];
const KINDS = { manual: "Manual", auto: "Automatic", "before-restore": "Before a restore" };
const NAME_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_(manual|auto|before-restore)\.json$/;

const pad = (n) => String(n).padStart(2, "0");
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** Save a backup file. Returns its summary. */
export async function createBackup(kind = "manual", client) {
  await mkdir(BACKUP_DIR, { recursive: true });
  const c = client || (await pool.connect());
  try {
    const tables = {};
    for (const t of TABLES) tables[t] = (await c.query(`SELECT * FROM ${t}`)).rows;
    const data = { app: "porridge-factory", schemaVersion: 2, kind, createdAt: new Date().toISOString(), tables };
    let name = `${stamp()}_${kind}.json`;
    // two clicks in the same second: wait a moment so names stay unique
    try { await stat(path.join(BACKUP_DIR, name)); await new Promise((r) => setTimeout(r, 1100)); name = `${stamp()}_${kind}.json`; } catch { /* free */ }
    await writeFile(path.join(BACKUP_DIR, name), JSON.stringify(data));
    await prune();
    return summarize(name, data, (await stat(path.join(BACKUP_DIR, name))).size);
  } finally {
    if (!client) c.release();
  }
}

function summarize(name, data, size) {
  const t = data.tables || {};
  const n = (k) => (t[k] || []).length;
  return {
    name, kind: KINDS[data.kind] || data.kind, createdAt: data.createdAt, size,
    records: TABLES.filter((k) => k !== "settings").reduce((a, k) => a + n(k), 0),
    counts: { supermarkets: n("outlets"), products: n("products"), deliveries: n("dispatches"), sales: n("sales"), payments: n("payments"), people: n("users") },
  };
}

async function listFiles() {
  try { return (await readdir(BACKUP_DIR)).filter((f) => NAME_RE.test(f)).sort().reverse(); } catch { return []; }
}

async function prune() {
  const files = await listFiles();
  for (const f of files.slice(KEEP)) await unlink(path.join(BACKUP_DIR, f)).catch(() => {});
}

async function readBackup(name) {
  if (!NAME_RE.test(name)) throw new HttpError(404, "That backup doesn't exist.");
  let data;
  try { data = JSON.parse(await readFile(path.join(BACKUP_DIR, name), "utf8")); }
  catch { throw new HttpError(404, "That backup file is missing or damaged."); }
  if (data.app !== "porridge-factory" || !data.tables) throw new HttpError(400, "That file isn't a Porridge Factory backup.");
  return data;
}

/** Replace every record with the backup's. A safety backup of the current records is made first. */
async function restoreBackup(name) {
  const data = await readBackup(name);
  const safety = await createBackup("before-restore");
  await tx(async (c) => {
    await c.query(`TRUNCATE ${[...TABLES].reverse().join(", ")}, sessions`);
    for (const t of TABLES) {
      const rows = data.tables[t] || [];
      if (!rows.length) continue;
      await c.query(`INSERT INTO ${t} SELECT * FROM json_populate_recordset(NULL::${t}, $1::json)`, [JSON.stringify(rows)]);
    }
    const s = await c.query("SELECT count(*)::int AS n FROM settings");
    if (!s.rows[0].n) await c.query("INSERT INTO settings (id) VALUES (1)");
  });
  return { restored: summarize(name, data, 0), safety: safety.name };
}

/** Make one automatic backup per day (called on normal use; never blocks or fails a request). */
let autoDay = null;
export function dailyBackup() {
  const today = stamp().slice(0, 10);
  if (autoDay === today) return;
  autoDay = today;
  listFiles()
    .then((files) => (files.some((f) => f.startsWith(today) && f.endsWith("_auto.json")) ? null : createBackup("auto")))
    .catch((e) => { autoDay = null; console.warn("Automatic backup failed:", e.message); });
}

export function backupRoutes(app, wrap) {
  const admin = (req) => { if (req.user?.role !== "admin") throw new HttpError(403, "Only an administrator can manage backups."); };

  app.get("/api/backups", requireUser, wrap(async (req, res) => {
    admin(req);
    const out = [];
    for (const f of await listFiles()) {
      try {
        const full = path.join(BACKUP_DIR, f);
        out.push(summarize(f, JSON.parse(await readFile(full, "utf8")), (await stat(full)).size));
      } catch { /* skip unreadable files */ }
    }
    res.json({ folder: BACKUP_DIR, backups: out });
  }));

  app.post("/api/backups", requireUser, wrap(async (req, res) => {
    admin(req);
    res.status(201).json(await createBackup("manual"));
  }));

  app.post("/api/backups/:name/restore", requireUser, wrap(async (req, res) => {
    admin(req);
    res.json(await restoreBackup(req.params.name));
  }));

  app.get("/api/backups/:name/download", requireUser, wrap(async (req, res) => {
    admin(req);
    await readBackup(req.params.name);
    res.download(path.join(BACKUP_DIR, req.params.name), `porridge-factory-${req.params.name}`);
  }));
}
