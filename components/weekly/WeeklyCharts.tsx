"use client";

import { useId } from "react";
import { roundScore1, privacyIndexChartRange } from "@/lib/weekly/privacyIndex";

export function WeeklyBarList({
  items,
  emphasizeLast = false,
}: {
  items: Array<{ label: string; value: number; meta?: string; hint?: string }>;
  emphasizeLast?: boolean;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const width = Math.max(4, Math.round((item.value / max) * 100));
        const active = emphasizeLast
          ? index === items.length - 1
          : index === 0;
        const opacity = active ? 1 : Math.max(0.45, 1 - index * 0.12);
        return (
          <div key={`${item.label}-${index}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className={active ? "font-semibold text-teal-900" : "text-slate-700"}>
                {item.label}
              </span>
              <span className="shrink-0 tabular-nums text-slate-600">
                {item.meta || item.value.toLocaleString("ko-KR")}
              </span>
            </div>
            {item.hint ? (
              <p className="mb-1 text-xs leading-relaxed text-slate-500">{item.hint}</p>
            ) : null}
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${active ? "bg-teal-800" : "bg-teal-500"}`}
                style={{ width: `${width}%`, opacity }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const GRADE_BANDS = [
  { min: 80, max: 100, fill: "rgba(16, 185, 129, 0.12)", label: "양호" },
  { min: 60, max: 80, fill: "rgba(14, 165, 233, 0.10)", label: "보통" },
  { min: 40, max: 60, fill: "rgba(245, 158, 11, 0.12)", label: "주의" },
  { min: 0, max: 40, fill: "rgba(234, 88, 12, 0.10)", label: "위험" },
];

function formatPointValue(value: number, suffix: string): string {
  const rounded = roundScore1(value);
  if (rounded == null) return "";
  return `${rounded.toFixed(1)}${suffix}`;
}

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function yTicks(yMin: number, yMax: number): number[] {
  const span = yMax - yMin;
  const step = span <= 30 ? 5 : span <= 60 ? 10 : 20;
  const start = Math.ceil(yMin / step) * step;
  const ticks: number[] = [];
  for (let tick = start; tick <= yMax + 1e-9; tick += step) {
    ticks.push(tick);
  }
  if (ticks.length === 0 || ticks[0] - yMin > step * 0.45) {
    ticks.unshift(Math.round(yMin * 10) / 10);
  }
  if (yMax - ticks[ticks.length - 1] > step * 0.45) {
    ticks.push(Math.round(yMax * 10) / 10);
  }
  return [...new Set(ticks.map((tick) => Math.round(tick * 10) / 10))];
}

export function WeeklyTrendChart({
  title,
  points,
  valueSuffix = "",
  yMin: yMinProp,
  yMax: yMaxProp,
  variant = "compact",
  showGradeBands = false,
}: {
  title: string;
  points: Array<{ id?: string; label: string; value: number | null }>;
  valueSuffix?: string;
  yMin?: number;
  yMax?: number;
  variant?: "hero" | "compact";
  showGradeBands?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const usable = points
    .map((point) => point.value)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (usable.length === 0) {
    return (
      <p className="text-sm text-slate-500">{title} 데이터가 충분하지 않습니다.</p>
    );
  }

  const auto = privacyIndexChartRange(usable);
  const yMin = yMinProp ?? auto.yMin;
  const yMax = yMaxProp ?? auto.yMax;

  const width = variant === "hero" ? 720 : 560;
  const height = variant === "hero" ? 210 : 170;
  const padL = 42;
  const padR = 16;
  const padT = 22;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const span = yMax - yMin || 1;

  const yFor = (value: number) => padT + (1 - (value - yMin) / span) * plotH;
  const baseline = yFor(yMin);
  const n = points.length;
  const coords = points.map((point, index) => {
    const x = n === 1 ? padL + plotW / 2 : padL + (index * plotW) / (n - 1);
    const value = point.value;
    return {
      key: point.id || `${point.label}-${index}`,
      x,
      y: value == null ? null : yFor(value),
      label: point.label,
      value,
    };
  });
  const drawn = coords.filter(
    (coord): coord is typeof coord & { y: number; value: number } =>
      coord.y != null && coord.value != null,
  );

  const line =
    drawn.length === 0
      ? ""
      : drawn
          .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
          .join(" ");
  const area =
    drawn.length === 0
      ? ""
      : `${line} L${drawn[drawn.length - 1].x.toFixed(2)},${baseline.toFixed(2)} L${drawn[0].x.toFixed(2)},${baseline.toFixed(2)} Z`;

  const ticks = yTicks(yMin, yMax);
  const visibleBands = GRADE_BANDS.map((band) => {
    const overlapMin = Math.max(band.min, yMin);
    const overlapMax = Math.min(band.max, yMax);
    if (overlapMax <= overlapMin) return null;
    return { ...band, overlapMin, overlapMax };
  }).filter((band): band is NonNullable<typeof band> => band != null);
  const labelEvery = n > 8 ? 2 : 1;
  const showValueLabels = n <= 8;

  return (
    <figure className="weekly-trend-chart">
      {title ? (
        <figcaption className="mb-3 text-sm font-semibold text-slate-800">{title}</figcaption>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={title || "추세 그래프"}
      >
        <defs>
          <linearGradient id={`weekly-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.28" />
            <stop offset="70%" stopColor="#0f766e" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`weekly-stroke-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#14b8a6" />
            <stop offset="55%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#134e4a" />
          </linearGradient>
          <filter id={`weekly-glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {showGradeBands
          ? visibleBands.map((band) => {
              const yTop = yFor(band.overlapMax);
              const yBot = yFor(band.overlapMin);
              return (
                <rect
                  key={band.label}
                  x={padL}
                  y={yTop}
                  width={plotW}
                  height={Math.max(0, yBot - yTop)}
                  fill={band.fill}
                />
              );
            })
          : null}

        {ticks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
                strokeDasharray={tick === yMin || tick === yMax ? undefined : "3 4"}
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#94a3b8"
              >
                {formatTick(tick)}
              </text>
            </g>
          );
        })}

        {showGradeBands
          ? visibleBands.map((band) => {
              const y = (yFor(band.overlapMin) + yFor(band.overlapMax)) / 2;
              return (
                <text
                  key={`band-${band.label}`}
                  x={width - padR - 4}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#64748b"
                  opacity="0.7"
                >
                  {band.label}
                </text>
              );
            })
          : null}

        {area ? (
          <path
            className="weekly-chart-area"
            d={area}
            fill={`url(#weekly-fill-${uid})`}
          />
        ) : null}
        {line ? (
          <path
            className="weekly-chart-line"
            d={line}
            fill="none"
            stroke={`url(#weekly-stroke-${uid})`}
            strokeWidth={variant === "hero" ? 3.2 : 2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            filter={`url(#weekly-glow-${uid})`}
          />
        ) : null}

        {drawn.map((coord, index) => {
          const last = index === drawn.length - 1;
          const delay = 0.85 + index * 0.07;
          const showAxisLabel =
            index % labelEvery === 0 || index === drawn.length - 1;
          const showScore = showValueLabels || last;
          return (
            <g key={coord.key}>
              {last ? (
                <circle
                  className="weekly-chart-pulse"
                  cx={coord.x}
                  cy={coord.y}
                  r="8"
                  fill="#0f766e"
                />
              ) : null}
              <circle
                className="weekly-chart-point"
                cx={coord.x}
                cy={coord.y}
                r={last ? 6 : 4.2}
                fill={last ? "#134e4a" : "#14b8a6"}
                stroke="#ffffff"
                strokeWidth="2"
                style={{ animationDelay: `${delay}s` }}
              />
              {showScore ? (
                <text
                  className="weekly-chart-label"
                  x={coord.x}
                  y={coord.y - 12}
                  textAnchor="middle"
                  fontSize={variant === "hero" ? 12 : 11}
                  fontWeight={last ? 700 : 500}
                  fill={last ? "#134e4a" : "#0f172a"}
                  style={{ animationDelay: `${delay + 0.12}s` }}
                >
                  {formatPointValue(coord.value, valueSuffix)}
                </text>
              ) : null}
              {showAxisLabel ? (
                <text
                  className="weekly-chart-label"
                  x={coord.x}
                  y={height - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#64748b"
                  style={{ animationDelay: `${delay + 0.12}s` }}
                >
                  {coord.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function WeeklyTrendSvg({
  title,
  points,
  valueSuffix = "",
}: {
  title: string;
  points: Array<{ label: string; value: number | null }>;
  valueSuffix?: string;
}) {
  return (
    <WeeklyTrendChart
      title={title}
      points={points}
      valueSuffix={valueSuffix}
      variant="compact"
    />
  );
}
