import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import { classifyOutreachPriority } from "@/lib/report/adminOutreach";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import { buildCoreOperatorProblems } from "@/lib/reporting/buildCoreOperatorProblems";
import {
  buildAppliedLegalBasis,
  buildNoticeCheckEvidence,
} from "@/lib/reporting/buildDetailedEvidenceSummary";
import { CATEGORY_LABELS } from "@/lib/reporting/reportMessages";
import type { LegalBasisEntry, LegalBasisId } from "@/lib/reporting/legalBasisRegistry";
import type { ScanReport } from "@/lib/types/scan";
import {
  GENERIC_OPERATOR_LABELS,
  displayInstitutionName,
  institutionEvidenceFromReportJson,
} from "@/lib/report/publicInstitutionColumns";

export type OfficialLetterRow = string[];

export interface OfficialLetterModel {
  surveyTitle: string;
  operatorName: string;
  operatorOverview: string;
  docNumber: string;
  diagnosedAtKo: string;
  riskCover: string;
  riskOverview: string;
  surveyUrl: string;
  toolName: string;
  diagnosisMethod: string;
  personalItems: string;
  sensitiveItems: string;
  highRiskItems: string;
  cautionBody: string;
  noticeRows: OfficialLetterRow[];
  questionRows: OfficialLetterRow[];
  legalRows: OfficialLetterRow[];
  evidenceCapture: string;
  evidenceKeep: string;
  priorityLabel: string;
  whyIntro: string;
  whyItems: string[];
  recItems: string[];
}

const DIRECT_CODES = new Set([
  "name",
  "phone",
  "email",
  "address",
  "birthdate",
]);
const QUASI_CODES = new Set([
  "gender",
  "respondent_age",
  "age_range",
  "child_age_range",
  "residence_area",
  "affiliation",
  "organization_identifier",
  "department",
  "position",
  "tenure",
  "quasi_identifier",
]);
const MINOR_TITLE_RE =
  /미성년|청소년|초등|중학|고등|어린이|아동|유아|키즈|오케스트라|아이수크림|학생/;
const MINOR_QUESTION_RE =
  /미성년|청소년|초등|중학|어린이|아동|유아|만\s*\d+\s*세|법정대리인|친권자/;

const GU_CITY: Record<string, string> = {
  종로구: "서울특별시 종로구",
  광주북구: "광주광역시 북구",
};

const TITLE_ORG_ALIASES: Array<[RegExp, string]> = [
  [/한국수력원자력|한수원/, "한국수력원자력"],
  [/\bETRI\b|한국전자통신연구원/, "한국전자통신연구원"],
  [/남악청소년문화의집/, "남악청소년문화의집"],
];

const METRO_PREFIX: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
};

const NOTICE_ITEMS: Array<{
  item: string;
  key:
    | "purpose"
    | "items"
    | "retention"
    | "destruction"
    | "contact"
    | "refusal"
    | "trustee"
    | "overseas"
    | "raw_access"
    | "sensitive";
}> = [
  { item: "개인정보 수집 목적 안내", key: "purpose" },
  { item: "수집하는 개인정보 항목 안내", key: "items" },
  { item: "개인정보 보유기간 안내", key: "retention" },
  { item: "개인정보 파기 기준 안내", key: "destruction" },
  { item: "담당부서 및 문의처 안내", key: "contact" },
  { item: "동의 거부 권리 및 불이익 안내", key: "refusal" },
  { item: "외부 업체 위탁·처리 기준 안내", key: "trustee" },
  { item: "국외 서버 보관·이전 안내", key: "overseas" },
  { item: "수집 자료 접근권한 관리 안내", key: "raw_access" },
  { item: "민감정보 별도 동의 안내", key: "sensitive" },
];

const LEGAL_LETTER_WHY: Partial<Record<LegalBasisId, string>> = {
  PIPA_ART_15:
    "개인정보 수집·이용 목적, 수집 항목, 보유기간, 동의 거부권 등에 대한 안내 확인이 필요함",
  PIPA_ART_16: "목적에 필요한 범위에서 최소 수집 원칙 준수 여부 확인이 필요함",
  PIPA_ART_21: "설문 목적을 달성한 개인정보의 구체적 파기 시점·방법 확인이 필요함",
  PIPA_ART_22: "동의 내용이 명확히 구분되어 안내되었는지 확인이 필요함",
  PIPA_ART_23: "민감정보 처리 제한 및 별도 동의 확인이 필요함",
  PIPA_ART_24: "고유식별정보 처리 제한과 안전조치 확인이 필요함",
  PIPA_ART_26: "외부 업체에 위탁하여 처리하는 경우 관련 안내 및 관리 확인이 필요함",
  PIPA_ART_28_8: "개인정보를 국외로 이전하는 경우 관련 안내 확인이 필요함",
  PIPA_ART_29: "개인정보의 안전성 확보조치 확인이 필요함",
  CSAP_PUBLIC_CLOUD:
    "공공부문에서 클라우드 서비스를 이용할 때의 보안 기준 확인이 필요함",
  MOIS_PUBLIC_CLOUD_NOTICE:
    "공공기관의 클라우드 이용 시 보안 적정성 확인이 필요함",
  NIS_SECURITY_REVIEW:
    "공공기관 정보시스템 또는 클라우드 이용 시 보안성 검토가 필요함",
  ISMS_P: "개인정보 관리체계(ISMS-P 등) 운영 여부 확인이 필요함",
  INTERNAL_ACCESS_CONTROL:
    "원자료 열람·다운로드·파기 담당 등 내부 접근권한 관리 확인이 필요함",
};

const LEGAL_LETTER_LABEL: Record<LegalBasisId, string> = {
  PIPA_ART_15: "「개인정보 보호법」 제15조",
  PIPA_ART_16: "「개인정보 보호법」 제16조",
  PIPA_ART_21: "「개인정보 보호법」 제21조",
  PIPA_ART_22: "「개인정보 보호법」 제22조",
  PIPA_ART_23: "「개인정보 보호법」 제23조",
  PIPA_ART_24: "「개인정보 보호법」 제24조",
  PIPA_ART_26: "「개인정보 보호법」 제26조",
  PIPA_ART_28_8: "「개인정보 보호법」 제28조의8",
  PIPA_ART_29: "「개인정보 보호법」 제29조",
  CSAP_PUBLIC_CLOUD: "「클라우드컴퓨팅법」 / CSAP",
  MOIS_PUBLIC_CLOUD_NOTICE: "「행정·공공기관 클라우드 이용 기준」",
  NIS_SECURITY_REVIEW: "국가정보원 보안성 검토 기준",
  ISMS_P: "ISMS-P 관리체계",
  INTERNAL_ACCESS_CONTROL: "내부 관리계획 / 접근권한 관리",
};

function isScanReport(value: unknown): value is ScanReport {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const form = row.form as Record<string, unknown> | undefined;
  return (
    typeof row.scanId === "string" &&
    Boolean(form) &&
    typeof form === "object" &&
    Array.isArray(form.questions)
  );
}

export function officialLetterDocNumber(caseId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < caseId.length; i += 1) {
    hash ^= caseId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const n = ((hash >>> 0) % 9000) + 1;
  return `SURE26-${String(n).padStart(4, "0")}`;
}

export function formatKoDate(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (day) {
    return `${Number(day[1])}년 ${Number(day[2])}월 ${Number(day[3])}일`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const kst = new Date(parsed.getTime() + 9 * 60 * 60 * 1000);
    return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
  }
  return "진단일자 미확인";
}

function objectParticle(word: string): "을" | "를" {
  const last = Array.from(word.replace(/[)\]"'」》]/g, "")).at(-1) || "";
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 === 0 ? "를" : "을";
  }
  return "를";
}

export function isLetterGenericOperator(name: string | null | undefined): boolean {
  const t = (name || "").trim();
  if (!t) return true;
  if (GENERIC_OPERATOR_LABELS.has(t)) return true;
  if (/확인\s*불가|주체 확인/.test(t)) return true;
  return false;
}

export function institutionFromTitle(title: string | null | undefined): string | null {
  const t = String(title || "").trim();
  if (!t) return null;
  for (const [pattern, name] of TITLE_ORG_ALIASES) {
    if (pattern.test(t)) return name;
  }
  const metro = t.match(
    /(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|제주특별자치도)(?:\s*([가-힣]+(?:시|군|구)))?/,
  );
  if (metro) return [metro[1], metro[2]].filter(Boolean).join(" ");
  const bracket = t.match(/\[([가-힣]+(?:특별시|광역시|특별자치시|도|시|군|구)|[가-힣]{2,8}구)\]/);
  if (bracket?.[1]) {
    const token = bracket[1];
    if (GU_CITY[token]) return GU_CITY[token];
    const glued = token.match(/^(서울|부산|대구|인천|광주|대전|울산)(.+구)$/);
    if (glued) return `${METRO_PREFIX[glued[1]]} ${glued[2]}`;
  }
  const yearGu = t.match(/20\d{2}\s+([가-힣]{2,6}구)/);
  if (yearGu?.[1] && GU_CITY[yearGu[1]]) return GU_CITY[yearGu[1]];
  const house = t.match(/([가-힣]{2,12}(?:문화의집|주민센터|구청|시청|교육청))/);
  if (house?.[1]) return house[1];
  return null;
}

function letterOperator(detail: AdminCaseDetail): {
  name: string;
  overview: string;
  specific: boolean;
} {
  const evidence = institutionEvidenceFromReportJson(detail.reportJson);
  const fromData = displayInstitutionName(
    evidence.matchedName,
    detail.summary.operatorName,
  );
  if (!isLetterGenericOperator(fromData)) {
    return {
      name: fromData,
      overview: `${fromData} (설문 제목·고지문 내 명칭 확인)`,
      specific: true,
    };
  }
  const fromTitle = institutionFromTitle(detail.summary.surveyTitle);
  if (fromTitle) {
    return {
      name: fromTitle,
      overview: `${fromTitle} (설문 제목에서 확인)`,
      specific: true,
    };
  }
  return {
    name: "미확인",
    overview: "미확인 (화면에서 기관명 미확인)",
    specific: false,
  };
}

export function letterToolName(platform: string | null | undefined): string {
  switch (platform) {
    case "google_forms":
      return "Google Forms (구글 설문지)";
    case "naver_forms":
      return "네이버폼";
    case "moaform":
      return "모아폼";
    case "wiseon_csap":
      return "와이즈온(CSAP)";
    default:
      return "자체 홈페이지 또는 기타";
  }
}

export function isLetterConsentQuestion(label: string | null | undefined): boolean {
  const t = String(label || "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    t.length >= 40 &&
    /개인정보 수집·이용 동의|개인정보제공 및 초상권|수집·이용 목적:|보유·이용 기간:/.test(t)
  ) {
    return true;
  }
  return t.length >= 80 && /개인정보 수집|동의 거부|보유·이용 기간/.test(t);
}

export function shortenLetterQuestionLabel(label: string | null | undefined): string {
  const t = String(label || "(문항)")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= 60) return t;
  return `${t.slice(0, 57)}...`;
}

export function sanitizeOfficialLetterTitle(title: string | null | undefined): string {
  return (title || "제목없음")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function letterRisk(level: string | null | undefined): {
  cover: string;
  overview: string;
} {
  switch (String(level || "").toLowerCase()) {
    case "critical":
      return { cover: "CRITICAL", overview: "CRITICAL (매우 높음)" };
    case "high":
      return { cover: "HIGH", overview: "HIGH (높음)" };
    case "medium":
      return { cover: "MEDIUM", overview: "MEDIUM (확인 필요)" };
    case "low":
      return { cover: "LOW", overview: "LOW (낮음)" };
    default:
      return { cover: "확인 필요", overview: "확인 필요" };
  }
}

function joinItems(items: string[], empty = "확인되지 않음"): string {
  const unique = [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(", ") : empty;
}

function noticeStatusLabel(status: "posted" | "missing" | "na"): string {
  if (status === "posted") return "게시됨";
  if (status === "na") return "해당 없음";
  return "게시되지 않음(확인 불가)";
}

function asRecommendation(action: string): string {
  const text = action.trim();
  if (/주시기 바랍니다\.?$/.test(text)) {
    return text.replace(/\.?$/, ".");
  }
  if (/하세요\.?$/.test(text)) {
    return text.replace(/하세요\.?$/, "하여 주시기 바랍니다.");
  }
  return `${text.replace(/\.?$/, "")}하여 주시기 바랍니다.`;
}

function infoTypeLabel(question: AdminCaseDetail["questions"][number]): string {
  if (question.hasHighRiskInfo) return "고유식별정보";
  if (question.hasSensitiveInfo) return "민감정보";
  const codes = question.categories.map((item) => item.categoryCode);
  const hasDirect = codes.some((code) => DIRECT_CODES.has(code));
  const hasQuasi = codes.some((code) => QUASI_CODES.has(code));
  if (hasQuasi && !hasDirect) return "준식별정보";
  if (question.hasPersonalInfo || hasDirect) return "직접식별정보";
  return "기타";
}

function collectedLabel(question: AdminCaseDetail["questions"][number]): string {
  const labels = question.categories
    .map((item) => item.categoryLabel || CATEGORY_LABELS[item.categoryCode as keyof typeof CATEGORY_LABELS] || "")
    .filter(Boolean);
  return joinItems(labels, "확인 필요");
}

function looksLikeMinor(detail: AdminCaseDetail): boolean {
  if (MINOR_TITLE_RE.test(detail.summary.surveyTitle || "")) return true;
  return detail.questions.some((q) => MINOR_QUESTION_RE.test(q.questionLabel || ""));
}

function legalLetterLabel(entry: LegalBasisEntry): string {
  return LEGAL_LETTER_LABEL[entry.id] || entry.label;
}

function legalLetterWhy(entry: LegalBasisEntry): string {
  return (
    LEGAL_LETTER_WHY[entry.id] ||
    `${entry.description.replace(/입니다\.?$/, "").trim()} 확인이 필요함`
  );
}

export function buildOfficialLetterModel(
  detail: AdminCaseDetail,
): OfficialLetterModel {
  const s = detail.summary;
  const risk = letterRisk(s.overallRiskLevel);
  const operator = letterOperator(detail);
  const operatorName = operator.name;
  const toolName = letterToolName(s.platform);
  const toolParticle = objectParticle(toolName);
  const diagnosedAtKo = formatKoDate(s.observedDateKst || s.observedAt);
  const surveyTitle = s.surveyTitle || "제목 없음";
  const piiQuestions = detail.questions.filter(
    (q) =>
      (q.hasPersonalInfo || q.hasSensitiveInfo || q.hasHighRiskInfo) &&
      !isLetterConsentQuestion(q.questionLabel),
  );
  const personalItems = joinItems(
    piiQuestions
      .filter((q) => q.hasPersonalInfo && !q.hasSensitiveInfo && !q.hasHighRiskInfo)
      .flatMap((q) => q.categories.map((c) => c.categoryLabel))
      .filter(Boolean),
  );
  const sensitiveItems = joinItems(
    piiQuestions
      .filter((q) => q.hasSensitiveInfo)
      .flatMap((q) => q.categories.map((c) => c.categoryLabel))
      .filter(Boolean),
  );
  const highRiskItems = joinItems(
    piiQuestions
      .filter((q) => q.hasHighRiskInfo)
      .flatMap((q) => q.categories.map((c) => c.categoryLabel))
      .filter(Boolean),
  );

  const shots = detail.evidenceFiles.filter((f) => /screenshot/i.test(f.evidenceType));
  const shotCount = shots.length || s.screenshotFileIds.length;
  const keepCount = Math.max(detail.evidenceFiles.length, shotCount, s.evidenceCount, 1);

  const priority = classifyOutreachPriority({
    publicPrivateType: s.publicPrivateType,
    hasPersonalInfo: s.hasPersonalInfo,
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    overallRiskLevel: s.overallRiskLevel,
    userDecisionLabel: s.userDecisionLabel,
    evidenceCount: s.evidenceCount,
  });
  const priorityLabel =
    priority === "A"
      ? "A (최우선 확인 권장)"
      : priority === "B"
        ? "B (확인 권장)"
        : "C (참고)";

  const cautionBody = looksLikeMinor(detail)
    ? "응답자 중 미성년자·청소년이 포함될 수 있는 것으로 확인되었습니다. 미성년자의 개인정보는 법상 민감정보로 분류되지는 않으나, 처리 전 과정에서 보호자 동의 확인 등 각별한 보호조치가 필요할 수 있습니다."
    : "이번 진단에서 별도로 안내할 보호대상 유의사항은 확인되지 않았습니다.";

  let noticeByKey = new Map<
    string,
    { status: "posted" | "missing" | "na"; note: string }
  >();
  let whyItems: string[] = [];
  let recItems: string[] = [];
  let legalRows: OfficialLetterRow[] = [];
  let whyIntro = operator.specific
    ? `이 설문은 ${operatorName}에서 운영하는 것으로 확인되며, ${toolName}${toolParticle} 통해 개인정보를 수집하고 있습니다. 아래는 자동진단에서 확인이 필요한 사항입니다.`
    : `이 설문은 공공기관에서 운영하는 것으로 분류되며, 화면에서 구체적인 기관명은 확인되지 않았습니다. ${toolName}${toolParticle} 통해 개인정보를 수집하고 있습니다. 아래는 자동진단에서 확인이 필요한 사항입니다.`;

  if (isScanReport(detail.reportJson)) {
    const report = detail.reportJson;
    const audience = composeAudienceReport(report);
    const summary = audience.collectedDataSummary;
    const core = buildCoreOperatorProblems(report, summary);
    const privacyType = audience.privacyAssessment?.type || "limited";
    const notice = buildNoticeCheckEvidence(report, privacyType, summary);
    const legal = buildAppliedLegalBasis(report, summary, privacyType);
    const corpusByItem = new Map(
      notice.allRows.map((row) => [row.item, row] as const),
    );
    const mapNotice = (
      corpusName: string,
      fallback: { status: "posted" | "missing" | "na"; note: string },
    ) => {
      const row = corpusByItem.get(corpusName);
      if (!row) return fallback;
      if (row.status === "not_applicable") {
        return { status: "na" as const, note: fallback.note };
      }
      if (row.status === "confirmed") {
        return { status: "posted" as const, note: "" };
      }
      return { status: "missing" as const, note: fallback.note };
    };

    const hasSensitive = s.hasSensitiveInfo || summary.sensitiveItems.length > 0;
    const external =
      report.platform === "google_forms" ||
      report.platform === "naver_forms" ||
      report.platform === "moaform";
    const overseas = report.platform === "google_forms";

    noticeByKey = new Map([
      ["purpose", mapNotice("수집 목적", { status: "missing", note: "" })],
      ["items", mapNotice("수집 항목", { status: "missing", note: "" })],
      ["retention", mapNotice("보유기간", { status: "missing", note: "" })],
      ["destruction", mapNotice("파기 기준", { status: "missing", note: "" })],
      ["contact", mapNotice("담당부서/문의처", { status: "missing", note: "화면상 확인 불가" })],
      [
        "refusal",
        mapNotice("동의 거부권 및 불이익", { status: "missing", note: "" }),
      ],
      [
        "trustee",
        external
          ? mapNotice("위탁/외부도구 처리 기준", {
              status: "missing",
              note: "위탁 여부 자체가 불분명함",
            })
          : { status: "na", note: "외부 설문도구 미사용" },
      ],
      [
        "overseas",
        overseas
          ? mapNotice("국외 보관·이전 안내", {
              status: "missing",
              note: "Google Forms 사용에 따른 확인 필요",
            })
          : { status: "na", note: "국외 이전 도구 미사용" },
      ],
      [
        "raw_access",
        mapNotice("원자료 접근권한", {
          status: "missing",
          note: "화면상 확인 불가",
        }),
      ],
      [
        "sensitive",
        hasSensitive
          ? mapNotice("민감정보 별도 동의", { status: "missing", note: "" })
          : {
              status: "na",
              note: "민감정보 미확인으로 해당사항 없음",
            },
      ],
    ]);

    whyItems = core.problems.slice(0, 7).map((item) => item.why);
    recItems = core.problems.slice(0, 6).map((item) => asRecommendation(item.action));
    legalRows = legal
      .slice(0, 12)
      .map((entry) => [legalLetterLabel(entry), legalLetterWhy(entry)]);
    if (looksLikeMinor(detail)) {
      whyIntro = operator.specific
        ? `이 설문은 ${operatorName}에서 운영하는 것으로 확인되며, ${toolName}${toolParticle} 통해 개인정보를 수집하고 있습니다. 응답자에 미성년자·청소년이 포함될 수 있어 각별한 주의가 필요합니다.`
        : `이 설문은 공공기관에서 운영하는 것으로 분류되며, ${toolName}${toolParticle} 통해 개인정보를 수집하고 있습니다. 응답자에 미성년자·청소년이 포함될 수 있어 각별한 주의가 필요합니다.`;
    }
  } else {
    const byItem = new Map(
      detail.complianceChecks.map((row) => [row.checkItem, row] as const),
    );
    const fromCheck = (
      names: string[],
      fallback: { status: "posted" | "missing" | "na"; note: string },
    ) => {
      const row = names
        .map((name) => byItem.get(name))
        .find(Boolean);
      if (!row) return fallback;
      if (row.statusLabel === "해당 없음" || row.status === "not_applicable") {
        return { status: "na" as const, note: row.evidenceNote || fallback.note };
      }
      if (row.statusLabel === "확인됨" || row.status === "confirmed") {
        return { status: "posted" as const, note: "" };
      }
      return {
        status: "missing" as const,
        note: row.evidenceNote || fallback.note,
      };
    };
    noticeByKey = new Map([
      ["purpose", fromCheck(["수집 목적"], { status: "missing", note: "" })],
      ["items", fromCheck(["수집 항목"], { status: "missing", note: "" })],
      ["retention", fromCheck(["보유기간"], { status: "missing", note: "" })],
      ["destruction", fromCheck(["파기 기준"], { status: "missing", note: "" })],
      ["contact", fromCheck(["담당부서/문의처"], { status: "missing", note: "" })],
      [
        "refusal",
        fromCheck(["동의 거부권 및 불이익"], { status: "missing", note: "" }),
      ],
      [
        "trustee",
        fromCheck(["위탁/외부도구 처리 기준"], {
          status: "missing",
          note: "위탁 여부 자체가 불분명함",
        }),
      ],
      [
        "overseas",
        s.platform === "google_forms"
          ? fromCheck(["국외 보관·이전 안내"], {
              status: "missing",
              note: "Google Forms 사용에 따른 확인 필요",
            })
          : { status: "na", note: "국외 이전 도구 미사용" },
      ],
      [
        "raw_access",
        fromCheck(["원자료 접근권한"], {
          status: "missing",
          note: "화면상 확인 불가",
        }),
      ],
      [
        "sensitive",
        s.hasSensitiveInfo
          ? fromCheck(["민감정보 별도 동의"], { status: "missing", note: "" })
          : { status: "na", note: "민감정보 미확인으로 해당사항 없음" },
      ],
    ]);
    whyItems = detail.findings.slice(0, 7).map((item) => item.description || item.title);
    recItems = detail.findings
      .slice(0, 6)
      .map((item) => asRecommendation(item.recommendation || item.title));
    legalRows = detail.findings
      .flatMap((item) => item.legalBasisCodes)
      .filter((code, i, arr) => arr.indexOf(code) === i)
      .slice(0, 12)
      .map((code) => [
        LEGAL_LETTER_LABEL[code as LegalBasisId] || code,
        "관련 기준 확인이 필요함",
      ]);
  }

  if (whyItems.length === 0) {
    whyItems = [
      "설문 화면에서 확인된 개인정보 수집·고지 사항을 기준으로 운영 보완 여부를 검토할 필요가 있습니다.",
    ];
  }
  if (recItems.length === 0) {
    recItems = [
      "설문 화면에 개인정보 수집 목적, 항목, 보유기간, 파기 기준, 담당부서 안내를 명확히 표시하여 주시기 바랍니다.",
    ];
  }
  if (legalRows.length === 0) {
    legalRows = [
      [
        "「개인정보 보호법」 제15조",
        "개인정보 수집·이용 목적, 수집 항목, 보유기간, 동의 거부권 등에 대한 안내 확인이 필요함",
      ],
    ];
  }

  const noticeRows = NOTICE_ITEMS.map((spec) => {
    const mapped = noticeByKey.get(spec.key) || {
      status: "missing" as const,
      note: "",
    };
    return [spec.item, noticeStatusLabel(mapped.status), mapped.note];
  });

  const questionRows =
    piiQuestions.length > 0
      ? piiQuestions.slice(0, 40).map((q, index) => [
          q.questionNumber || `Q${index + 1}`,
          shortenLetterQuestionLabel(q.questionLabel),
          collectedLabel(q),
          infoTypeLabel(q),
        ])
      : [["—", "확인된 개인정보 문항 없음", "—", "—"]];

  return {
    surveyTitle,
    operatorName,
    operatorOverview: operator.overview,
    docNumber: officialLetterDocNumber(detail.id),
    diagnosedAtKo,
    riskCover: risk.cover,
    riskOverview: risk.overview,
    surveyUrl: s.surveyUrl || s.finalUrl || "(파일 진단)",
    toolName,
    diagnosisMethod: s.surveyUrl
      ? "설문 화면에 실제 접속하여 확인"
      : "파일 진단",
    personalItems,
    sensitiveItems,
    highRiskItems,
    cautionBody,
    noticeRows,
    questionRows,
    legalRows,
    evidenceCapture:
      shotCount > 0
        ? `${shotCount}개 (설문 화면 캡처)`
        : "화면 캡처 없음",
    evidenceKeep: `개정원에서 ${keepCount}건 보관 중이며, 요청 시 제공 가능`,
    priorityLabel,
    whyIntro,
    whyItems,
    recItems,
  };
}
