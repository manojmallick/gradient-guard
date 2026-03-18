"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

interface Props {
  score: number;
  breakdown?: Record<string, number>;
}

export default function ComplianceGauge({ score, breakdown }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const duration = 1200;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setDisplayed(Math.round(t * score));
      if (t < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [score]);

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - displayed / 100);

  const color =
    displayed >= 80
      ? "#22c55e"
      : displayed >= 60
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={180} viewBox="0 0 180 180">
        <circle
          cx={90}
          cy={90}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={14}
        />
        <circle
          cx={90}
          cy={90}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 90 90)"
          style={{ transition: "stroke 0.3s" }}
        />
        <text
          x={90}
          y={94}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={32}
          fontWeight="bold"
        >
          {displayed}
        </text>
        <text
          x={90}
          y={116}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize={11}
        >
          / 100
        </text>
      </svg>

      {breakdown && (
        <div className="mt-3 w-full space-y-1">
          {Object.entries(breakdown).map(([article, val]) => (
            <div
              key={article}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-slate-400 truncate max-w-[120px]">
                {article}
              </span>
              <span
                className={clsx("font-mono font-semibold", {
                  "text-green-400": val >= 80,
                  "text-amber-400": val >= 60 && val < 80,
                  "text-red-400": val < 60,
                })}
              >
                {val}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
