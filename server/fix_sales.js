import { pool } from './db.js';

async function fixSales() {
  console.log('🛠️ Updating sales table schema constraints...');
  try {
    // Drop existing primary key on sales if any
    await pool.query(`ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_pkey;`);
    
    // Add auto-incrementing id as primary key
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;`);
    
    // Make invoice_id optional with a generated default
    await pool.query(`ALTER TABLE sales ALTER COLUMN invoice_id DROP NOT NULL;`);
    await pool.query(`ALTER TABLE sales ALTER COLUMN invoice_id SET DEFAULT 'INV-' || floor(random() * 90000 + 10000)::text;`);

    console.log('✅ Sales table constraints updated successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating sales table:', err);
    process.exit(1);
  }
}

fixSales();