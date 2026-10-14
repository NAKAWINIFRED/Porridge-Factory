// Day-to-day entry forms.
import { byKey, n0, n1, num, today } from "../lib/format";
import { recipeCost, recipeFor } from "../lib/costing";
import { useLookup, useStore } from "../state/store";
import { useNavigate } from "react-router-dom";
import { useFigures, useUI } from "../state/ui";
import { Field, FormShell, Input, Row, Select, useForm } from "../components/Form";

export const productOpts = (products, stockOf) =>
  products.map((p) => {
    const base = p.name + (p.size ? " · " + p.size : "");
    if (!stockOf) return { value: p.id, label: base };
    const [n, where] = stockOf(p.id);
    return { value: p.id, label: `${base}  (${Math.max(0, Math.round(n)).toLocaleString("en-US")} ${where})` };
  });
/** The first product with stock, or the first product. */
const firstWithStock = (products, stockOf) => (products.find((p) => stockOf(p.id)[0] > 0) || products[0])?.id || "";
export function shopOpts(outlets, L) {
  return outlets.slice()
    .sort((a, b) => L.regionName(a.regionId).localeCompare(L.regionName(b.regionId)) || a.name.localeCompare(b.name))
    .map((o) => ({ value: o.id, label: `${o.name} · ${L.regionName(o.regionId)}` }));
}

/** Shown instead of a form when something it needs hasn't been set up yet. */
export function Missing({ what, who }) {
  const { me } = useStore();
  const { close } = useUI();
  const nav = useNavigate();
  const admin = me?.role === "admin";
  return (
    <div className="missing">
      <p><b>There are no {what} yet.</b> {who}</p>
      {admin && <button className="btn primary self-start" onClick={() => { close(); nav("/setup#products"); }}>Go to Setup → Products</button>}
      {!admin && <p className="muted small">Ask your administrator to add them.</p>}
    </div>
  );
}

const onlyShop = (S, id) => id || (S.outlets.length === 1 ? S.outlets[0].id : "");

/* ---------- Raw material bought ---------- */
export function PurchaseForm({ materialId }) {
  const { state, post } = useStore();
  const { M, money } = useLookup();
  const { done } = useUI();
  const F = useFigures();
  const [v, set] = useForm({ date: today(), materialId: materialId || state.materials[0]?.id || "", qty: "", cost: "", supplier: "", supplierContact: "", memo: "" });
  const m = M(v.materialId);
  const perUnit = num(v.qty) > 0 && num(v.cost) > 0 ? num(v.cost) / num(v.qty) : null;
  return (
    <FormShell onSubmit={async () => {
      if (!(await post("/api/purchases", v))) return;
      done(`Bought ${n0(v.qty)} ${m?.unit || ""} of ${m?.name || "material"}`);
    }}>
      <Row>
        <Field id="date" label="Date"><Input id="date" type="date" v={v} set={set} /></Field>
        <Field id="materialId" label="Material">
          <Select id="materialId" v={v} set={set} options={state.materials.map((x) => ({ value: x.id, label: `${x.name} (${x.unit})` }))} />
        </Field>
      </Row>
      <Row>
        <Field id="qty" label={`Quantity bought${m ? ` (${m.unit})` : ""}`} hint={m ? `On hand now: ${n0(F.mat[m.id]?.onHand)} ${m.unit}` : ""}>
          <Input id="qty" type="number" v={v} set={set} />
        </Field>
        <Field id="cost" label="Total paid" hint={perUnit ? `${money(perUnit)} per ${m?.unit}` : "Used to work out cost per pack."}>
          <Input id="cost" money={state.settings.currency} v={v} set={set} />
        </Field>
      </Row>
      <Row>
        <Field id="supplier" label="Supplier"><Input id="supplier" v={v} set={set} placeholder="e.g. Bugesera grain cooperative" /></Field>
        <Field id="supplierContact" label="Supplier phone or contact"><Input id="supplierContact" v={v} set={set} /></Field>
      </Row>
      <Field id="memo" label="Note"><Input id="memo" v={v} set={set} /></Field>
    </FormShell>
  );
}

/* ---------- Raw material wastage ---------- */
export function WastageForm({ materialId }) {
  const { state, post } = useStore();
  const { M } = useLookup();
  const { done } = useUI();
  const F = useFigures();
  const [v, set] = useForm({ date: today(), materialId: materialId || state.materials[0]?.id || "", qty: "", note: "" });
  const m = M(v.materialId);
  return (
    <FormShell onSubmit={async () => {
      if (!(await post("/api/adjustments", { ...v, item: "material", reason: "wastage" }))) return;
      done(`Wastage recorded for ${m?.name}`);
    }}>
      <Row>
        <Field id="date" label="Date"><Input id="date" type="date" v={v} set={set} /></Field>
        <Field id="materialId" label="Material"><Select id="materialId" v={v} set={set} options={state.materials.map((x) => ({ value: x.id, label: x.name }))} /></Field>
      </Row>
      <Field id="qty" label={`Quantity lost${m ? ` (${m.unit})` : ""}`} hint={m ? `On hand: ${n0(F.mat[m.id]?.onHand)} ${m.unit}` : ""}>
        <Input id="qty" type="number" v={v} set={set} />
      </Field>
      <Field id="note" label="What happened"><Input id="note" v={v} set={set} placeholder="e.g. damp sacks, spilled, pests" /></Field>
    </FormShell>
  );
}

/* ---------- Production batch: expected vs actual ---------- */
function nextCode(date, list) {
  const d = (date || today()).replace(/-/g, "").slice(2);
  const k = list.filter((x) => (x.code || "").includes(d)).length + 1;
  return `BT-${d}-${String(k).padStart(2, "0")}`;
}
export function BatchForm() {
  const { state, post } = useStore();
  const { money } = useLookup();
  const { done } = useUI();
  const F = useFigures();
  const firstP = state.products[0]?.id || "";
  const fill = (next) => {
    recipeFor(state, next.productId, next.plannedUnits).forEach((r) => (next["mu-" + r.materialId] = r.qty ? String(r.qty) : ""));
    return next;
  };
  const [v, set] = useForm(
    fill({ date: today(), code: nextCode(today(), state.batches), productId: firstP, plannedUnits: "", units: "", otherCosts: "", memo: "",
      ...Object.fromEntries(state.materials.map((m) => ["mu-" + m.id, ""])) }),
    (next, k) => (k === "productId" || k === "plannedUnits" ? fill(next) : next)
  );
  const recipe = recipeCost(state, F, v.productId);
  const used = state.materials.map((m) => ({ materialId: m.id, qty: num(v["mu-" + m.id]) })).filter((u) => u.qty > 0);
  const matCost = used.reduce((a, u) => a + u.qty * (F.mat[u.materialId]?.avgCost || 0), 0);
  const total = matCost + num(v.otherCosts);
  const units = num(v.units), planned = num(v.plannedUnits);
  const short = used.find((u) => u.qty > (F.mat[u.materialId]?.onHand || 0));
  return (
    <FormShell onSubmit={async () => {
      if (!v.productId) return "Choose the product.";
      if (v.units === "") return "Enter how many packs were actually produced.";
      const r = await post("/api/batches", { date: v.date, code: v.code, productId: v.productId, plannedUnits: v.plannedUnits, units: v.units, otherCosts: v.otherCosts, memo: v.memo, used });
      if (r) done(`${n0(v.units)} packs added to the factory`);
    }}>
      <Row>
        <Field id="date" label="Date"><Input id="date" type="date" v={v} set={set} /></Field>
        <Field id="code" label="Batch code" hint="Printed on the packs."><Input id="code" v={v} set={set} /></Field>
      </Row>
      <Field id="productId" label="Product"><Select id="productId" v={v} set={set} options={productOpts(state.products)} /></Field>
      <Row>
        <Field id="plannedUnits" label="Packs planned (expected)" hint={recipe.hasRecipe ? "Fills in the materials from the recipe." : "No recipe yet: add one under Recipes & costs."}>
          <Input id="plannedUnits" type="number" v={v} set={set} />
        </Field>
        <Field id="units" label="Packs actually produced" bad={planned > 0 && units > 0 && units < planned}
          hint={planned > 0 && units > 0 ? (units < planned ? `${n0(planned - units)} fewer than planned (${n1((units / planned) * 100)}%)` : "On target") : ""}>
          <Input id="units" type="number" v={v} set={set} />
        </Field>
      </Row>
      <div className="field">
        <label>Raw materials actually used</label>
        {state.materials.length ? (
          <div className="mats">
            {state.materials.map((m) => (
              <div className="m" key={m.id}>
                <label htmlFor={"mu-" + m.id}>{m.name} <span className="muted small">· {n0(F.mat[m.id]?.onHand)} {m.unit} on hand</span></label>
                <Input id={"mu-" + m.id} type="number" v={v} set={set} placeholder={m.unit} />
              </div>
            ))}
          </div>
        ) : <div className="hint">Add raw materials first.</div>}
        {short && <div className="hint bad">Not enough {state.materials.find((m) => m.id === short.materialId)?.name} on hand.</div>}
      </div>
      <Field id="otherCosts" label="Other batch costs" hint="Labour, energy, water, packing labour… Optional.">
        <Input id="otherCosts" money={state.settings.currency} v={v} set={set} />
      </Field>
      {(matCost > 0 || num(v.otherCosts) > 0) && (
        <div className="cost-box">
          <div><span>Materials</span><b>{money(matCost)}</b></div>
          <div><span>Batch total</span><b>{money(total)}</b></div>
          <div><span>Cost per pack</span><b>{units > 0 ? money(total / units) : "—"}</b></div>
          {recipe.hasRecipe && recipe.priced && <div><span>Recipe cost per pack</span><b>{money(recipe.perPack)}</b></div>}
        </div>
      )}
      <Field id="memo" label="Note"><Input id="memo" v={v} set={set} /></Field>
    </FormShell>
  );
}

/* ---------- Send stock to a supermarket ---------- */
export function DispatchForm({ outletId }) {
  const { state, post } = useStore();
  const L = useLookup();
  const { done } = useUI();
  const F = useFigures();
  const factoryOf = (pid) => [F.prod[pid]?.factory || 0, "in factory"];
  const firstP = L.P(firstWithStock(state.products, factoryOf));
  const [v, set] = useForm(
    { date: today(), note: "DN-" + String(state.dispatches.length + 1).padStart(4, "0"), outletId: outletId || "", productId: firstP?.id || "", qty: "", price: firstP?.price ?? "" },
    (next, k) => { if (k === "productId") next.price = L.P(next.productId)?.price ?? ""; return next; }
  );
  const fac = F.prod[v.productId]?.factory || 0;
  const over = num(v.qty) > fac;
  return (
    <FormShell onSubmit={async () => {
      if (!v.outletId) return "Choose the supermarket.";
      if (over) return `The factory only has ${n0(fac)} packs of this product.`;
      if (await post("/api/dispatches", v)) done(`${n0(v.qty)} packs on their way to ${L.O(v.outletId)?.name}`);
    }}>
      <Row>
        <Field id="date" label="Date sent"><Input id="date" type="date" v={v} set={set} /></Field>
        <Field id="note" label="Delivery note no."><Input id="note" v={v} set={set} /></Field>
      </Row>
      <Field id="outletId" label="Supermarket"><Select id="outletId" v={v} set={set} options={shopOpts(state.outlets, L)} blank="Choose a supermarket…" /></Field>
      <Row>
        <Field id="productId" label="Product"><Select id="productId" v={v} set={set} options={productOpts(state.products, factoryOf)} /></Field>
        <Field id="qty" label="Packs sent" bad={over} hint={over ? `Only ${n0(fac)} in the factory. Add packs with Production → Record batch, or Deliveries → Factory stock count.` : `${n0(fac)} in the factory`}>
          <Input id="qty" type="number" v={v} set={set} />
        </Field>
      </Row>
      <Field id="price" label="Agreed price per pack"><Input id="price" money={state.settings.currency} v={v} set={set} /></Field>
      <p className="muted small">The packs show as <b>in transit</b> until the supermarket confirms how many arrived.</p>
    </FormShell>
  );
}

/* ---------- Confirm a delivery arrived ---------- */
export function ReceiveForm({ id }) {
  const { state, post } = useStore();
  const L = useLookup();
  const { done } = useUI();
  const d = state.dispatches.find((x) => x.id === id);
  const [v, set] = useForm({ receivedQty: d ? String(num(d.qty)) : "", receivedDate: today(), receivedNote: "" });
  if (!d) return <p className="muted">This delivery no longer exists.</p>;
  const short = num(d.qty) - num(v.receivedQty);
  return (
    <FormShell onSubmit={async () => {
      if (v.receivedQty === "") return "Enter how many packs arrived.";
      if (await post(`/api/dispatches/${encodeURIComponent(id)}/receive`, v)) done(`Delivery confirmed at ${L.O(d.outletId)?.name}`);
    }}>
      <div className="kv">
        <div><b>{n0(d.qty)}</b><span>packs sent on {d.date}</span></div>
        <div><b className="sm">{L.pName(d.productId)}</b><span>{L.O(d.outletId)?.name}</span></div>
        <div><b className="sm">{d.note || "—"}</b><span>delivery note</span></div>
      </div>
      <Row>
        <Field id="receivedQty" label="Packs that arrived in good condition" bad={short > 0}
          hint={short > 0 ? `${n0(short)} missing or damaged on arrival: this is recorded as a discrepancy.` : "All packs arrived."}>
          <Input id="receivedQty" type="number" v={v} set={set} />
        </Field>
        <Field id="receivedDate" label="Date received"><Input id="receivedDate" type="date" v={v} set={set} /></Field>
      </Row>
      <Field id="receivedNote" label="Note"><Input id="receivedNote" v={v} set={set} placeholder={short > 0 ? "What happened to the missing packs?" : ""} /></Field>
    </FormShell>
  );
}

/* ---------- Sales at a supermarket ---------- */
export function SaleForm({ outletId }) {
  const { state, post } = useStore();
  const L = useLookup();
  const { done } = useUI();
  const F = useFigures();
  const shelfOf = (oid) => (pid) => [oid ? F.out[oid]?.by[pid]?.shelf || 0 : 0, "on shelf"];
  const startShop = onlyShop(state, outletId);
  const firstP = L.P(startShop ? firstWithStock(state.products, shelfOf(startShop)) : state.products[0]?.id);
  const [v, set] = useForm(
    { date: today(), outletId: startShop, productId: firstP?.id || "", qty: "", unitPrice: firstP?.price ?? "", discount: "" },
    (next, k) => {
      if (k === "outletId" && next.outletId && !(shelfOf(next.outletId)(next.productId)[0] > 0)) next.productId = firstWithStock(state.products, shelfOf(next.outletId));
      if (k === "productId" || k === "outletId") next.unitPrice = L.P(next.productId)?.price ?? "";
      return next;
    }
  );
  const shelf = v.outletId ? F.out[v.outletId]?.by[v.productId]?.shelf || 0 : 0;
  const over = v.outletId && num(v.qty) > shelf;
  const amount = Math.max(0, num(v.qty) * num(v.unitPrice) - num(v.discount));
  return (
    <FormShell onSubmit={async () => {
      if (!v.outletId) return "Choose the supermarket.";
      if (over) return `This supermarket only has ${n0(shelf)} packs of this product on record. Confirm the delivery first.`;
      if (await post("/api/sales", v)) done(`Sales recorded · ${L.money(amount)}`);
    }}>
      <Row>
        <Field id="date" label="Date"><Input id="date" type="date" v={v} set={set} /></Field>
        <Field id="outletId" label="Supermarket"><Select id="outletId" v={v} set={set} options={shopOpts(state.outlets, L)} blank="Choose…" /></Field>
      </Row>
      <Row>
        <Field id="productId" label="Product"><Select id="productId" v={v} set={set} options={productOpts(state.products, v.outletId ? shelfOf(v.outletId) : null)} /></Field>
        <Field id="qty" label="Packs sold" bad={over} hint={v.outletId ? `${n0(shelf)} on the shelf` : ""}><Input id="qty" type="number" v={v} set={set} /></Field>
      </Row>
      <Row>
        <Field id="unitPrice" label="Price per pack"><Input id="unitPrice" money={state.settings.currency} v={v} set={set} /></Field>
        <Field id="discount" label="Discount, total" hint="Optional."><Input id="discount" money={state.settings.currency} v={v} set={set} /></Field>
      </Row>
      <div className="cost-box"><div><span>Sales value</span><b>{L.money(amount)}</b></div></div>
    </FormShell>
  );
}

/* ---------- Payment received from a supermarket ---------- */
export function PaymentForm({ outletId }) {
  const { state, post } = useStore();
  const L = useLookup();
  const { done } = useUI();
  const F = useFigures();
  const [v, set] = useForm({ date: today(), outletId: onlyShop(state, outletId), amount: "", method: "Mobile money", reference: "" });
  const owed = v.outletId ? F.out[v.outletId]?.outstanding || 0 : 0;
  return (
    <FormShell onSubmit={async () => {
      if (!v.outletId) return "Choose the supermarket.";
      if (await post("/api/payments", v)) done(`Payment of ${L.money(v.amount)} recorded`);
    }}>
      <Row>
        <Field id="date" label="Date"><Input id="date" type="date" v={v} set={set} /></Field>
        <Field id="outletId" label="Supermarket"><Select id="outletId" v={v} set={set} options={shopOpts(state.outlets, L)} blank="Choose…" /></Field>
      </Row>
      <Field id="amount" label="Amount received" hint={v.outletId ? `They owe ${L.money(owed)} at the moment.` : ""}>
        <Input id="amount" money={state.settings.currency} v={v} set={set} />
      </Field>
      <Row>
        <Field id="method" label="Paid by"><Select id="method" v={v} set={set} options={["Mobile money", "Bank transfer", "Cash", "Cheque", "Other"].map((x) => ({ value: x, label: x }))} /></Field>
        <Field id="reference" label="Reference"><Input id="reference" v={v} set={set} placeholder="Transaction ID, receipt no." /></Field>
      </Row>
    </FormShell>
  );
}

/* ---------- Returns, damage, expiry, loss (packs) ---------- */
export function AdjustForm({ outletId, factory }) {
  const { state, post } = useStore();
  const L = useLookup();
  const { done } = useUI();
  const F = useFigures();
  const [v, set] = useForm({ date: today(), outletId: factory ? "" : onlyShop(state, outletId), productId: state.products[0]?.id || "", reason: factory ? "damaged" : "returned", qty: "", note: "" });
  const have = factory ? F.prod[v.productId]?.factory || 0 : v.outletId ? F.out[v.outletId]?.by[v.productId]?.shelf || 0 : 0;
  const reasons = (factory ? [] : [["returned", "Returned to the factory"]]).concat([["damaged", "Damaged"], ["expired", "Expired"], ["lost", "Lost / missing"]]);
  return (
    <FormShell onSubmit={async () => {
      if (!factory && !v.outletId) return "Choose the supermarket.";
      if (num(v.qty) > have) return `Only ${n0(have)} packs on record there.`;
      if (await post("/api/adjustments", { ...v, item: "product", outletId: factory ? null : v.outletId })) done("Recorded");
    }}>
      <Row>
        <Field id="date" label="Date"><Input id="date" type="date" v={v} set={set} /></Field>
        {factory ? <Field id="where" label="Where"><input id="where" value="At the factory" disabled /></Field>
          : <Field id="outletId" label="Supermarket"><Select id="outletId" v={v} set={set} options={shopOpts(state.outlets, L)} blank="Choose…" /></Field>}
      </Row>
      <Row>
        <Field id="productId" label="Product"><Select id="productId" v={v} set={set} options={productOpts(state.products)} /></Field>
        <Field id="reason" label="What happened"><Select id="reason" v={v} set={set} options={reasons.map(([value, label]) => ({ value, label }))} /></Field>
      </Row>
      <Field id="qty" label="Packs" hint={`${n0(have)} on record ${factory ? "in the factory" : "on the shelf"}`}><Input id="qty" type="number" v={v} set={set} /></Field>
      <Field id="note" label="Note"><Input id="note" v={v} set={set} /></Field>
    </FormShell>
  );
}

/* ---------- Stock count at a supermarket ---------- */
export function StockCountForm({ outletId, factory }) {
  const { state, post } = useStore();
  const L = useLookup();
  const { done, toast } = useUI();
  const F = useFigures();
  const [v, set] = useForm({ date: today(), outletId: factory ? "" : onlyShop(state, outletId), note: "", ...Object.fromEntries(state.products.map((p) => ["c-" + p.id, ""])) });
  const expectedFor = (pid) => (factory ? Math.max(0, F.prod[pid]?.factory || 0) : v.outletId ? F.out[v.outletId]?.by[pid]?.shelf || 0 : 0);
  return (
    <FormShell onSubmit={async () => {
      if (!factory && !v.outletId) return "Choose the supermarket.";
      const counts = state.products.filter((p) => v["c-" + p.id] !== "").map((p) => ({ productId: p.id, counted: v["c-" + p.id] }));
      if (!counts.length) return "Enter at least one count.";
      const r = await post("/api/stock-counts", { outletId: factory ? null : v.outletId, date: v.date, note: v.note, counts });
      if (!r) return;
      const diffs = r.counts.filter((c) => c.difference !== 0);
      if (factory) {
        done(diffs.length ? "Factory stock updated" : "Count saved · matches the records");
        return;
      }
      done(diffs.length ? `Count saved · ${diffs.length} product${diffs.length > 1 ? "s" : ""} differed from the records` : "Count saved · matches the records");
      if (diffs.some((c) => c.difference > 0)) toast(`${n0(diffs.reduce((a, c) => a + Math.max(0, c.difference), 0))} packs missing compared with the records`, "bad");
    }}>
      {factory && (
        <p className="muted small">
          Count the finished packs in the factory and type what's really there. The factory stock is set to match.
          Use this when you start using the system (packs you already had), or whenever you check the store.
          Packs you produce from now on are added by <b>Production → Record batch</b>.
        </p>
      )}
      <Row>
        <Field id="date" label="Date of count"><Input id="date" type="date" v={v} set={set} /></Field>
        {factory ? <Field id="where" label="Where"><input id="where" value="At the factory" disabled /></Field>
          : <Field id="outletId" label="Supermarket"><Select id="outletId" v={v} set={set} options={shopOpts(state.outlets, L)} blank="Choose…" /></Field>}
      </Row>
      <div className="field">
        <label>Packs counted {factory ? "in the factory" : "on the shelf"}</label>
        <div className="mats">
          {state.products.map((p) => {
            const expected = expectedFor(p.id);
            const c = v["c-" + p.id];
            const diff = c === "" ? null : expected - num(c);
            return (
              <div className="m" key={p.id}>
                <label htmlFor={"c-" + p.id}>{L.pName(p.id)}
                  <span className={"small " + (diff ? "bad-text" : "muted")}> · records say {n0(expected)}{diff ? ` · ${diff > 0 ? n0(diff) + " fewer" : n0(-diff) + " more"}` : ""}</span>
                </label>
                <Input id={"c-" + p.id} type="number" v={v} set={set} placeholder="packs" />
              </div>
            );
          })}
        </div>
        <div className="hint">Leave a product empty if you didn't count it.{factory ? "" : " Differences are recorded as stock discrepancies."}</div>
      </div>
      <Field id="note" label="Note"><Input id="note" v={v} set={set} placeholder={factory ? "e.g. Opening stock" : ""} /></Field>
    </FormShell>
  );
}

export { byKey };
