import Gradient from "@digitalocean/gradient";
import { env } from "../lib/env";
import { type Response } from "express";
import { listFallbackIncidents } from "./fallback-store";

function writeSseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
}

async function streamStaticCounselFallback(
  question: string,
  res: Response,
  reason: "missing_config" | "upstream_error"
): Promise<void> {
  writeSseHeaders(res);

  const guidance =
    reason === "missing_config"
      ? "Compliance Counsel agent credentials are not available in runtime."
      : "Compliance Counsel agent call failed, using resilient fallback.";

  const q = question.toLowerCase();
  const incidents = listFallbackIncidents();
  const openIncidents = incidents.filter((i) => i.status === "open").length;

  let answer =
    "DORA Article 11 requires robust ICT continuity planning, including recovery objectives, testing, and major incident response evidence.";

  if (q.includes("article 11") || q.includes("rto") || q.includes("rpo")) {
    answer =
      "For DORA Article 11, maintain tested ICT business continuity with defined RTO/RPO targets, documented failover procedures, and recurring resilience testing evidence.";
  } else if (q.includes("evidence") || q.includes("audit")) {
    answer =
      "For audit evidence, capture incident timeline, affected services, decision log, recovery actions, timestamps, and final attestation mapped to DORA obligations.";
  } else if (q.includes("history") || q.includes("recent") || q.includes("incident")) {
    answer =
      `Recent incident summary: ${incidents.length} total incident(s), ${openIncidents} currently open. Highest observed severity in fallback mode: ${incidents[0]?.severity ?? "N/A"}.`;
  } else if (q.includes("gdpr") || q.includes("nis2") || q.includes("mas")) {
    answer =
      "Cross-regulation mapping in demo mode: DORA governs financial ICT resilience, GDPR focuses security/privacy controls, NIS2 covers broader cybersecurity governance, and MAS TRM aligns operational risk controls.";
  }

  const fallback = [
    `${guidance}`,
    "\n\nAnswer:",
    `\n${answer}`,
    "\n\nCitations:",
    "\n- DORA Article 11 (ICT business continuity and recovery)",
    "\n- DORA Article 17 (incident handling and post-incident review)",
    "\n\nDemo context:",
    `\n- Open incidents in fallback memory: ${openIncidents}`,
    "\n- Use Simulate P1 to trigger incident lifecycle in real time",
    "\n\nTo enable full legal RAG responses, set GRADIENT_AGENT_URL_COUNSEL and GRADIENT_AGENT_KEY_COUNSEL.",
  ];

  for (const chunk of fallback) {
    res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
}

async function streamModelCounselFallback(
  question: string,
  res: Response,
  reason: "missing_config" | "upstream_error"
): Promise<void> {
  if (!env.GRADIENT_MODEL_ACCESS_KEY) {
    await streamStaticCounselFallback(question, res, reason);
    return;
  }

  try {
    const modelClient = new Gradient({
      modelAccessKey: env.GRADIENT_MODEL_ACCESS_KEY,
    });

    const prompt = [
      "You are ComplianceCounsel for a financial-services DORA program.",
      "Give a practical, concise answer with explicit references to DORA obligations.",
      "Include MAS TRM comparison only if requested.",
      "Format: Direct answer, obligations checklist, and references.",
      `Question: ${question}`,
    ].join("\n");

    const stream = await modelClient.chat.completions.create({
      model: "llama3.3-70b-instruct",
      stream: true,
      messages: [{ role: "user", content: prompt }],
    });

    writeSseHeaders(res);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch {
    await streamStaticCounselFallback(question, res, reason);
  }
}

export async function streamCounselResponse(
  question: string,
  res: Response
): Promise<void> {
  const hasCounselConfig =
    Boolean(env.GRADIENT_AGENT_URL_COUNSEL) &&
    Boolean(env.GRADIENT_AGENT_KEY_COUNSEL);
  if (!hasCounselConfig) {
    await streamModelCounselFallback(question, res, "missing_config");
    return;
  }

  try {
    const counselAgent = new Gradient({
      agentAccessKey: env.GRADIENT_AGENT_KEY_COUNSEL,
      agentEndpoint: env.GRADIENT_AGENT_URL_COUNSEL,
    });

    const stream = await counselAgent.chat.completions.create({
      messages: [{ role: "user", content: question }],
      model: "llama3.3-70b-instruct",
      stream: true,
    });

    writeSseHeaders(res);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch {
    await streamModelCounselFallback(question, res, "upstream_error");
  }
}
