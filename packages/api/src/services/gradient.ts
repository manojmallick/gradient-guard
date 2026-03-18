import Gradient from "@digitalocean/gradient";
import { env } from "../lib/env";
import { type Response } from "express";

export const counselAgent = new Gradient({
  agentAccessKey: env.GRADIENT_AGENT_KEY_COUNSEL,
  agentEndpoint: env.GRADIENT_AGENT_URL_COUNSEL,
});

export async function streamCounselResponse(
  question: string,
  res: Response
): Promise<void> {
  const stream = await counselAgent.chat.completions.create({
    messages: [{ role: "user", content: question }],
    stream: true,
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
  }
  res.write("data: [DONE]\n\n");
  res.end();
}
