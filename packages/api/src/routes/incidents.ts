import { Router, Request, Response } from "express";
import { db } from "../services/db";
import { incidents } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { addClient, removeClient } from "../services/sse";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  createFallbackIncident,
  findFallbackIncidentById,
  listFallbackIncidents,
  updateFallbackIncidentStatus,
} from "../services/fallback-store";

export const incidentsRouter = Router();

// GET /api/incidents — list with optional filters
incidentsRouter.get("/", async (req: Request, res: Response) => {
  const severity = req.query.severity as string | undefined;
  const status = req.query.status as string | undefined;

  try {
    const rows = await db.query.incidents.findMany({
      where: (t, { and, eq }) =>
        and(
          severity ? eq(t.severity, severity) : undefined,
          status ? eq(t.status, status) : undefined
        ),
      orderBy: [desc(incidents.detectedAt)],
      limit: 100,
    });

    res.json({ incidents: rows });
  } catch (error) {
    console.error("GET /api/incidents failed", error);
    res.json({ incidents: listFallbackIncidents({ severity, status }) });
  }
});

// GET /api/incidents/stream — SSE stream
incidentsRouter.get("/stream", (req: Request, res: Response) => {
  const clientId = randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  addClient(clientId, res);

  req.on("close", () => {
    removeClient(clientId);
  });
});

// GET /api/incidents/:id — single incident
incidentsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const incident = await db.query.incidents.findFirst({
      where: (t, { eq }) => eq(t.id, req.params.id),
    });
    if (!incident) {
      res.status(404).json({ error: "Incident not found" });
      return;
    }
    res.json({ incident });
  } catch (error) {
    console.error("GET /api/incidents/:id failed", error);
    const incident = findFallbackIncidentById(req.params.id);
    if (!incident) {
      res.status(404).json({ error: "Incident not found" });
      return;
    }
    res.json({ incident });
  }
});

// POST /api/incidents — create manually (demo/testing)
const CreateIncidentSchema = z.object({
  severity: z.enum(["P1", "P2", "P3"]),
  doraArticles: z.array(z.string()),
  details: z.array(z.unknown()).default([]),
});

incidentsRouter.post("/", async (req: Request, res: Response) => {
  const parsed = CreateIncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const [created] = await db
      .insert(incidents)
      .values({
        severity: parsed.data.severity,
        doraArticles: parsed.data.doraArticles,
        details: parsed.data.details,
        status: "open",
      })
      .returning();
    res.status(201).json({ incident: created });
  } catch (error) {
    console.error("POST /api/incidents failed", error);
    const fallback = createFallbackIncident({
      severity: parsed.data.severity,
      doraArticles: parsed.data.doraArticles,
      details: parsed.data.details,
      status: "open",
    });
    res.status(201).json({ incident: fallback, storage: "memory" });
  }
});

// PUT /api/incidents/:id — update status
const UpdateIncidentSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "closed"]),
});

incidentsRouter.put("/:id", async (req: Request, res: Response) => {
  const parsed = UpdateIncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const [updated] = await db
      .update(incidents)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(incidents.id, req.params.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Incident not found" });
      return;
    }
    res.json({ incident: updated });
  } catch (error) {
    console.error("PUT /api/incidents/:id failed", error);
    const updated = updateFallbackIncidentStatus(req.params.id, parsed.data.status);
    if (!updated) {
      res.status(404).json({ error: "Incident not found" });
      return;
    }
    res.json({ incident: updated, storage: "memory" });
  }
});
