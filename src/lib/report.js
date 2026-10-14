// Period reports at three levels: supermarket, region, whole business.
// Opening stock = everything before the period; closing = opening + received − sold − returns/losses.
import { addDays, num, today } from "./format";

export const METRICS = [
  ["opening", "Opening stock"], ["received", "Received"], ["sold", "Sold"], ["returned", "Returned"],
  ["losses", "Damaged / expired / lost"], ["countDiff", "Count difference"], ["closing", "Closing stock"],
  ["salesValue", "Sales value"], ["discount", "Discounts"], ["paid", "Paid"], ["outstanding", "Outstanding"],
];

const blank = () => ({
  opening: 0, received: 0, sold: 0, returned: 0, losses: 0, countDiff: 0, closing: 0,
  salesValue: 0, discount: 0, paid: 0, outstanding: 0, shortOnArrival: 0, inTransit: 0,
});

function addInto(a, b) { for (const k of Object.keys(a)) a[k] += b[k] || 0; return a; }

export function presetPeriod(key) {
  const t = today();
  const [y, m] = t.split("-").map(Number);
  const iso = (yy, mm, dd) => `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const lastDay = (yy, mm) => new Date(yy, mm, 0).getDate();
  if (key === "month") return { from: iso(y, m, 1), to: t };
  if (key === "lastMonth") { const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y; return { from: iso(py, pm, 1), to: iso(py, pm, lastDay(py, pm)) }; }
  if (key === "30") return { from: addDays(t, -29), to: t };
  if (key === "7") return { from: addDays(t, -6), to: t };
  if (key === "year") return { from: iso(y, 1, 1), to: t };
  return { from: iso(y, m, 1), to: t };
}

/**
 * Build the report for a period.
 * Returns { shops: {id: {totals, byProduct}}, regions: {id|"none": totals}, total, factory }.
 */
export function buildReport(S, from, to) {
  const before = (d) => d && d < from;
  const within = (d) => d && d >= from && d <= to;
  const upTo = (d) => d && d <= to;

  const shops = {};
  const shop = (id) => shops[id] || (shops[id] = { totals: blank(), byProduct: {} });
  const line = (sid, pid) => { const s = shop(sid); return s.byProduct[pid] || (s.byProduct[pid] = blank()); };
  S.outlets.forEach((o) => shop(o.id));

  const bump = (sid, pid, key, v) => { line(sid, pid)[key] += v; shop(sid).totals[key] += v; };
  const money = (sid, key, v) => { shop(sid).totals[key] += v; };

  S.dispatches.forEach((d) => {
    if (d.status === "received") {
      const r = num(d.receivedQty);
      if (before(d.receivedDate)) bump(d.outletId, d.productId, "opening", r);
      else if (within(d.receivedDate)) {
        bump(d.outletId, d.productId, "received", r);
        bump(d.outletId, d.productId, "shortOnArrival", num(d.qty) - r);
      }
    }
    // Sent by the end of the period but not received by then
    if (upTo(d.date) && !(d.status === "received" && upTo(d.receivedDate))) bump(d.outletId, d.productId, "inTransit", num(d.qty));
  });

  S.sales.forEach((s) => {
    const q = num(s.qty);
    if (before(s.date)) { bump(s.outletId, s.productId, "opening", -q); }
    else if (within(s.date)) {
      bump(s.outletId, s.productId, "sold", q);
      line(s.outletId, s.productId).salesValue += num(s.amount);
      money(s.outletId, "salesValue", num(s.amount));
      money(s.outletId, "discount", num(s.discount));
    }
    if (upTo(s.date)) money(s.outletId, "outstanding", num(s.amount));
  });

  S.payments.forEach((p) => {
    if (within(p.date)) money(p.outletId, "paid", num(p.amount));
    if (upTo(p.date)) money(p.outletId, "outstanding", -num(p.amount));
  });

  S.adjustments.forEach((a) => {
    if (a.item !== "product" || !a.outletId) return;
    const q = num(a.qty);
    if (before(a.date)) bump(a.outletId, a.productId, "opening", -q);
    else if (within(a.date)) {
      const key = a.reason === "returned" ? "returned" : a.reason === "count" ? "countDiff" : "losses";
      bump(a.outletId, a.productId, key, q);
    }
  });

  const close = (t) => { t.closing = t.opening + t.received - t.sold - t.returned - t.losses - t.countDiff; };
  Object.values(shops).forEach((s) => { close(s.totals); Object.values(s.byProduct).forEach(close); });

  const regions = {};
  const total = blank();
  S.outlets.forEach((o) => {
    const key = o.regionId || "none";
    regions[key] ||= blank();
    addInto(regions[key], shops[o.id].totals);
    addInto(total, shops[o.id].totals);
  });

  // Factory side (only for people who see production records)
  const factory = { produced: 0, dispatched: 0, factoryLosses: 0, materialsBought: 0, wastage: 0 };
  S.batches.forEach((b) => { if (within(b.date)) factory.produced += num(b.units); });
  S.dispatches.forEach((d) => { if (within(d.date)) factory.dispatched += num(d.qty); });
  S.adjustments.forEach((a) => {
    if (!within(a.date)) return;
    if (a.item === "product" && !a.outletId) factory.factoryLosses += num(a.qty);
    if (a.item === "material") factory.wastage += 1;
  });
  S.purchases.forEach((p) => { if (within(p.date)) factory.materialsBought += num(p.cost); });

  return { from, to, shops, regions, total, factory };
}

/** Rows → CSV text (for download). */
export function toCSV(rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
