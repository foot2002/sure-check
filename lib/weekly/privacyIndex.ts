export type WeeklyPrivacyGrade = "양호" | "보통" | "주의" | "위험";

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

export const WEEKLY_PRIVACY_INDEX_DISCLAIMER =
  "본 지수는 공개 설문 화면 기준 자동진단 결과를 바탕으로 산출한 참고 지표이며, 개별 설문의 위법 여부를 확정하는 기준은 아닙니다.";
