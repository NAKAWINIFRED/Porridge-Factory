import { pool } from './db.js';

async function seedFullHistory() {
  console.log('🌱 Seeding complete Porridge Factory data for September, October, and November 2026...');

  try {
    // Drop restrictive check constraint on dispatches if it exists
    await pool.query(`ALTER TABLE dispatches DROP CONSTRAINT IF EXISTS dispatches_check;`);

    // Ensure unique indexes for ON CONFLICT clauses
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_id_idx ON sales(invoice_id);`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS regions_id_idx ON regions(id);`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS outlets_id_idx ON outlets(id);`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS products_id_idx ON products(id);`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS materials_item_code_idx ON materials(item_code);`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS material_purchases_id_idx ON material_purchases(id);`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS batches_id_idx ON batches(id);`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS dispatches_id_idx ON dispatches(id);`);

    // 1. Ensure Regions
    await pool.query(`INSERT INTO regions (id, name, notes) VALUES ('reg-kigali', 'Kigali', 'Central operations') ON CONFLICT (id) DO NOTHING;`);
    await pool.query(`INSERT INTO regions (id, name, notes) VALUES ('reg-north', 'Northern Region', 'Musanze hub') ON CONFLICT (id) DO NOTHING;`);

    // 2. Ensure Outlets (Supermarkets)
    const outlets = [
      ['out-1', 'Kigali City Supermarket', 'supermarket', 'reg-kigali', 'KN 4 Ave, Nyarugenge', 'Jean Claude', '+250 788 123 456'],
      ['out-2', 'Simba Supermarket - Kimironko', 'supermarket', 'reg-kigali', 'KG 11 Ave, Gasabo', 'Aline Uwase', '+250 788 234 567'],
      ['out-3', 'China Town', 'supermarket', 'reg-kigali', 'Namasuba', 'Li Wei', '+250 788 345 678'],
      ['out-4', 'Quality Supermarket', 'supermarket', 'reg-kigali', 'Ntinda', 'Patrick Mugisha', '+250 788 456 789'],
      ['out-5', 'Musanze Modern Store', 'supermarket', 'reg-north', 'RN4 Highway, Musanze', 'Bosco Nshimiyimana', '+250 788 567 890']
    ];
    for (const o of outlets) {
      await pool.query(
        `INSERT INTO outlets (id, name, type, region_id, area, contact, phone) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING;`,
        o
      );
    }

    // 3. Ensure Products
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

    // 4. Ensure Materials
    const materials = [
      ['MAT-001', 'Finger Millet Grain', 'Grain', 'Kg', 1500, 300, 2500, 'AgriSupply Co'],
      ['MAT-002', 'Sorghum Flour', 'Grain', 'Kg', 1200, 250, 2200, 'Great Lakes Grains'],
      ['MAT-003', 'Fortified Whole Maize', 'Grain', 'Kg', 2000, 400, 1800, 'Rwanda Farmers Hub'],
      ['MAT-004', 'Refined Sugar', 'Additive', 'Kg', 500, 100, 3500, 'Kabuye Sugar Works'],
      ['MAT-005', 'Milk Powder', 'Additive', 'Kg', 200, 50, 12000, 'Brookside Dairy'],
      ['MAT-006', '1kg Printed Pouches', 'Packaging', 'Packs', 5000, 2000, 300, 'Packaging Ltd'],
      ['MAT-007', '500g Printed Pouches', 'Packaging', 'Packs', 5000, 3000, 200, 'Packaging Ltd'],
      ['MAT-008', 'Outer Shipping Cartons', 'Packaging', 'Boxes', 500, 150, 1500, 'BoxCo Africa']
    ];
    for (const m of materials) {
      await pool.query(
        `INSERT INTO materials (item_code, name, category, unit, stock, reorder_level, unit_cost, supplier) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (item_code) DO NOTHING;`,
        m
      );
    }

    // 5. Seed Material Purchases across Sept, Oct, Nov 2026
    const purchases = [
      ['pur-sep-1', '2026-09-05', 1, 1500, 3750000, 'AgriSupply Co', '+250788000001', 'September bulk grain purchase'],
      ['pur-sep-2', '2026-09-20', 2, 1200, 2640000, 'Great Lakes Grains', '+250788000002', 'September sorghum restock'],
      ['pur-oct-1', '2026-10-04', 1, 2000, 5000000, 'AgriSupply Co', '+250788000001', 'October grain delivery'],
      ['pur-oct-2', '2026-10-18', 6, 3000, 900000, 'Packaging Ltd', '+250788000003', '1kg Pouches restock'],
      ['pur-nov-1', '2026-11-02', 2, 1500, 3300000, 'Great Lakes Grains', '+250788000002', 'November sorghum purchase'],
      ['pur-nov-2', '2026-11-10', 3, 2000, 3600000, 'Rwanda Farmers Hub', '+250788000004', 'Maize batch purchase']
    ];
    for (const pur of purchases) {
      await pool.query(
        `INSERT INTO material_purchases (id, date, material_id, qty, cost, supplier, supplier_contact, memo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING;`,
        pur
      );
    }

    // 6. Seed Production Batches (Sept - Nov 2026)
    const batches = [
      ['bat-sep-1', '2026-09-10', 'BAT-0901', 'prod-1', 1200, 1150, 50000, 'September Batch A'],
      ['bat-sep-2', '2026-09-25', 'BAT-0902', 'prod-2', 1500, 1480, 45000, 'September Batch B'],
      ['bat-oct-1', '2026-10-10', 'BAT-1001', 'prod-1', 2000, 1950, 80000, 'October Batch A'],
      ['bat-oct-2', '2026-10-22', 'BAT-1002', 'prod-3', 1000, 980, 60000, 'October Millet Blend'],
      ['bat-nov-1', '2026-11-05', 'BAT-1101', 'prod-1', 1500, 1450, 50000, 'November Batch A'],
      ['bat-nov-2', '2026-11-12', 'BAT-1102', 'prod-2', 2000, 1960, 70000, 'November Batch B']
    ];
    for (const bat of batches) {
      await pool.query(
        `INSERT INTO batches (id, date, code, product_id, planned_units, units, other_costs, memo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING;`,
        bat
      );
    }

    // 7. Seed Dispatches (Deliveries to supermarkets)
    const dispatches = [
      ['dsp-sep-1', '2026-09-12', 'out-1', 'prod-1', 400, 4500, 'in_transit', 'Shipment to Kigali City Supermarket'],
      ['dsp-sep-2', '2026-09-28', 'out-2', 'prod-2', 500, 2500, 'in_transit', 'Shipment to Simba Kimironko'],
      ['dsp-oct-1', '2026-10-12', 'out-1', 'prod-1', 600, 4500, 'in_transit', 'October restock Kigali City'],
      ['dsp-oct-2', '2026-10-25', 'out-3', 'prod-2', 300, 2500, 'in_transit', 'Initial delivery to China Town'],
      ['dsp-nov-1', '2026-11-06', 'out-1', 'prod-1', 350, 4500, 'in_transit', 'November restock Kigali City'],
      ['dsp-nov-2', '2026-11-14', 'out-2', 'prod-2', 400, 2500, 'in_transit', 'November restock Simba Kimironko']
    ];
    for (const dsp of dispatches) {
      await pool.query(
        `INSERT INTO dispatches (id, date, outlet_id, product_id, qty, price, status, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING;`,
        dsp
      );
    }

    // 8. Seed Sales & Revenue Records
    const sales = [
      ['INV-9001', '2026-09-15', 'Kigali City Supermarket', 'prod-1', 350, 4800, 0, 1680000, 'Bank Transfer', 'Kanyerezi'],
      ['INV-9002', '2026-09-30', 'Simba Supermarket - Kimironko', 'prod-2', 450, 2700, 0, 1215000, 'Mobile Money', 'Kanyerezi'],
      ['INV-1001', '2026-10-15', 'Kigali City Supermarket', 'prod-1', 550, 4800, 0, 2640000, 'Bank Transfer', 'Kanyerezi'],
      ['INV-1002', '2026-10-28', 'China Town', 'prod-2', 250, 2700, 0, 675000, 'Cash', 'Kanyerezi'],
      ['INV-1101', '2026-11-08', 'Kigali City Supermarket', 'prod-1', 300, 4800, 0, 1440000, 'Bank Transfer', 'Kanyerezi'],
      ['INV-1102', '2026-11-15', 'Simba Supermarket - Kimironko', 'prod-2', 380, 2700, 0, 1026000, 'Mobile Money', 'Kanyerezi']
    ];
    for (const s of sales) {
      await pool.query(
        `INSERT INTO sales (invoice_id, transaction_date, date, supermarket, product_id, qty, total_delivered, unit_price, discount, amount, payment_method, recorded_by) 
         VALUES ($1, $2, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10) 
         ON CONFLICT (invoice_id) DO NOTHING;`,
        [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9]]
      );
    }

    console.log('✅ Porridge Factory fully populated with September, October, and November 2026 historical records!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding historical records:', err);
    process.exit(1);
  }
}

seedFullHistory();