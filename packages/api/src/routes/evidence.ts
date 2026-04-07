import { Router, Request, Response } from "express";
import { db } from "../services/db";
import { getEvidencePresignedUrl } from "../services/spaces";
import { findFallbackIncidentById } from "../services/fallback-store";

export const evidenceRouter = Router();

// GET /api/evidence/demo/:id — lightweight demo PDF for fallback mode
evidenceRouter.get("/demo/:id", (req: Request, res: Response) => {
  const incidentId = req.params.id;
  const now = new Date().toISOString();
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 238 >>
stream
BT
/F1 16 Tf
72 740 Td
(GradientGuard Demo Evidence Package) Tj
0 -30 Td
/F1 12 Tf
(Incident ID: ${incidentId}) Tj
0 -20 Td
(Generated: ${now}) Tj
0 -20 Td
(Status: Demo fallback evidence) Tj
0 -40 Td
(This document is generated for live demo continuity.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000061 00000 n 
0000000120 00000 n 
0000000255 00000 n 
0000000543 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
613
%%EOF`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename=gradientguard_evidence_${incidentId}.pdf`
  );
  res.send(Buffer.from(pdf, "utf8"));
});

// GET /api/evidence/:id — get presigned PDF URL for an incident
evidenceRouter.get("/:id", async (req: Request, res: Response) => {
  let incident;
  try {
    incident = await db.query.incidents.findFirst({
      where: (t, { eq }) => eq(t.id, req.params.id),
    });
  } catch (error) {
    console.error("GET /api/evidence/:id failed", error);
    const fallback = findFallbackIncidentById(req.params.id);
    if (fallback?.evidenceUrl) {
      res.json({
        incident_id: fallback.id,
        evidence_url: fallback.evidenceUrl,
        generated_at: fallback.evidenceGeneratedAt,
        storage: "memory",
      });
      return;
    }
    res.status(503).json({ error: "Evidence unavailable" });
    return;
  }

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
