import type { RiskGrade } from "@/lib/types/scan";

export const GRADE_LABELS: Record<RiskGrade, string> = {
  safe: "안전",
  caution: "주의",
  risk: "위험",
  high_risk: "고위험",
};

export const GRADE_DESCRIPTIONS: Record<RiskGrade, string> = {
  safe: "개인정보보호 관련 위험 신호가 낮은 수준으로 확인됩니다.",
  caution: "일부 보완이 필요한 항목이 확인됩니다. 확인 후 이용을 권장합니다.",
  risk: "감지된 위험 신호가 있습니다. 응답 전 고지·동의·수집 항목을 꼼꼼히 확인하세요.",
  high_risk: "다수의 위험 신호가 감지되었습니다. 민감 정보 입력을 신중히 검토하세요.",
};

export const LIMITED_LABEL = "진단 제한";

export const LIMITED_DESCRIPTION =
  "설문 문항 또는 입력 필드를 자동으로 확인하지 못해 개인정보 위험 점수를 산정하지 않았습니다.";

export function getLimitedColor(): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  return {
    bg: "bg-[#f3f4f6]",
    text: "text-[#4b5563]",
    border: "border-[#d1d5db]",
    dot: "bg-[#6b7280]",
  };
}

export function getGradeColor(grade: RiskGrade): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (grade) {
    case "safe":
      return {
        bg: "bg-[#edf7f1]",
        text: "text-[#1f6b47]",
        border: "border-[#c5e6d4]",
        dot: "bg-[#2d8a5e]",
      };
    case "caution":
      return {
        bg: "bg-[#fdf6e8]",
        text: "text-[#8a5f12]",
        border: "border-[#f0ddb0]",
        dot: "bg-[#c4841a]",
      };
    case "risk":
      return {
        bg: "bg-[#fdf0e8]",
        text: "text-[#a34a1a]",
        border: "border-[#f5cdb0]",
        dot: "bg-[#d4622a]",
      };
    case "high_risk":
      return {
        bg: "bg-[#fdf0f2]",
        text: "text-[#9e2a3e]",
        border: "border-[#f5c2cc]",
        dot: "bg-[#c73e54]",
      };
  }
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "text-[#1f6b47]";
  if (score >= 60) return "text-[#8a5f12]";
  if (score >= 40) return "text-[#a34a1a]";
  return "text-[#9e2a3e]";
}

export function getGaugeColor(score: number): string {
  if (score >= 80) return "#2d8a5e";
  if (score >= 60) return "#c4841a";
  if (score >= 40) return "#d4622a";
  return "#c73e54";
}
