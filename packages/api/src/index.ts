import "dotenv/config";
import express from "express";
import cors from "cors";
import { env } from "./lib/env";
import { incidentsRouter } from "./routes/incidents";
import { agentsRouter } from "./routes/agents";
import { evidenceRouter } from "./routes/evidence";
import { healthRouter } from "./routes/health";

const app = express();

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

app.listen(env.API_PORT, () => {
  console.log(
    `GradientGuard API running on port ${env.API_PORT} [${env.NODE_ENV}]`
  );
});

export default app;
