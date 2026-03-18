import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/gradientguard",
    ssl: process.env.DATABASE_URL?.includes("ondigitalocean.com")
      ? { rejectUnauthorized: false }
      : false,
  },
} satisfies Config;
