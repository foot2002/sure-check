export function WeeklyBarList({
  items,
  emphasizeLast = false,
}: {
  items: Array<{ label: string; value: number; meta?: string }>;
  emphasizeLast?: boolean;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const width = Math.max(4, Math.round((item.value / max) * 100));
        const active = emphasizeLast && index === items.length - 1;
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
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${active ? "bg-teal-800" : "bg-teal-500"}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
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
  const usable = points.map((p) => p.value).filter((v): v is number => v != null);
  if (usable.length === 0) {
    return (
      <p className="text-sm text-slate-500">{title} 데이터가 충분하지 않습니다.</p>
    );
  }
  const width = 560;
  const height = 180;
  const padX = 28;
  const padY = 24;
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min || 1;
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = padX + i * step;
    const v = p.value == null ? min : p.value;
    const y = height - padY - ((v - min) / span) * (height - padY * 2);
    return { x, y, ...p };
  });
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold text-slate-800">{title}</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={title}
      >
        <path d={line} fill="none" stroke="#0f766e" strokeWidth="3" />
        {coords.map((c, i) => (
          <g key={c.label}>
            <circle
              cx={c.x}
              cy={c.y}
              r={i === coords.length - 1 ? 5.5 : 3.5}
              fill={i === coords.length - 1 ? "#115e59" : "#14b8a6"}
            />
            <text
              x={c.x}
              y={height - 6}
              textAnchor="middle"
              fontSize="11"
              fill="#64748b"
            >
              {c.label}
            </text>
            {c.value != null ? (
              <text
                x={c.x}
                y={c.y - 10}
                textAnchor="middle"
                fontSize="11"
                fill="#0f172a"
              >
                {c.value}
                {valueSuffix}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </figure>
  );
}
