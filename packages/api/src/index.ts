import "dotenv/config";
import express from "express";
import cors from "cors";
import { env } from "./lib/env";
import { incidentsRouter } from "./routes/incidents";
import { agentsRouter } from "./routes/agents";
import { evidenceRouter } from "./routes/evidence";
import { healthRouter } from "./routes/health";
import { db, pool } from "./services/db";

const app = express();

// Initialize database schema on startup
async function initializeDatabase() {
  try {
    console.log("🔄 Initializing database schema...");
    // Query to check if incidents table exists
    const checkTable = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='incidents');`
    );
    
    if (!checkTable.rows[0].exists) {
      console.log("📝 Creating schema (incidents table not found)...");
      // Import and run the schema creation
      try {
        // Try using drizzle-kit migrate if available
        const { execSync } = await import("child_process");
        execSync("npm run db:push", { stdio: "inherit" });
      } catch {
        console.warn("⚠️  Auto-migration not available in production, will use fallback");
        // Fallback: create table directly
        await pool.query(`
          CREATE TABLE IF NOT EXISTS incidents (
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
          );
          CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
          CREATE INDEX IF NOT EXISTS idx_incidents_detected_at ON incidents(detected_at DESC);
          CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
        `);
        console.log("✅ Created incidents table via fallback");
      }
    } else {
      console.log("✅ Database schema already initialized");
    }
  } catch (error) {
    console.error("❌ Database initialization failed (will continue):", error);
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
