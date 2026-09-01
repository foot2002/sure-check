const ISSUE_COPY: Record<string, string> = {
  "고지문 미흡":
    "개인정보 수집 목적·항목·보유기간 등 기본 고지 항목이 설문 화면에서 충분히 확인되지 않은 경우입니다.",
  "운영주체 확인 필요":
    "설문을 운영하는 기관·담당자를 화면에서 확인하기 어려운 경우입니다.",
  "동의 안내 미흡":
    "동의 여부, 거부권, 거부 시 불이익에 대한 안내가 충분하지 않은 경우입니다.",
  "국외이전 확인 필요":
    "국외 이전 가능성에 대한 안내가 화면에서 확인되지 않은 경우입니다.",
  "외부 설문도구·처리경로 확인 필요":
    "외부 설문도구 사용과 개인정보 처리경로 안내가 충분하지 않은 경우입니다.",
  "민감정보 문항 확인 필요":
    "건강·신념 등 민감정보로 볼 수 있는 문항이 확인되어 추가 안내가 필요한 경우입니다.",
  "공공부문 클라우드 보안 확인 필요":
    "공공부문 설문이 외부 도구로 운영되어 클라우드 보안 기준 확인이 필요한 경우입니다.",
  "보유기간·파기 안내 미흡":
    "정보가 얼마나 보관되고 어떻게 파기되는지 안내가 부족한 경우입니다.",
  "개인정보 문항 확인 필요":
    "이름·연락처 등 개인정보 입력이 요구되는 문항이 확인된 경우입니다.",
  "고위험정보 문항 확인 필요":
    "주민등록번호 등 고위험정보로 볼 수 있는 문항이 확인된 경우입니다.",
};

const TECHNICAL_ISSUE =
  /HTML\s*진단|platform_parser|\bINFO\b|browser fallback|문항 분석 제한|parser|debug/i;

export function isPublicWeeklyIssue(label: string): boolean {
  if (!label.trim()) return false;
  if (label === "기타 확인 필요" || label === "기타") return false;
  return !TECHNICAL_ISSUE.test(label);
}

export function weeklyIssueDescription(label: string): string {
  return (
    ISSUE_COPY[label] ||
    "공개 설문 화면에서 고지·안내가 충분하지 않거나 추가 확인이 필요한 항목입니다."
  );
}
