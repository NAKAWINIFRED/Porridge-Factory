// All the live figures: factory stock, packs in transit, each shop's shelf, sales, payments, run-out estimates.
// Everything is worked out from the records, so nothing can drift out of step.
import { addDays, daysBetween, num, today } from "./format";

export const LOSS_REASONS = { returned: "Returned", damaged: "Damaged", expired: "Expired", lost: "Lost / missing", count: "Count difference", wastage: "Wastage" };

const blankShop = () => ({
  by: {}, received: 0, sold: 0, removed: 0, inShop: 0, inTransit: 0, pending: 0, rev: 0, paid: 0, outstanding: 0,
  soldP: 0, revP: 0, paidP: 0, first: null, lastSale: null, lastDel: null, sold14: 0,
});

export function compute(S, period) {
  const T = today();
  const since = period ? addDays(T, -period + 1) : "0000-00-00";
  const inP = (d) => !!d && d >= since;
  const r14 = addDays(T, -13);
  const settings = S.settings;

  /* ---- raw materials ---- */
  const mat = {};
  const gm = (id) => mat[id] || (mat[id] = { purchased: 0, purchasedP: 0, cost: 0, costP: 0, used: 0, usedP: 0, wasted: 0, wastedP: 0 });
  S.materials.forEach((m) => gm(m.id));
  S.purchases.forEach((r) => {
    const m = gm(r.materialId);
    m.purchased += num(r.qty); m.cost += num(r.cost);
    if (inP(r.date)) { m.purchasedP += num(r.qty); m.costP += num(r.cost); }
  });
  S.batches.forEach((b) => (b.used || []).forEach((u) => {
    const m = gm(u.materialId);
    m.used += num(u.qty);
    if (inP(b.date)) m.usedP += num(u.qty);
  }));

  /* ---- products (factory side) ---- */
  const prod = {};
  const gp = (id) => prod[id] || (prod[id] = { produced: 0, producedP: 0, dispatched: 0, dispatchedP: 0, factoryLoss: 0, inTransit: 0, soldP: 0, revP: 0 });
  S.products.forEach((p) => gp(p.id));
  S.batches.forEach((b) => { const p = gp(b.productId); p.produced += num(b.units); if (inP(b.date)) p.producedP += num(b.units); });

  /* ---- shops ---- */
  const out = {};
  const go = (id) => out[id] || (out[id] = blankShop());
  S.outlets.forEach((o) => go(o.id));
  const gb = (o, pid) => o.by[pid] || (o.by[pid] = { received: 0, sold: 0, removed: 0, soldP: 0, revP: 0 });
  const daily = {};

  S.dispatches.forEach((d) => {
    const p = gp(d.productId), q = num(d.qty);
    p.dispatched += q;
    if (inP(d.date)) p.dispatchedP += q;
    const o = go(d.outletId);
    if (d.status === "received") {
      const r = num(d.receivedQty);
      o.received += r; gb(o, d.productId).received += r;
      if (!o.first || d.receivedDate < o.first) o.first = d.receivedDate;
      if (!o.lastDel || d.receivedDate > o.lastDel) o.lastDel = d.receivedDate;
    } else {
      o.inTransit += q; o.pending += 1; p.inTransit += q;
    }
  });

  S.sales.forEach((s) => {
    const o = go(s.outletId), q = num(s.qty), a = num(s.amount);
    o.sold += q; o.rev += a; gb(o, s.productId).sold += q;
    if (!o.lastSale || s.date > o.lastSale) o.lastSale = s.date;
    if (s.date >= r14) o.sold14 += q;
    if (inP(s.date)) {
      o.soldP += q; o.revP += a;
      const b = gb(o, s.productId); b.soldP += q; b.revP += a;
      gp(s.productId).soldP += q; gp(s.productId).revP += a;
      daily[s.date] = (daily[s.date] || 0) + a;
    }
  });

  S.payments.forEach((pm) => {
    const o = go(pm.outletId);
    o.paid += num(pm.amount);
    if (inP(pm.date)) o.paidP += num(pm.amount);
    if (!o.lastPay || pm.date > o.lastPay) o.lastPay = pm.date;
  });

  S.adjustments.forEach((a) => {
    const q = num(a.qty);
    if (a.item === "material") {
      const m = gm(a.materialId); m.wasted += q; if (inP(a.date)) m.wastedP += q;
    } else if (a.outletId) {
      const o = go(a.outletId); o.removed += q; gb(o, a.productId).removed += q;
    } else {
      gp(a.productId).factoryLoss += q;
    }
  });

  Object.values(mat).forEach((m) => {
    m.onHand = m.purchased - m.used - m.wasted;
    m.avgCost = m.purchased > 0 ? m.cost / m.purchased : null;
  });
  Object.values(prod).forEach((p) => (p.factory = p.produced - p.dispatched - p.factoryLoss));

  Object.values(out).forEach((o) => {
    o.inShop = Math.max(0, o.received - o.sold - o.removed);
    Object.values(o.by).forEach((b) => (b.shelf = Math.max(0, b.received - b.sold - b.removed)));
    o.outstanding = o.rev - o.paid;
    o.daysActive = o.first ? daysBetween(o.first, T) + 1 : 0;
    const win = o.first ? Math.max(1, Math.min(14, o.daysActive)) : 14;
    o.rate = o.sold14 / win;
    o.daysLeft = o.rate > 0 ? o.inShop / o.rate : null;
    o.quiet = o.lastSale ? daysBetween(o.lastSale, T) : o.first ? daysBetween(o.first, T) : null;
    if (!o.first && !o.pending) o.status = ["New", "mute"];
    else if (o.inShop <= 0 && o.pending) o.status = ["Delivery to confirm", "warn"];
    else if (o.inShop <= 0) o.status = ["Out of stock", "bad"];
    else if (o.daysLeft !== null && o.daysLeft <= settings.lowDays) o.status = ["Restock soon", "warn"];
    else if (o.quiet !== null && o.quiet >= settings.quietDays) o.status = ["No sales recorded", "warn"];
    else o.status = ["Stocked", "good"];
  });

  /* ---- regions ---- */
  const reg = {};
  S.regions.forEach((r) => (reg[r.id] = { outlets: [], inShop: 0, soldP: 0, revP: 0, outstanding: 0 }));
  S.outlets.forEach((o) => {
    const r = reg[o.regionId];
    if (!r) return;
    const x = out[o.id];
    r.outlets.push(o.id); r.inShop += x.inShop; r.soldP += x.soldP; r.revP += x.revP; r.outstanding += x.outstanding;
  });

  const sum = (obj, k) => Object.values(obj).reduce((a, x) => a + (x[k] || 0), 0);
  const tot = {
    matInP: sum(mat, "purchasedP"),
    matCostP: sum(mat, "costP"),
    producedP: sum(prod, "producedP"),
    factory: Object.values(prod).reduce((a, p) => a + Math.max(0, p.factory), 0),
    inTransit: sum(out, "inTransit"),
    pending: sum(out, "pending"),
    inShops: sum(out, "inShop"),
    soldP: sum(out, "soldP"),
    revP: sum(out, "revP"),
    paidP: sum(out, "paidP"),
    outstanding: sum(out, "outstanding"),
    shopsStocked: Object.values(out).filter((o) => o.inShop > 0).length,
  };

  return { T, since, inP, prod, mat, out, reg, tot, daily };
}
