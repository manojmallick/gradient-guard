import { Router, Request, Response } from "express";
import { streamCounselResponse } from "../services/gradient";
import { db } from "../services/db";
import { incidents } from "../db/schema";
import { desc } from "drizzle-orm";
import { broadcast } from "../services/sse";
import { z } from "zod";
import { env } from "../lib/env";
import {
  createFallbackIncident,
  listFallbackIncidents,
  updateFallbackIncidentEvidence,
} from "../services/fallback-store";

export const agentsRouter = Router();

async function dispatchDownstreamAgents(payload: {
  incident_id: string;
  severity: "P1" | "P2" | "P3";
  dora_articles: string[];
  incidents: unknown[];
}): Promise<void> {
  const hasEvidence =
    Boolean(env.GRADIENT_AGENT_URL_EVIDENCE) &&
    Boolean(env.GRADIENT_AGENT_KEY_EVIDENCE);
  const hasRemediation =
    Boolean(env.GRADIENT_AGENT_URL_REMEDIATION) &&
    Boolean(env.GRADIENT_AGENT_KEY_REMEDIATION);

  if (!hasEvidence && !hasRemediation) {
    return;
  }

  const body = { messages: [{ role: "user", content: JSON.stringify(payload) }] };
  const tasks: Array<Promise<void>> = [];

  if (hasEvidence) {
    tasks.push(
      fetch(`${env.GRADIENT_AGENT_URL_EVIDENCE}/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GRADIENT_AGENT_KEY_EVIDENCE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          if (!res.ok) {
            return;
          }
          const json = (await res.json()) as { evidence_url?: string };
          if (json.evidence_url) {
            updateFallbackIncidentEvidence(payload.incident_id, json.evidence_url);
          }
        })
        .catch(() => {
          // Keep demo path resilient even if evidence agent is unavailable.
        })
    );
  }

  if (hasRemediation) {
    tasks.push(
      fetch(`${env.GRADIENT_AGENT_URL_REMEDIATION}/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GRADIENT_AGENT_KEY_REMEDIATION}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
        .then(() => undefined)
        .catch(() => undefined)
    );
  }

  await Promise.all(tasks);
}

// POST /api/counsel — stream compliance Q&A from A4
agentsRouter.post("/counsel", async (req: Request, res: Response) => {
  const { question } = req.body as { question?: string };
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "question is required" });
    return;
  }
  await streamCounselResponse(question, res);
});

// POST /api/simulate — trigger a demo P1 incident
agentsRouter.post("/simulate", async (req: Request, res: Response) => {
  const demoIncidents = [
    {
      type: "droplet_down",
      resource_id: "demo-001",
      resource_name: "prod-api-01",
      dora_article: "Article 11(3) - ICT continuity",
      rto_breach: true,
      details: "Demo: Droplet prod-api-01 is off",
    },
    {
      type: "database_unavailable",
      resource_id: "demo-db-001",
      resource_name: "prod-postgres",
      dora_article: "Article 11(2) - Data backup and recovery",
      rpo_breach: true,
      details: "Demo: Database prod-postgres is unavailable",
    },
  ];

  try {
    const [created] = await db
      .insert(incidents)
      .values({
        severity: "P1",
        doraArticles: [
          "Article 11(3) - ICT continuity",
          "Article 11(2) - Data backup and recovery",
        ],
        details: demoIncidents,
        status: "open",
      })
      .returning();

    broadcast("incident", created);

    res.status(201).json({
      message: "Demo P1 incident created",
      incident_id: created.id,
    });
  } catch (error) {
    console.error("POST /api/simulate failed", error);
    const fallback = createFallbackIncident({
      severity: "P1",
      doraArticles: [
        "Article 11(3) - ICT continuity",
        "Article 11(2) - Data backup and recovery",
      ],
      details: demoIncidents,
      status: "open",
    });

    broadcast("incident", fallback);

    res.status(201).json({
      message: "Demo P1 incident created",
      incident_id: fallback.id,
      storage: "memory",
    });

    const downstreamPayload = {
      incident_id: fallback.id,
      severity: "P1" as const,
      dora_articles: fallback.doraArticles,
      incidents: demoIncidents,
    };
    void dispatchDownstreamAgents(downstreamPayload);
  }
});

// GET /api/compliance/score — compute live DORA score
agentsRouter.get("/compliance/score", async (_req: Request, res: Response) => {
  try {
    const openIncidents = await db.query.incidents.findMany({
      where: (t, { eq }) => eq(t.status, "open"),
      orderBy: [desc(incidents.detectedAt)],
      limit: 50,
    });

    let score = 100;
    const breakdown: Record<string, number> = {
      "Article 11": 100,
      "Article 17": 100,
      "Article 19": 100,
      "Article 25": 100,
      "Article 28": 100,
    };

    for (const inc of openIncidents) {
      const deduction =
        inc.severity === "P1" ? 20 : inc.severity === "P2" ? 10 : 5;
      score = Math.max(0, score - deduction);

      const articles = (inc.doraArticles as string[]) ?? [];
      for (const article of articles) {
        for (const key of Object.keys(breakdown)) {
          if (article.includes(key)) {
            breakdown[key] = Math.max(0, (breakdown[key] ?? 100) - deduction);
          }
        }
      }
    }

    res.json({ score, breakdown, open_incidents: openIncidents.length });
  } catch (error) {
    console.error("GET /api/compliance/score failed", error);
    const openIncidents = listFallbackIncidents({ status: "open" });
    let score = 100;
    const breakdown: Record<string, number> = {
      "Article 11": 100,
      "Article 17": 100,
      "Article 19": 100,
      "Article 25": 100,
      "Article 28": 100,
    };

    for (const inc of openIncidents) {
      const deduction =
        inc.severity === "P1" ? 20 : inc.severity === "P2" ? 10 : 5;
      score = Math.max(0, score - deduction);

      for (const article of inc.doraArticles ?? []) {
        for (const key of Object.keys(breakdown)) {
          if (article.includes(key)) {
            breakdown[key] = Math.max(0, (breakdown[key] ?? 100) - deduction);
          }
        }
      }
    }

    res.json({
      score,
      breakdown,
      open_incidents: openIncidents.length,
      storage: "memory",
    });
  }
});
