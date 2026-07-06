"use client";

import { getGaugeColor, getScoreColor } from "@/lib/utils/grade";

interface ScoreGaugeProps {
  score?: number | null;
  unavailable?: boolean;
  size?: number;
}

export function ScoreGauge({
  score,
  unavailable = false,
  size = 112,
}: ScoreGaugeProps) {
  if (unavailable || score == null) {
    return (
      <div
        className="relative inline-flex shrink-0 items-center justify-center rounded-full border border-border-subtle bg-background"
        style={{ width: size, height: size }}
      >
        <div className="flex flex-col items-center px-3 text-center">
          <span className="text-[13px] font-semibold leading-tight text-muted">
            점수 산정 불가
          </span>
        </div>
      </div>
    );
  }

  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getGaugeColor(score);

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#eef1f5"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-2xl font-semibold tabular-nums tracking-tight ${getScoreColor(score)}`}>
          {score}
        </span>
        <span className="text-[10px] font-medium text-muted">/ 100</span>
      </div>
    </div>
  );
}
