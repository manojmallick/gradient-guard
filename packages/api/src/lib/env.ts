import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  DIGITALOCEAN_API_TOKEN: z.string().min(1).optional(),
  GRADIENT_MODEL_ACCESS_KEY: z.string().min(1).optional(),

  // Agent endpoints — optional until agents are deployed via Gradient ADK
  GRADIENT_AGENT_KEY_SENTINEL: z.string().min(1).optional(),
  GRADIENT_AGENT_URL_SENTINEL: z.string().url().optional(),
  GRADIENT_AGENT_KEY_EVIDENCE: z.string().min(1).optional(),
  GRADIENT_AGENT_URL_EVIDENCE: z.string().url().optional(),
  GRADIENT_AGENT_KEY_REMEDIATION: z.string().min(1).optional(),
  GRADIENT_AGENT_URL_REMEDIATION: z.string().url().optional(),
  GRADIENT_AGENT_KEY_COUNSEL: z.string().min(1).optional(),
  GRADIENT_AGENT_URL_COUNSEL: z.string().url().optional(),

  // DO Spaces — optional until bucket is created
  DO_SPACES_KEY: z.string().min(1).optional(),
  DO_SPACES_SECRET: z.string().min(1).optional(),
  DO_SPACES_ENDPOINT: z.string().url().optional(),
  DO_SPACES_BUCKET: z.string().min(1).optional(),
  DO_SPACES_CDN_ENDPOINT: z.string().url().optional(),

  // Optional
  SLACK_WEBHOOK_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const result = EnvSchema.safeParse(process.env);
if (!result.success) {
  console.error("❌ Invalid environment variables:");
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
