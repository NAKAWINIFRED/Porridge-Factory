// Shortcuts for opening forms, with a friendly message when something needed is missing.
import { useStore } from "../state/store";
import { useUI } from "../state/ui";

export default function useActions() {
  const { state } = useStore();
  const { open, toast } = useUI();
  const need = (ok, msg) => { if (ok) return true; toast(msg, "bad"); return false; };
  const products = () => need(state.products.length, "Add a product first (Setup → Products).");
  const shops = () => need(state.outlets.length, "There are no supermarkets yet.");
  return {
    open,
    shop: (id) => open("shop", { id }),
    dispatch: (outletId) => products() && shops() && open("dispatch", { outletId }),
    receive: (id) => open("receive", { id }),
    sale: (outletId) => shops() && products() && open("sale", { outletId }),
    payment: (outletId) => shops() && open("payment", { outletId }),
    adjust: (outletId) => shops() && products() && open("adjust", { outletId }),
    factoryLoss: () => products() && open("adjust", { factory: true }),
    count: (outletId) => shops() && products() && open("count", { outletId }),
    factoryCount: () => products() && open("count", { factory: true }),
    purchase: (materialId) => need(state.materials.length, "Add a raw material first.") && open("purchase", { materialId }),
    wastage: (materialId) => need(state.materials.length, "Add a raw material first.") && open("wastage", { materialId }),
    batch: () => products() && open("batch"),
  };
}
