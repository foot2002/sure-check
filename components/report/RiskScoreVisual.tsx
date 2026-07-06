import type { RespondentDecision } from "@/lib/reporting/reportMessages";

interface RiskScoreVisualProps {
  score?: number | null;
  limited?: boolean;
  decision: RespondentDecision;
  scoreEvaluation?: string;
}

function scoreColor(score: number | null | undefined, decision: RespondentDecision): string {
  if (decision === "hold_response") return "#c73e54";
  if (score == null) return "#6b7280";
  if (score >= 80) return "#2d8a5e";
  if (score >= 60) return "#c4841a";
  if (score >= 40) return "#d4622a";
  return "#c73e54";
}

function scoreLabel(
  score: number | null | undefined,
  scoreEvaluation?: string,
): string {
  if (scoreEvaluation) return scoreEvaluation;
  if (score == null) return "산정 불가";
  if (score >= 80) return "낮음";
  if (score >= 60) return "주의";
  if (score >= 40) return "위험";
  return "고위험";
}

export function RiskScoreVisual({
  score,
  limited = false,
  decision,
  scoreEvaluation,
}: RiskScoreVisualProps) {
  if (limited || score == null) {
    return (
      <div className="flex h-40 w-40 shrink-0 flex-col items-center justify-center rounded-full border-2 border-[#d1d5db] bg-[#f9fafb] text-center shadow-inner md:h-44 md:w-44">
        <p className="text-sm font-semibold text-[#6b7280]">위험 점수</p>
        <p className="mt-1 text-base font-bold leading-tight text-[#4b5563] md:text-lg">
          {scoreEvaluation ?? "산정 불가"}
        </p>
      </div>
    );
  }

  const size = 168;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = scoreColor(score, decision);

  return (
    <div className="relative flex h-44 w-44 shrink-0 items-center justify-center md:h-48 md:w-48">
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
        <p className="text-5xl font-extrabold tabular-nums tracking-tight text-foreground md:text-6xl">
          {score}
        </p>
        <p className="mt-1 text-sm font-semibold text-muted md:text-[15px]">
          {scoreLabel(score, scoreEvaluation)}
        </p>
      </div>
    </div>
  );
}
