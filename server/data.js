// Reading and writing factory records, with stock rules and access rules applied.
import { pool, tx } from "./db.js";
import { HttpError, MIN_PASSWORD, hashPassword, normUsername, requireUser } from "./auth.js";
import { ROLES, can, inScope, scopeFor, seesFactory } from "./access.js";
import { RECORDS, TABLES, fromDb, insertRow, pick, settingsFromDb, updateRow } from "./tables.js";

const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString("en-US");
const today = () => new Date().toISOString().slice(0, 10);

function need(user, action) {
  if (!can(user, action)) throw new HttpError(403, "Your role doesn't allow this. Ask an administrator if you need it.");
}
function needShop(scope, outletId) {
  if (!outletId) throw new HttpError(400, "Choose the supermarket.");
  if (!inScope(scope, outletId)) throw new HttpError(403, "You can only record for the supermarkets assigned to you.");
}
const req0 = (v, msg) => { if (v === undefined || v === null || String(v).trim() === "") throw new HttpError(400, msg); };
const positive = (v, msg) => { if (!(n(v) > 0)) throw new HttpError(400, msg); };

/* ═════════════ stock figures (inside a transaction, after lock) ═════════════ */

const lock = (c) => c.query("SELECT pg_advisory_xact_lock(4217)"); // stock-changing saves wait their turn

async function one(c, sql, params) { const { rows } = await c.query(sql, params); return rows[0]; }

async function materialOnHand(c, materialId) {
  return one(c,
    `SELECT m.name, m.unit,
       COALESCE((SELECT SUM(qty) FROM material_purchases WHERE material_id = m.id), 0)
     - COALESCE((SELECT SUM(qty) FROM batch_materials WHERE material_id = m.id), 0)
     - COALESCE((SELECT SUM(qty) FROM adjustments WHERE item = 'material' AND material_id = m.id), 0) AS on_hand
     FROM materials m WHERE m.id = $1`, [materialId]);
}

async function factoryStock(c, productId) {
  const r = await one(c,
    `SELECT COALESCE((SELECT SUM(units) FROM batches WHERE product_id = $1), 0)
          - COALESCE((SELECT SUM(qty) FROM dispatches WHERE product_id = $1), 0)
          - COALESCE((SELECT SUM(qty) FROM adjustments WHERE item = 'product' AND outlet_id IS NULL AND product_id = $1), 0) AS v`,
    [productId]);
  return r.v;
}

async function shelfStock(c, outletId, productId) {
  const r = await one(c,
    `SELECT COALESCE((SELECT SUM(received_qty) FROM dispatches WHERE status = 'received' AND outlet_id = $1 AND product_id = $2), 0)
          - COALESCE((SELECT SUM(qty) FROM sales WHERE outlet_id = $1 AND product_id = $2), 0)
          - COALESCE((SELECT SUM(qty) FROM adjustments WHERE item = 'product' AND outlet_id = $1 AND product_id = $2), 0) AS v`,
    [outletId, productId]);
  return r.v;
}

/* ═════════════ reading: everything this person may see ═════════════ */

export async function loadState(c, user) {
  const scope = await scopeFor(c, user);
  const factory = seesFactory(user);
  const all = async (t, where = "", params = []) =>
    (await c.query(`SELECT * FROM ${t} ${where} ORDER BY created_at, id`, params)).rows.map((r) => fromDb(t, r));
  const s = {};

  s.settings = settingsFromDb((await c.query("SELECT * FROM settings WHERE id = 1")).rows[0]);
  s.products = await all("products");

  if (scope.all) {
    s.regions = await all("regions");
    s.outlets = await all("outlets");
    s.dispatches = await all("dispatches");
    s.sales = await all("sales");
    s.payments = await all("payments");
    s.adjustments = await all("adjustments");
  } else {
    const o = [scope.outletIds];
    s.regions = await all("regions", "WHERE id = ANY($1)", [scope.regionIds]);
    s.outlets = await all("outlets", "WHERE id = ANY($1)", o);
    s.dispatches = await all("dispatches", "WHERE outlet_id = ANY($1)", o);
    s.sales = await all("sales", "WHERE outlet_id = ANY($1)", o);
    s.payments = await all("payments", "WHERE outlet_id = ANY($1)", o);
    s.adjustments = await all("adjustments", "WHERE item = 'product' AND outlet_id = ANY($1)", o);
  }

  if (factory) {
    s.materials = await all("materials");
    s.purchases = await all("material_purchases");
    s.batches = await all("batches");
    const used = (await c.query("SELECT batch_id, material_id, qty FROM batch_materials")).rows;
    const byBatch = {};
    used.forEach((u) => (byBatch[u.batch_id] ||= []).push({ materialId: u.material_id, qty: u.qty }));
    s.batches.forEach((b) => (b.used = byBatch[b.id] || []));
    s.bom = (await c.query("SELECT product_id, material_id, qty_per_unit FROM bom_items")).rows
      .map((r) => ({ productId: r.product_id, materialId: r.material_id, qtyPerUnit: r.qty_per_unit }));
  } else {
    s.materials = []; s.purchases = []; s.batches = []; s.bom = [];
  }

  if (["admin", "management", "finance"].includes(user.role)) s.submissions = await all("report_submissions");
  else if (user.role === "regional_manager") s.submissions = await all("report_submissions", "WHERE region_id = ANY($1)", [scope.regionIds]);
  else s.submissions = [];

  // People: full details for the administrator, names only for everyone else
  const users = (await c.query("SELECT * FROM users ORDER BY name")).rows;
  if (user.role === "admin") {
    const ur = (await c.query("SELECT * FROM user_regions")).rows;
    const uo = (await c.query("SELECT * FROM user_outlets")).rows;
    s.users = users.map((u) => ({
      ...fromDb("users", u),
      canSignIn: !!(u.username && u.password_hash),
      regionIds: ur.filter((x) => x.user_id === u.id).map((x) => x.region_id),
      outletIds: uo.filter((x) => x.user_id === u.id).map((x) => x.outlet_id),
    }));
  } else {
    s.users = users.map((u) => ({ id: u.id, name: u.name, role: u.role, active: u.active }));
  }

  s.me = { id: user.id, name: user.name, username: user.username, role: user.role,
           regionIds: scope.all ? null : scope.regionIds, outletIds: scope.all ? null : scope.outletIds };
  return s;
}

/* ═════════════ importing many records (sample data, backups) ═════════════ */

const IMPORT_ORDER = [
  ["regions", "regions"], ["products", "products"], ["materials", "materials"], ["outlets", "outlets"],
  ["users", "users"], ["purchases", "material_purchases"], ["batches", "batches"], ["dispatches", "dispatches"],
  ["sales", "sales"], ["payments", "payments"], ["adjustments", "adjustments"], ["submissions", "report_submissions"],
];

async function importData(c, data, mode) {
  if (mode === "replace") {
    await c.query(`TRUNCATE adjustments, payments, sales, dispatches, batch_materials, batches, material_purchases,
                   bom_items, report_submissions, user_outlets, user_regions, outlets, regions, materials, products`);
  }
  const counts = {};
  for (const [key, table] of IMPORT_ORDER) {
    const recs = Array.isArray(data[key]) ? data[key] : [];
    for (const r of recs) {
      const rec = { ...r };
      if (table === "users") {
        delete rec.canSignIn;
        if (rec.username) rec.username = normUsername(rec.username);
        else delete rec.username;
      }
      await insertRow(c, table, rec, { upsert: true });
      if (table === "batches") {
        await c.query("DELETE FROM batch_materials WHERE batch_id = $1", [r.id]);
        for (const u of cleanUsed(r.used)) {
          await c.query("INSERT INTO batch_materials (batch_id, material_id, qty) VALUES ($1, $2, $3)", [r.id, u.materialId, u.qty]);
        }
      }
      if (table === "users") {
        if (Array.isArray(r.regionIds)) {
          await c.query("DELETE FROM user_regions WHERE user_id = $1", [r.id]);
          for (const id of r.regionIds) await c.query("INSERT INTO user_regions VALUES ($1, $2) ON CONFLICT DO NOTHING", [r.id, id]);
        }
        if (Array.isArray(r.outletIds)) {
          await c.query("DELETE FROM user_outlets WHERE user_id = $1", [r.id]);
          for (const id of r.outletIds) await c.query("INSERT INTO user_outlets VALUES ($1, $2) ON CONFLICT DO NOTHING", [r.id, id]);
        }
      }
    }
    counts[key] = recs.length;
  }
  for (const b of Array.isArray(data.bom) ? data.bom : []) {
    await c.query(
      `INSERT INTO bom_items (product_id, material_id, qty_per_unit) VALUES ($1, $2, $3)
       ON CONFLICT (product_id, material_id) DO UPDATE SET qty_per_unit = EXCLUDED.qty_per_unit`,
      [b.productId, b.materialId, b.qtyPerUnit]);
  }
  if (data.settings && typeof data.settings === "object") await saveSettings(c, data.settings);
  return counts;
}

function cleanUsed(used) {
  const m = {};
  (used || []).forEach((u) => { if (u && u.materialId && n(u.qty) > 0) m[u.materialId] = (m[u.materialId] || 0) + n(u.qty); });
  return Object.entries(m).map(([materialId, qty]) => ({ materialId, qty }));
}

async function saveSettings(c, b) {
  const { rows } = await c.query(
    `UPDATE settings SET company = COALESCE($1, company), currency = COALESCE($2, currency),
            low_days = COALESCE($3, low_days), quiet_days = COALESCE($4, quiet_days) WHERE id = 1 RETURNING *`,
    [b.company?.trim() || null, b.currency?.trim()?.toUpperCase() || null, b.lowDays ?? null, b.quietDays ?? null]);
  return settingsFromDb(rows[0]);
}

/* ═════════════ people ═════════════ */

async function saveUser(c, me, id, body) {
  const rec = pick(body, ["name", "username", "role", "phone", "email", "active"]);
  if (rec.role !== undefined && !ROLES.includes(rec.role)) throw new HttpError(400, "Choose a role.");
  if (rec.username !== undefined) rec.username = normUsername(rec.username) || null;
  if (!id) req0(rec.name, "Enter the person's name.");
  if (id === me.id && (rec.active === false || (rec.role && rec.role !== "admin"))) {
    throw new HttpError(400, "You can't remove your own administrator access. Ask another administrator.");
  }
  const pw = body.password ? String(body.password) : "";
  if (pw && pw.length < MIN_PASSWORD) throw new HttpError(400, `Use a password of at least ${MIN_PASSWORD} characters.`);

  let uid = id;
  if (id) {
    if (!(await one(c, "SELECT 1 AS ok FROM users WHERE id = $1", [id]))) throw new HttpError(404, "That person no longer exists.");
    await updateRow(c, "users", id, rec);
  } else {
    uid = (await insertRow(c, "users", rec)).id;
  }

  if (pw) {
    const u = await one(c, "SELECT username FROM users WHERE id = $1", [uid]);
    if (!u.username) throw new HttpError(400, "Give them a username so they can sign in with this password.");
    await c.query("UPDATE users SET password_hash = $2 WHERE id = $1", [uid, await hashPassword(pw)]);
    await c.query("DELETE FROM sessions WHERE user_id = $1", [uid]); // signs them out everywhere
  }
  if (rec.active === false) await c.query("DELETE FROM sessions WHERE user_id = $1", [uid]);
  if (Array.isArray(body.regionIds)) {
    await c.query("DELETE FROM user_regions WHERE user_id = $1", [uid]);
    for (const r of body.regionIds) await c.query("INSERT INTO user_regions VALUES ($1, $2) ON CONFLICT DO NOTHING", [uid, r]);
  }
  if (Array.isArray(body.outletIds)) {
    await c.query("DELETE FROM user_outlets WHERE user_id = $1", [uid]);
    for (const o of body.outletIds) await c.query("INSERT INTO user_outlets VALUES ($1, $2) ON CONFLICT DO NOTHING", [uid, o]);
  }
  return { id: uid };
}

/* ═════════════ routes ═════════════ */

export function dataRoutes(app, wrap) {
  const R = (method, path, handler) => app[method](path, requireUser, wrap(handler));

  R("get", "/api/state", async (req, res) => {
    const c = await pool.connect();
    try { res.json(await loadState(c, req.user)); } finally { c.release(); }
  });

  /* ---- setup (administrator) ---- */

  R("put", "/api/settings", async (req, res) => {
    need(req.user, "setup");
    res.json(await tx((c) => saveSettings(c, req.body || {})));
  });

  for (const [table, fields, action] of [
    ["regions", ["name", "notes"], "setup"],
    ["outlets", ["name", "type", "regionId", "area", "contact", "phone"], "setup"],
    ["products", ["name", "size", "price", "shelf"], "setup"],
    ["materials", ["name", "description", "unit", "reorder"], "materials"],
  ]) {
    R("post", `/api/${table}`, async (req, res) => {
      need(req.user, action);
      const rec = pick(req.body, fields);
      req0(rec.name, "Enter a name.");
      res.status(201).json(await tx((c) => insertRow(c, table, rec)));
    });
    R("patch", `/api/${table}/:id`, async (req, res) => {
      need(req.user, action);
      const row = await tx((c) => updateRow(c, table, req.params.id, pick(req.body, fields)));
      if (!row) throw new HttpError(404, "That record no longer exists.");
      res.json(row);
    });
    R("delete", `/api/${table}/:id`, async (req, res) => {
      need(req.user, "setup");
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    });
  }

  R("post", "/api/users", async (req, res) => {
    need(req.user, "setup");
    res.status(201).json(await tx((c) => saveUser(c, req.user, null, req.body || {})));
  });
  R("patch", "/api/users/:id", async (req, res) => {
    need(req.user, "setup");
    res.json(await tx((c) => saveUser(c, req.user, req.params.id, req.body || {})));
  });

  // Recipe (Bill of Materials): replace the whole list for one product
  R("put", "/api/products/:id/recipe", async (req, res) => {
    need(req.user, "recipes");
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await tx(async (c) => {
      await c.query("DELETE FROM bom_items WHERE product_id = $1", [req.params.id]);
      const seen = new Set();
      for (const it of items) {
        if (!it.materialId || !(n(it.qtyPerUnit) > 0) || seen.has(it.materialId)) continue;
        seen.add(it.materialId);
        await c.query("INSERT INTO bom_items (product_id, material_id, qty_per_unit) VALUES ($1, $2, $3)",
          [req.params.id, it.materialId, n(it.qtyPerUnit)]);
      }
    });
    res.json({ ok: true });
  });

  /* ---- factory & production ---- */

  R("post", "/api/purchases", async (req, res) => {
    need(req.user, "materials");
    const rec = pick(req.body, ["date", "materialId", "qty", "cost", "supplier", "supplierContact", "memo"]);
    req0(rec.materialId, "Choose the material.");
    positive(rec.qty, "Enter the quantity bought.");
    rec.date ||= today(); rec.cost = n(rec.cost); rec.recordedBy = req.user.id;
    res.status(201).json(await tx((c) => insertRow(c, "material_purchases", rec)));
  });

  R("post", "/api/batches", async (req, res) => {
    need(req.user, "batches");
    const rec = pick(req.body, ["date", "code", "productId", "plannedUnits", "units", "otherCosts", "memo"]);
    req0(rec.productId, "Choose the product.");
    if (!(n(rec.units) >= 0) || rec.units === undefined || rec.units === "") throw new HttpError(400, "Enter how many packs were produced.");
    rec.date ||= today(); rec.units = n(rec.units); rec.otherCosts = n(rec.otherCosts);
    rec.plannedUnits = rec.plannedUnits === "" || rec.plannedUnits == null ? null : n(rec.plannedUnits);
    rec.recordedBy = req.user.id;
    const used = cleanUsed(req.body?.used);
    const row = await tx(async (c) => {
      await lock(c);
      for (const u of used) {
        const m = await materialOnHand(c, u.materialId);
        if (!m) throw new HttpError(400, "One of the materials no longer exists.");
        if (u.qty > m.on_hand) throw new HttpError(409, `Only ${fmt(m.on_hand)} ${m.unit} of ${m.name} is on hand. Record the purchase first or lower the amount.`);
      }
      const b = await insertRow(c, "batches", rec);
      for (const u of used) {
        await c.query("INSERT INTO batch_materials (batch_id, material_id, qty) VALUES ($1, $2, $3)", [b.id, u.materialId, u.qty]);
      }
      return { ...b, used };
    });
    res.status(201).json(row);
  });

  /* ---- distribution ---- */

  R("post", "/api/dispatches", async (req, res) => {
    need(req.user, "dispatch");
    const rec = pick(req.body, ["date", "note", "outletId", "productId", "qty", "price"]);
    req0(rec.outletId, "Choose the supermarket.");
    req0(rec.productId, "Choose the product.");
    positive(rec.qty, "Enter how many packs are going out.");
    rec.date ||= today(); rec.price = n(rec.price); rec.status = "in_transit"; rec.recordedBy = req.user.id;
    const row = await tx(async (c) => {
      await lock(c);
      const have = await factoryStock(c, rec.productId);
      if (n(rec.qty) > have) throw new HttpError(409, `The factory only has ${fmt(have)} packs of this product. Record a production batch first.`);
      return insertRow(c, "dispatches", rec);
    });
    res.status(201).json(row);
  });

  R("post", "/api/dispatches/:id/receive", async (req, res) => {
    need(req.user, "receive");
    const row = await tx(async (c) => {
      const d = await one(c, "SELECT * FROM dispatches WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (!d) throw new HttpError(404, "That delivery no longer exists.");
      needShop(await scopeFor(c, req.user), d.outlet_id);
      if (d.status === "received") throw new HttpError(409, "This delivery has already been confirmed.");
      const got = n(req.body?.receivedQty);
      if (got < 0 || got > d.qty) throw new HttpError(400, `Enter a number between 0 and ${fmt(d.qty)} (the packs sent).`);
      return updateRow(c, "dispatches", d.id, {
        status: "received", receivedQty: got, receivedDate: req.body?.receivedDate || today(),
        receivedNote: req.body?.receivedNote || "", receivedBy: req.user.id,
      });
    });
    res.json(row);
  });

  /* ---- supermarkets ---- */

  R("post", "/api/sales", async (req, res) => {
    need(req.user, "sale");
    const rec = pick(req.body, ["date", "outletId", "productId", "qty", "unitPrice", "discount"]);
    req0(rec.productId, "Choose the product.");
    positive(rec.qty, "Enter how many packs were sold.");
    rec.date ||= today(); rec.qty = n(rec.qty); rec.unitPrice = n(rec.unitPrice); rec.discount = n(rec.discount);
    rec.amount = Math.max(0, Math.round((rec.qty * rec.unitPrice - rec.discount) * 100) / 100);
    rec.recordedBy = req.user.id;
    const row = await tx(async (c) => {
      needShop(await scopeFor(c, req.user), rec.outletId);
      await lock(c);
      const have = await shelfStock(c, rec.outletId, rec.productId);
      if (rec.qty > have) throw new HttpError(409, `This supermarket only has ${fmt(have)} packs of this product on record. Confirm the delivery first.`);
      return insertRow(c, "sales", rec);
    });
    res.status(201).json(row);
  });

  R("post", "/api/payments", async (req, res) => {
    need(req.user, "payment");
    const rec = pick(req.body, ["date", "outletId", "amount", "method", "reference"]);
    positive(rec.amount, "Enter the amount received.");
    rec.date ||= today(); rec.recordedBy = req.user.id;
    const row = await tx(async (c) => {
      needShop(await scopeFor(c, req.user), rec.outletId);
      return insertRow(c, "payments", rec);
    });
    res.status(201).json(row);
  });

  // Returns, damage, expiry and losses (packs) or wastage (raw materials)
  R("post", "/api/adjustments", async (req, res) => {
    const rec = pick(req.body, ["date", "item", "productId", "materialId", "outletId", "reason", "qty", "note"]);
    positive(rec.qty, "Enter the quantity.");
    rec.date ||= today(); rec.qty = n(rec.qty); rec.recordedBy = req.user.id;
    const row = await tx(async (c) => {
      await lock(c);
      if (rec.item === "material") {
        need(req.user, "materials");
        req0(rec.materialId, "Choose the material.");
        rec.reason = "wastage"; rec.productId = null; rec.outletId = null;
        const m = await materialOnHand(c, rec.materialId);
        if (rec.qty > m.on_hand) throw new HttpError(409, `Only ${fmt(m.on_hand)} ${m.unit} of ${m.name} is on hand.`);
      } else {
        rec.item = "product"; rec.materialId = null;
        req0(rec.productId, "Choose the product.");
        if (!["returned", "damaged", "expired", "lost"].includes(rec.reason)) throw new HttpError(400, "Choose what happened to the packs.");
        if (rec.outletId) {
          need(req.user, "shopAdjust");
          needShop(await scopeFor(c, req.user), rec.outletId);
          const have = await shelfStock(c, rec.outletId, rec.productId);
          if (rec.qty > have) throw new HttpError(409, `This supermarket only has ${fmt(have)} packs of this product on record.`);
        } else {
          need(req.user, "factoryAdjust");
          if (rec.reason === "returned") throw new HttpError(400, "Returns are recorded at the supermarket that sent them back.");
          const have = await factoryStock(c, rec.productId);
          if (rec.qty > have) throw new HttpError(409, `The factory only has ${fmt(have)} packs of this product.`);
        }
      }
      return insertRow(c, "adjustments", rec);
    });
    res.status(201).json(row);
  });

  // Stock count: compare what is really there with what the records say, and record the difference.
  // With a supermarket: counts its shelf. Without one: counts the finished packs in the factory
  // (also how you enter packs that were already in the factory before you started using the system).
  R("post", "/api/stock-counts", async (req, res) => {
    const { date, note } = req.body || {};
    const outletId = req.body?.outletId || null;
    const counts = Array.isArray(req.body?.counts) ? req.body.counts : [];
    need(req.user, outletId ? "shopAdjust" : "factoryAdjust");
    const result = await tx(async (c) => {
      if (outletId) needShop(await scopeFor(c, req.user), outletId);
      await lock(c);
      const out = [];
      for (const ct of counts) {
        if (!ct.productId || ct.counted === "" || ct.counted == null) continue;
        const counted = n(ct.counted);
        if (counted < 0) throw new HttpError(400, "Counts can't be negative.");
        const expected = outletId ? await shelfStock(c, outletId, ct.productId) : await factoryStock(c, ct.productId);
        const diff = Math.round((expected - counted) * 100) / 100;
        out.push({ productId: ct.productId, expected, counted, difference: diff });
        if (diff !== 0) {
          await insertRow(c, "adjustments", {
            date: date || today(), item: "product", productId: ct.productId, outletId, reason: "count",
            qty: diff, note: note || `Counted ${fmt(counted)}, records showed ${fmt(expected)}`, recordedBy: req.user.id,
          });
        }
      }
      return out;
    });
    res.status(201).json({ counts: result });
  });

  /* ---- reports ---- */

  R("post", "/api/submissions", async (req, res) => {
    need(req.user, "submitReport");
    const { regionId, periodFrom, periodTo, note, summary } = req.body || {};
    req0(regionId, "Choose the region.");
    if (!periodFrom || !periodTo || periodTo < periodFrom) throw new HttpError(400, "Choose a valid reporting period.");
    const row = await tx(async (c) => {
      const scope = await scopeFor(c, req.user);
      if (!scope.all && !scope.regionIds.includes(regionId)) throw new HttpError(403, "You can only submit reports for your own regions.");
      const r = await one(c, "SELECT name FROM regions WHERE id = $1", [regionId]);
      if (!r) throw new HttpError(404, "That region no longer exists.");
      return insertRow(c, "report_submissions", {
        regionId, regionName: r.name, periodFrom, periodTo, note: note || "", summary: summary || {}, submittedBy: req.user.id,
      });
    });
    res.status(201).json(row);
  });

  /* ---- deleting a record: administrators, or the person who recorded it ---- */
  const RECORD_PATHS = { purchases: "material_purchases", batches: "batches", dispatches: "dispatches", sales: "sales",
                         payments: "payments", adjustments: "adjustments", submissions: "report_submissions" };
  R("delete", "/api/:kind(purchases|batches|dispatches|sales|payments|adjustments|submissions)/:id", async (req, res) => {
    const table = RECORD_PATHS[req.params.kind];
    if (!RECORDS.includes(table)) throw new HttpError(404, "Not found.");
    const who = table === "report_submissions" ? "submitted_by" : "recorded_by";
    const row = await one(pool, `SELECT ${who} AS by FROM ${table} WHERE id = $1`, [req.params.id]);
    if (!row) return res.json({ ok: true });
    if (req.user.role !== "admin" && row.by !== req.user.id) {
      throw new HttpError(403, "Only an administrator or the person who recorded this can delete it.");
    }
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  });

  /* ---- data tools (administrator) ---- */

  R("post", "/api/bulk", async (req, res) => {
    need(req.user, "setup");
    const { mode = "merge", data = {} } = req.body || {};
    const counts = await tx((c) => importData(c, data, mode));
    res.json({ ok: true, counts });
  });
}

export { TABLES };
