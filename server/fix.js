import { pool } from './db.js';

async function fixDatabase() {
  try {
    const tables = ['shops', 'materials', 'production', 'deliveries', 'sales'];
    
    for (const table of tables) {
      // Check if 'id' column exists
      const checkCol = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = 'id'
      `, [table]);

      if (checkCol.rows.length === 0) {
        console.log(`Adding missing 'id' column to ${table}...`);
        // Add as SERIAL without forcing primary key if one already exists
        await pool.query(`ALTER TABLE ${table} ADD COLUMN id SERIAL;`);
      } else {
        console.log(`Table '${table}' already has an 'id' column. Skipping.`);
      }
    }

    console.log('Database check & patch completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error patching database:', err);
    process.exit(1);
  }
}

fixDatabase();