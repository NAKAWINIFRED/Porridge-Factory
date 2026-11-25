import { pool } from './db.js';
import crypto from 'crypto';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function getTableCols(tableName) {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(res.rows.map((r) => r.column_name));
}

async function resolveRecordedBy(tableName, tableCols, usrCols, preferredName) {
  if (!tableCols.has('recorded_by')) return null;

  const fkRes = await pool.query(
    `
    SELECT ccu.column_name AS ref_col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_name = $1
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'recorded_by'
    LIMIT 1;
    `,
    [tableName]
  );

  if (fkRes.rows.length > 0 && usrCols.size > 0) {
    const refCol = fkRes.rows[0].ref_col;
    const safeRefCol = /^[a-zA-Z0-9_]+$/.test(refCol) ? refCol : 'id';
    const usrRows = (await pool.query(`SELECT * FROM users;`)).rows;
    const target = String(preferredName || '').trim().toLowerCase();
    const firstToken = target.split(/\s+/)[0] || '';

    const matchedRow =
      usrRows.find((r) =>
        [r.full_name, r.name, r.username, r.id]
          .filter((v) => v !== null && v !== undefined)
          .some((v) => String(v).trim().toLowerCase() === target)
      ) ||
      (firstToken
        ? usrRows.find((r) =>
            [r.full_name, r.name, r.username, r.id]
              .filter((v) => v !== null && v !== undefined)
              .some((v) => String(v).trim().toLowerCase() === firstToken)
          )
        : null) ||
      usrRows[0];

    if (matchedRow && matchedRow[safeRefCol] !== undefined) {
      return matchedRow[safeRefCol];
    }
    return null;
  }

  return preferredName || null;
}

async function seedAugOctExact() {
  console.log('🌱 Seeding exact Porridge_Factory_Aug_Oct_2026_Test_Data.xlsx records into Postgres...');

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

    // Inspect live columns so optional tables/columns adapt automatically
    const prodCols = await getTableCols('products');
    const batCols = await getTableCols('batches');
    const dspCols = await getTableCols('dispatches');
    const payCols = await getTableCols('payments');
    const adjCols = await getTableCols('adjustments');
    const bomCols = await getTableCols('bom_items');
    const usrCols = await getTableCols('users');
    const usrRegCols = await getTableCols('user_regions');
    const usrOutCols = await getTableCols('user_outlets');

    // 1. Regions
    const regions = [
      ['reg-kigali', 'Kigali', 'Central operations'],
      ['reg-north', 'Northern Region', 'Musanze hub'],
      ['reg-east', 'Eastern Province', 'Rwamagana & Kayonza distribution corridor'],
      ['reg-south', 'Southern Province', 'Huye & Muhanga institutional and retail hub'],
    ];
    for (const r of regions) {
      await pool.query(
        `INSERT INTO regions (id, name, notes) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING;`,
        r
      );
    }

    // 2. Supermarkets / Outlets
    const outlets = [
      ['out-1', 'Kigali City Supermarket', 'supermarket', 'reg-kigali', 'KN 4 Ave, Nyarugenge', 'Jean Claude', '+250 788 123 456'],
      ['out-2', 'Simba Supermarket - Kimironko', 'supermarket', 'reg-kigali', 'KG 11 Ave, Gasabo', 'Aline Uwase', '+250 788 234 567'],
      ['out-3', 'China Town', 'supermarket', 'reg-kigali', 'Namasuba', 'Li Wei', '+250 788 345 678'],
      ['out-4', 'Quality Supermarket', 'supermarket', 'reg-kigali', 'Ntinda', 'Patrick Mugisha', '+250 788 456 789'],
      ['out-5', 'Musanze Modern Store', 'supermarket', 'reg-north', 'RN4 Highway, Musanze', 'Bosco Nshimiyimana', '+250 788 567 890'],
      ['out-rwamagana-mart', 'Rwamagana Central Mart', 'supermarket', 'reg-east', 'Rwamagana Town', 'Jean Bosco', '+250 788 301 112'],
      ['out-kayonza-fresh', 'Kayonza Fresh Grocers', 'supermarket', 'reg-east', 'Kayonza Junction', 'Diane Uwase', '+250 788 302 223'],
      ['out-huye-plaza', 'Huye Plaza Supermarket', 'supermarket', 'reg-south', 'Huye Urban', 'Emmanuel Safari', '+250 788 303 334'],
      ['out-muhanga-star', 'Muhanga Star Wholesalers', 'wholesaler', 'reg-south', 'Muhanga Center', 'Claudine Mukeshimana', '+250 788 304 445'],
      ['out-remera-express', 'Remera Corner Express', 'shop', null, 'Remera, Kigali', 'Eric Ndayisaba', '+250 788 305 556'],
    ];
    for (const o of outlets) {
      await pool.query(
        `INSERT INTO outlets (id, name, type, region_id, area, contact, phone) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING;`,
        o
      );
    }

    // 3. Optional Users / Regional Managers / Store Staff (if `users` table exists)
    if (usrCols.size > 0 && usrCols.has('username')) {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username);`);
      const defaultPass = hashPassword('Porridge123!');
      const users = [
        ['usr-mgr-claire', 'claire', defaultPass, 'Claire Uwimana', 'regional_manager', '0788412900', true],
        ['usr-mgr-david', 'david', defaultPass, 'David Habimana', 'regional_manager', '0788523110', true],
        ['usr-prod-grace', 'grace', defaultPass, 'Grace Mukamana', 'production', '0788634220', true],
        ['usr-fin-peter', 'peter', defaultPass, 'Peter Niyonzima', 'finance', '0788745330', true],
        ['usr-store-aline', 'aline', defaultPass, 'Aline Ishimwe', 'store_user', '0788856440', true],
      ];
      for (const u of users) {
        if (usrCols.has('password_hash') && usrCols.has('full_name')) {
          await pool.query(
            `INSERT INTO users (id, username, password_hash, full_name, role, phone, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (username) DO NOTHING;`,
            u
          );
        } else if (usrCols.has('password') && usrCols.has('name')) {
          await pool.query(
            `INSERT INTO users (id, username, password, name, role)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (username) DO NOTHING;`,
            [u[0], u[1], u[2], u[3], u[4]]
          );
        }
      }

      // Resolve actual user IDs from `users` in case a username already existed with a different ID
      const existingUsersRes = await pool.query(`SELECT id, username FROM users WHERE username IN ('claire', 'david', 'aline')`);
      const userIdByName = {};
      for (const row of existingUsersRes.rows) {
        userIdByName[row.username] = row.id;
      }

      if (usrRegCols.size > 0 && usrRegCols.has('user_id') && usrRegCols.has('region_id')) {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS user_regions_uq ON user_regions(user_id, region_id);`);
        if (userIdByName.claire) {
          await pool.query(
            `INSERT INTO user_regions (user_id, region_id) VALUES ($1, 'reg-east') ON CONFLICT DO NOTHING;`,
            [userIdByName.claire]
          );
        }
        if (userIdByName.david) {
          await pool.query(
            `INSERT INTO user_regions (user_id, region_id) VALUES ($1, 'reg-south') ON CONFLICT DO NOTHING;`,
            [userIdByName.david]
          );
        }
      }

      if (usrOutCols.size > 0 && usrOutCols.has('user_id') && usrOutCols.has('outlet_id')) {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS user_outlets_uq ON user_outlets(user_id, outlet_id);`);
        if (userIdByName.aline) {
          await pool.query(
            `INSERT INTO user_outlets (user_id, outlet_id) VALUES ($1, 'out-rwamagana-mart') ON CONFLICT DO NOTHING;`,
            [userIdByName.aline]
          );
          await pool.query(
            `INSERT INTO user_outlets (user_id, outlet_id) VALUES ($1, 'out-kayonza-fresh') ON CONFLICT DO NOTHING;`,
            [userIdByName.aline]
          );
        }
      }
    }

    // 4. Products (matches Excel wholesale & shelf prices)
    const products = [
      ['prod-1', 'NutriPorridge 1kg', '1kg', 4500, 4800],
      ['prod-2', 'NutriPorridge 500g', '500g', 2500, 2700],
      ['prod-3', 'Family Millet Blend 1kg', '1kg', 4800, 5200],
      ['prod-soya-1kg', 'Soya Protein Porridge 1kg', '1kg', 5000, 5500],
      ['prod-oats-500g', 'Honey Oat Instant 500g', '500g', 3200, 3600],
      ['prod-baby-250g', 'Baby Nutri-Smooth 250g', '250g', 1800, 2100],
    ];
    for (const p of products) {
      if (prodCols.has('shelf_price')) {
        await pool.query(
          `INSERT INTO products (id, name, size, price, shelf_price) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING;`,
          p
        );
      } else {
        await pool.query(
          `INSERT INTO products (id, name, size, price) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING;`,
          p.slice(0, 4)
        );
      }
    }

    // 5. Materials (all 12 raw materials & packaging items referenced in Excel)
    const materials = [
      ['MAT-001', 'Finger Millet Grain', 'Grain', 'Kg', 4500, 300, 2200, 'Nyagatare Grain Co-op'],
      ['MAT-002', 'Sorghum Flour', 'Grain', 'Kg', 2500, 250, 2200, 'Kayonza Millers Ltd'],
      ['MAT-003', 'Fortified Whole Maize', 'Grain', 'Kg', 2500, 400, 1700, 'Eastern Agro Mill'],
      ['MAT-004', 'Refined Sugar', 'Additive', 'Kg', 450, 100, 1500, 'Kabuye Sugar Works'],
      ['MAT-005', 'Milk Powder', 'Additive', 'Kg', 300, 50, 6250, 'Inyange Industrial Supply'],
      ['MAT-006', '1kg Printed Pouches', 'Packaging', 'Packs', 9000, 2000, 300, 'Rwanda Pack Solutions'],
      ['MAT-007', '500g Printed Pouches', 'Packaging', 'Packs', 7000, 3000, 310, 'Rwanda Pack Solutions'],
      ['MAT-008', 'Outer Shipping Cartons', 'Packaging', 'Boxes', 1200, 150, 500, 'Kigali Corrugated Box Ltd'],
      ['MAT-009', 'Roasted Soya Flour', 'Grain', 'Kg', 7200, 400, 2600, 'Bugesera Soya Processors'],
      ['MAT-010', 'Rolled Oats', 'Grain', 'Kg', 6300, 300, 3500, 'Kigali Food Imports'],
      ['MAT-011', 'Organic Honey', 'Additive', 'Litres', 320, 50, 8000, 'Nyungwe Beekeepers Co-op'],
      ['MAT-012', '250g Printed Pouches', 'Packaging', 'Packs', 10000, 1500, 220, 'Rwanda Pack Solutions'],
    ];
    for (const m of materials) {
      await pool.query(
        `INSERT INTO materials (item_code, name, category, unit, stock, reorder_level, unit_cost, supplier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (item_code) DO NOTHING;`,
        m
      );
    }

    // Resolve integer material IDs from Postgres
    const matRows = (await pool.query(`SELECT id, item_code FROM materials`)).rows;
    const matIdByCode = {};
    for (const r of matRows) {
      if (r.item_code) matIdByCode[r.item_code.trim()] = r.id;
    }

    // 6. Recipes (BOM) — exact 19 rows from Excel (if `bom_items` table exists)
    if (bomCols.size > 0) {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS bom_items_prod_mat_idx ON bom_items(product_id, material_id);`);
      const bomEntries = [
      [
            "prod-soya-1kg",
            "MAT-001",
            0.35
      ],
      [
            "prod-soya-1kg",
            "MAT-009",
            0.4
      ],
      [
            "prod-soya-1kg",
            "MAT-003",
            0.2
      ],
      [
            "prod-soya-1kg",
            "MAT-004",
            0.05
      ],
      [
            "prod-soya-1kg",
            "MAT-006",
            1.0
      ],
      [
            "prod-soya-1kg",
            "MAT-008",
            0.05
      ],
      [
            "prod-oats-500g",
            "MAT-010",
            0.32
      ],
      [
            "prod-oats-500g",
            "MAT-002",
            0.15
      ],
      [
            "prod-oats-500g",
            "MAT-011",
            0.02
      ],
      [
            "prod-oats-500g",
            "MAT-005",
            0.01
      ],
      [
            "prod-oats-500g",
            "MAT-007",
            1.0
      ],
      [
            "prod-oats-500g",
            "MAT-008",
            0.04
      ],
      [
            "prod-baby-250g",
            "MAT-001",
            0.1
      ],
      [
            "prod-baby-250g",
            "MAT-009",
            0.08
      ],
      [
            "prod-baby-250g",
            "MAT-010",
            0.05
      ],
      [
            "prod-baby-250g",
            "MAT-005",
            0.015
      ],
      [
            "prod-baby-250g",
            "MAT-011",
            0.005
      ],
      [
            "prod-baby-250g",
            "MAT-012",
            1.0
      ],
      [
            "prod-baby-250g",
            "MAT-008",
            0.025
      ]
];
      for (const [pid, mcode, qtyPerUnit] of bomEntries) {
        const mid = matIdByCode[mcode];
        if (mid != null) {
          await pool.query(
            `INSERT INTO bom_items (product_id, material_id, qty_per_unit) VALUES ($1, $2, $3) ON CONFLICT (product_id, material_id) DO NOTHING;`,
            [pid, mid, qtyPerUnit]
          );
        }
      }
    }

    // 7. Material Purchases — exact 18 rows from Excel
    const purchases = [
      [
            "pur-aug-01",
            "2026-08-02",
            "MAT-001",
            4500.0,
            9900000.0,
            "Nyagatare Grain Co-op",
            "+250788110001",
            "August opening grain stock"
      ],
      [
            "pur-aug-02",
            "2026-08-02",
            "MAT-002",
            2500.0,
            5500000.0,
            "Kayonza Millers Ltd",
            "+250788110002",
            "August sorghum delivery"
      ],
      [
            "pur-aug-03",
            "2026-08-03",
            "MAT-003",
            2500.0,
            4250000.0,
            "Eastern Agro Mill",
            "+250788110003",
            "Fortified maize batch A"
      ],
      [
            "pur-aug-04",
            "2026-08-03",
            "MAT-009",
            3000.0,
            7800000.0,
            "Bugesera Soya Processors",
            "+250788110004",
            "Roasted soya flour August"
      ],
      [
            "pur-aug-05",
            "2026-08-04",
            "MAT-010",
            2500.0,
            8750000.0,
            "Kigali Food Imports",
            "+250788110005",
            "Rolled oats bulk sacks"
      ],
      [
            "pur-aug-06",
            "2026-08-04",
            "MAT-004",
            450.0,
            675000.0,
            "Kabuye Sugar Works",
            "+250788000005",
            "Refined sugar bags"
      ],
      [
            "pur-aug-07",
            "2026-08-05",
            "MAT-005",
            300.0,
            1875000.0,
            "Inyange Industrial Supply",
            "+250788110007",
            "Fortified milk concentrate"
      ],
      [
            "pur-aug-08",
            "2026-08-05",
            "MAT-011",
            200.0,
            1600000.0,
            "Nyungwe Beekeepers Co-op",
            "+250788110008",
            "Pure forest honey"
      ],
      [
            "pur-aug-09",
            "2026-08-06",
            "MAT-006",
            9000.0,
            2700000.0,
            "Rwanda Pack Solutions",
            "+250788110009",
            "1kg pouches restock (covers Aug-Nov)"
      ],
      [
            "pur-aug-10",
            "2026-08-06",
            "MAT-007",
            7000.0,
            2170000.0,
            "Rwanda Pack Solutions",
            "+250788110009",
            "500g pouches restock"
      ],
      [
            "pur-aug-11",
            "2026-08-06",
            "MAT-012",
            6000.0,
            1320000.0,
            "Rwanda Pack Solutions",
            "+250788110009",
            "250g baby pouches"
      ],
      [
            "pur-aug-12",
            "2026-08-06",
            "MAT-008",
            1200.0,
            600000.0,
            "Kigali Corrugated Box Ltd",
            "+250788110010",
            "Heavy-duty master cartons"
      ],
      [
            "pur-sep-01",
            "2026-09-02",
            "MAT-009",
            2000.0,
            5300000.0,
            "Bugesera Soya Processors",
            "+250788110004",
            "September soya restock"
      ],
      [
            "pur-sep-02",
            "2026-09-03",
            "MAT-010",
            1800.0,
            6480000.0,
            "Kigali Food Imports",
            "+250788110005",
            "September oats shipment"
      ],
      [
            "pur-sep-03",
            "2026-09-04",
            "MAT-011",
            120.0,
            984000.0,
            "Nyungwe Beekeepers Co-op",
            "+250788110008",
            "September honey drums"
      ],
      [
            "pur-oct-01",
            "2026-10-03",
            "MAT-009",
            2200.0,
            5830000.0,
            "Bugesera Soya Processors",
            "+250788110004",
            "October soya restock"
      ],
      [
            "pur-oct-02",
            "2026-10-04",
            "MAT-010",
            2000.0,
            7100000.0,
            "Kigali Food Imports",
            "+250788110005",
            "October oats restock"
      ],
      [
            "pur-oct-03",
            "2026-10-05",
            "MAT-012",
            4000.0,
            900000.0,
            "Rwanda Pack Solutions",
            "+250788110009",
            "October 250g pouches"
      ]
];
    for (const [id, dt, mcode, qty, cost, sup, contact, memo] of purchases) {
      const mid = matIdByCode[mcode];
      if (mid != null) {
        await pool.query(
          `INSERT INTO material_purchases (id, date, material_id, qty, cost, supplier, supplier_contact, memo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING;`,
          [id, dt, mid, qty, cost, sup, contact, memo]
        );
      }
    }

    // 8. Production Batches — exact 11 rows from Excel
    const batches = [
      [
            "bat-aug-01",
            "2026-08-08",
            "BAT-0801",
            "prod-soya-1kg",
            2000,
            1950,
            95000.0,
            "Grace Mukamana",
            "First August Soya Protein run"
      ],
      [
            "bat-aug-02",
            "2026-08-12",
            "BAT-0802",
            "prod-oats-500g",
            2200,
            2150,
            85000.0,
            "Grace Mukamana",
            "August Honey Oat Instant batch"
      ],
      [
            "bat-aug-03",
            "2026-08-16",
            "BAT-0803",
            "prod-baby-250g",
            2500,
            2440,
            75000.0,
            "Grace Mukamana",
            "August Baby Nutri-Smooth run"
      ],
      [
            "bat-aug-04",
            "2026-08-21",
            "BAT-0804",
            "prod-1",
            1800,
            1760,
            80000.0,
            "Grace Mukamana",
            "August NutriPorridge 1kg stock build"
      ],
      [
            "bat-aug-05",
            "2026-08-25",
            "BAT-0805",
            "prod-2",
            2000,
            1960,
            70000.0,
            "Grace Mukamana",
            "August NutriPorridge 500g stock build"
      ],
      [
            "bat-sep-01",
            "2026-09-06",
            "BAT-0903",
            "prod-soya-1kg",
            2400,
            2350,
            105000.0,
            "Grace Mukamana",
            "September Soya Protein expansion"
      ],
      [
            "bat-sep-02",
            "2026-09-14",
            "BAT-0904",
            "prod-oats-500g",
            2500,
            2420,
            92000.0,
            "Grace Mukamana",
            "September Honey Oat run"
      ],
      [
            "bat-sep-03",
            "2026-09-20",
            "BAT-0905",
            "prod-baby-250g",
            3000,
            2920,
            88000.0,
            "Grace Mukamana",
            "September Baby Nutri-Smooth batch"
      ],
      [
            "bat-oct-01",
            "2026-10-07",
            "BAT-1003",
            "prod-soya-1kg",
            2500,
            2450,
            110000.0,
            "Grace Mukamana",
            "October Soya Protein run"
      ],
      [
            "bat-oct-02",
            "2026-10-15",
            "BAT-1004",
            "prod-oats-500g",
            2400,
            2340,
            90000.0,
            "Grace Mukamana",
            "October Honey Oat run"
      ],
      [
            "bat-oct-03",
            "2026-10-24",
            "BAT-1005",
            "prod-baby-250g",
            2800,
            2750,
            84000.0,
            "Grace Mukamana",
            "October Baby Nutri-Smooth run"
      ]
];
    const validBatchRecordedBy = await resolveRecordedBy('batches', batCols, usrCols, 'Grace Mukamana');
    for (const [id, dt, code, pid, planned, units, otherCosts, recBy, memo] of batches) {
      if (batCols.has('recorded_by')) {
        await pool.query(
          `INSERT INTO batches (id, date, code, product_id, planned_units, units, other_costs, recorded_by, memo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING;`,
          [id, dt, code, pid, planned, units, otherCosts, validBatchRecordedBy, memo]
        );
      } else {
        await pool.query(
          `INSERT INTO batches (id, date, code, product_id, planned_units, units, other_costs, memo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING;`,
          [id, dt, code, pid, planned, units, otherCosts, memo]
        );
      }
    }

    // 9. Deliveries / Dispatches — exact 22 rows from Excel
    const dispatches = [
      [
            "dsp-aug-01",
            "2026-08-10",
            "out-rwamagana-mart",
            "prod-soya-1kg",
            600,
            5000.0,
            "received",
            600,
            "2026-08-10",
            "DN-0801: All cartons intact"
      ],
      [
            "dsp-aug-02",
            "2026-08-11",
            "out-kayonza-fresh",
            "prod-soya-1kg",
            450,
            5000.0,
            "received",
            445,
            "2026-08-11",
            "DN-0802: 5 packs torn in transit"
      ],
      [
            "dsp-aug-03",
            "2026-08-14",
            "out-huye-plaza",
            "prod-oats-500g",
            700,
            3200.0,
            "received",
            700,
            "2026-08-15",
            "DN-0803: Received in full"
      ],
      [
            "dsp-aug-04",
            "2026-08-15",
            "out-muhanga-star",
            "prod-oats-500g",
            800,
            3200.0,
            "received",
            790,
            "2026-08-15",
            "DN-0804: 10 packs short on arrival"
      ],
      [
            "dsp-aug-05",
            "2026-08-18",
            "out-1",
            "prod-baby-250g",
            900,
            1800.0,
            "received",
            900,
            "2026-08-18",
            "DN-0805: Delivered to central store"
      ],
      [
            "dsp-aug-06",
            "2026-08-19",
            "out-2",
            "prod-soya-1kg",
            500,
            5000.0,
            "received",
            500,
            "2026-08-19",
            "DN-0806: Checked & signed"
      ],
      [
            "dsp-aug-07",
            "2026-08-22",
            "out-remera-express",
            "prod-baby-250g",
            400,
            1800.0,
            "received",
            400,
            "2026-08-22",
            "DN-0807: OK"
      ],
      [
            "dsp-aug-08",
            "2026-08-26",
            "out-5",
            "prod-1",
            650,
            4500.0,
            "received",
            650,
            "2026-08-27",
            "DN-0808: Northern route delivery"
      ],
      [
            "dsp-sep-01",
            "2026-09-08",
            "out-rwamagana-mart",
            "prod-oats-500g",
            650,
            3200.0,
            "received",
            650,
            "2026-09-08",
            "DN-0905: Received"
      ],
      [
            "dsp-sep-02",
            "2026-09-09",
            "out-kayonza-fresh",
            "prod-baby-250g",
            750,
            1800.0,
            "received",
            740,
            "2026-09-09",
            "DN-0906: 10 packs missing in transit"
      ],
      [
            "dsp-sep-03",
            "2026-09-12",
            "out-huye-plaza",
            "prod-soya-1kg",
            800,
            5000.0,
            "received",
            800,
            "2026-09-13",
            "DN-0907: Received in full"
      ],
      [
            "dsp-sep-04",
            "2026-09-15",
            "out-muhanga-star",
            "prod-baby-250g",
            900,
            1800.0,
            "received",
            900,
            "2026-09-15",
            "DN-0908: Full pallet received"
      ],
      [
            "dsp-sep-05",
            "2026-09-18",
            "out-3",
            "prod-oats-500g",
            550,
            3200.0,
            "received",
            550,
            "2026-09-18",
            "DN-0909: Delivered"
      ],
      [
            "dsp-sep-06",
            "2026-09-22",
            "out-4",
            "prod-2",
            700,
            2500.0,
            "received",
            700,
            "2026-09-22",
            "DN-0910: Stocked at Ntinda"
      ],
      [
            "dsp-oct-01",
            "2026-10-08",
            "out-rwamagana-mart",
            "prod-baby-250g",
            800,
            1800.0,
            "received",
            800,
            "2026-10-08",
            "DN-1005: Received"
      ],
      [
            "dsp-oct-02",
            "2026-10-10",
            "out-kayonza-fresh",
            "prod-oats-500g",
            600,
            3200.0,
            "received",
            592,
            "2026-10-10",
            "DN-1006: 8 packs damaged on truck"
      ],
      [
            "dsp-oct-03",
            "2026-10-14",
            "out-huye-plaza",
            "prod-baby-250g",
            850,
            1800.0,
            "received",
            850,
            "2026-10-15",
            "DN-1007: Full delivery"
      ],
      [
            "dsp-oct-04",
            "2026-10-18",
            "out-muhanga-star",
            "prod-soya-1kg",
            950,
            5000.0,
            "received",
            950,
            "2026-10-18",
            "DN-1008: Wholesale order confirmed"
      ],
      [
            "dsp-oct-05",
            "2026-10-21",
            "out-1",
            "prod-soya-1kg",
            700,
            5000.0,
            "received",
            700,
            "2026-10-21",
            "DN-1009: Confirmed"
      ],
      [
            "dsp-oct-06",
            "2026-10-25",
            "out-remera-express",
            "prod-oats-500g",
            350,
            3200.0,
            "received",
            350,
            "2026-10-25",
            "DN-1010: Confirmed"
      ],
      [
            "dsp-oct-07",
            "2026-10-28",
            "out-huye-plaza",
            "prod-soya-1kg",
            400,
            5000.0,
            "in_transit",
            null,
            null,
            "DN-1011"
      ],
      [
            "dsp-oct-08",
            "2026-10-29",
            "out-rwamagana-mart",
            "prod-oats-500g",
            300,
            3200.0,
            "in_transit",
            null,
            null,
            "DN-1012"
      ]
];
    for (const [id, dt, oid, pid, qty, price, status, recQty, recDate, note] of dispatches) {
      if (dspCols.has('received_qty') && dspCols.has('received_date')) {
        await pool.query(
          `INSERT INTO dispatches (id, date, outlet_id, product_id, qty, price, status, received_qty, received_date, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING;`,
          [id, dt, oid, pid, qty, price, status, recQty, recDate, note]
        );
      } else {
        await pool.query(
          `INSERT INTO dispatches (id, date, outlet_id, product_id, qty, price, status, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING;`,
          [id, dt, oid, pid, qty, price, status, note]
        );
      }
    }

    // 10. Sales — exact 23 rows from Excel (using `sal-aug-01` .. `sal-oct-07` in `invoice_id`)
    const sales = [
      [
            "sal-aug-01",
            "2026-08-14",
            "Rwamagana Central Mart",
            "prod-soya-1kg",
            240,
            5000.0,
            20000.0,
            1180000.0,
            "Bank Transfer",
            "Aline Ishimwe"
      ],
      [
            "sal-aug-02",
            "2026-08-16",
            "Kayonza Fresh Grocers",
            "prod-soya-1kg",
            180,
            5000.0,
            0.0,
            900000.0,
            "Mobile Money",
            "Aline Ishimwe"
      ],
      [
            "sal-aug-03",
            "2026-08-19",
            "Huye Plaza Supermarket",
            "prod-oats-500g",
            310,
            3200.0,
            15000.0,
            977000.0,
            "Bank Transfer",
            "David Habimana"
      ],
      [
            "sal-aug-04",
            "2026-08-20",
            "Muhanga Star Wholesalers",
            "prod-oats-500g",
            420,
            3200.0,
            44000.0,
            1300000.0,
            "Mobile Money",
            "David Habimana"
      ],
      [
            "sal-aug-05",
            "2026-08-22",
            "Kigali City Supermarket",
            "prod-baby-250g",
            360,
            1800.0,
            0.0,
            648000.0,
            "Bank Transfer",
            "Administrator"
      ],
      [
            "sal-aug-06",
            "2026-08-24",
            "Simba Supermarket - Kimironko",
            "prod-soya-1kg",
            210,
            5000.0,
            10000.0,
            1040000.0,
            "Mobile Money",
            "Administrator"
      ],
      [
            "sal-aug-07",
            "2026-08-26",
            "Remera Corner Express",
            "prod-baby-250g",
            190,
            1800.0,
            0.0,
            342000.0,
            "Bank Transfer",
            "Administrator"
      ],
      [
            "sal-aug-08",
            "2026-08-29",
            "Musanze Modern Store",
            "prod-1",
            280,
            4500.0,
            0.0,
            1260000.0,
            "Mobile Money",
            "Administrator"
      ],
      [
            "sal-sep-01",
            "2026-09-11",
            "Rwamagana Central Mart",
            "prod-oats-500g",
            290,
            3200.0,
            0.0,
            928000.0,
            "Bank Transfer",
            "Aline Ishimwe"
      ],
      [
            "sal-sep-02",
            "2026-09-12",
            "Rwamagana Central Mart",
            "prod-soya-1kg",
            190,
            5000.0,
            0.0,
            950000.0,
            "Mobile Money",
            "Aline Ishimwe"
      ],
      [
            "sal-sep-03",
            "2026-09-14",
            "Kayonza Fresh Grocers",
            "prod-baby-250g",
            340,
            1800.0,
            12000.0,
            600000.0,
            "Bank Transfer",
            "Aline Ishimwe"
      ],
      [
            "sal-sep-04",
            "2026-09-16",
            "Huye Plaza Supermarket",
            "prod-soya-1kg",
            350,
            5000.0,
            25000.0,
            1725000.0,
            "Mobile Money",
            "David Habimana"
      ],
      [
            "sal-sep-05",
            "2026-09-18",
            "Muhanga Star Wholesalers",
            "prod-baby-250g",
            480,
            1800.0,
            24000.0,
            840000.0,
            "Bank Transfer",
            "David Habimana"
      ],
      [
            "sal-sep-06",
            "2026-09-20",
            "China Town",
            "prod-oats-500g",
            260,
            3200.0,
            0.0,
            832000.0,
            "Mobile Money",
            "Administrator"
      ],
      [
            "sal-sep-07",
            "2026-09-24",
            "Quality Supermarket",
            "prod-2",
            310,
            2500.0,
            0.0,
            775000.0,
            "Bank Transfer",
            "Administrator"
      ],
      [
            "sal-sep-08",
            "2026-09-27",
            "Kigali City Supermarket",
            "prod-baby-250g",
            280,
            1800.0,
            0.0,
            504000.0,
            "Mobile Money",
            "Administrator"
      ],
      [
            "sal-oct-01",
            "2026-10-10",
            "Rwamagana Central Mart",
            "prod-baby-250g",
            390,
            1800.0,
            0.0,
            702000.0,
            "Bank Transfer",
            "Aline Ishimwe"
      ],
      [
            "sal-oct-02",
            "2026-10-12",
            "Kayonza Fresh Grocers",
            "prod-oats-500g",
            270,
            3200.0,
            14000.0,
            850000.0,
            "Mobile Money",
            "Aline Ishimwe"
      ],
      [
            "sal-oct-03",
            "2026-10-16",
            "Huye Plaza Supermarket",
            "prod-baby-250g",
            410,
            1800.0,
            0.0,
            738000.0,
            "Bank Transfer",
            "David Habimana"
      ],
      [
            "sal-oct-04",
            "2026-10-20",
            "Muhanga Star Wholesalers",
            "prod-soya-1kg",
            510,
            5000.0,
            50000.0,
            2500000.0,
            "Mobile Money",
            "David Habimana"
      ],
      [
            "sal-oct-05",
            "2026-10-23",
            "Kigali City Supermarket",
            "prod-soya-1kg",
            320,
            5000.0,
            0.0,
            1600000.0,
            "Bank Transfer",
            "Administrator"
      ],
      [
            "sal-oct-06",
            "2026-10-26",
            "Remera Corner Express",
            "prod-oats-500g",
            160,
            3200.0,
            0.0,
            512000.0,
            "Mobile Money",
            "Administrator"
      ],
      [
            "sal-oct-07",
            "2026-10-28",
            "Simba Supermarket - Kimironko",
            "prod-soya-1kg",
            140,
            5000.0,
            0.0,
            700000.0,
            "Bank Transfer",
            "Administrator"
      ]
];
    for (const [invId, dt, supermarket, pid, qty, unitPrice, discount, amount, payMethod, recBy] of sales) {
      await pool.query(
        `INSERT INTO sales (invoice_id, transaction_date, date, supermarket, product_id, qty, total_delivered, unit_price, discount, amount, payment_method, recorded_by)
         VALUES ($1, $2, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (invoice_id) DO NOTHING;`,
        [invId, dt, supermarket, pid, qty, unitPrice, discount, amount, payMethod, recBy]
      );
    }

    // 11. Payments — exact 17 rows from Excel (if `payments` table exists)
    if (payCols.size > 0 && payCols.has('outlet_id')) {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS payments_id_idx ON payments(id);`);
      const payments = [
      [
            "pay-aug-01",
            "2026-08-18",
            "out-rwamagana-mart",
            900000.0,
            "Bank transfer",
            "BK-8801",
            "Peter Niyonzima"
      ],
      [
            "pay-aug-02",
            "2026-08-21",
            "out-kayonza-fresh",
            650000.0,
            "Mobile money",
            "MTN-8802",
            "Peter Niyonzima"
      ],
      [
            "pay-aug-03",
            "2026-08-24",
            "out-huye-plaza",
            800000.0,
            "Bank transfer",
            "EQ-8803",
            "Peter Niyonzima"
      ],
      [
            "pay-aug-04",
            "2026-08-27",
            "out-muhanga-star",
            1000000.0,
            "Cheque",
            "CHQ-401",
            "Peter Niyonzima"
      ],
      [
            "pay-aug-05",
            "2026-08-28",
            "out-1",
            500000.0,
            "Bank transfer",
            "BK-8805",
            "Peter Niyonzima"
      ],
      [
            "pay-aug-06",
            "2026-08-30",
            "out-5",
            950000.0,
            "Mobile money",
            "MTN-8806",
            "Peter Niyonzima"
      ],
      [
            "pay-sep-01",
            "2026-09-15",
            "out-rwamagana-mart",
            1200000.0,
            "Bank transfer",
            "BK-9901",
            "Peter Niyonzima"
      ],
      [
            "pay-sep-02",
            "2026-09-19",
            "out-huye-plaza",
            1300000.0,
            "Bank transfer",
            "EQ-9902",
            "Peter Niyonzima"
      ],
      [
            "pay-sep-03",
            "2026-09-22",
            "out-muhanga-star",
            750000.0,
            "Cash",
            "RCP-9903",
            "Peter Niyonzima"
      ],
      [
            "pay-sep-04",
            "2026-09-25",
            "out-3",
            600000.0,
            "Mobile money",
            "AIR-9904",
            "Peter Niyonzima"
      ],
      [
            "pay-sep-05",
            "2026-09-28",
            "out-4",
            775000.0,
            "Bank transfer",
            "BK-9905",
            "Peter Niyonzima"
      ],
      [
            "pay-oct-01",
            "2026-10-14",
            "out-rwamagana-mart",
            850000.0,
            "Bank transfer",
            "BK-1001",
            "Peter Niyonzima"
      ],
      [
            "pay-oct-02",
            "2026-10-17",
            "out-kayonza-fresh",
            700000.0,
            "Mobile money",
            "MTN-1002",
            "Peter Niyonzima"
      ],
      [
            "pay-oct-03",
            "2026-10-22",
            "out-huye-plaza",
            900000.0,
            "Bank transfer",
            "EQ-1003",
            "Peter Niyonzima"
      ],
      [
            "pay-oct-04",
            "2026-10-25",
            "out-muhanga-star",
            1500000.0,
            "Bank transfer",
            "BK-1004",
            "Peter Niyonzima"
      ],
      [
            "pay-oct-05",
            "2026-10-27",
            "out-remera-express",
            500000.0,
            "Mobile money",
            "MTN-1005",
            "Peter Niyonzima"
      ],
      [
            "pay-oct-06",
            "2026-10-29",
            "out-2",
            1100000.0,
            "Bank transfer",
            "BK-1006",
            "Peter Niyonzima"
      ]
];
      for (const p of payments) {
        const safeRecBy = payCols.has('recorded_by')
          ? await resolveRecordedBy('payments', payCols, usrCols, p[6])
          : p[6];
        const rowToInsert = [...p];
        rowToInsert[6] = safeRecBy;
        await pool.query(
          `INSERT INTO payments (id, date, outlet_id, amount, method, reference, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING;`,
          rowToInsert
        );
      }
    }

    // 12. Returns & Losses / Adjustments — exact 12 rows from Excel (if `adjustments` table exists)
    if (adjCols.size > 0 && adjCols.has('outlet_id') && adjCols.has('product_id')) {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS adjustments_id_idx ON adjustments(id);`);
      const adjustments = [
      [
            "adj-aug-01",
            "2026-08-15",
            "material",
            null,
            "MAT-009",
            null,
            "wastage",
            25.0,
            "[Raw Material Store] Moisture damage during bagging",
            "Grace Mukamana"
      ],
      [
            "adj-sep-01",
            "2026-09-10",
            "material",
            null,
            "MAT-010",
            null,
            "wastage",
            18.0,
            "[Raw Material Store] Spillage on hopper line",
            "Grace Mukamana"
      ],
      [
            "adj-oct-01",
            "2026-10-12",
            "material",
            null,
            "MAT-012",
            null,
            "wastage",
            45.0,
            "[Raw Material Store] Heat-sealer calibration rejects",
            "Grace Mukamana"
      ],
      [
            "adj-aug-02",
            "2026-08-20",
            "product",
            "prod-soya-1kg",
            null,
            null,
            "damaged",
            15.0,
            "[Factory Warehouse] Forklift punctured outer carton in warehouse",
            "Grace Mukamana"
      ],
      [
            "adj-sep-02",
            "2026-09-19",
            "product",
            "prod-oats-500g",
            null,
            null,
            "lost",
            10.0,
            "[Factory Warehouse] Quality lab retention samples",
            "Grace Mukamana"
      ],
      [
            "adj-oct-02",
            "2026-10-19",
            "product",
            "prod-baby-250g",
            null,
            null,
            "expired",
            12.0,
            "[Factory Warehouse] Trial batch past shelf-life window",
            "Grace Mukamana"
      ],
      [
            "adj-aug-03",
            "2026-08-25",
            "product",
            "prod-soya-1kg",
            null,
            "out-rwamagana-mart",
            "returned",
            12.0,
            "Overstocked display return",
            "Claire Uwimana"
      ],
      [
            "adj-aug-04",
            "2026-08-28",
            "product",
            "prod-oats-500g",
            null,
            "out-huye-plaza",
            "damaged",
            8.0,
            "Crushed packs on lower shelf",
            "David Habimana"
      ],
      [
            "adj-sep-03",
            "2026-09-21",
            "product",
            "prod-baby-250g",
            null,
            "out-kayonza-fresh",
            "returned",
            15.0,
            "Packaging label smudge returned",
            "Claire Uwimana"
      ],
      [
            "adj-sep-04",
            "2026-09-26",
            "product",
            "prod-soya-1kg",
            null,
            "out-muhanga-star",
            "count",
            6.0,
            "Counted 284, records showed 290",
            "David Habimana"
      ],
      [
            "adj-oct-03",
            "2026-10-22",
            "product",
            "prod-baby-250g",
            null,
            "out-rwamagana-mart",
            "expired",
            10.0,
            "Cleared near-expiry units from shelf",
            "Aline Ishimwe"
      ],
      [
            "adj-oct-04",
            "2026-10-27",
            "product",
            "prod-oats-500g",
            null,
            "out-muhanga-star",
            "lost",
            5.0,
            "Unaccounted shrinkage during audit",
            "David Habimana"
      ]
];
      for (const [id, dt, item, pid, mcode, oid, reason, qty, note, recBy] of adjustments) {
        const mid = mcode ? matIdByCode[mcode] || null : null;
        const safeRecBy = adjCols.has('recorded_by')
          ? await resolveRecordedBy('adjustments', adjCols, usrCols, recBy)
          : recBy;
        await pool.query(
          `INSERT INTO adjustments (id, date, item, product_id, material_id, outlet_id, reason, qty, note, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING;`,
          [id, dt, item, pid, mid, oid, reason, qty, note, safeRecBy]
        );
      }
    }

    console.log('✅ Exact Excel dataset (Aug–Oct 2026) seeded cleanly into Postgres!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding exact Excel records:', err);
    process.exit(1);
  }
}

seedAugOctExact();