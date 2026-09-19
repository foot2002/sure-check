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
const MINOR_RE =
  /미성년|청소년|초등|중학|고등|어린이|아동|보호자|만\s*\d+\s*세/;

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
      return "자체 구축 또는 기타";
  }
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
  const blob = [
    detail.summary.surveyTitle || "",
    ...detail.questions.map((q) => q.questionLabel),
  ].join(" ");
  return MINOR_RE.test(blob);
}

function legalLetterLabel(entry: LegalBasisEntry): string {
  return LEGAL_LETTER_LABEL[entry.id] || entry.label;
}

function legalLetterWhy(entry: LegalBasisEntry): string {
  const base = entry.description.replace(/입니다\.?$/, "").trim();
  return `${base} 확인이 필요함`;
}

export function buildOfficialLetterModel(
  detail: AdminCaseDetail,
): OfficialLetterModel {
  const s = detail.summary;
  const risk = letterRisk(s.overallRiskLevel);
  const operatorName = s.operatorName || "미확인";
  const toolName = letterToolName(s.platform);
  const diagnosedAtKo = formatKoDate(s.observedDateKst || s.observedAt);
  const surveyTitle = s.surveyTitle || "제목 없음";
  const piiQuestions = detail.questions.filter(
    (q) => q.hasPersonalInfo || q.hasSensitiveInfo || q.hasHighRiskInfo,
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
  let whyIntro = `이 설문은 ${operatorName}에서 운영하는 것으로 확인되며, ${toolName}을 통해 개인정보를 수집하고 있습니다. 아래는 자동진단에서 확인이 필요한 사항입니다.`;

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
        return { status: "na" as const, note: row.evidence || fallback.note };
      }
      if (row.status === "confirmed") {
        return { status: "posted" as const, note: "" };
      }
      return { status: "missing" as const, note: row.evidence || fallback.note };
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
      ["contact", mapNotice("담당부서/문의처", { status: "missing", note: "" })],
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
      whyIntro = `이 설문은 ${operatorName}에서 운영하는 것으로 확인되며, ${toolName}을 통해 개인정보를 수집하고 있습니다. 응답자에 미성년자·청소년이 포함될 수 있어 각별한 주의가 필요합니다.`;
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
          q.questionLabel || "(문항)",
          collectedLabel(q),
          infoTypeLabel(q),
        ])
      : [["—", "확인된 개인정보 문항 없음", "—", "—"]];

  return {
    surveyTitle,
    operatorName,
    operatorOverview: s.operatorName
      ? `${s.operatorName} (설문 제목·고지문 내 명칭 확인)`
      : "미확인",
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
