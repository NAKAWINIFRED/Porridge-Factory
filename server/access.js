// Who may do what, and which supermarkets each person can see.
// The app (src/lib/roles.js) mirrors these rules to hide buttons, but this file is what's enforced.

export const ROLES = ["admin", "management", "regional_manager", "store_user", "factory_manager", "production_manager", "finance"];

const RULES = {
  setup:        ["admin"],                                                   // settings, people, regions, shops, products, data tools
  materials:    ["admin", "production_manager"],                             // raw materials, purchases, wastage
  recipes:      ["admin", "production_manager"],                             // Bill of Materials
  batches:      ["admin", "production_manager"],
  dispatch:     ["admin", "factory_manager"],                                // send stock out of the factory
  factoryAdjust:["admin", "factory_manager"],                                // damaged/expired/lost packs at the factory
  receive:      ["admin", "factory_manager", "regional_manager", "store_user"], // confirm a delivery arrived
  sale:         ["admin", "regional_manager", "store_user"],
  shopAdjust:   ["admin", "factory_manager", "regional_manager", "store_user"], // returns, damage, losses, stock counts at a shop
  payment:      ["admin", "finance", "regional_manager"],
  submitReport: ["admin", "regional_manager"],
};

export const can = (user, action) => !!user && (RULES[action] || []).includes(user.role);

/** Roles that only see some supermarkets. */
export const isScoped = (user) => user.role === "regional_manager" || user.role === "store_user";

/** Roles that see factory and production figures. */
export const seesFactory = (user) => !isScoped(user);

/**
 * The supermarkets (and regions) a person can see.
 * Returns { all: true } for everyone except regional managers and store users.
 */
export async function scopeFor(c, user) {
  if (!isScoped(user)) return { all: true };
  if (user.role === "regional_manager") {
    const { rows } = await c.query(
      `SELECT ur.region_id, o.id AS outlet_id FROM user_regions ur
       LEFT JOIN outlets o ON o.region_id = ur.region_id WHERE ur.user_id = $1`, [user.id]);
    return {
      all: false,
      regionIds: [...new Set(rows.map((r) => r.region_id))],
      outletIds: [...new Set(rows.map((r) => r.outlet_id).filter(Boolean))],
    };
  }
  const { rows } = await c.query(
    `SELECT uo.outlet_id, o.region_id FROM user_outlets uo JOIN outlets o ON o.id = uo.outlet_id WHERE uo.user_id = $1`, [user.id]);
  return {
    all: false,
    regionIds: [...new Set(rows.map((r) => r.region_id).filter(Boolean))],
    outletIds: rows.map((r) => r.outlet_id),
  };
}

export const inScope = (scope, outletId) => scope.all || scope.outletIds.includes(outletId);
