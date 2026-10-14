// Forms for things set up once: supermarkets, regions, people, products, materials, recipes, settings.
import { useState } from "react";
import { byKey, n0, num } from "../lib/format";
import { ROLES } from "../lib/roles";
import { api } from "../lib/api";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import { Field, FormShell, Input, Row, Select, useForm } from "../components/Form";

const list = (arr) => arr.map((x) => ({ value: x, label: x }));

export function ShopForm({ id }) {
  const { state, post, patch } = useStore();
  const { O } = useLookup();
  const { done } = useUI();
  const o = O(id) || {};
  const [v, set] = useForm({ name: o.name || "", type: o.type || "Supermarket", regionId: o.regionId || "", area: o.area || "", contact: o.contact || "", phone: o.phone || "" });
  return (
    <FormShell onSubmit={async () => {
      if (!v.name.trim()) return "Enter the supermarket's name.";
      const ok = id ? await patch(`/api/outlets/${id}`, v) : await post("/api/outlets", v);
      if (ok) done(id ? "Supermarket updated" : `${v.name} added`);
    }}>
      <Field id="name" label="Name"><Input id="name" v={v} set={set} placeholder="e.g. Ineza Supermarket" /></Field>
      <Row>
        <Field id="regionId" label="Region" hint={state.regions.length ? "The region's manager will see this supermarket." : "Add regions in Setup first."}>
          <Select id="regionId" v={v} set={set} blank="No region" options={state.regions.slice().sort(byKey("name")).map((r) => ({ value: r.id, label: r.name }))} />
        </Field>
        <Field id="type" label="Type"><Select id="type" v={v} set={set} options={list(["Supermarket", "Shop", "Kiosk", "Market stall", "Wholesaler", "School / institution"])} /></Field>
      </Row>
      <Field id="area" label="Town / area"><Input id="area" v={v} set={set} placeholder="e.g. Nyamata" /></Field>
      <Row>
        <Field id="contact" label="Supermarket's contact person"><Input id="contact" v={v} set={set} /></Field>
        <Field id="phone" label="Phone"><Input id="phone" type="tel" v={v} set={set} /></Field>
      </Row>
    </FormShell>
  );
}

export function RegionForm({ id }) {
  const { post, patch } = useStore();
  const { R } = useLookup();
  const { done } = useUI();
  const r = R(id) || {};
  const [v, set] = useForm({ name: r.name || "", notes: r.notes || "" });
  return (
    <FormShell onSubmit={async () => {
      if (!v.name.trim()) return "Enter the region's name.";
      const ok = id ? await patch(`/api/regions/${id}`, v) : await post("/api/regions", v);
      if (ok) done(id ? "Region updated" : `${v.name} added`);
    }}>
      <Field id="name" label="Region name"><Input id="name" v={v} set={set} placeholder="e.g. Bugesera" /></Field>
      <Field id="notes" label="Notes"><Input id="notes" v={v} set={set} /></Field>
      <p className="muted small">Put supermarkets in this region from each supermarket's details, and choose its manager under People.</p>
    </FormShell>
  );
}

/** Add or edit a person: role, sign-in, and which regions or supermarkets they cover. */
export function UserForm({ id }) {
  const { state, me, post, patch } = useStore();
  const { U, regionName } = useLookup();
  const { done } = useUI();
  const u = U(id) || {};
  const [v, set] = useForm({
    name: u.name || "", role: u.role || "regional_manager", username: u.username || "", phone: u.phone || "", email: u.email || "",
    password: "", active: u.active === false ? "no" : "yes",
  });
  const [regions, setRegions] = useState(new Set(u.regionIds || []));
  const [shops, setShops] = useState(new Set(u.outletIds || []));
  const toggle = (setFn, cur, k) => { const n = new Set(cur); n.has(k) ? n.delete(k) : n.add(k); setFn(n); };
  const self = id === me.id;
  return (
    <FormShell onSubmit={async () => {
      if (!v.name.trim()) return "Enter the person's name.";
      if (v.password && !v.username.trim()) return "Give them a username so they can sign in.";
      if (!id && v.username && !v.password) return "Set a password so they can sign in (or leave the username empty for now).";
      const body = {
        name: v.name, role: v.role, username: v.username, phone: v.phone, email: v.email, active: v.active === "yes",
        regionIds: v.role === "regional_manager" ? [...regions] : [],
        outletIds: v.role === "store_user" ? [...shops] : [],
      };
      if (v.password) body.password = v.password;
      const ok = id ? await patch(`/api/users/${id}`, body) : await post("/api/users", body);
      if (ok) done(id ? "Details saved" : `${v.name} added`);
    }}>
      <Field id="name" label="Full name"><Input id="name" v={v} set={set} /></Field>
      <Field id="role" label="Role" hint={ROLES[v.role]?.help}>
        <Select id="role" v={v} set={set} options={Object.entries(ROLES).map(([value, r]) => ({ value, label: r.label }))} />
      </Field>
      {self && v.role !== "admin" && <div className="form-err">You can't remove your own administrator role.</div>}

      {v.role === "regional_manager" && (
        <div className="field">
          <label>Regions they manage</label>
          {state.regions.length ? (
            <div className="checks">
              {state.regions.slice().sort(byKey("name")).map((r) => (
                <label key={r.id}><input type="checkbox" checked={regions.has(r.id)} onChange={() => toggle(setRegions, regions, r.id)} />
                  <span className="grow">{r.name}</span>
                  <span className="muted small">{state.outlets.filter((o) => o.regionId === r.id).length} supermarkets</span></label>
              ))}
            </div>
          ) : <div className="hint">Add regions first (Setup → Regions).</div>}
        </div>
      )}
      {v.role === "store_user" && (
        <div className="field">
          <label>Supermarkets they record for</label>
          {state.outlets.length ? (
            <div className="checks">
              {state.outlets.slice().sort(byKey("name")).map((o) => (
                <label key={o.id}><input type="checkbox" checked={shops.has(o.id)} onChange={() => toggle(setShops, shops, o.id)} />
                  <span className="grow">{o.name}</span><span className="muted small">{regionName(o.regionId)}</span></label>
              ))}
            </div>
          ) : <div className="hint">Add supermarkets first.</div>}
        </div>
      )}

      <Row>
        <Field id="phone" label="Phone"><Input id="phone" type="tel" v={v} set={set} /></Field>
        <Field id="email" label="Email"><Input id="email" type="email" v={v} set={set} /></Field>
      </Row>
      <fieldset className="fs">
        <legend>Signing in</legend>
        <Row>
          <Field id="username" label="Username"><Input id="username" v={v} set={set} autoComplete="off" /></Field>
          <Field id="password" label={id && u.canSignIn ? "New password" : "Password"} hint={id && u.canSignIn ? "Leave empty to keep their current password." : "At least 8 characters."}>
            <Input id="password" type="password" v={v} set={set} autoComplete="new-password" />
          </Field>
        </Row>
        {id && <Field id="active" label="Account"><Select id="active" v={v} set={set} options={[{ value: "yes", label: "Active: can sign in" }, { value: "no", label: "Switched off: can't sign in" }]} /></Field>}
        <p className="muted small">Give them their username and password yourself. They can change the password after signing in.</p>
      </fieldset>
    </FormShell>
  );
}

export function ProductForm({ id }) {
  const { state, post, patch } = useStore();
  const { P } = useLookup();
  const { done } = useUI();
  const p = P(id) || {};
  const cur = state.settings.currency;
  const [v, set] = useForm({ name: p.name || "", size: p.size || "", price: p.price ?? "", shelf: p.shelf ?? "" });
  return (
    <FormShell onSubmit={async () => {
      if (!v.name.trim()) return "Enter the product name.";
      const ok = id ? await patch(`/api/products/${id}`, v) : await post("/api/products", v);
      if (ok) done(id ? "Product updated" : `${v.name} added`);
    }}>
      <Field id="name" label="Product name"><Input id="name" v={v} set={set} placeholder="e.g. Sorghum Porridge Flour" /></Field>
      <Row>
        <Field id="size" label="Pack size"><Input id="size" v={v} set={set} placeholder="e.g. 1 kg" /></Field>
        <Field id="price" label="Selling price to supermarkets"><Input id="price" money={state.settings.currency} v={v} set={set} /></Field>
      </Row>
      <Field id="shelf" label="Shelf price" hint="What customers pay in the shop. Optional."><Input id="shelf" money={state.settings.currency} v={v} set={set} /></Field>
    </FormShell>
  );
}

export function MaterialForm({ id }) {
  const { post, patch } = useStore();
  const { M } = useLookup();
  const { done } = useUI();
  const m = M(id) || {};
  const [v, set] = useForm({ name: m.name || "", description: m.description || "", unit: m.unit || "kg", reorder: m.reorder ?? "" });
  return (
    <FormShell onSubmit={async () => {
      if (!v.name.trim()) return "Enter the material name.";
      const ok = id ? await patch(`/api/materials/${id}`, v) : await post("/api/materials", v);
      if (ok) done(id ? "Material updated" : `${v.name} added`);
    }}>
      <Field id="name" label="Material"><Input id="name" v={v} set={set} placeholder="e.g. Sorghum grain, dried mango, soya" /></Field>
      <Field id="description" label="Description"><Input id="description" v={v} set={set} /></Field>
      <Row>
        <Field id="unit" label="Unit of measurement"><Select id="unit" v={v} set={set} options={list(["kg", "g", "litres", "units", "pcs", "bags", "rolls"])} /></Field>
        <Field id="reorder" label="Warn when below" hint="Low-stock warning level."><Input id="reorder" type="number" v={v} set={set} /></Field>
      </Row>
    </FormShell>
  );
}

/** Bill of Materials: how much of each material goes into one pack. */
export function RecipeForm({ productId }) {
  const { state, put } = useStore();
  const { pName, money } = useLookup();
  const { done } = useUI();
  const F = useFigures();
  const current = Object.fromEntries(state.bom.filter((b) => b.productId === productId).map((b) => [b.materialId, String(b.qtyPerUnit)]));
  const [v, set] = useForm(Object.fromEntries(state.materials.map((m) => ["q-" + m.id, current[m.id] || ""])));
  const lines = state.materials.map((m) => ({ m, q: num(v["q-" + m.id]), c: F.mat[m.id]?.avgCost }));
  const perPack = lines.reduce((a, l) => a + l.q * (l.c || 0), 0);
  const price = state.products.find((p) => p.id === productId)?.price || 0;
  return (
    <FormShell onSubmit={async () => {
      const items = lines.filter((l) => l.q > 0).map((l) => ({ materialId: l.m.id, qtyPerUnit: l.q }));
      if (await put(`/api/products/${productId}/recipe`, { items })) done(`Recipe saved for ${pName(productId)}`);
    }}>
      <p className="muted small">How much of each material goes into <b>one pack</b>. Leave a material empty if it isn't used.</p>
      <div className="mats">
        {lines.map(({ m, q, c }) => (
          <div className="m" key={m.id}>
            <label htmlFor={"q-" + m.id}>{m.name} <span className="muted small">· {m.unit} per pack{c != null && q > 0 ? ` · ${money(q * c)}` : ""}</span></label>
            <Input id={"q-" + m.id} type="number" v={v} set={set} step="0.0001" />
          </div>
        ))}
      </div>
      <div className="cost-box">
        <div><span>Material cost per pack</span><b>{money(perPack)}</b></div>
        <div><span>Selling price</span><b>{money(price)}</b></div>
        <div><span>Left after materials</span><b>{money(price - perPack)}</b></div>
      </div>
      {lines.some((l) => l.q > 0 && l.c == null) && <p className="hint bad">Some materials have no purchases yet, so their cost isn't known.</p>}
    </FormShell>
  );
}

export function SettingsForm() {
  const { state, put } = useStore();
  const { done } = useUI();
  const [v, set] = useForm({ ...state.settings });
  return (
    <FormShell onSubmit={async () => {
      const ok = await put("/api/settings", { company: String(v.company), currency: String(v.currency), lowDays: num(v.lowDays) || 5, quietDays: num(v.quietDays) || 7 });
      if (ok) done("Settings saved");
    }}>
      <Field id="company" label="Company name"><Input id="company" v={v} set={set} /></Field>
      <Row>
        <Field id="currency" label="Currency"><Input id="currency" v={v} set={set} maxLength={5} /></Field>
        <Field id="lowDays" label="Warn when a supermarket has less than (days of stock)"><Input id="lowDays" type="number" v={v} set={set} /></Field>
      </Row>
      <Field id="quietDays" label="Flag a supermarket with no sales recorded after (days)"><Input id="quietDays" type="number" v={v} set={set} /></Field>
    </FormShell>
  );
}

export function PasswordForm() {
  const { done } = useUI();
  const [v, set] = useForm({ current: "", next: "", confirm: "" });
  return (
    <FormShell onSubmit={async () => {
      if (v.next !== v.confirm) return "The two new passwords don't match.";
      try { await api.post("/api/auth/password", { current: v.current, next: v.next }); }
      catch (e) { return e.message; }
      done("Password changed. Other devices have been signed out.");
    }}>
      <Field id="current" label="Current password"><Input id="current" type="password" v={v} set={set} autoComplete="current-password" /></Field>
      <Row>
        <Field id="next" label="New password" hint="At least 8 characters."><Input id="next" type="password" v={v} set={set} autoComplete="new-password" /></Field>
        <Field id="confirm" label="Type it again"><Input id="confirm" type="password" v={v} set={set} autoComplete="new-password" /></Field>
      </Row>
    </FormShell>
  );
}

/** A regional manager sends a period report to management. */
export function SubmitReportForm({ regionId, from, to, summary }) {
  const { post } = useStore();
  const { regionName, money } = useLookup();
  const { done } = useUI();
  const [v, set] = useForm({ note: "" });
  return (
    <FormShell onSubmit={async () => {
      if (await post("/api/submissions", { regionId, periodFrom: from, periodTo: to, note: v.note, summary })) done("Report submitted to management");
    }}>
      <div className="kv">
        <div><b className="sm">{regionName(regionId)}</b><span>{from} to {to}</span></div>
        <div><b>{n0(summary.sold)}</b><span>packs sold</span></div>
        <div><b className="sm">{money(summary.salesValue)}</b><span>sales value</span></div>
        <div><b className="sm">{money(summary.paid)}</b><span>paid</span></div>
        <div><b className="sm">{money(summary.outstanding)}</b><span>outstanding</span></div>
        <div><b>{n0(summary.returned + summary.losses + summary.countDiff)}</b><span>returns, losses & differences</span></div>
      </div>
      <Field id="note" label="Comments for management" hint="What went well, problems, what you need.">
        <textarea id="note" rows={5} value={v.note} onChange={(e) => set("note", e.target.value)} />
      </Field>
      <p className="muted small">The figures are saved as they are now. Management sees them under Reports.</p>
    </FormShell>
  );
}
