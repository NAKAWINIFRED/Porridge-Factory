import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { byKey, n0 } from "../lib/format";
import { api } from "../lib/api";
import { ROLES, roleLabel } from "../lib/roles";
import { useLookup, useStore } from "../state/store";
import { useUI } from "../state/ui";
import { ConfirmButton, DataTable, PageHead, Panel, Pill, SampleTag, Tabs } from "../components/ui";

const TABS = [["people", "People & access"], ["regions", "Regions"], ["products", "Products"], ["general", "Company & data"]];

export default function Setup() {
  const { hash } = useLocation();
  const nav = useNavigate();
  const initial = TABS.some(([k]) => "#" + k === hash) ? hash.slice(1) : "people";
  const [tab, setTabState] = useState(initial);
  const setTab = (k) => { setTabState(k); nav("#" + k, { replace: true }); };
  return (
    <>
      <PageHead eyebrow="Administrator" title="Setup" />
      <Tabs value={tab} onChange={setTab} label="Setup sections" options={TABS} />
      {tab === "people" && <People />}
      {tab === "regions" && <Regions />}
      {tab === "products" && <Products />}
      {tab === "general" && <General />}
    </>
  );
}

function People() {
  const { state } = useStore();
  const { regionName, O } = useLookup();
  const { open } = useUI();
  const [showRoles, setShowRoles] = useState(false);
  const covers = (u) => u.role === "regional_manager" ? (u.regionIds?.length ? u.regionIds.map(regionName).join(", ") : <span className="warn-text">No region yet</span>)
    : u.role === "store_user" ? (u.outletIds?.length ? u.outletIds.map((id) => O(id)?.name || "?").join(", ") : <span className="warn-text">No supermarket yet</span>)
    : <span className="muted">Everything</span>;
  return (
    <Panel eyebrow={`${state.users.filter((u) => u.active !== false).length} active`} title="People & access"
      right={<div className="actions">
        <button className="btn small ghost" onClick={() => setShowRoles(!showRoles)}>{showRoles ? "Hide" : "What each role can do"}</button>
        <button className="btn primary" onClick={() => open("userForm")}>Add person</button></div>}>
      {showRoles && (
        <dl className="roles">
          {Object.entries(ROLES).map(([k, r]) => <div key={k}><dt>{r.label}</dt><dd>{r.help}</dd></div>)}
        </dl>
      )}
      <DataTable rows={state.users.slice().sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name))}
        onRowClick={(u) => open("userForm", { id: u.id })} empty="No people yet."
        columns={[
          { label: "Name", render: (u) => <><div className="name">{u.name}<SampleTag rec={u} /></div><div className="sub">{[u.phone, u.email].filter(Boolean).join(" · ")}</div></> },
          { label: "Role", render: (u) => roleLabel(u.role) },
          { label: "Sees", render: covers },
          { label: "Signs in as", render: (u) => (u.canSignIn ? <span className="mono">{u.username}</span> : <span className="muted">Can't sign in yet</span>) },
          { label: "", render: (u) => (u.active === false ? <Pill status={["Switched off", "mute"]} /> : <Pill status={["Active", "good"]} />) },
        ]} />
      <p className="muted small">Regional managers only see the supermarkets in their regions. Supermarket users only see their own supermarket. Click a person to change their role, what they see, or their password.</p>
    </Panel>
  );
}

function Regions() {
  const { state } = useStore();
  const { open } = useUI();
  const unplaced = state.outlets.filter((o) => !o.regionId);
  return (
    <Panel title="Regions" right={<button className="btn primary" onClick={() => open("regionForm")}>Add region</button>}>
      <DataTable rows={state.regions.slice().sort(byKey("name"))} onRowClick={(r) => open("regionForm", { id: r.id })} empty="No regions yet. Add one, then put supermarkets in it."
        columns={[
          { label: "Region", render: (r) => <><div className="name">{r.name}<SampleTag rec={r} /></div><div className="sub">{r.notes}</div></> },
          { label: "Regional manager", render: (r) => {
              const m = state.users.filter((u) => u.role === "regional_manager" && u.active !== false && (u.regionIds || []).includes(r.id));
              return m.length ? m.map((u) => u.name).join(", ") : <span className="warn-text">None yet</span>;
            } },
          { label: "Supermarkets", render: (r) => state.outlets.filter((o) => o.regionId === r.id).map((o) => o.name).join(", ") || <span className="muted">None</span> },
        ]} />
      {unplaced.length > 0 && <p className="hint bad">Not in any region: {unplaced.map((o) => o.name).join(", ")}. Open each supermarket to choose its region.</p>}
      <p className="muted small">Choose each region's manager under People & access. Put a supermarket in a region from the supermarket's own details.</p>
    </Panel>
  );
}

function Products() {
  const { state } = useStore();
  const { money } = useLookup();
  const { open } = useUI();
  const nav = useNavigate();
  return (
    <Panel title="Products" right={<button className="btn primary" onClick={() => open("productForm")}>Add product</button>}>
      <DataTable rows={state.products.slice().sort(byKey("name"))} onRowClick={(p) => open("productForm", { id: p.id })} empty="No products yet."
        columns={[
          { label: "Product", render: (p) => <><div className="name">{p.name}<SampleTag rec={p} /></div><div className="sub">{p.size}</div></> },
          { label: "Price to supermarkets", num: true, render: (p) => money(p.price) },
          { label: "Shelf price", num: true, render: (p) => (p.shelf ? money(p.shelf) : "—") },
          { label: "Recipe", render: (p) => (state.bom.some((b) => b.productId === p.id) ? <Pill status={["Set", "good"]} /> : <Pill status={["Not set", "warn"]} />) },
        ]} />
      <button className="btn small ghost self-start" onClick={() => nav("/production")}>Recipes and raw materials are under Production →</button>
    </Panel>
  );
}

function General() {
  const { state } = useStore();
  const { open } = useUI();
  const c = state.settings;
  return (
    <>
      <Panel title="Company" right={<button className="btn" onClick={() => open("settings")}>Edit</button>}>
        <div className="kv">
          <div><span>Company</span><b className="sm">{c.company}</b></div>
          <div><span>Currency</span><b className="sm">{c.currency}</b></div>
          <div><span>Warnings</span><b className="sm">under {n0(c.lowDays)} days of stock · no sales for {n0(c.quietDays)} days</b></div>
        </div>
      </Panel>
      <Backups />
    </>
  );
}

const fmtWhen = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
};

/** Back up with one click; restore any backup. */
function Backups() {
  const { toast } = useUI();
  const [list, setList] = useState(null);
  const [working, setWorking] = useState("");

  const load = async () => {
    try { setList((await api.get("/api/backups")).backups); }
    catch (e) { toast(e.message, "bad"); setList([]); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const backUp = async () => {
    setWorking("new");
    try {
      const b = await api.post("/api/backups");
      toast(`Backed up · ${n0(b.records)} records saved`);
      await load();
    } catch (e) { toast(e.message, "bad"); }
    setWorking("");
  };

  const restore = async (b) => {
    setWorking(b.name);
    try {
      await api.post(`/api/backups/${encodeURIComponent(b.name)}/restore`);
      toast(`Restored the backup from ${fmtWhen(b.createdAt)}. Please sign in again.`);
      setTimeout(() => window.location.reload(), 1800);
    } catch (e) { toast(e.message, "bad"); setWorking(""); }
  };

  const latest = list && list[0];
  return (
    <Panel eyebrow={latest ? `Last backup ${ago(latest.createdAt)}` : "Keep your records safe"} title="Backups"
      right={<button className="btn primary" disabled={!!working} onClick={backUp}>
        {working === "new" ? <><span className="spin" aria-hidden="true" />Backing up…</> : "Back up now"}
      </button>}>
      {list === null ? <p className="muted">Loading backups…</p> : (
        <DataTable rows={list} rowKey={(b) => b.name}
          empty="No backups yet. Click Back up now to save your first one."
          columns={[
            { label: "Saved", render: (b) => <><div className="name">{fmtWhen(b.createdAt)}</div><div className="sub">{ago(b.createdAt)}</div></> },
            { label: "Type", render: (b) => <Pill status={[b.kind, b.kind === "Manual" ? "good" : "mute"]} /> },
            { label: "Contains", render: (b) => <span className="sub">{[
              [b.counts.supermarkets, "supermarket"], [b.counts.products, "product"], [b.counts.sales, "sale"], [b.counts.people, "person", "people"],
            ].map(([k, one, many]) => `${n0(k)} ${k === 1 ? one : many || one + "s"}`).join(" · ")}</span> },
            { label: "", render: (b) => (
              <span className="row-actions">
                <ConfirmButton className="btn small" confirmText="Click again to restore" onConfirm={() => restore(b)}>
                  {working === b.name ? "Restoring…" : "Restore"}
                </ConfirmButton>
                <a className="icon-btn" href={`/api/backups/${encodeURIComponent(b.name)}/download`} download title="Download a copy" aria-label="Download a copy">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                </a>
              </span>
            ) },
          ]} />
      )}
      {list && list.length > 0 && (
        <p className="muted small">Restoring puts every record back exactly as it was at that time, and saves a copy of the current records first. A backup is also made automatically each day.</p>
      )}
    </Panel>
  );
}
