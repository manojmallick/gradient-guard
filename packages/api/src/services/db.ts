import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import { env } from "../lib/env";

const configuredSchema = (process.env.DB_SCHEMA ?? "gradientguard").trim();
const dbSchema = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(configuredSchema)
  ? configuredSchema
  : "gradientguard";

// DO managed PG DATABASE_URL contains `?sslmode=require` which causes node-postgres
// to verify the full cert chain (SELF_SIGNED_CERT_IN_CHAIN).  Strip it and let the
// explicit ssl config below handle verification settings instead.
const rawUrl = env.DATABASE_URL;
const sanitizedUrl =
  env.NODE_ENV === "production"
    ? rawUrl
        .replace(/[?&]sslmode=[^&]*/g, "")   // remove sslmode param
        .replace(/[?&]ssl=[^&]*/g, "")         // remove ssl param
        .replace(/\?$/, "")                    // clean trailing ?
    : rawUrl;

const pool = new Pool({
  connectionString: sanitizedUrl,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});


export const db = drizzle(pool, { schema });
export { pool };
export { dbSchema };
