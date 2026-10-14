// PostgreSQL connection. Settings come from the .env file (see .env.example).
// The tables are created in pgAdmin from the database/ SQL files; this server never changes the structure.
import pg from "pg";

// Return numbers as JS numbers (not strings) and dates as plain "YYYY-MM-DD" text.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
pg.types.setTypeParser(1082, (v) => v); // date

export const SCHEMA_VERSION = 2;

const env = process.env;
export const pool = new pg.Pool(
  env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL, ssl: env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined }
    : {
        host: env.PGHOST || "localhost",
        port: Number(env.PGPORT || 5432),
        database: env.PGDATABASE || "porridge_factory",
        user: env.PGUSER || "postgres",
        password: env.PGPASSWORD || "",
        ssl: env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
      }
);

/** Run fn(client) inside a transaction. Rolls back if anything throws. */
export async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export class SchemaError extends Error {}

/** Check the tables exist and are the version this app expects. */
export async function checkSchema() {
  const { rows } = await pool.query("SELECT to_regclass('public.schema_version') AS t, to_regclass('public.staff') AS old");
  if (!rows[0].t) {
    throw new SchemaError(
      rows[0].old
        ? "The database is still on version 1. In pgAdmin, open the Query Tool on this database and run 02_upgrade_from_v1.sql."
        : "The database has no tables yet. In pgAdmin, open the Query Tool on this database and run 01_create_schema.sql."
    );
  }
  const v = await pool.query("SELECT max(version) AS v FROM schema_version");
  if ((v.rows[0].v || 0) < SCHEMA_VERSION) {
    throw new SchemaError(`The database is on version ${v.rows[0].v}, but this app needs version ${SCHEMA_VERSION}. Run the matching upgrade file in pgAdmin.`);
  }
}
