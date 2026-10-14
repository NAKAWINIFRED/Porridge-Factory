// Maps the app's field names (camelCase) to database columns (snake_case).
// Only the columns listed here can be read or written through the API.

export const TABLES = {
  regions: { name: "name", notes: "notes" },
  users: { name: "name", username: "username", role: "role", phone: "phone", email: "email", active: "active" },
  outlets: { name: "name", type: "type", regionId: "region_id", area: "area", contact: "contact", phone: "phone" },
  products: { name: "name", size: "size", price: "price", shelf: "shelf_price" },
  materials: { name: "name", description: "description", unit: "unit", reorder: "reorder_level" },
  material_purchases: {
    date: "date", materialId: "material_id", qty: "qty", cost: "cost",
    supplier: "supplier", supplierContact: "supplier_contact", memo: "memo", recordedBy: "recorded_by",
  },
  batches: {
    date: "date", code: "code", productId: "product_id", plannedUnits: "planned_units", units: "units",
    otherCosts: "other_costs", memo: "memo", recordedBy: "recorded_by",
  },
  dispatches: {
    date: "date", note: "note", outletId: "outlet_id", productId: "product_id", qty: "qty", price: "price",
    status: "status", receivedQty: "received_qty", receivedDate: "received_date", receivedBy: "received_by",
    receivedNote: "received_note", recordedBy: "recorded_by",
  },
  sales: {
    date: "date", outletId: "outlet_id", productId: "product_id", qty: "qty", unitPrice: "unit_price",
    discount: "discount", amount: "amount", recordedBy: "recorded_by",
  },
  payments: { date: "date", outletId: "outlet_id", amount: "amount", method: "method", reference: "reference", recordedBy: "recorded_by" },
  adjustments: {
    date: "date", item: "item", productId: "product_id", materialId: "material_id", outletId: "outlet_id",
    reason: "reason", qty: "qty", note: "note", recordedBy: "recorded_by",
  },
  report_submissions: {
    regionId: "region_id", regionName: "region_name", periodFrom: "period_from", periodTo: "period_to",
    note: "note", summary: "summary", submittedBy: "submitted_by",
  },
};

/** Day-to-day records (deleted by an admin, or by the person who recorded them). */
export const RECORDS = ["material_purchases", "batches", "dispatches", "sales", "payments", "adjustments", "report_submissions"];

const isLink = (col) => col.endsWith("_id") || col.endsWith("_by");

// Number columns. An empty box in a form arrives as "" and must become a number (or empty) before saving.
const NUMBER_ZERO = new Set(["price", "shelf_price", "reorder_level", "cost", "other_costs", "discount", "unit_price", "amount"]);
const NUMBER_NULL = new Set(["planned_units", "received_qty"]);
const NUMBER = new Set([...NUMBER_ZERO, ...NUMBER_NULL, "qty", "units"]);
const DATES = new Set(["date", "received_date", "period_from", "period_to"]);

function cleanValue(col, v) {
  if (NUMBER.has(col)) {
    if (v === "" || v === null || v === undefined) return NUMBER_NULL.has(col) || !NUMBER_ZERO.has(col) ? null : 0;
    const x = parseFloat(String(v).replace(/,/g, ""));
    return Number.isFinite(x) ? x : NaN; // NaN is refused below with a clear message
  }
  if (DATES.has(col) && v === "") return null;
  return v;
}

/** Keep only the listed app fields from a request body. */
export function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body && body[f] !== undefined) out[f] = body[f];
  return out;
}

/** App record → { columns, values } for SQL. */
export function toDb(table, rec, { withMeta = true } = {}) {
  const map = TABLES[table];
  const columns = [];
  const values = [];
  for (const [field, col] of Object.entries(map)) {
    if (rec[field] === undefined) continue;
    let v = rec[field];
    if (isLink(col) && (v === "" || v === null)) v = null;
    if (typeof v === "string") v = v.trim();
    v = cleanValue(col, v);
    if (Number.isNaN(v)) {
      const err = new Error(`"${String(rec[field])}" isn't a number. Use digits only, for example 6500.`);
      err.status = 400;
      throw err;
    }
    if (col === "summary") v = JSON.stringify(v ?? {});
    columns.push(col);
    values.push(v);
  }
  if (withMeta) {
    if (rec.id) { columns.push("id"); values.push(String(rec.id)); }
    if (rec.sample !== undefined) { columns.push("sample"); values.push(!!rec.sample); }
    if (rec.createdAt) { columns.push("created_at"); values.push(rec.createdAt); }
  }
  return { columns, values };
}

/** Database row → app record. */
export function fromDb(table, row) {
  const out = { id: row.id };
  for (const [field, col] of Object.entries(TABLES[table])) out[field] = row[col] ?? (isLink(col) ? null : "");
  if (row.sample) out.sample = true;
  out.createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return out;
}

export async function insertRow(c, table, rec, { upsert = false } = {}) {
  const { columns, values } = toDb(table, rec);
  const ph = values.map((_, i) => `$${i + 1}`).join(", ");
  let sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${ph})`;
  if (upsert && columns.includes("id")) {
    const set = columns.filter((x) => x !== "id").map((x) => `${x} = EXCLUDED.${x}`).join(", ");
    sql += set ? ` ON CONFLICT (id) DO UPDATE SET ${set}` : " ON CONFLICT (id) DO NOTHING";
  }
  const { rows } = await c.query(sql + " RETURNING *", values);
  return rows[0] ? fromDb(table, rows[0]) : null;
}

export async function updateRow(c, table, id, rec) {
  const { columns, values } = toDb(table, rec, { withMeta: false });
  if (!columns.length) return null;
  const set = columns.map((col, i) => `${col} = $${i + 2}`).join(", ");
  const { rows } = await c.query(`UPDATE ${table} SET ${set} WHERE id = $1 RETURNING *`, [id, ...values]);
  return rows[0] ? fromDb(table, rows[0]) : null;
}

export const settingsFromDb = (row) => ({
  company: row.company, currency: row.currency, lowDays: row.low_days, quietDays: row.quiet_days,
});
