export type WeeklySampleBadge = "none" | "small" | "caution";

export function weeklySampleBadge(surveyCount: number): WeeklySampleBadge {
  if (surveyCount < 3) return "caution";
  if (surveyCount < 5) return "small";
  return "none";
}

export function weeklySampleBadgeLabel(badge: WeeklySampleBadge): string | null {
  if (badge === "caution") return "해석 주의";
  if (badge === "small") return "표본 적음";
  return null;
}

export function countFromRate(rate: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((rate / 100) * total);
}
