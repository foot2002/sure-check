import type {
  PublicInstitutionEvidence,
  PublicSectorConfidence,
  SubjectType,
} from "@/lib/types/analyzer";
import type { NormalizedForm } from "@/lib/types/scan";
import { collectAuthorityTextCandidates } from "@/lib/public-sector/collectAuthorityTexts";
import { matchPublicInstitution } from "@/lib/public-sector/publicInstitutionMatcher";

export interface PublicSectorDetectionResult {
  subjectType: SubjectType;
  publicSectorDetected: boolean;
  publicSectorConfidence: PublicSectorConfidence;
  publicSectorEvidence: string[];
  publicInstitutionEvidence?: PublicInstitutionEvidence;
  detectedOrganizations: string[];
  surveyPurposeTypes: string[];
  possibleOnly: boolean;
}

const ORGANIZATION_LABELS = [
  "조사기관",
  "발주기관",
  "주관기관",
  "수행기관",
  "운영기관",
  "위탁기관",
  "개인정보처리자",
  "담당기관",
  "문의처",
  "주최",
  "주관",
  "후원",
  "의뢰기관",
];

const STRONG_PUBLIC_KEYWORDS = [
  "정부",
  "중앙정부",
  "행정기관",
  "공공기관",
  "국가기관",
  "지자체",
  "지방자치단체",
  "시청",
  "군청",
  "구청",
  "도청",
  "교육청",
  "의회",
  "공사",
  "공단",
  "지방공기업",
  "출자기관",
  "출연기관",
  "출자·출연기관",
  "출자출연기관",
  "공공재단",
  "문화재단",
  "문화관광재단",
  "관광재단",
  "복지재단",
  "장학재단",
  "청소년재단",
  "시설관리공단",
  "시설관리",
  "공공시설",
  "공공체육시설",
  "체육시설",
  "종합운동장",
  "체육공원",
  "스포츠센터",
  "도시공사",
  "개발공사",
  "테크노파크",
  "진흥원",
  "국립",
  "도립",
  "시립",
  "군립",
  "구립",
];

const LOCAL_GOV_NAMES = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청남도",
  "충청북도",
  "전라남도",
  "전북특별자치도",
  "경상남도",
  "경상북도",
  "제주특별자치도",
  "홍성군",
  "홍주",
  "양평군",
  "양평",
  "물맑은양평",
];

const LOCAL_GOV_COMPOUND_PATTERNS = [
  /[가-힣]{2,8}특별시/,
  /[가-힣]{2,8}광역시/,
  /[가-힣]{2,8}특별자치시/,
  /[가-힣]{2,8}특별자치도/,
  /[가-힣]{2,8}도청/,
  /[가-힣]{2,8}시청/,
  /[가-힣]{2,8}군청/,
  /[가-힣]{2,8}구청/,
  /[가-힣]{2,8}군/,
  /[가-힣]{2,8}시(?![설민간])/,
  /서울시/,
  /부산시/,
  /대구시/,
  /인천시/,
  /광주시/,
  /대전시/,
  /울산시/,
];

const PUBLIC_FOUNDATION_NATURE = [
  "문화관광재단",
  "관광재단",
  "문화재단",
  "복지재단",
  "장학재단",
  "청소년재단",
  "시설관리공단",
  "문화관광",
];

const PUBLIC_FACILITY_NATURE = [
  "박물관",
  "미술관",
  "도서관",
  "문화시설",
  "공공문화시설",
  "시설관리",
  "공공시설",
  "공공체육시설",
  "체육시설",
  "종합운동장",
  "체육공원",
  "스포츠센터",
  "어린이물놀이시설",
];

const PRIVATE_FOUNDATION_MARKERS = [/민간재단/, /사단법인\s*민간/, /비영리\s*민간/];

const KNOWN_PUBLIC_ORGANIZATIONS = [
  /홍주문화관광재단/,
  /\(재\)홍주문화관광재단/,
  /용인시박물관/,
];

const ORGANIZATION_NAME_PATTERN =
  /(?:\(재\)|재단법인\s*)?[가-힣A-Za-z0-9·\-()（）]{2,40}(?:재단|공사|공단|진흥원|연구원|테크노파크|위원회|협의회|센터|박물관|미술관|도서관)/g;

const TOURISM_PURPOSE_PATTERNS = [/시티투어/, /관광/, /이용\s*목적/, /방문\s*목적/];
const EVENT_PURPOSE_KEYWORDS = ["이벤트", "경품", "응모", "추첨"];

function buildFullSurveyText(form: NormalizedForm): string {
  return [
    form.title,
    form.operatorType,
    form.notices?.description,
    form.notices?.purpose,
    form.notices?.privacyNotice,
    form.notices?.processor,
    form.notices?.trustee,
    form.notices?.contactDepartment,
    form.contextHints?.prizeDescription,
    ...(form.metadata?.noticeTexts ?? []),
    ...(form.metadata?.headings ?? []),
    ...form.questions.flatMap((question) => [
      question.label,
      question.questionText,
      question.auxiliaryText,
      ...(question.options ?? []),
    ]),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAuthorityText(form: NormalizedForm): string {
  return [
    form.title,
    form.operatorType,
    form.notices?.description,
    form.notices?.purpose,
    form.notices?.privacyNotice,
    form.notices?.processor,
    form.notices?.trustee,
    form.notices?.contactDepartment,
    form.contextHints?.prizeDescription,
    ...(form.metadata?.noticeTexts ?? []),
    ...(form.metadata?.headings ?? []),
    ...form.questions.flatMap((question) => [
      question.label,
      question.questionText,
      question.auxiliaryText,
    ]),
  ]
    .filter(Boolean)
    .join("\n");
}

function extractOrganizationsNearLabels(text: string): string[] {
  const found: string[] = [];

  for (const label of ORGANIZATION_LABELS) {
    const pattern = new RegExp(
      `${label}\\s*[:：]?\\s*([^\\n,;.|]{2,60})`,
      "gi",
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const org = match[1].trim().replace(/[)\]}>]+$/, "");
      if (org.length >= 2) found.push(org);
    }
  }

  return [...new Set(found)];
}

function extractOrganizationNames(text: string): string[] {
  const names = new Set<string>(extractOrganizationsNearLabels(text));

  let match: RegExpExecArray | null;
  const globalPattern = new RegExp(ORGANIZATION_NAME_PATTERN.source, "g");
  while ((match = globalPattern.exec(text)) !== null) {
    names.add(match[0].trim());
  }

  for (const pattern of KNOWN_PUBLIC_ORGANIZATIONS) {
    const hit = text.match(pattern);
    if (hit) names.add(hit[0]);
  }

  return [...names];
}

function hasPrivateFoundationContext(text: string): boolean {
  return PRIVATE_FOUNDATION_MARKERS.some((pattern) => pattern.test(text));
}

function hasStrongPublicKeyword(text: string): string | null {
  for (const keyword of STRONG_PUBLIC_KEYWORDS) {
    if (text.includes(keyword)) return keyword;
  }
  return null;
}

function hasLocalGovCompound(text: string): string | null {
  for (const name of LOCAL_GOV_NAMES) {
    if (text.includes(name)) return name;
  }
  for (const pattern of LOCAL_GOV_COMPOUND_PATTERNS) {
    const hit = text.match(pattern);
    if (hit) return hit[0];
  }
  return null;
}

function hasOrganizationLabelContext(text: string): string | null {
  const window = 100;

  for (const label of ORGANIZATION_LABELS) {
    let searchFrom = 0;
    while (true) {
      const index = text.indexOf(label, searchFrom);
      if (index === -1) break;

      const start = Math.max(0, index - window);
      const end = Math.min(text.length, index + label.length + window);
      const snippet = text.slice(start, end);

      const keywordHit = hasStrongPublicKeyword(snippet);
      if (keywordHit) {
        return `${label} 주변: ${keywordHit}`;
      }

      const localHit = hasLocalGovCompound(snippet);
      if (localHit) {
        return `${label} 주변: ${localHit}`;
      }

      const orgNearLabel = snippet.match(
        /(?:\(재\)|재단법인\s*)?[가-힣A-Za-z0-9·\-()（）]{2,40}(?:재단|공사|공단|진흥원|연구원)/,
      );
      if (orgNearLabel) {
        return `${label}: ${orgNearLabel[0]}`;
      }

      searchFrom = index + label.length;
    }
  }

  return null;
}

function detectSurveyPurposeTypes(text: string): string[] {
  const types: string[] = [];
  if (TOURISM_PURPOSE_PATTERNS.some((pattern) => pattern.test(text))) {
    types.push("tourism");
  }
  if (EVENT_PURPOSE_KEYWORDS.some((keyword) => text.includes(keyword))) {
    types.push("event_prize");
  }
  if (/만족도/.test(text)) types.push("satisfaction");
  return types;
}

function evaluateSpecialRules(text: string): {
  confirmed: boolean;
  possible: boolean;
  evidence: string[];
} {
  const evidence: string[] = [];
  let confirmed = false;
  let possible = false;

  for (const pattern of KNOWN_PUBLIC_ORGANIZATIONS) {
    const hit = text.match(pattern);
    if (hit) {
      confirmed = true;
      evidence.push(`공공부문 기관명 탐지: ${hit[0]}`);
    }
  }

  const hasFoundationNature = PUBLIC_FOUNDATION_NATURE.some((keyword) =>
    text.includes(keyword),
  );
  const localGov = hasLocalGovCompound(text);
  if (localGov && hasFoundationNature) {
    confirmed = true;
    evidence.push(`지자체(${localGov}) + 공공재단 성격 키워드`);
  }

  const hasRePrefix = /\(재\)/.test(text);
  const hasFoundationLaw = text.includes("재단법인");
  if (hasRePrefix && hasFoundationNature) {
    confirmed = true;
    evidence.push("(재) + 공공재단 성격 키워드");
  }

  if (hasFoundationLaw && localGov) {
    confirmed = true;
    evidence.push(`재단법인 + 지자체명(${localGov})`);
  }

  if (hasFoundationLaw && hasFoundationNature && !hasPrivateFoundationContext(text)) {
    confirmed = true;
    evidence.push("재단법인 + 공공 목적 기관명");
  }

  if (hasFoundationLaw && !confirmed && !hasPrivateFoundationContext(text)) {
    possible = true;
    evidence.push("재단법인 단독 — 공공부문 확인 필요");
  }

  if (
    /(양평군|양평|물맑은양평)/.test(text) &&
    /(종합운동장|체육시설|공공체육시설|어린이물놀이시설|체육공원|스포츠센터|시설관리)/.test(text)
  ) {
    confirmed = true;
    evidence.push("양평 지역 공공 체육·물놀이시설 설문 맥락");
  }

  const publicMuseum = text.match(/[가-힣]{2,8}시박물관/);
  if (publicMuseum) {
    confirmed = true;
    evidence.push(`공공 문화시설: ${publicMuseum[0]}`);
  }

  const hasPublicFacilityNature = PUBLIC_FACILITY_NATURE.some((keyword) =>
    text.includes(keyword),
  );
  if (localGov && hasPublicFacilityNature) {
    confirmed = true;
    evidence.push(`지자체(${localGov}) + 공공 문화·체육시설 맥락`);
  }

  return { confirmed, possible, evidence };
}

export function detectPublicSector(form: NormalizedForm): PublicSectorDetectionResult {
  const fullText = buildFullSurveyText(form);
  const text = buildAuthorityText(form);
  const evidence: string[] = [];
  const organizations = extractOrganizationNames(text);
  const surveyPurposeTypes = detectSurveyPurposeTypes(fullText);

  // 1) Public-institution list match (exact / alias / keyword fallback)
  const listMatch = matchPublicInstitution(collectAuthorityTextCandidates(form));
  if (
    listMatch.isPublicSector &&
    (listMatch.confidence === "high" || listMatch.confidence === "medium")
  ) {
    const institutionEvidence: PublicInstitutionEvidence = {
      matchedName: listMatch.matchedName,
      matchedType: listMatch.matchedType,
      matchedRegion: listMatch.matchedRegion,
      matchedBy: listMatch.matchedBy,
      evidenceText: listMatch.evidenceText,
      evidenceSource: listMatch.evidenceSource,
    };
    const matchLabel =
      listMatch.matchedBy === "exact_list"
        ? "공공기관 리스트"
        : listMatch.matchedBy === "alias"
          ? "기관명 별칭"
          : "기관명 키워드";
    evidence.push(
      `공공기관 리스트 매칭(${matchLabel}): ${listMatch.matchedName ?? "공공기관"}`,
    );
    if (listMatch.evidenceText) {
      evidence.push(`근거 텍스트: ${listMatch.evidenceText.slice(0, 120)}`);
    }

    let subjectType: SubjectType = "public_sector";
    if (/병원|의료|클리닉/.test(text)) subjectType = "medical";
    else if (/학교|교육청|교육지원청/.test(text)) subjectType = "education";
    else if (/위탁|용역|수행기관|대행/.test(text) && /민간|주식회사|㈜/.test(text)) {
      subjectType = "public_contracted_private";
    }

    return {
      subjectType,
      publicSectorDetected: true,
      publicSectorConfidence: listMatch.confidence,
      publicSectorEvidence: [...new Set(evidence)],
      publicInstitutionEvidence: institutionEvidence,
      detectedOrganizations: [
        ...new Set(
          [listMatch.matchedName, ...organizations].filter(
            (value): value is string => Boolean(value && value.length >= 2),
          ),
        ),
      ],
      surveyPurposeTypes,
      possibleOnly: false,
    };
  }

  if (hasPrivateFoundationContext(text) && !/(재)/.test(text)) {
    const hasExplicitPublic = STRONG_PUBLIC_KEYWORDS.some((keyword) =>
      text.includes(keyword),
    );
    if (!hasExplicitPublic && organizations.every((org) => /민간/.test(org))) {
      return {
        subjectType: "private_company",
        publicSectorDetected: false,
        publicSectorConfidence: "none",
        publicSectorEvidence: ["민간재단 맥락으로 공공부문 확정 보류"],
        detectedOrganizations: organizations,
        surveyPurposeTypes,
        possibleOnly: false,
      };
    }
  }

  const special = evaluateSpecialRules(text);
  evidence.push(...special.evidence);

  const labelContext = hasOrganizationLabelContext(text);
  if (labelContext) evidence.push(labelContext);

  const keywordHit = hasStrongPublicKeyword(text);
  if (keywordHit) evidence.push(`공공기관 키워드: ${keywordHit}`);

  const localGovHit = hasLocalGovCompound(text);
  if (localGovHit && hasFoundationNatureKeyword(text)) {
    evidence.push(`지자체·공공기관명: ${localGovHit}`);
  }

  for (const org of organizations) {
    if (isLikelyPublicOrganization(org)) {
      evidence.push(`기관명 탐지: ${org}`);
    }
  }

  const uniqueEvidence = [...new Set(evidence)];
  const weakKeywordOnly =
    keywordHit !== null &&
    ["공공", "센터", "위원회", "협의회", "연구원", "진흥원"].includes(keywordHit);

  const confirmed =
    special.confirmed ||
    Boolean(labelContext) ||
    organizations.some((org) => isLikelyPublicOrganization(org)) ||
    (keywordHit !== null && !weakKeywordOnly);

  const possibleOnly = !confirmed && (special.possible || false);

  let confidence: PublicSectorConfidence = "none";
  if (confirmed) {
    confidence =
      special.confirmed ||
      organizations.some((org) => KNOWN_PUBLIC_ORGANIZATIONS.some((p) => p.test(org))) ||
      Boolean(labelContext)
        ? "high"
        : "medium";
  } else if (possibleOnly) {
    confidence = "low";
  }

  const publicSectorDetected = confirmed && confidence !== "none";

  let subjectType: SubjectType = "unknown";
  if (publicSectorDetected) {
    if (/병원|의료|클리닉/.test(text)) subjectType = "medical";
    else if (/학교|교육청|교육지원청/.test(text)) subjectType = "education";
    else subjectType = "public_sector";
  } else if (
    form.operatorType?.includes("기업") ||
    form.operatorType?.includes("회사")
  ) {
    subjectType = "private_company";
  } else if (/협회|사단법인|비영리/.test(text)) {
    subjectType = "nonprofit_or_association";
  } else if (possibleOnly) {
    subjectType = "unknown";
  } else if (!publicSectorDetected && organizations.length === 0 && !keywordHit) {
    subjectType = "private_company";
  }

  return {
    subjectType,
    publicSectorDetected,
    publicSectorConfidence: confidence,
    publicSectorEvidence: uniqueEvidence,
    publicInstitutionEvidence:
      listMatch.matchedBy && listMatch.matchedBy !== "none"
        ? {
            matchedName: listMatch.matchedName,
            matchedType: listMatch.matchedType,
            matchedRegion: listMatch.matchedRegion,
            matchedBy: listMatch.matchedBy,
            evidenceText: listMatch.evidenceText,
            evidenceSource: listMatch.evidenceSource,
          }
        : undefined,
    detectedOrganizations: organizations.filter((org) => org.length >= 2),
    surveyPurposeTypes,
    possibleOnly,
  };
}

function hasFoundationNatureKeyword(text: string): boolean {
  return PUBLIC_FOUNDATION_NATURE.some((keyword) => text.includes(keyword));
}

function isLikelyPublicOrganization(name: string): boolean {
  if (PRIVATE_FOUNDATION_MARKERS.some((pattern) => pattern.test(name))) {
    return false;
  }
  if (KNOWN_PUBLIC_ORGANIZATIONS.some((pattern) => pattern.test(name))) {
    return true;
  }
  if (/\(재\)/.test(name)) return true;
  if (/재단법인/.test(name) && PUBLIC_FOUNDATION_NATURE.some((k) => name.includes(k))) {
    return true;
  }
  if (/[가-힣]{2,8}시(?:립)?(?:박물관|미술관|도서관)/.test(name)) {
    return true;
  }
  return STRONG_PUBLIC_KEYWORDS.some(
    (keyword) =>
      name.includes(keyword) &&
      !["공공", "센터", "위원회", "협의회", "연구원", "진흥원"].includes(keyword),
  );
}

export function isPublicSectorContext(
  result: Pick<PublicSectorDetectionResult, "publicSectorDetected" | "publicSectorConfidence">,
): boolean {
  return (
    result.publicSectorDetected &&
    (result.publicSectorConfidence === "high" || result.publicSectorConfidence === "medium")
  );
}
