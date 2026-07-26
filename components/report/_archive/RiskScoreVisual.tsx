import type { VerdictType } from "@/lib/reporting/reportMessages";

interface RiskScoreVisualProps {
  score?: number | null;
  limited?: boolean;
  decision: VerdictType;
  scoreEvaluation?: string;
}

function scoreColor(score: number | null | undefined, decision: VerdictType): string {
  if (decision === "DO_NOT_RESPOND" || decision === "REPORT_OR_INQUIRE") {
    return "#c73e54";
  }
  if (score == null || decision === "LIMITED_DIAGNOSIS") return "#6b7280";
  if (score >= 80) return "#2d8a5e";
  if (score >= 60) return "#c4841a";
  if (score >= 40) return "#d4622a";
  return "#c73e54";
}

export function RiskScoreVisual({
  score,
  limited = false,
  decision,
  scoreEvaluation,
}: RiskScoreVisualProps) {
  if (limited || score == null || decision === "LIMITED_DIAGNOSIS") {
    return (
      <div className="flex h-36 w-36 shrink-0 flex-col items-center justify-center rounded-full border-2 border-[#d1d5db] bg-[#f9fafb] text-center shadow-inner md:h-40 md:w-40">
        <p className="text-xs font-semibold text-[#6b7280]">점수</p>
        <p className="mt-1 px-3 text-sm font-bold leading-tight text-[#4b5563]">
          {scoreEvaluation ?? "산정 불가"}
        </p>
      </div>
    );
  }

  const size = 152;
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = scoreColor(score, decision);

  return (
    <div className="relative flex h-40 w-40 shrink-0 items-center justify-center md:h-44 md:w-44">
      <svg width={size} height={size} className="-rotate-90 drop-shadow-sm">
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
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeWidth={strokeWidth}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-4xl font-extrabold tabular-nums tracking-tight text-foreground md:text-5xl">
          {score}
        </p>
        <p className="mt-1 max-w-[7rem] text-[11px] font-semibold leading-tight text-muted">
          {scoreEvaluation ?? "보조 점수"}
        </p>
      </div>
    </div>
  );
}
