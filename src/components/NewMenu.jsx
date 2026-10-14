// The "New" button: everything this person can record, in one place.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { can } from "../lib/roles";
import { useStore } from "../state/store";
import useActions from "../pages/useActions";

export default function NewMenu() {
  const { state, me } = useStore();
  const act = useActions();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const pending = state.dispatches.filter((d) => d.status === "in_transit").length;
  const one = state.outlets.length === 1 ? state.outlets[0].id : undefined;

  const groups = [
    ["Supermarket", [
      can(me, "receive") && pending > 0 && ["Confirm a delivery", `${pending} waiting`, () => nav("/deliveries")],
      can(me, "sale") && ["Sales", "Packs sold and their value", () => act.sale(one)],
      can(me, "payment") && ["Payment received", "Money from a supermarket", () => act.payment(one)],
      can(me, "shopAdjust") && ["Returns & losses", "Returned, damaged, expired, lost", () => act.adjust(one)],
      can(me, "shopAdjust") && ["Stock count", "Count what's on the shelf", () => act.count(one)],
    ]],
    ["Factory", [
      can(me, "dispatch") && ["Send stock", "Factory → supermarket", () => act.dispatch()],
      can(me, "batches") && ["Production batch", "Packs made today", () => act.batch()],
      can(me, "materials") && ["Raw material bought", "Purchases from suppliers", () => act.purchase()],
      can(me, "factoryAdjust") && ["Factory stock count", "Set what's in the factory", () => act.factoryCount()],
    ]],
    ["Setup", [
      can(me, "setup") && ["Supermarket", "Add a new shop", () => act.open("shopForm")],
      can(me, "setup") && ["Person", "Give someone access", () => act.open("userForm")],
      can(me, "setup") && ["Product", "Something you make", () => act.open("productForm")],
    ]],
  ].map(([label, items]) => [label, items.filter(Boolean)]).filter(([, items]) => items.length);

  if (!groups.length) return null;
  return (
    <div className="new-menu" ref={ref}>
      <button className="btn primary new-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        <span>New</span>
      </button>
      {open && (
        <div className="new-pop pop" role="menu">
          {groups.map(([label, items]) => (
            <div key={label} className="new-group">
              <span className="menu-label">{label}</span>
              {items.map(([title, sub, go]) => (
                <button key={title} role="menuitem" onClick={() => { setOpen(false); go(); }}>
                  <b>{title}</b><span>{sub}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
