"use client";

import { useEffect, useState } from "react";

interface Incident {
  id: string;
  severity: string;
  detectedAt: string;
  evidenceUrl?: string;
  evidenceGeneratedAt?: string;
}

export default function EvidencePanel() {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    fetch("/api/incidents")
      .then((r) => r.json())
      .then((d) => setIncidents((d.incidents ?? []).slice(0, 20)));
  }, []);

  if (!incidents.length) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-8 text-center">
        <p className="text-slate-400 text-sm">
          No evidence packages generated yet.
        </p>
        <p className="text-slate-500 text-xs mt-1">
          Evidence is auto-generated when an incident is detected by DORASentinel.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-3">Incident ID</th>
            <th className="text-left px-4 py-3">Severity</th>
            <th className="text-left px-4 py-3">Detected At</th>
            <th className="text-left px-4 py-3">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((inc) => (
            <tr
              key={inc.id}
              className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
            >
              <td className="px-4 py-3 font-mono text-xs text-slate-300">
                {inc.id.slice(0, 8)}…
              </td>
              <td className="px-4 py-3">
                <span
                  className={`font-bold text-xs px-1.5 py-0.5 rounded ${
                    inc.severity === "P1"
                      ? "bg-red-500/20 text-red-400"
                      : inc.severity === "P2"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-blue-500/20 text-blue-400"
                  }`}
                >
                  {inc.severity}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs">
                {new Date(inc.detectedAt).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                {inc.evidenceUrl ? (
                  <a
                    href={inc.evidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs underline"
                  >
                    Download PDF
                  </a>
                ) : (
                  <a
                    href={`/api/evidence/demo/${inc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 text-xs underline"
                  >
                    Open Demo PDF
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
