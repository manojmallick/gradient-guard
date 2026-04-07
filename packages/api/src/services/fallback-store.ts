import { randomUUID } from "crypto";

export type FallbackSeverity = "P1" | "P2" | "P3";
export type FallbackStatus = "open" | "investigating" | "resolved" | "closed";

export interface FallbackIncident {
  id: string;
  severity: FallbackSeverity;
  doraArticles: string[];
  details: unknown[];
  status: FallbackStatus;
  detectedAt: string;
  resolvedAt: string | null;
  evidenceUrl: string | null;
  evidenceGeneratedAt: string | null;
  rootCause: unknown | null;
  remediationPlan: unknown | null;
  estimatedRtoMinutes: number | null;
  remediationGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const fallbackIncidents: FallbackIncident[] = [];

export function listFallbackIncidents(filters?: {
  severity?: string;
  status?: string;
}): FallbackIncident[] {
  return fallbackIncidents
    .filter((incident) =>
      filters?.severity ? incident.severity === filters.severity : true
    )
    .filter((incident) =>
      filters?.status ? incident.status === filters.status : true
    )
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export function findFallbackIncidentById(id: string): FallbackIncident | undefined {
  return fallbackIncidents.find((incident) => incident.id === id);
}

export function createFallbackIncident(input: {
  severity: FallbackSeverity;
  doraArticles: string[];
  details?: unknown[];
  status?: FallbackStatus;
}): FallbackIncident {
  const now = new Date().toISOString();
  const incident: FallbackIncident = {
    id: randomUUID(),
    severity: input.severity,
    doraArticles: input.doraArticles,
    details: input.details ?? [],
    status: input.status ?? "open",
    detectedAt: now,
    resolvedAt: null,
    evidenceUrl: null,
    evidenceGeneratedAt: null,
    rootCause: null,
    remediationPlan: null,
    estimatedRtoMinutes: null,
    remediationGeneratedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  fallbackIncidents.unshift(incident);
  return incident;
}

export function updateFallbackIncidentStatus(
  id: string,
  status: FallbackStatus
): FallbackIncident | undefined {
  const incident = fallbackIncidents.find((item) => item.id === id);
  if (!incident) {
    return undefined;
  }

  incident.status = status;
  incident.updatedAt = new Date().toISOString();
  if (status === "resolved" || status === "closed") {
    incident.resolvedAt = new Date().toISOString();
  }
  return incident;
}
