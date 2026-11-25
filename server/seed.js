import { pool } from './db.js';

async function seedDatabase() {
  console.log('🌱 Starting Porridge Factory dynamic database seeding...');

  try {
    // Helper to get relative dates (e.g., X days ago)
    const daysAgo = (days) => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    };

    // 1. Seed Supermarkets / Shops
    console.log('Inserting supermarkets...');
    const supermarkets = [
      ['SUP-001', 'Kigali City Supermarket', 'Kigali', 'KN 4 Ave, Nyarugenge', 'Jean Claude', '+250 788 123 456', 'Kanyerezi', 'Active'],
      ['SUP-002', 'Simba Supermarket - Kimironko', 'Kigali', 'KG 11 Ave, Gasabo', 'Aline Uwase', '+250 788 234 567', 'Kanyerezi', 'Active'],
      ['SUP-003', 'Sawa Citi - Remera', 'Kigali', 'KG 178 St, Remera', 'Patrick Mugisha', '+250 788 345 678', 'Kanyerezi', 'Active'],
      ['SUP-004', 'Musanze Modern Store', 'Northern Region', 'RN4 Highway, Musanze', 'Bosco Nshimiyimana', '+250 788 456 789', 'Nakawunde', 'Active'],
      ['SUP-005', 'Rubavu Lakeside Mart', 'Western Region', 'Lake Kivu Road, Gisenyi', 'Chantal Umutoni', '+250 788 567 890', 'Nakawunde', 'Active'],
      ['SUP-006', 'Huye Central Supermarket', 'Southern Region', 'University Road, Huye', 'Eric Manzi', '+250 788 678 901', 'Winnie', 'Active'],
      ['SUP-007', 'Rwamagana Express Mart', 'Eastern Region', 'Main Street, Rwamagana', 'Divine Iribagiza', '+250 788 789 012', 'Winnie', 'Pending'],
    ];

    for (const shop of supermarkets) {
      await pool.query(
        `INSERT INTO shops (shop_id, name, region, address, contact_person, phone, manager, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         ON CONFLICT (shop_id) DO UPDATE SET name = EXCLUDED.name;`,
        shop
      );
    }

    // 2. Seed Raw Materials with actual initial stock so they aren't empty
    console.log('Inserting raw materials...');
    const rawMaterials = [
      ['MAT-001', 'Finger Millet Grain', 'Grain', 'Kg', 1500, 300, 2500, 'AgriSupply Co'],
      ['MAT-002', 'Sorghum Flour', 'Grain', 'Kg', 1200, 250, 2200, 'Great Lakes Grains'],
      ['MAT-003', 'Fortified Whole Maize', 'Grain', 'Kg', 2000, 400, 1800, 'Rwanda Farmers Hub'],
      ['MAT-004', 'Refined Sugar', 'Additive', 'Kg', 450, 100, 4000, 'Sugar Works Ltd'],
      ['MAT-005', 'Milk Powder', 'Additive', 'Kg', 180, 50, 12000, 'Dairy Quality Inc'],
      ['MAT-006', '1kg Printed Pouches', 'Packaging', 'Packs', 8500, 2000, 350, 'FlexiPack Ltd'],
      ['MAT-007', '500g Printed Pouches', 'Packaging', 'Packs', 12000, 3000, 250, 'FlexiPack Ltd'],
      ['MAT-008', 'Outer Shipping Cartons', 'Packaging', 'Boxes', 650, 150, 1500, 'Carton Craft'],
    ];

    for (const mat of rawMaterials) {
      await pool.query(
        `INSERT INTO materials (item_code, name, category, unit, stock, reorder_level, unit_cost, supplier) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         ON CONFLICT (item_code) DO UPDATE SET stock = EXCLUDED.stock;`,
        mat
      );
    }

    // 3. Seed Production Batches (recent dates within last 6 days)
    console.log('Inserting production batches...');
    const batches = [
      ['BAT-2026-1101', daysAgo(5), 'NutriPorridge 1kg', 1000, 985, 15, 2955000, 'Completed'],
      ['BAT-2026-1102', daysAgo(4), 'NutriPorridge 500g', 2000, 1980, 20, 3168000, 'Completed'],
      ['BAT-2026-1103', daysAgo(3), 'Family Millet Blend 1kg', 1500, 1490, 10, 4172000, 'Completed'],
      ['BAT-2026-1104', daysAgo(2), 'Baby Care Porridge 500g', 800, 792, 8, 2217600, 'Completed'],
      ['BAT-2026-1105', daysAgo(1), 'NutriPorridge 1kg', 1200, 1190, 10, 3570000, 'Completed'],
      ['BAT-2026-1106', daysAgo(0), 'Family Millet Blend 1kg', 1000, 995, 5, 2786000, 'In Progress'],
    ];

    for (const batch of batches) {
      await pool.query(
        `INSERT INTO production (batch_no, production_date, product_name, planned_yield, actual_yield, wastage, material_cost, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         ON CONFLICT (batch_no) DO NOTHING;`,
        batch
      );
    }

    // 4. Seed Deliveries
    console.log('Inserting deliveries...');
    const deliveries = [
      ['DSP-2001', daysAgo(5), 'Kigali City Supermarket', 'NutriPorridge 1kg', 300, 4500, 'Express Logistics', 'Confirmed'],
      ['DSP-2002', daysAgo(4), 'Simba Supermarket - Kimironko', 'NutriPorridge 500g', 500, 2500, 'Express Logistics', 'Confirmed'],
      ['DSP-2003', daysAgo(3), 'Sawa Citi - Remera', 'Family Millet Blend 1kg', 400, 4800, 'Factory Truck 1', 'Confirmed'],
      ['DSP-2004', daysAgo(2), 'Musanze Modern Store', 'Baby Care Porridge 500g', 250, 3800, 'Northern Logistics', 'In Transit'],
      ['DSP-2005', daysAgo(1), 'Rubavu Lakeside Mart', 'NutriPorridge 1kg', 350, 4500, 'Western Transporters', 'In Transit'],
      ['DSP-2006', daysAgo(0), 'Huye Central Supermarket', 'Family Millet Blend 1kg', 200, 4800, 'Factory Truck 2', 'Pending'],
    ];

    for (const dsp of deliveries) {
      await pool.query(
        `INSERT INTO deliveries (dispatch_id, dispatch_date, supermarket, product, quantity, unit_wholesale_price, transporter, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         ON CONFLICT (dispatch_id) DO NOTHING;`,
        dsp
      );
    }

    // 5. Seed Sales & Payments
    console.log('Inserting sales and payments...');
    const sales = [
      ['INV-6001', daysAgo(5), 'Kigali City Supermarket', 1350000, 1350000, 'Bank Transfer', 'Kanyerezi'],
      ['INV-6002', daysAgo(4), 'Simba Supermarket - Kimironko', 1250000, 1000000, 'Mobile Money', 'Kanyerezi'],
      ['INV-6003', daysAgo(3), 'Sawa Citi - Remera', 1920000, 1920000, 'Bank Transfer', 'Nakawunde'],
      ['INV-6004', daysAgo(2), 'Musanze Modern Store', 950000, 500000, 'Cheque', 'Nakawunde'],
      ['INV-6005', daysAgo(1), 'Rubavu Lakeside Mart', 1575000, 0, 'Pending', 'Winnie'],
      ['INV-6006', daysAgo(0), 'Huye Central Supermarket', 960000, 0, 'Pending', 'Winnie'],
    ];

    for (const sale of sales) {
      await pool.query(
        `INSERT INTO sales (invoice_id, transaction_date, supermarket, total_delivered, amount_paid, payment_method, recorded_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         ON CONFLICT (invoice_id) DO NOTHING;`,
        sale
      );
    }

    console.log('✅ Database successfully and dynamically seeded!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding database:', err);
    process.exit(1);
  }
}

seedDatabase();