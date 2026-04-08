"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ComplianceGauge from "../../components/ComplianceGauge";
import IncidentFeed from "../../components/IncidentFeed";
import DoProductBadge from "../../components/DoProductBadge";
import SimulateButton from "../../components/SimulateButton";
import RoiCalculator from "../../components/RoiCalculator";

interface ComplianceData {
  score: number;
  breakdown: Record<string, number>;
  open_incidents: number;
}

const DEFAULT: ComplianceData = { score: 100, breakdown: {}, open_incidents: 0 };

export default function DashboardPage() {
  const [compliance, setCompliance] = useState<ComplianceData>(DEFAULT);

  useEffect(() => {
    const load = () =>
      fetch("/api/compliance/score", { cache: "no-store" })
        .then((r) => r.json())
        .then(setCompliance)
        .catch(() => {});

    load();
    // Refresh score every 15s so it drops live when an incident is triggered
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">GradientGuard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            DORA Compliance Intelligence · Powered by DigitalOcean Gradient™ AI
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/dashboard/incidents" className="text-slate-300 hover:text-white transition-colors">
            Incidents
          </Link>
          <Link href="/dashboard/evidence" className="text-slate-300 hover:text-white transition-colors">
            Evidence
          </Link>
          <Link href="/dashboard/counsel" className="text-slate-300 hover:text-white transition-colors">
            Counsel
          </Link>
        </nav>
      </header>

      {/* DO Products Banner */}
      <DoProductBadge />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compliance score */}
        <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 flex flex-col items-center">
          <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-4">
            DORA Compliance Score
          </h2>
          <ComplianceGauge
            score={compliance.score}
            breakdown={compliance.breakdown}
          />
          <p className="mt-4 text-slate-400 text-xs text-center">
            {compliance.open_incidents} open incident(s) affecting score
          </p>
          <SimulateButton className="mt-4 w-full" />
        </div>

        {/* Live incident feed */}
        <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider">
              Live Incidents
            </h2>
            <Link href="/dashboard/incidents" className="text-[var(--do-blue)] text-xs hover:underline">
              View all →
            </Link>
          </div>
          <IncidentFeed maxItems={5} />
        </div>
      </div>

      {/* ROI Calculator */}
      <RoiCalculator />
    </div>
  );
}
