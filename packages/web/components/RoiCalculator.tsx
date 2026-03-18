"use client";

import { useState } from "react";

const MIN = 10;
const MAX = 10000;
const MANUAL_COST_PER_EMPLOYEE = 1200;
const GRADIENT_GUARD_ANNUAL = 2160;

export default function RoiCalculator() {
  const [employees, setEmployees] = useState(100);

  const manualCost = employees * MANUAL_COST_PER_EMPLOYEE;
  const savings = manualCost - GRADIENT_GUARD_ANNUAL;
  const pct = Math.round((savings / manualCost) * 100);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-EU", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 p-6">
      <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-4">
        ROI Calculator
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="space-y-3">
          <label className="text-slate-300 text-sm">
            Number of employees:{" "}
            <span className="font-bold text-white">{employees.toLocaleString()}</span>
          </label>
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={10}
            value={employees}
            onChange={(e) => setEmployees(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <p className="text-slate-500 text-xs">
            Source: Deloitte 2024 DORA Compliance Cost Study
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-slate-400 text-xs mb-1">Manual cost</p>
            <p className="text-red-400 font-bold text-lg">{fmt(manualCost)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">GradientGuard</p>
            <p className="text-green-400 font-bold text-lg">
              {fmt(GRADIENT_GUARD_ANNUAL)}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">Savings</p>
            <p className="text-white font-bold text-lg">
              {pct}%
            </p>
            <p className="text-slate-400 text-xs">{fmt(savings)}/yr</p>
          </div>
        </div>
      </div>
    </div>
  );
}
