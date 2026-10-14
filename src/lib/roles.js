// Roles from the project document. Mirrors server/access.js (the server enforces; this hides buttons).

export const ROLES = {
  admin: { label: "Administrator", help: "Manages people, regions, shops, products and settings. Can do everything." },
  management: { label: "Top management", help: "Sees every region, all reports and figures. View only." },
  regional_manager: { label: "Regional manager", help: "Sees and records for the supermarkets in their regions, records payments and submits regional reports." },
  store_user: { label: "Supermarket user", help: "Confirms deliveries and records sales, returns, damage and stock counts for their shop." },
  factory_manager: { label: "Factory / inventory manager", help: "Manages finished packs: sends stock to supermarkets and records factory losses." },
  production_manager: { label: "Production manager", help: "Records raw material purchases, recipes, production batches and wastage." },
  finance: { label: "Finance", help: "Sees revenue, payments and costs everywhere and records payments." },
};
export const roleLabel = (r) => ROLES[r]?.label || r;

const RULES = {
  setup: ["admin"],
  materials: ["admin", "production_manager"],
  recipes: ["admin", "production_manager"],
  batches: ["admin", "production_manager"],
  dispatch: ["admin", "factory_manager"],
  factoryAdjust: ["admin", "factory_manager"],
  receive: ["admin", "factory_manager", "regional_manager", "store_user"],
  sale: ["admin", "regional_manager", "store_user"],
  shopAdjust: ["admin", "factory_manager", "regional_manager", "store_user"],
  payment: ["admin", "finance", "regional_manager"],
  submitReport: ["admin", "regional_manager"],
};
export const can = (me, action) => !!me && (RULES[action] || []).includes(me.role);

/** Regional managers and supermarket users only see some supermarkets. */
export const isScoped = (me) => me?.role === "regional_manager" || me?.role === "store_user";
export const seesFactory = (me) => !isScoped(me);

/** Which pages each role sees in the menu. */
export const PAGES = {
  overview: Object.keys(ROLES),
  shops: ["admin", "management", "regional_manager", "factory_manager", "finance"],
  deliveries: ["admin", "management", "factory_manager", "regional_manager", "store_user"],
  sales: ["admin", "management", "regional_manager", "store_user", "finance"],
  production: ["admin", "management", "production_manager", "finance"],
  reports: ["admin", "management", "regional_manager", "store_user", "finance", "factory_manager"],
  history: Object.keys(ROLES),
  setup: ["admin"],
};
export const seesPage = (me, page) => !!me && PAGES[page].includes(me.role);

/** Can this person delete a record? Administrators, or whoever recorded it. */
export const canDelete = (me, rec) => !!me && (me.role === "admin" || (rec && (rec.recordedBy || rec.submittedBy) === me.id));
