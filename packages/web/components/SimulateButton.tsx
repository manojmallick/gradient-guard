"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

interface Props {
  className?: string;
}

export default function SimulateButton({ className }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  const simulate = async () => {
    setLoading(true);
    setDone(false);
    try {
      await fetch("/api/simulate", { method: "POST" });
      setDone(true);
      // Refresh server components (compliance score, etc.)
      router.refresh();
      setTimeout(() => {
        setDone(false);
        router.refresh(); // second refresh after agent has had time to respond
      }, 15000);
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
