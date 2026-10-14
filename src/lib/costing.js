// Recipe (Bill of Materials) and production costs.
// Material prices use the average purchase cost per unit (total paid ÷ total bought).
import { num } from "./format";

/** Cost of one pack's raw materials, from the product's recipe. */
export function recipeCost(S, F, productId) {
  const lines = S.bom
    .filter((b) => b.productId === productId)
    .map((b) => {
      const m = S.materials.find((x) => x.id === b.materialId);
      const unitCost = F.mat[b.materialId]?.avgCost ?? null;
      return {
        materialId: b.materialId, name: m?.name || "Removed material", unit: m?.unit || "",
        qtyPerUnit: num(b.qtyPerUnit), unitCost, costPerPack: unitCost === null ? null : num(b.qtyPerUnit) * unitCost,
      };
    });
  const priced = lines.every((l) => l.costPerPack !== null);
  return {
    lines,
    hasRecipe: lines.length > 0,
    priced,
    perPack: lines.reduce((a, l) => a + (l.costPerPack || 0), 0),
  };
}

/** Expected vs actual for one batch. */
export function batchCost(S, F, b) {
  const recipe = recipeCost(S, F, b.productId);
  const materialCost = (b.used || []).reduce((a, u) => a + num(u.qty) * (F.mat[u.materialId]?.avgCost || 0), 0);
  const other = num(b.otherCosts);
  const units = num(b.units);
  const planned = b.plannedUnits === "" || b.plannedUnits == null ? null : num(b.plannedUnits);
  const total = materialCost + other;
  const expectedMaterial = recipe.hasRecipe && planned ? recipe.perPack * planned : null;
  return {
    materialCost,
    otherCosts: other,
    total,
    perPack: units > 0 ? total / units : null,
    planned,
    units,
    shortfall: planned !== null ? planned - units : null,         // packs not made vs plan (production loss)
    yieldPct: planned ? (units / planned) * 100 : null,
    expectedPerPack: expectedMaterial !== null && planned ? (expectedMaterial + other) / planned : null,
    expectedMaterial,
  };
}

/** Recipe amounts for a planned number of packs (to pre-fill a batch). */
export function recipeFor(S, productId, packs) {
  return S.bom
    .filter((b) => b.productId === productId)
    .map((b) => ({ materialId: b.materialId, qty: Math.round(num(b.qtyPerUnit) * num(packs) * 100) / 100 }));
}
