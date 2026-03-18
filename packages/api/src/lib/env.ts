import { z } from "zod";

// App Platform injects unset SECRET env vars as empty strings.
// Preprocess them to undefined so .optional() works correctly.
const opt = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  DIGITALOCEAN_API_TOKEN: opt(z.string().min(1)),
  GRADIENT_MODEL_ACCESS_KEY: opt(z.string().min(1)),

  // Agent endpoints — optional until agents are deployed via Gradient ADK
  GRADIENT_AGENT_KEY_SENTINEL: opt(z.string().min(1)),
  GRADIENT_AGENT_URL_SENTINEL: opt(z.string().url()),
  GRADIENT_AGENT_KEY_EVIDENCE: opt(z.string().min(1)),
  GRADIENT_AGENT_URL_EVIDENCE: opt(z.string().url()),
  GRADIENT_AGENT_KEY_REMEDIATION: opt(z.string().min(1)),
  GRADIENT_AGENT_URL_REMEDIATION: opt(z.string().url()),
  GRADIENT_AGENT_KEY_COUNSEL: opt(z.string().min(1)),
  GRADIENT_AGENT_URL_COUNSEL: opt(z.string().url()),

  // DO Spaces — optional until bucket is created
  DO_SPACES_KEY: opt(z.string().min(1)),
  DO_SPACES_SECRET: opt(z.string().min(1)),
  DO_SPACES_ENDPOINT: opt(z.string().url()),
  DO_SPACES_BUCKET: opt(z.string().min(1)),
  DO_SPACES_CDN_ENDPOINT: opt(z.string().url()),

  // Optional
  SLACK_WEBHOOK_URL: opt(z.string().url()),
});

export type Env = z.infer<typeof EnvSchema>;

const result = EnvSchema.safeParse(process.env);
if (!result.success) {
  console.error("❌ Invalid environment variables:");
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
