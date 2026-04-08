import {
  pgTable,
  pgSchema,
  uuid,
  varchar,
  jsonb,
  timestamp,
  integer,
  text,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Fully-qualify every table so Drizzle never relies on search_path being set.
// Drizzle throws if "public" is passed to pgSchema — use pgTable for that case.
const _schemaName = (process.env.DB_SCHEMA ?? "gradientguard").trim();
const _validSchema = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(_schemaName) ? _schemaName : "gradientguard";
const _appSchema = _validSchema !== "public" ? pgSchema(_validSchema) : null;
const defineTable: typeof pgTable = _appSchema
  ? (_appSchema.table.bind(_appSchema) as unknown as typeof pgTable)
  : pgTable;

export const incidents = defineTable(
  "incidents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    severity: varchar("severity", { length: 3 }).notNull(), // P1, P2, P3
    doraArticles: jsonb("dora_articles").notNull().default(sql`'[]'`),
    details: jsonb("details").notNull().default(sql`'[]'`),
    status: varchar("status", { length: 20 }).default("open"), // open | investigating | resolved | closed
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    // Evidence (set by A2)
    evidenceUrl: text("evidence_url"),
    evidenceGeneratedAt: timestamp("evidence_generated_at", {
      withTimezone: true,
    }),

    // Remediation (set by A3)
    rootCause: jsonb("root_cause"),
    remediationPlan: jsonb("remediation_plan"),
    estimatedRtoMinutes: integer("estimated_rto_minutes"),
    remediationGeneratedAt: timestamp("remediation_generated_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    severityIdx: index("idx_incidents_severity").on(t.severity),
    detectedAtIdx: index("idx_incidents_detected_at").on(t.detectedAt),
    statusIdx: index("idx_incidents_status").on(t.status),
  })
);

export const complianceScores = defineTable("compliance_scores", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  score: integer("score").notNull(),
  breakdown: jsonb("breakdown").notNull().default(sql`'{}'`),
  calculatedAt: timestamp("calculated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLog = defineTable("audit_log", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  action: varchar("action", { length: 100 }).notNull(),
  actor: varchar("actor", { length: 50 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }),
  resourceId: text("resource_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;
export type ComplianceScore = typeof complianceScores.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
