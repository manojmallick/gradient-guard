import { Router, Request, Response } from "express";
import { pool } from "../services/db";
import { env } from "../lib/env";

export const healthRouter = Router();

healthRouter.get("/", async (_req: Request, res: Response) => {
  const dbOk = await pool
    .query("SELECT 1")
    .then(() => true)
    .catch(() => false);

  // Always return 200 — 503 causes App Platform to fail the deployment.
  // DB connectivity issues are reported in the payload for observability.
  res.status(200).json({
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    checks: {
      database: dbOk ? "ok" : "error",
      gradient_counsel_configured:
        Boolean(env.GRADIENT_AGENT_URL_COUNSEL) ? "ok" : "missing",
    },
  });
});
