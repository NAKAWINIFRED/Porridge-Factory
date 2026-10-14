// The side drawer: a supermarket in detail, or any entry form.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fmtDate, n0, n1, num } from "../lib/format";
import { buildHistory } from "../lib/history";
import { can } from "../lib/roles";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import {
  AdjustForm, BatchForm, DispatchForm, Missing, PaymentForm, PurchaseForm, ReceiveForm, SaleForm, StockCountForm, WastageForm,
} from "../forms/EntryForms";
import {
  MaterialForm, PasswordForm, ProductForm, RecipeForm, RegionForm, SettingsForm, ShopForm, SubmitReportForm, UserForm,
} from "../forms/SetupForms";
import HistoryList from "./HistoryList";
import { DataTable, Empty, Pill, Stamp } from "./ui";

// Forms that can't work until at least one product exists, with what to tell the person.
const NEEDS_PRODUCTS = {
  count: "Products are what you count on the shelf, so add your porridge products first (name, pack size and price).",
  sale: "Add your porridge products first, then you can record sales.",
  adjust: "Add your porridge products first.",
  dispatch: "Add your porridge products first, then record production before sending stock out.",
  batch: "Add the products you make first.",
};

const FORMS = {
  purchase: ["Raw material bought", "Production", PurchaseForm],
  wastage: ["Raw material wastage", "Production", WastageForm],
  batch: ["Record a production batch", "Production", BatchForm],
  dispatch: ["Send stock to a supermarket", "Deliveries", DispatchForm],
  receive: ["Confirm a delivery arrived", "Deliveries", ReceiveForm],
  sale: ["Record sales", "Sales", SaleForm],
  payment: ["Record a payment received", "Payments", PaymentForm],
  adjust: [(p) => (p.factory ? "Damaged or lost packs at the factory" : "Returns, damage or losses"), "Stock changes", AdjustForm],
  count: [(p) => (p.factory ? "Factory stock count" : "Stock count"), (p) => (p.factory ? "Factory" : "Supermarket"), StockCountForm],
  shopForm: [(p) => (p.id ? "Edit supermarket" : "Add a supermarket"), "Supermarkets", ShopForm],
  regionForm: [(p) => (p.id ? "Edit region" : "Add a region"), "Regions", RegionForm],
  userForm: [(p) => (p.id ? "Edit person" : "Add a person"), "People & access", UserForm],
  productForm: [(p) => (p.id ? "Edit product" : "Add a product"), "Products", ProductForm],
  materialForm: [(p) => (p.id ? "Edit raw material" : "Add a raw material"), "Raw materials", MaterialForm],
  recipe: ["Recipe (Bill of Materials)", "Recipes & costs", RecipeForm],
  settings: ["Company settings", "Setup", SettingsForm],
  password: ["Change your password", "Your account", PasswordForm],
  submitReport: ["Submit report to management", "Reports", SubmitReportForm],
};

export default function DrawerHost() {
  const { drawer, close } = useUI();
  const { state } = useStore();
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, close]);
  if (!drawer) return null;

  const key = drawer.kind + JSON.stringify(drawer.props);
  let content;
  if (drawer.kind === "shop") {
    content = <ShopDetail key={key} id={drawer.props.id} />;
  } else {
    const [t, eyebrow, Comp] = FORMS[drawer.kind];
    content = (
      <>
        <DrawerHead eyebrow={typeof eyebrow === "function" ? eyebrow(drawer.props) : eyebrow} title={typeof t === "function" ? t(drawer.props) : t} />
        <div className="drawer-b">
          {NEEDS_PRODUCTS[drawer.kind] && !state.products.length
            ? <Missing what="products" who={NEEDS_PRODUCTS[drawer.kind]} />
            : <Comp key={key} {...drawer.props} />}
        </div>
      </>
    );
  }
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="drawer" role="dialog" aria-modal="true">{content}</div>
    </div>
  );
}

function DrawerHead({ eyebrow, title }) {
  const { close } = useUI();
  return (
    <div className="drawer-h">
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      <button className="icon-btn" onClick={close} aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

/** Collapsible history, plus a link to the full History page filtered to it. */
export function HistorySection({ rows, filter, label }) {
  const [openList, setOpenList] = useState(false);
  const { close } = useUI();
  const nav = useNavigate();
  const goFull = () => { close(); nav(`/history?${filter}`); };
  return (
    <section className="panel">
      <div className="panel-h">
        <button className="collapse-btn" aria-expanded={openList} onClick={() => setOpenList(!openList)}>
          <span className="chev" aria-hidden="true">▸</span><h3>History</h3>
          <span className="muted small">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>
        </button>
        {rows.length > 0 && <button className="btn small ghost" onClick={goFull}>Open full history →</button>}
      </div>
      {openList && (rows.length ? (
        <>
          <HistoryList rows={rows.slice(0, 5)} showShop={false} />
          {rows.length > 5 && <button className="btn small self-start" onClick={goFull}>See all {rows.length} entries for {label} →</button>}
        </>
      ) : <Empty>No entries yet.</Empty>)}
    </section>
  );
}

/* ---------- Supermarket detail ---------- */
function ShopDetail({ id }) {
  const { state, me } = useStore();
  const L = useLookup();
  const { open } = useUI();
  const F = useFigures();
  const all = useMemo(() => buildHistory(state, L), [state, L]);
  const o = L.O(id);
  if (!o) return <><DrawerHead eyebrow="Supermarket" title="Removed" /><div className="drawer-b"><Empty>This supermarket no longer exists.</Empty></div></>;
  const x = F.out[o.id];
  const pending = state.dispatches.filter((d) => d.outletId === id && d.status === "in_transit");
  const rows = Object.entries(x.by).map(([pid, b]) => ({ id: pid, ...b }));
  const managers = state.users.filter((u) => u.role === "regional_manager" && (u.regionIds || []).includes(o.regionId));

  return (
    <>
      <DrawerHead eyebrow={[L.regionName(o.regionId), o.type, o.area].filter(Boolean).join(" · ")} title={o.name} />
      <div className="drawer-b">
        <div className="actions">
          {can(me, "sale") && <button className="btn primary" onClick={() => open("sale", { outletId: id })}>Record sales</button>}
          {can(me, "payment") && <button className="btn" onClick={() => open("payment", { outletId: id })}>Record payment</button>}
          {can(me, "shopAdjust") && <button className="btn" onClick={() => open("adjust", { outletId: id })}>Returns & losses</button>}
          {can(me, "shopAdjust") && <button className="btn" onClick={() => open("count", { outletId: id })}>Stock count</button>}
          {can(me, "dispatch") && <button className="btn" onClick={() => open("dispatch", { outletId: id })}>Send stock</button>}
          {can(me, "setup") && <button className="btn ghost" onClick={() => open("shopForm", { id })}>Edit</button>}
        </div>
        <div className="inline-meta">
          <Pill status={x.status} />
          {managers.length > 0 && <span className="muted small">Regional manager: {managers.map((m) => m.name).join(", ")}</span>}
          {(o.contact || o.phone) && <span className="muted small">Contact: {[o.contact, o.phone].filter(Boolean).join(", ")}</span>}
        </div>

        {pending.length > 0 && (
          <section className="panel attention">
            <h3>{pending.length} deliver{pending.length === 1 ? "y" : "ies"} waiting to be confirmed</h3>
            <ul className="plain">
              {pending.map((d) => (
                <li key={d.id}>
                  <span><b>{n0(d.qty)}</b> × {L.pName(d.productId)} <span className="muted small">sent {fmtDate(d.date)} {d.note && <Stamp>{d.note}</Stamp>}</span></span>
                  {can(me, "receive") && <button className="btn small primary" onClick={() => open("receive", { id: d.id })}>Confirm</button>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="kv">
          <div><b>{n0(x.inShop)}</b><span>packs on the shelf</span></div>
          <div><b>{n0(x.inTransit)}</b><span>packs in transit</span></div>
          <div><b>{x.daysLeft === null ? "—" : n0(x.daysLeft)}</b><span>days of stock left ({x.rate ? n1(x.rate) : 0}/day)</span></div>
          <div><b className="sm">{L.money(x.rev)}</b><span>sales value, all time</span></div>
          <div><b className="sm">{L.money(x.paid)}</b><span>paid</span></div>
          <div><b className={"sm" + (x.outstanding > 0 ? " warn-text" : "")}>{L.money(x.outstanding)}</b><span>still owed</span></div>
        </div>

        <section className="panel">
          <h3>Stock by product</h3>
          <DataTable rows={rows} empty="Nothing received yet."
            columns={[
              { label: "Product", render: (r) => L.pName(r.id) },
              { label: "Received", num: true, render: (r) => n0(r.received) },
              { label: "Sold", num: true, render: (r) => n0(r.sold) },
              { label: "Returns & losses", num: true, render: (r) => n0(r.removed) },
              { label: "On shelf", num: true, render: (r) => <b>{n0(r.shelf)}</b> },
            ]} />
        </section>
        <HistorySection rows={all.filter((h) => h.shopId === id)} filter={`shop=${encodeURIComponent(id)}`} label={o.name} />
      </div>
    </>
  );
}

export { num };
