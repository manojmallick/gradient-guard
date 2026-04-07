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

pool.on("connect", (client) => {
  // Prefer app schema first and still allow reads from public if objects exist there.
  const searchPath = `${dbSchema},public`;
  void client.query(`SET search_path TO ${searchPath}`);
});

export const db = drizzle(pool, { schema });
export { pool };
export { dbSchema };
