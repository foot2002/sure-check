/**
 * Reporting-only organization scope tags for existing rules.
 * Does not change legal rule meaning or invent new obligations.
 */

export type RuleOrgScope =
  | "COMMON"
  | "PUBLIC"
  | "COMPANY"
  | "UNIVERSITY_OFFICIAL";

/** Map known finding / check domains to org scopes for UI framing. */
export function scopesForCheckDomain(domain: string | null | undefined): RuleOrgScope[] {
  const d = (domain || "").toLowerCase();
  if (/csap|cloud|public|공공|보안인증|security.?cert/.test(d)) {
    return ["PUBLIC"];
  }
  if (/university|대학|연구|school/.test(d)) {
    return ["UNIVERSITY_OFFICIAL", "COMMON"];
  }
  if (/private|company|기업|위탁|국외|outsourcing|transfer/.test(d)) {
    return ["COMPANY", "COMMON"];
  }
  return ["COMMON"];
}

export function reportEmphasisForSubject(
  subjectType: string | null | undefined,
  publicPrivateType: string | null | undefined,
): {
  scope: RuleOrgScope;
  sectionTitles: [string, string, string];
} {
  const subject = (subjectType || "").toLowerCase();
  const pp = (publicPrivateType || "").toLowerCase();
  if (
    pp === "public" ||
    /public|공공|지자체|공사|공단|agency|school_local/.test(subject)
  ) {
    return {
      scope: "PUBLIC",
      sectionTitles: [
        "개인정보 보호",
        "공공 SaaS/도구 적합성",
        "즉시 확인사항",
      ],
    };
  }
  if (/university|대학|연구|school/.test(subject)) {
    return {
      scope: "UNIVERSITY_OFFICIAL",
      sectionTitles: [
        "연구/조사 개인정보",
        "공식조직 책임",
        "즉시 확인사항",
      ],
    };
  }
  return {
    scope: "COMPANY",
    sectionTitles: [
      "개인정보 보호",
      "외부 SaaS/위탁·이전 확인",
      "즉시 확인사항",
    ],
  };
}

/** Finding axes emphasized per org scope (reporting framing only). */
export function findingDimensionsForScope(scope: RuleOrgScope): string[] {
  if (scope === "PUBLIC") {
    return [
      "개인정보 수집·고지",
      "공공 외부도구/CSAP 적합성",
      "위탁·국외보관 확인",
      "운영주체·문의처",
    ];
  }
  if (scope === "UNIVERSITY_OFFICIAL") {
    return [
      "연구/조사 개인정보",
      "공식조직 책임 주체",
      "동의·고지 명확성",
      "문의·열람 경로",
    ];
  }
  if (scope === "COMPANY") {
    return [
      "개인정보 수집·고지",
      "외부 SaaS/위탁·이전",
      "마케팅·경품 부가 수집",
      "문의처·파기 안내",
    ];
  }
  return ["개인정보 수집·고지", "운영주체·문의처", "즉시 확인사항"];
}
