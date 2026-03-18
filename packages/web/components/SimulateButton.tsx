"use client";

import { useState } from "react";
import clsx from "clsx";

interface Props {
  className?: string;
}

export default function SimulateButton({ className }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const simulate = async () => {
    setLoading(true);
    setDone(false);
    try {
      await fetch("/api/simulate", { method: "POST" });
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={simulate}
      disabled={loading}
      className={clsx(
        "text-sm font-semibold py-2 px-4 rounded-lg border transition-colors",
        done
          ? "bg-green-600/20 border-green-500/40 text-green-400"
          : "bg-red-600/20 border-red-500/40 text-red-400 hover:bg-red-600/30",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {loading ? "Triggering…" : done ? "✓ P1 Incident Created" : "Simulate P1 Incident"}
    </button>
  );
}
