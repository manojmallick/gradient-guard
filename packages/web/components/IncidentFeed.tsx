"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

interface Incident {
  id: string;
  severity: "P1" | "P2" | "P3";
  doraArticles: string[];
  status: string;
  detectedAt: string;
  evidenceUrl?: string;
  remediationPlan?: unknown;
}

interface Props {
  maxItems?: number;
}

const SEVERITY_COLOR: Record<string, string> = {
  P1: "bg-red-500/20 text-red-400 border-red-500/40",
  P2: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  P3: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function IncidentFeed({ maxItems = 10 }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);

  useEffect(() => {
    // Initial load
    fetch("/api/incidents")
      .then((r) => r.json())
      .then((d) => setIncidents((d.incidents ?? []).slice(0, maxItems)));

    // SSE stream for real-time updates
    const es = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/incidents/stream`
    );
    es.addEventListener("incident", (e) => {
      const inc = JSON.parse(e.data) as Incident;
      setIncidents((prev) => [inc, ...prev].slice(0, maxItems));
    });
    return () => es.close();
  }, [maxItems]);

  if (!incidents.length) {
    return (
      <p className="text-slate-500 text-sm text-center py-8">
        No incidents detected. System is healthy.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {incidents.map((inc) => (
          <button
            key={inc.id}
            onClick={() => setSelected(inc)}
            className="w-full text-left bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg p-3 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    "text-xs font-bold px-2 py-0.5 rounded border",
                    SEVERITY_COLOR[inc.severity] ?? ""
                  )}
                >
                  {inc.severity}
                </span>
                <span className="text-slate-300 text-sm font-medium">
                  {(inc.doraArticles as string[])?.[0] ?? "ICT Incident"}
                </span>
              </div>
              <span className="text-slate-500 text-xs">
                {timeAgo(inc.detectedAt)}
              </span>
            </div>
            <div className="mt-1 flex gap-2 text-xs text-slate-500">
              <span className="capitalize">{inc.status}</span>
              {inc.evidenceUrl && (
                <span className="text-green-400">PDF ready</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40">
          <div className="w-full max-w-md h-full bg-slate-900 border-l border-slate-700 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Incident Detail</h3>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-slate-500">Severity</span>
                <span
                  className={clsx(
                    "font-bold px-1.5 rounded",
                    SEVERITY_COLOR[selected.severity] ?? ""
                  )}
                >
                  {selected.severity}
                </span>
              </div>
              <div>
                <span className="text-slate-500">DORA Articles</span>
                <ul className="mt-1 list-disc list-inside text-slate-300">
                  {(selected.doraArticles as string[]).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>{" "}
                <span className="capitalize text-slate-200">{selected.status}</span>
              </div>
              {selected.evidenceUrl && (
                <a
                  href={selected.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded transition-colors"
                >
                  Download Evidence PDF
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
