import "dotenv/config";
import express from "express";
import cors from "cors";
import { env } from "./lib/env";
import { incidentsRouter } from "./routes/incidents";
import { agentsRouter } from "./routes/agents";
import { evidenceRouter } from "./routes/evidence";
import { healthRouter } from "./routes/health";
import { dbSchema, pool } from "./services/db";

const app = express();

// Initialize database schema on startup
async function initializeDatabase() {
  try {
    console.log(`Initializing database schema in '${dbSchema}'...`);

    const safeSchema = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbSchema)
      ? dbSchema
      : "gradientguard";

    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${safeSchema}`);
    await pool.query(`SET search_path TO ${safeSchema},public`);

    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${safeSchema}.incidents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        severity VARCHAR(3) NOT NULL,
        dora_articles JSONB NOT NULL DEFAULT '[]',
        details JSONB NOT NULL DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'open',
        detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        evidence_url TEXT,
        evidence_generated_at TIMESTAMPTZ,
        root_cause JSONB,
        remediation_plan JSONB,
        estimated_rto_minutes INT,
        remediation_generated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_incidents_severity ON ${safeSchema}.incidents(severity)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_incidents_detected_at ON ${safeSchema}.incidents(detected_at DESC)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_incidents_status ON ${safeSchema}.incidents(status)`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${safeSchema}.compliance_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        score INT NOT NULL,
        breakdown JSONB NOT NULL DEFAULT '{}',
        calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${safeSchema}.audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action VARCHAR(100) NOT NULL,
        actor VARCHAR(50) NOT NULL,
        resource_type VARCHAR(50),
        resource_id TEXT,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    console.log("Database bootstrap completed");
  } catch (error) {
    console.error("Database initialization failed (continuing in degraded mode):", error);
  }
}

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://gradient-guard.ondigitalocean.app",
      process.env.NEXT_PUBLIC_APP_URL ?? "",
    ].filter(Boolean),
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/health", healthRouter);

// Support both local direct routing and App Platform path-prefix stripping.
app.use("/api/incidents", incidentsRouter);
app.use("/incidents", incidentsRouter);

app.use("/api", agentsRouter);
app.use("/", agentsRouter);

app.use("/api/evidence", evidenceRouter);
app.use("/evidence", evidenceRouter);

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// Start server after database initialization
(async () => {
  await initializeDatabase();
  app.listen(env.API_PORT, () => {
    console.log(
      `GradientGuard API running on port ${env.API_PORT} [${env.NODE_ENV}]`
    );
  });
})();

export default app;
