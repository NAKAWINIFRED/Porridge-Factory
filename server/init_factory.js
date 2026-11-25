import { pool } from './db.js';

async function initFactory() {
  console.log('🌱 Initializing Porridge Factory complete operational records...');

  try {
    const daysAgo = (days) => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    };

    // 1. Regions
    await pool.query(`INSERT INTO regions (id, name, notes) VALUES ('reg-kigali', 'Kigali', 'Central operations') ON CONFLICT (id) DO NOTHING;`);
    await pool.query(`INSERT INTO regions (id, name, notes) VALUES ('reg-north', 'Northern Region', 'Musanze hub') ON CONFLICT (id) DO NOTHING;`);

    // 2. Outlets (Supermarkets)
    const outlets = [
      ['out-1', 'Kigali City Supermarket', 'supermarket', 'reg-kigali', 'KN 4 Ave, Nyarugenge', 'Jean Claude', '+250 788 123 456'],
      ['out-2', 'Simba Supermarket - Kimironko', 'supermarket', 'reg-kigali', 'KG 11 Ave, Gasabo', 'Aline Uwase', '+250 788 234 567'],
      ['out-3', 'Musanze Modern Store', 'supermarket', 'reg-north', 'RN4 Highway, Musanze', 'Bosco Nshimiyimana', '+250 788 456 789']
    ];
    for (const o of outlets) {
      await pool.query(
        `INSERT INTO outlets (id, name, type, region_id, area, contact, phone) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING;`,
        o
      );
    }

    // 3. Products
    const products = [
      ['prod-1', 'NutriPorridge 1kg', '1kg', 4500, 4800],
      ['prod-2', 'NutriPorridge 500g', '500g', 2500, 2700],
      ['prod-3', 'Family Millet Blend 1kg', '1kg', 4800, 5200]
    ];
    for (const p of products) {
      await pool.query(
        `INSERT INTO products (id, name, size, price, shelf_price) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING;`,
        p
      );
    }

    // 4. Materials
    const materials = [
      ['MAT-001', 'Finger Millet Grain', 'Grain', 'Kg', 1500, 300, 2500, 'AgriSupply Co'],
      ['MAT-002', 'Sorghum Flour', 'Grain', 'Kg', 1200, 250, 2200, 'Great Lakes Grains'],
      ['MAT-003', 'Fortified Whole Maize', 'Grain', 'Kg', 2000, 400, 1800, 'Rwanda Farmers Hub']
    ];
    for (const m of materials) {
      await pool.query(
        `INSERT INTO materials (item_code, name, category, unit, stock, reorder_level, unit_cost, supplier) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (item_code) DO NOTHING;`,
        m
      );
    }

    // 5. Material Purchases
    const purchases = [
      ['pur-1', daysAgo(5), 1, 1000, 2500000, 'AgriSupply Co', '+250788000001', 'Initial batch purchase'],
      ['pur-2', daysAgo(4), 2, 800, 1760000, 'Great Lakes Grains', '+250788000002', 'Restock flour']
    ];
    for (const pur of purchases) {
      await pool.query(
        `INSERT INTO material_purchases (id, date, material_id, qty, cost, supplier, supplier_contact, memo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING;`,
        pur
      );
    }

    // 6. Production Batches
    const batches = [
      ['bat-1', daysAgo(3), 'BAT-1101', 'prod-1', 1000, 950, 0, 'First production run'],
      ['bat-2', daysAgo(2), 'BAT-1102', 'prod-2', 1500, 1450, 0, 'Second production run']
    ];
    for (const bat of batches) {
      await pool.query(
        `INSERT INTO batches (id, date, code, product_id, planned_units, units, other_costs, memo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING;`,
        bat
      );
    }

    // 7. Dispatches
    const dispatches = [
      ['dsp-1', daysAgo(2), 'out-1', 'prod-1', 200, 4500, 'in_transit', 'Shipment to Kigali City Supermarket'],
      ['dsp-2', daysAgo(1), 'out-2', 'prod-2', 300, 2500, 'in_transit', 'Shipment to Simba Kimironko']
    ];
    for (const dsp of dispatches) {
      await pool.query(
        `INSERT INTO dispatches (id, date, outlet_id, product_id, qty, price, status, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING;`,
        dsp
      );
    }

    // 8. Sales (matching invoice_id, transaction_date, supermarket schema)
    const sales = [
      ['INV-6001', daysAgo(1), 'Kigali City Supermarket', 50, 240000, 'Mobile Money', 'Kanyerezi'],
      ['INV-6002', daysAgo(0), 'Simba Supermarket - Kimironko', 80, 216000, 'Bank Transfer', 'Nakawunde']
    ];
    for (const s of sales) {
      await pool.query(
        `INSERT INTO sales (invoice_id, transaction_date, supermarket, total_delivered, amount_paid, payment_method, recorded_by) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (invoice_id) DO NOTHING;`,
        s
      );
    }

    console.log('✅ Factory fully seeded with master and operational records!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding factory:', err);
    process.exit(1);
  }
}

initFactory();