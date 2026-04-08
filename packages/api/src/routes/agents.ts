import { Router, Request, Response } from "express";
import { streamCounselResponse } from "../services/gradient";
import { db } from "../services/db";
import { incidents } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { broadcast } from "../services/sse";
import { z } from "zod";
import { env } from "../lib/env";
import {
  createFallbackIncident,
  listFallbackIncidents,
  updateFallbackIncidentEvidence,
} from "../services/fallback-store";

export const agentsRouter = Router();

/** Builds a styled PDF in Node when the EvidenceForge agent is unavailable. */
async function generateFallbackEvidence(payload: {
  incident_id: string;
  severity: string;
  dora_articles: string[];
  incidents: unknown[];
}): Promise<void> {
  try {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const sevColor = payload.severity === "P1" ? "0.93 0.27 0.27" // red
      : payload.severity === "P2" ? "0.98 0.45 0.09" // orange
      : "0.13 0.77 0.33"; // green

    const incRows = (payload.incidents as Array<Record<string, unknown>>);

    // ── PDF content streams ───────────────────────────────────────────────────
    // Page 1: banner + summary cards + sections
    const W = 595, H = 842, M = 50;

    const ops: string[] = [];

    // Navy banner background
    ops.push(`0.04 0.09 0.16 rg`); // NAVY
    ops.push(`0 ${H - 72} ${W} 72 re f`);

    // Light-gray meta bar
    ops.push(`0.94 0.96 0.98 rg`);
    ops.push(`0 ${H - 90} ${W} 18 re f`);

    // Title text (white)
    ops.push(`1 1 1 rg`);
    ops.push(`BT /F2 16 Tf ${M} ${H - 44} Td (GradientGuard) Tj ET`);
    ops.push(`0.00 0.76 1.00 rg`); // ACCENT blue
    ops.push(`BT /F1 11 Tf 165 ${H - 44} Td (  DORA Incident Evidence Package) Tj ET`);

    // Severity badge (right-aligned)
    ops.push(`${sevColor} rg`);
    ops.push(`BT /F2 22 Tf ${W - M - 50} ${H - 48} Td (${payload.severity}) Tj ET`);

    // Meta bar text
    ops.push(`0.39 0.45 0.55 rg`);
    ops.push(`BT /F1 7.5 Tf ${M} ${H - 85} Td (Incident ID: ${payload.incident_id}) Tj ET`);
    ops.push(`BT /F1 7.5 Tf ${W - M - 140} ${H - 85} Td (Generated: ${now}) Tj ET`);

    // ── Summary cards ──────────────────────────────────────────────────────────
    const cardY = H - 140, cardH = 40, cardW = (W - 2 * M - 8) / 3;
    const cards = [
      { label: "SEVERITY LEVEL", value: payload.severity, vColor: sevColor },
      { label: "BREACHES DETECTED", value: String(incRows.length), vColor: "0.04 0.09 0.16" },
      { label: "REPORT STATUS", value: "COMPLETE", vColor: "0.13 0.77 0.33" },
    ];
    cards.forEach((card, idx) => {
      const cx = M + idx * (cardW + 4);
      ops.push(`0.94 0.96 0.98 rg`);
      ops.push(`${cx} ${cardY} ${cardW} ${cardH} re f`);
      ops.push(`0.39 0.45 0.55 rg`);
      ops.push(`BT /F1 7 Tf ${cx + 10} ${cardY + 27} Td (${card.label}) Tj ET`);
      ops.push(`${card.vColor} rg`);
      ops.push(`BT /F2 14 Tf ${cx + 10} ${cardY + 10} Td (${card.value}) Tj ET`);
    });

    // ── Section helper (blue rule + heading) ──────────────────────────────────
    let curY = cardY - 20;
    const section = (title: string) => {
      curY -= 4;
      ops.push(`0.00 0.34 1.00 rg`);
      ops.push(`${M} ${curY} ${W - 2 * M} 1.5 re f`);
      curY -= 14;
      ops.push(`0.04 0.09 0.16 rg`);
      ops.push(`BT /F2 11 Tf ${M} ${curY} Td (${title}) Tj ET`);
      curY -= 10;
    };

    // ── Executive Summary ─────────────────────────────────────────────────────
    section("1  ·  Executive Summary");
    ops.push(`0.12 0.16 0.23 rg`);
    const summaryLine = `Incident ${payload.incident_id.slice(0, 12)}... | Severity: ${payload.severity} | ${incRows.length} breach(es) | ${payload.dora_articles.length} DORA article(s) triggered`;
    ops.push(`BT /F1 8.5 Tf ${M} ${curY} Td (${summaryLine.replace(/[()\\]/g, "")}) Tj ET`);
    curY -= 16;

    // ── Breaches table ────────────────────────────────────────────────────────
    section("2  ·  Detected Breaches");
    // header row
    ops.push(`0.04 0.09 0.16 rg`);
    ops.push(`${M} ${curY - 2} ${W - 2 * M} 16 re f`);
    ops.push(`1 1 1 rg`);
    ops.push(`BT /F2 7.5 Tf ${M + 4} ${curY + 2} Td (Type) Tj ET`);
    ops.push(`BT /F2 7.5 Tf ${M + 90} ${curY + 2} Td (Resource) Tj ET`);
    ops.push(`BT /F2 7.5 Tf ${M + 190} ${curY + 2} Td (DORA Article) Tj ET`);
    ops.push(`BT /F2 7.5 Tf ${M + 370} ${curY + 2} Td (Details) Tj ET`);
    curY -= 18;

    incRows.slice(0, 6).forEach((inc, idx) => {
      const bg = idx % 2 === 0 ? "1 1 1" : "0.94 0.96 0.98";
      ops.push(`${bg} rg`);
      ops.push(`${M} ${curY - 2} ${W - 2 * M} 15 re f`);
      ops.push(`0.12 0.16 0.23 rg`);
      const type = String(inc.type ?? "").replace(/_/g, " ").slice(0, 16);
      const res  = String(inc.resource_name ?? inc.resource_id ?? "—").slice(0, 18);
      const art  = String(inc.dora_article ?? "—").slice(0, 26);
      const det  = String(inc.details ?? "").slice(0, 30).replace(/[()\\]/g, "");
      ops.push(`BT /F1 7.5 Tf ${M + 4} ${curY + 2} Td (${type}) Tj ET`);
      ops.push(`BT /F1 7.5 Tf ${M + 90} ${curY + 2} Td (${res}) Tj ET`);
      ops.push(`BT /F1 7.5 Tf ${M + 190} ${curY + 2} Td (${art}) Tj ET`);
      ops.push(`BT /F1 7.5 Tf ${M + 370} ${curY + 2} Td (${det}) Tj ET`);
      curY -= 16;
    });
    curY -= 4;

    // ── DORA Articles ─────────────────────────────────────────────────────────
    section("3  ·  Triggered DORA Articles");
    payload.dora_articles.forEach((art, idx) => {
      const bg = idx % 2 === 0 ? "0.91 0.94 1.00" : "1 1 1";
      ops.push(`${bg} rg`);
      ops.push(`${M} ${curY - 2} ${W - 2 * M} 14 re f`);
      // Blue left bar
      ops.push(`0.00 0.34 1.00 rg`);
      ops.push(`${M} ${curY - 2} 3 14 re f`);
      ops.push(`0.12 0.16 0.23 rg`);
      ops.push(`BT /F1 8 Tf ${M + 10} ${curY + 2} Td (${art.replace(/[()\\]/g, "")}) Tj ET`);
      curY -= 16;
    });
    curY -= 6;

    // ── Attestation box ───────────────────────────────────────────────────────
    if (curY > 120) {
      section("4  ·  Attestation");
      ops.push(`0.91 0.94 1.00 rg`);
      ops.push(`${M} ${curY - 60} ${W - 2 * M} 70 re f`);
      ops.push(`0.00 0.34 1.00 rg`);
      ops.push(`${M} ${curY - 60} ${W - 2 * M} 70 re S`);
      ops.push(`0.12 0.16 0.23 rg`);
      ops.push(`BT /F1 8.5 Tf ${M + 12} ${curY - 6} Td (This evidence package was auto-generated by GradientGuard on DigitalOcean Gradient AI Platform.) Tj ET`);
      ops.push(`BT /F1 8.5 Tf ${M + 12} ${curY - 20} Td (Provided for audit purposes under DORA Article 17 - ICT-related incident management.) Tj ET`);
      ops.push(`0.39 0.45 0.55 rg`);
      ops.push(`BT /F1 7.5 Tf ${M + 12} ${curY - 34} Td (Digitally timestamped: ${now}) Tj ET`);
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    ops.push(`0.94 0.96 0.98 rg`);
    ops.push(`0 0 ${W} 24 re f`);
    ops.push(`0.39 0.45 0.55 rg`);
    ops.push(`BT /F1 7 Tf ${M} 8 Td (GradientGuard  |  DORA Compliance Platform  |  Powered by DigitalOcean Gradient AI) Tj ET`);
    ops.push(`BT /F1 7 Tf ${W - 60} 8 Td (Page 1 of 1) Tj ET`);

    // ── Assemble PDF ──────────────────────────────────────────────────────────
    const stream = ops.join("\n");
    const streamLen = Buffer.byteLength(stream, "utf8");

    const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W} ${H}]/Contents 4 0 R/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>>>endobj
4 0 obj<</Length ${streamLen}>>
stream
${stream}
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
6 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold>>endobj
xref
0 7
0000000000 65535 f
trailer<</Root 1 0 R/Size 7>>
startxref
9
%%EOF`;

    const b64 = Buffer.from(pdf, "utf8").toString("base64");
    const dataUrl = `data:application/pdf;base64,${b64}`;

    await db
      .update(incidents)
      .set({ evidenceUrl: dataUrl, evidenceGeneratedAt: new Date(), updatedAt: new Date() })
      .where(eq(incidents.id, payload.incident_id));

    console.log(`Fallback evidence PDF stored for incident ${payload.incident_id}`);
  } catch (err) {
    console.error("Fallback evidence generation failed:", err);
  }
}

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
      fetch(env.GRADIENT_AGENT_URL_EVIDENCE!, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GRADIENT_AGENT_KEY_EVIDENCE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000), // 2 min max
      })
        .then(async (res) => {
          if (!res.ok) {
            console.error(`Evidence agent returned ${res.status} — using server-side fallback`);
            await generateFallbackEvidence(payload);
            return;
          }
          const json = (await res.json()) as { evidence_url?: string };
          if (json.evidence_url) {
            try {
              await db
                .update(incidents)
                .set({
                  evidenceUrl: json.evidence_url,
                  evidenceGeneratedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(incidents.id, payload.incident_id));
              console.log(`Evidence stored for incident ${payload.incident_id}`);
            } catch {
              updateFallbackIncidentEvidence(payload.incident_id, json.evidence_url);
            }
          } else {
            await generateFallbackEvidence(payload);
          }
        })
        .catch(async (err: unknown) => {
          console.error("Evidence agent dispatch failed:", err);
          await generateFallbackEvidence(payload);
        })
    );
  }

  if (hasRemediation) {
    tasks.push(
      fetch(env.GRADIENT_AGENT_URL_REMEDIATION!, {
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

    // Dispatch evidence + remediation agents in the background
    void dispatchDownstreamAgents({
      incident_id: created.id,
      severity: "P1",
      dora_articles: created.doraArticles as string[],
      incidents: demoIncidents,
    });

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
