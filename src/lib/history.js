// One combined, newest-first list of everything recorded.
import { n0, num } from "./format";
import { LOSS_REASONS } from "./calc";

export const HISTORY_TYPES = {
  in: { label: "Materials", icon: "In" },
  make: { label: "Production", icon: "Mk" },
  out: { label: "Deliveries", icon: "Out" },
  sold: { label: "Sales", icon: "$" },
  paid: { label: "Payments", icon: "Pd" },
  adj: { label: "Stock changes", icon: "±" },
};

export function buildHistory(S, L) {
  const rows = [];
  const push = (r) => rows.push({ t: r.rec.createdAt || "", ...r });

  S.purchases.forEach((r) => {
    const m = L.M(r.materialId);
    push({ id: r.id, type: "in", date: r.date, rec: r, by: r.recordedBy, materialId: r.materialId,
      title: `Bought ${n0(r.qty)} ${m?.unit || ""} of ${m?.name || "material"}`,
      detail: r.supplier ? `from ${r.supplier}` : "", value: num(r.cost), qty: num(r.qty) });
  });
  S.batches.forEach((b) => {
    push({ id: b.id, type: "make", date: b.date, rec: b, by: b.recordedBy, productId: b.productId,
      title: `Produced ${n0(b.units)} × ${L.pName(b.productId)}`,
      detail: [b.code && `Batch ${b.code}`, b.plannedUnits ? `planned ${n0(b.plannedUnits)}` : ""].filter(Boolean).join(" · "),
      value: 0, qty: num(b.units) });
  });
  S.dispatches.forEach((d) => {
    const shop = L.O(d.outletId)?.name || "Removed shop";
    push({ id: d.id, type: "out", date: d.date, rec: d, by: d.recordedBy, shopId: d.outletId, productId: d.productId, shopName: shop,
      title: `Sent ${n0(d.qty)} × ${L.pName(d.productId)}`, detail: d.note || "", value: num(d.qty) * num(d.price), qty: num(d.qty) });
    if (d.status === "received") {
      const short = num(d.qty) - num(d.receivedQty);
      push({ id: d.id + "-r", type: "out", date: d.receivedDate, rec: { ...d, createdAt: d.receivedDate }, by: d.receivedBy,
        shopId: d.outletId, productId: d.productId, shopName: shop,
        title: `Received ${n0(d.receivedQty)} of ${n0(d.qty)} × ${L.pName(d.productId)}`,
        detail: short > 0 ? `${n0(short)} missing on arrival` : d.receivedNote || "", value: 0, qty: num(d.receivedQty) });
    }
  });
  S.sales.forEach((s) => {
    push({ id: s.id, type: "sold", date: s.date, rec: s, by: s.recordedBy, shopId: s.outletId, productId: s.productId,
      shopName: L.O(s.outletId)?.name || "Removed shop",
      title: `Sold ${n0(s.qty)} × ${L.pName(s.productId)}`,
      detail: num(s.discount) ? `discount ${L.money(s.discount)}` : "", value: num(s.amount), qty: num(s.qty) });
  });
  S.payments.forEach((p) => {
    push({ id: p.id, type: "paid", date: p.date, rec: p, by: p.recordedBy, shopId: p.outletId,
      shopName: L.O(p.outletId)?.name || "Removed shop",
      title: "Payment received", detail: [p.method, p.reference].filter(Boolean).join(" · "), value: num(p.amount), qty: 0 });
  });
  S.adjustments.forEach((a) => {
    const what = a.item === "material"
      ? `${n0(a.qty)} ${L.M(a.materialId)?.unit || ""} of ${L.M(a.materialId)?.name || "material"}`
      : `${n0(Math.abs(a.qty))} × ${L.pName(a.productId)}`;
    const reason = a.reason === "count" ? (a.qty > 0 ? "Count: missing" : "Count: extra found") : LOSS_REASONS[a.reason];
    push({ id: a.id, type: "adj", date: a.date, rec: a, by: a.recordedBy, shopId: a.outletId || undefined, productId: a.productId,
      shopName: a.outletId ? L.O(a.outletId)?.name || "Removed shop" : a.item === "product" ? "the factory" : "",
      title: `${reason}: ${what}`, detail: a.note || "", value: 0, qty: num(a.qty) });
  });
  return rows.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.t > a.t ? 1 : b.t < a.t ? -1 : 0));
}
