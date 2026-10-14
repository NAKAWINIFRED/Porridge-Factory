// Sample records so you can explore the system before entering real data.
// Every record carries `sample: true` and can be removed in one click from Setup.
// Sample people have no password, so nobody can sign in as them.
import { addDays, today } from "./format";

export function buildSample() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ri = (a, b) => Math.round(a + rnd() * (b - a));
  const T = today();
  const D = (n) => addDays(T, -n);
  const S = { regions: [], users: [], outlets: [], products: [], materials: [], bom: [], purchases: [],
              batches: [], dispatches: [], sales: [], payments: [], adjustments: [], submissions: [] };
  let t = 0;
  const put = (col, id, v) => S[col].push({ id: "smp-" + id, sample: true, createdAt: new Date(Date.now() - 4e9 + t++ * 60000).toISOString(), ...v });
  const id = (x) => "smp-" + x;

  // Regions and people
  [["rg1", "Bugesera"], ["rg2", "Kigali City"]].forEach(([k, name]) => put("regions", k, { name }));
  put("users", "u1", { name: "Aline Uwase", role: "regional_manager", phone: "0788 000 101", active: true, regionIds: [id("rg1")], outletIds: [] });
  put("users", "u2", { name: "Eric Habimana", role: "regional_manager", phone: "0788 000 102", active: true, regionIds: [id("rg2")], outletIds: [] });
  put("users", "u3", { name: "Diane Mukamana", role: "store_user", phone: "0788 000 103", active: true, regionIds: [], outletIds: [id("o1")] });
  put("users", "u4", { name: "Jean Bosco", role: "factory_manager", phone: "0788 000 104", active: true, regionIds: [], outletIds: [] });
  put("users", "u5", { name: "Claudine Ingabire", role: "production_manager", phone: "0788 000 105", active: true, regionIds: [], outletIds: [] });

  const shops = [
    ["o1", "Umurage Supermarket", "Supermarket", "Nyamata", "rg1", "u3", 1.0],
    ["o2", "Ruhuha Kiosk", "Kiosk", "Ruhuha", "rg1", "u1", 0.45],
    ["o3", "Gashora Mini-Mart", "Shop", "Gashora", "rg1", "u1", 0.6],
    ["o4", "Isoko Fresh", "Supermarket", "Nyamirambo", "rg2", "u2", 1.1],
    ["o5", "Ineza Mini-Mart", "Shop", "Remera", "rg2", "u2", 0.75],
    ["o6", "Gakiza Shop", "Shop", "Kicukiro", "rg2", "u2", 0.8],
  ];
  shops.forEach(([k, name, type, area, rg]) => put("outlets", k, { name, type, area, regionId: id(rg) }));

  // Products, materials and recipes
  const products = [["p1", "Sorghum Porridge Flour", "1 kg", 1800, 2200], ["p2", "Soya–Maize–Sorghum Mix", "1 kg", 2200, 2700], ["p3", "Baby Porridge", "500 g", 1500, 1900]];
  products.forEach(([k, name, size, price, shelf]) => put("products", k, { name, size, price, shelf }));
  const mats = [
    ["m1", "Sorghum grain", "Red sorghum, cleaned", "kg", 400, 520],
    ["m2", "Maize grain", "White maize", "kg", 300, 420],
    ["m3", "Soya beans", "Roasted before milling", "kg", 200, 900],
    ["m4", "Packaging bags", "Printed, 1 kg and 500 g", "pcs", 800, 60],
  ];
  mats.forEach(([k, name, description, unit, reorder]) => put("materials", k, { name, description, unit, reorder }));
  const recipe = {
    p1: [["m1", 1.03], ["m4", 1]],
    p2: [["m1", 0.42], ["m2", 0.35], ["m3", 0.26], ["m4", 1]],
    p3: [["m2", 0.27], ["m3", 0.2], ["m1", 0.06], ["m4", 1]],
  };
  Object.entries(recipe).forEach(([p, lines]) => lines.forEach(([m, q]) => S.bom.push({ productId: id(p), materialId: id(m), qtyPerUnit: q })));

  // Purchases
  let k = 0;
  const unitCost = Object.fromEntries(mats.map((m) => [m[0], m[5]]));
  const stockM = { m1: 0, m2: 0, m3: 0, m4: 0 };
  const buy = (d, m, q, supplier) => {
    stockM[m] += q;
    put("purchases", "r" + k++, { date: D(d), materialId: id(m), qty: q, cost: Math.round(q * unitCost[m] * (0.95 + rnd() * 0.1)), supplier, recordedBy: id("u5") });
  };
  [46, 34, 22, 10].forEach((d) => {
    buy(d, "m1", ri(900, 1100), "Bugesera grain cooperative");
    buy(d, "m2", ri(450, 600), "Bugesera grain cooperative");
    buy(d + 1, "m3", ri(300, 380), "Soya traders, Nyamata");
    buy(d + 1, "m4", 1600, "PackPrint Ltd");
  });

  // Batches: follow the recipe, with a little real-world variation
  const factory = { p1: 0, p2: 0, p3: 0 };
  k = 0;
  for (let d = 44; d >= 1; d -= 3) {
    const p = ["p1", "p2", "p3"][k % 3];
    const planned = ri(28, 36) * 10;
    const units = planned - ri(0, 12);
    const used = recipe[p].map(([m, q]) => ({ materialId: id(m), qty: Math.round(q * planned * (1 + (rnd() - 0.4) * 0.04)) }));
    used.forEach((u) => (stockM[u.materialId.slice(4)] -= u.qty));
    factory[p] += units;
    const dd = D(d);
    put("batches", "b" + k, { date: dd, code: "BT-" + dd.replace(/-/g, "").slice(2) + "-01", productId: id(p), plannedUnits: planned, units,
      otherCosts: ri(35, 55) * 1000, used, recordedBy: id("u5") });
    k++;
  }
  put("adjustments", "w1", { date: D(18), item: "material", materialId: id("m1"), reason: "wastage", qty: 14, note: "Damp sacks", recordedBy: id("u5") });

  // Distribution, sales, payments
  const price = { p1: 1800, p2: 2200, p3: 1500 };
  const shelf = {};
  const owed = {};
  let dn = 1, sk = 0, pk = 0, ak = 0;
  for (let d = 40; d >= 0; d--) {
    shops.forEach(([o, , , , , rep, speed], i) => {
      // Deliveries every week; confirmed a day later (the last ones are still in transit)
      if ((d + i * 2) % 7 === 0 && d > 0) {
        ["p1", "p2", "p3"].forEach((p) => {
          if (o === "o2" && p === "p3") return;
          const q = ri(20, 45);
          if (factory[p] < q) return;
          factory[p] -= q;
          const arrived = d > 1;
          const short = arrived && rnd() < 0.12 ? ri(1, 3) : 0;
          if (arrived) shelf[o + p] = (shelf[o + p] || 0) + q - short;
          put("dispatches", "d" + dn, {
            date: D(d), note: "DN-" + String(dn).padStart(4, "0"), outletId: id(o), productId: id(p), qty: q, price: price[p],
            status: arrived ? "received" : "in_transit", receivedQty: arrived ? q - short : null, receivedDate: arrived ? D(d - 1) : null,
            receivedBy: arrived ? id(rep) : null, receivedNote: short ? `${short} missing from the crate` : "", recordedBy: id("u4"),
          });
          dn++;
        });
      }
      // Sales counted twice a week
      if ((d + i) % 4 === 1) {
        ["p1", "p2", "p3"].forEach((p) => {
          const have = shelf[o + p] || 0;
          if (have < 2) return;
          const q = Math.min(have, Math.max(1, Math.round(have * (0.3 + rnd() * 0.25) * speed)));
          const disc = rnd() < 0.15 ? 500 * ri(1, 4) : 0;
          shelf[o + p] = have - q;
          const amount = q * price[p] - disc;
          owed[o] = (owed[o] || 0) + amount;
          put("sales", "x" + sk++, { date: D(d), outletId: id(o), productId: id(p), qty: q, unitPrice: price[p], discount: disc, amount, recordedBy: id(rep) });
          if (rnd() < 0.08 && shelf[o + p] > 3) {
            const r = ri(1, 3);
            shelf[o + p] -= r;
            put("adjustments", "a" + ak++, { date: D(d), item: "product", productId: id(p), outletId: id(o),
              reason: ["returned", "damaged", "expired"][ri(0, 2)], qty: r, note: "", recordedBy: id(rep) });
          }
        });
      }
      // Payments every ~10 days, most of what's owed
      if ((d + i * 3) % 10 === 0 && owed[o] > 0) {
        const amt = Math.round((owed[o] * (0.6 + rnd() * 0.35)) / 100) * 100;
        owed[o] -= amt;
        put("payments", "pm" + pk++, { date: D(d), outletId: id(o), amount: amt, method: ["Mobile money", "Bank transfer", "Cash"][ri(0, 2)],
          reference: "TX" + ri(100000, 999999), recordedBy: id("u1") });
      }
    });
  }
  return S;
}
