export type WeeklyPrivacyGrade = "양호" | "보통" | "주의" | "위험";

export type PrivacyIndexSeriesPoint = {
  id: string;
  label: string;
  value: number | null;
};

export type PrivacyIndexTrendRow = {
  weekId: string;
  shortRange: string;
  avgScore: number | null;
  analyzableCount: number;
};

export function weeklyPrivacyGrade(
  score: number | null | undefined,
): WeeklyPrivacyGrade | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 80) return "양호";
  if (score >= 60) return "보통";
  if (score >= 40) return "주의";
  return "위험";
}

export function weeklyPrivacyGradeTone(
  grade: WeeklyPrivacyGrade | null,
): "success" | "info" | "warning" | "danger" | "neutral" {
  if (grade === "양호") return "success";
  if (grade === "보통") return "info";
  if (grade === "주의") return "warning";
  if (grade === "위험") return "danger";
  return "neutral";
}

/** Round a privacy-index score to one decimal place (from the second). */
export function roundScore1(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

export function formatScore1(
  value: number | null | undefined,
  suffix = "점",
): string {
  const rounded = roundScore1(value);
  if (rounded == null) return "-";
  return `${rounded.toFixed(1)}${suffix}`;
}

export const WEEKLY_PRIVACY_INDEX_DISCLAIMER =
  "본 지수는 공개 설문 화면 기준 자동진단 결과를 바탕으로 산출한 참고 지표이며, 개별 설문의 위법 여부를 확정하는 기준은 아닙니다.";

export const WEEKLY_PRIVACY_INDEX_FORMULA = {
  title: "개인정보 보호 수준지수 계산 산식",
  intro:
    "자동진단 기반 참고 지표입니다. 공개 설문 화면에서 확인된 수집·고지·안내 상태를 점수로 요약한 값이며, 위법 여부를 확정하지 않습니다.",
  steps: [
    "분석 가능한 진단 완료 설문만 포함합니다. 종료·접근제한·진단 미완료 건은 제외합니다.",
    "각 설문의 점수 = 100 − (수집정보 위험 감점 + 처리경로 확인 필요 감점 + 고지 미흡 감점 + 관리·안내 미흡 감점).",
    "주간 지수 = 해당 주(월요일~일요일, KST)에 분석한 설문 점수의 산술평균.",
    "월간 지수 = 해당 월에 시작하는 주차의 주간 지수를 분석 건수로 가중 평균한 값. 월 구분은 주차 시작일(월요일) 기준입니다.",
    "화면에 표시하는 점수는 소수점 첫째자리까지이며, 둘째자리에서 반올림합니다.",
  ],
};

export const WEEKLY_PRIVACY_GRADE_BANDS: Array<{
  grade: WeeklyPrivacyGrade;
  range: string;
  min: number;
  max: number;
  meaning: string;
}> = [
  {
    grade: "양호",
    range: "80~100점",
    min: 80,
    max: 100,
    meaning:
      "공개 화면에서 기본 고지·안내가 비교적 확인되는 구간입니다. 자동진단 기반 참고 지표이며, 위법 여부를 확정하지 않습니다.",
  },
  {
    grade: "보통",
    range: "60~79점",
    min: 60,
    max: 79,
    meaning:
      "일부 고지 항목에서 확인 필요 신호가 나타나는 구간입니다. 운영 화면의 안내 문구를 다시 점검하는 것이 바람직합니다.",
  },
  {
    grade: "주의",
    range: "40~59점",
    min: 40,
    max: 59,
    meaning:
      "고지 미흡 가능성이 반복적으로 나타나는 구간입니다. 수집 목적·항목·보유기간·연락처 안내를 우선 개선할 필요가 있습니다.",
  },
  {
    grade: "위험",
    range: "0~39점",
    min: 0,
    max: 39,
    meaning:
      "확인 필요 신호가 집중되는 구간입니다. 공개 설문 화면의 개인정보 고지·안내를 우선 점검할 것을 권고합니다.",
  },
];

export function weeklyPrivacyIndexSeries(
  rows: Array<Pick<PrivacyIndexTrendRow, "weekId" | "shortRange" | "avgScore">>,
  limit = 12,
): PrivacyIndexSeriesPoint[] {
  return [...rows]
    .sort((a, b) => a.weekId.localeCompare(b.weekId))
    .slice(-limit)
    .map((row) => ({
      id: row.weekId,
      label: row.shortRange,
      value: roundScore1(row.avgScore),
    }));
}

export function monthlyPrivacyIndexSeries(
  rows: Array<Pick<PrivacyIndexTrendRow, "weekId" | "avgScore" | "analyzableCount">>,
): PrivacyIndexSeriesPoint[] {
  const buckets = new Map<
    string,
    { year: number; month: number; weighted: number; weight: number }
  >();

  for (const row of rows) {
    if (row.avgScore == null || !Number.isFinite(row.avgScore)) continue;
    const [year, month] = row.weekId.split("-").map(Number);
    if (!year || !month) continue;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const weight = row.analyzableCount > 0 ? row.analyzableCount : 1;
    const prev = buckets.get(key) ?? {
      year,
      month,
      weighted: 0,
      weight: 0,
    };
    prev.weighted += row.avgScore * weight;
    prev.weight += weight;
    buckets.set(key, prev);
  }

  return [...buckets.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((bucket) => ({
      id: `${bucket.year}-${String(bucket.month).padStart(2, "0")}`,
      label: `${bucket.year}년 ${bucket.month}월`,
      value: roundScore1(bucket.weighted / bucket.weight),
    }));
}
