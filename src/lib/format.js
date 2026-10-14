// Small formatting and date helpers used everywhere.

export const pad = (n) => String(n).padStart(2, "0");
export const fmtISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => fmtISO(new Date());

export const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return fmtISO(d);
};

export const daysBetween = (a, b) =>
  Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);

const NF0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
export const n0 = (v) => NF0.format(Math.round(v || 0));
export const n1 = (v) => NF1.format(v || 0);

export const fmtDate = (iso) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
export const fmtDateY = (iso) =>
  iso
    ? new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export const num = (v) => {
  const x = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export const initials = (s) =>
  String(s || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export const compact = (v) => (v >= 1e6 ? n1(v / 1e6) + "M" : v >= 1e3 ? n1(v / 1e3) + "k" : n0(v));

export const byKey = (k, dir = 1) => (a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir;

export const periodLabel = (p) => (p ? `last ${p} days` : "all time");
