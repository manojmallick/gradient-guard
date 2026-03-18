import { Router, Request, Response } from "express";
import { db } from "../services/db";
import { getEvidencePresignedUrl } from "../services/spaces";

export const evidenceRouter = Router();

// GET /api/evidence/:id — get presigned PDF URL for an incident
evidenceRouter.get("/:id", async (req: Request, res: Response) => {
  const incident = await db.query.incidents.findFirst({
    where: (t, { eq }) => eq(t.id, req.params.id),
  });

  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  if (!incident.evidenceUrl) {
    res.status(404).json({
      error: "Evidence not yet generated for this incident",
      incident_id: req.params.id,
    });
    return;
  }

  // If the URL is a Spaces object key, generate a fresh presigned URL
  // If it's already a presigned URL, return as-is
  const url = incident.evidenceUrl;
  res.json({
    incident_id: incident.id,
    evidence_url: url,
    generated_at: incident.evidenceGeneratedAt,
  });
});
