// Porridge Factory API: connects the React app to PostgreSQL.
import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SchemaError, checkSchema } from "./db.js";
import { HttpError, authRoutes, loadUser } from "./auth.js";
import { dataRoutes } from "./data.js";
import { backupRoutes, dailyBackup } from "./backup.js";

const app = express();
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "20mb" }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Check the database is set up (and the right version) before anything touches it.
// If it isn't, the check runs again on the next request, so fixing it in pgAdmin needs no restart.
let schemaOk = false;
app.use("/api", wrap(async (req, res, next) => {
  if (!schemaOk) { await checkSchema(); schemaOk = true; }
  next();
}));

app.use("/api", loadUser);
app.use("/api", (req, res, next) => { if (req.user) dailyBackup(); next(); }); // one automatic backup a day
authRoutes(app, wrap);
dataRoutes(app, wrap);
backupRoutes(app, wrap);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

/* ---------- serve the built React app (after `npm run build`) ---------- */
const dist = fileURLToPath(new URL("../dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile("index.html", { root: dist }));
}

/* ---------- errors → plain messages the app can show ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError || err.status === 400) return res.status(err.status).json({ error: err.message });
  if (err instanceof SchemaError) return res.status(503).json({ error: err.message, setup: true });
  const pg = {
    "23503": "This is linked to other records (for example deliveries or sales), so it can't be changed or deleted. Remove those records first.",
    "23502": `Some required information is missing${err.column ? ` (${err.column.replace(/_/g, " ")})` : ""}.`,
    "23514": "One of the numbers isn't allowed. Quantities must be above zero and prices can't be negative.",
    "23505": err.constraint === "users_username_key" ? "That username is already taken." : "That name is already in use.",
    "22P02": "One of the values is in the wrong format.",
    "22007": "One of the dates is in the wrong format.",
    "22008": "One of the dates is in the wrong format.",
  };
  if (err.code && pg[err.code]) return res.status(400).json({ error: pg[err.code] });
  if (["ECONNREFUSED", "ECONNRESET", "ENOENT", "ENOTFOUND", "ETIMEDOUT", "57P01", "57P03"].includes(err.code)) {
    return res.status(503).json({ error: "The server can't connect to the PostgreSQL database. Check that PostgreSQL is running (you can see it in pgAdmin)." });
  }
  if (err.code === "28P01" || err.code === "28000") {
    return res.status(503).json({ error: "PostgreSQL rejected the username or password. Check PGUSER and PGPASSWORD in the .env file." });
  }
  if (err.code === "3D000") {
    return res.status(503).json({ error: `The database "${process.env.PGDATABASE || "porridge_factory"}" doesn't exist yet. Create it in pgAdmin (right-click Databases → Create → Database).` });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server. Check the server window for details." });
});

/* ---------- start ---------- */
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, async () => {
  console.log(`Porridge Factory API running on http://localhost:${PORT}`);
  try {
    await checkSchema();
    schemaOk = true;
    console.log(`Connected to PostgreSQL database "${process.env.PGDATABASE || "porridge_factory"}" (version 2).`);
  } catch (e) {
    console.warn(`\n⚠ ${e instanceof SchemaError ? e.message : "Could not connect to PostgreSQL yet: " + e.message}`);
    console.warn("  The server keeps running and will connect once this is fixed.\n");
  }
});
