import "dotenv/config";
import { db } from "../src/services/db";
import { incidents, complianceScores } from "../src/db/schema";

const demoIncidents = [
  {
    severity: "P1" as const,
    doraArticles: [
      "Article 11(3) - ICT continuity",
      "Article 11(2) - Data backup and recovery",
    ],
    details: [
      {
        type: "droplet_down",
        resource_name: "prod-api-01",
        rto_breach: true,
        details: "Droplet prod-api-01 went offline during peak hours",
      },
      {
        type: "database_unavailable",
        resource_name: "prod-postgres",
        rpo_breach: true,
        details: "Primary DB failover triggered, replica lag exceeded 1 hour",
      },
    ],
    status: "resolved" as const,
  },
  {
    severity: "P2" as const,
    doraArticles: ["Article 11(5) - Recovery testing"],
    details: [
      {
        type: "app_deployment_failure",
        resource_name: "gradient-guard-api",
        rto_breach: true,
        details: "Deployment pipeline failed: Docker build error",
      },
    ],
    status: "resolved" as const,
  },
  {
    severity: "P3" as const,
    doraArticles: ["Article 11(3) - ICT continuity"],
    details: [
      {
        type: "droplet_down",
        resource_name: "staging-worker-01",
        rto_breach: false,
        details: "Staging droplet restarted after OOM kill",
      },
    ],
    status: "closed" as const,
  },
  {
    severity: "P2" as const,
    doraArticles: [
      "Article 11(2) - Data backup and recovery",
      "Article 17 - ICT incident management",
    ],
    details: [
      {
        type: "database_unavailable",
        resource_name: "analytics-db",
        rpo_breach: true,
        details: "Analytics DB backup verification failed",
      },
    ],
    status: "investigating" as const,
  },
];

async function seed() {
  console.log("Seeding demo incidents…");
  for (const inc of demoIncidents) {
    const [inserted] = await db.insert(incidents).values(inc).returning();
    console.log(`  ✓ Inserted ${inserted.severity} incident: ${inserted.id}`);
  }

  await db.insert(complianceScores).values({
    score: 72,
    breakdown: {
      "Article 11": 65,
      "Article 17": 80,
      "Article 19": 90,
      "Article 25": 85,
      "Article 28": 88,
    },
  });
  console.log("  ✓ Inserted compliance score baseline");
  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
