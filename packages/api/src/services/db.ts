import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import { env } from "../lib/env";

const configuredSchema = (process.env.DB_SCHEMA ?? "gradientguard").trim();
const dbSchema = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(configuredSchema)
  ? configuredSchema
  : "gradientguard";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Set search_path on every new connection as a belt-and-suspenders safety net.
// Primary schema qualification is done via pgSchema() in schema.ts so this is
// only needed for raw pool.query() calls (e.g. initializeDatabase in index.ts).
pool.on("connect", (client) => {
  const searchPath = `${dbSchema},public`;
  client.query(`SET search_path TO ${searchPath}`).catch((err: unknown) => {
    console.warn("Failed to set search_path on new connection:", err);
  });
});

export const db = drizzle(pool, { schema });
export { pool };
export { dbSchema };
