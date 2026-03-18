import Gradient from "@digitalocean/gradient";
import { env } from "../lib/env";
import { type Response } from "express";

function writeSseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
}

async function streamLocalCounselFallback(
  question: string,
  res: Response,
  reason: "missing_config" | "upstream_error"
): Promise<void> {
  writeSseHeaders(res);

  const guidance =
    reason === "missing_config"
      ? "Compliance Counsel agent is not configured in local mode."
      : "Compliance Counsel agent call failed, using local fallback.";

  const fallback = [
    `${guidance}`,
    "\n\nLocal demo guidance:",
    "\n- Use Simulate P1 to generate an incident and show live dashboard updates.",
    "\n- Open Incidents to show severity, DORA article tags, and status workflow.",
    "\n- Open Evidence to explain where A2 evidence URLs appear after agent execution.",
    "\n\nQuestion received:",
    `\n\"${question}\"`,
    "\n\nFor full legal Q&A, set GRADIENT_AGENT_URL_COUNSEL and GRADIENT_AGENT_KEY_COUNSEL.",
  ];

  for (const chunk of fallback) {
    res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
}

export async function streamCounselResponse(
  question: string,
  res: Response
): Promise<void> {
  const hasCounselConfig =
    Boolean(env.GRADIENT_AGENT_URL_COUNSEL) &&
    Boolean(env.GRADIENT_AGENT_KEY_COUNSEL);
  if (!hasCounselConfig) {
    await streamLocalCounselFallback(question, res, "missing_config");
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
    await streamLocalCounselFallback(question, res, "upstream_error");
  }
}
