import type { DetectedCategory, NormalizedQuestion, ScanReport } from "@/lib/types/scan";
import { getDetectedCategoryDisplayLabel } from "@/lib/extractors/htmlTextUtils";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import {
  buildCoreOperatorProblems,
  type CoreOperatorProblem,
} from "@/lib/reporting/buildCoreOperatorProblems";
import {
  LEGAL_BASIS_REGISTRY,
  type LegalBasisEntry,
  type LegalBasisId,
} from "@/lib/reporting/legalBasisRegistry";
import { buildToolGovernanceSummary } from "@/lib/reporting/buildToolGovernanceSummary";
import { missingNoticeLabels, classifyPrivacyDataType } from "@/lib/reporting/respondentDecision";
import type { PrivacyDataType } from "@/lib/reporting/reportMessages";
import type { ToolGovernanceSummary } from "@/lib/reporting/verdictTypes";
import { classifySurveySubject } from "@/lib/reporting/safetyType";

export type FilePreDeployVerdict =
  | "deploy_blocked"
  | "revise_required"
  | "improve_then_deploy"
  | "low_risk";

export interface FileLegalIssue {
  id: string;
  severityLabel: string;
  title: string;
  why: string;
  action: string;
  basis: LegalBasisEntry[];
}

export interface FileNoticeGap {
  id: string;
  title: string;
  detail: string;
}

export interface FileQuestionRevision {
  questionId: string;
  page: number;
  originalLabel: string;
  riskLevel: "personal" | "sensitive" | "high_risk" | "quasi" | "none";
  categories: string[];
  issue: string;
  suggestion: string;
}

export interface FileToolOption {
  id: string;
  tier: "avoid" | "conditional" | "recommended";
  title: string;
  detail: string;
}

export interface FilePreDeployReportModel {
  fileName: string;
  verdict: FilePreDeployVerdict;
  verdictTitle: string;
  verdictSummary: string;
  privacyType: PrivacyDataType;
  privacyTypeLabel: string;
  legalIssues: FileLegalIssue[];
  appliedLaws: LegalBasisEntry[];
  noticeGaps: FileNoticeGap[];
  consentGaps: FileNoticeGap[];
  noticeDraft: string;
  consentDraft: string;
  questionRevisions: FileQuestionRevision[];
  questionSummary: string;
  toolGovernance: ToolGovernanceSummary;
  toolOptions: FileToolOption[];
  overallChecklist: string[];
}

const PRIVACY_TYPE_LABEL: Record<PrivacyDataType, string> = {
  minimal: "개인정보 거의 없음",
  limited: "개인정보 제한적",
  quasi_only: "준식별정보 중심",
  direct_identifier: "직접식별정보 포함",
  sensitive_or_high_risk: "민감·고위험정보 포함",
};

const SENSITIVE = new Set<DetectedCategory>([
  "sensitive_health",
  "sensitive_belief_union",
  "sensitive_complaint",
  "sensitive_political",
  "sensitive_religion",
]);

const HIGH_RISK = new Set<DetectedCategory>([
  "unique_identifier",
  "financial",
  "resident_registration_number",
  "passport_number",
  "driver_license_number",
]);

const DIRECT = new Set<DetectedCategory>([
  "name",
  "phone",
  "email",
  "address",
  "birthdate",
]);

const QUASI = new Set<DetectedCategory>([
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

function uniqueBasis(ids: LegalBasisId[]): LegalBasisEntry[] {
  const seen = new Set<LegalBasisId>();
  const out: LegalBasisEntry[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(LEGAL_BASIS_REGISTRY[id]);
  }
  return out;
}

function mapProblem(problem: CoreOperatorProblem): FileLegalIssue {
  return {
    id: problem.id,
    severityLabel: problem.severityLabel,
    title: problem.title,
    why: problem.why,
    action: problem.action,
    basis: uniqueBasis(problem.basisIds),
  };
}

function noticeCorpus(report: ScanReport): string {
  const n = report.form.notices;
  if (!n) return "";
  return [
    n.privacyNotice,
    n.consentText,
    n.purpose,
    n.items,
    n.retention,
    n.destruction,
    n.refusalRight,
    n.refusalDisadvantage,
    n.processor,
    n.trustee,
    n.trusteeTask,
    n.overseasTransfer,
    n.sensitiveConsent,
    n.rawDataScope,
    n.contactDepartment,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildNoticeGaps(report: ScanReport, privacyType: PrivacyDataType): FileNoticeGap[] {
  if (privacyType === "minimal") return [];
  const missing = missingNoticeLabels(report);
  const gaps: FileNoticeGap[] = missing.map((label, i) => ({
    id: `notice_missing_${i}`,
    title: `${label} 누락`,
    detail: `고지문에서 「${label}」 관련 안내가 확인되지 않았습니다.`,
  }));

  const corpus = noticeCorpus(report);
  if (!report.form.hasPrivacyNotice && !corpus.trim()) {
    gaps.unshift({
      id: "notice_absent",
      title: "개인정보 수집·이용 고지문 없음",
      detail:
        "업로드 파일에서 개인정보 수집·이용 고지문을 확인하지 못했습니다. 배포 전 고지문을 설문 앞부분에 추가하세요.",
    });
  }
  return gaps;
}

function buildConsentGaps(report: ScanReport, privacyType: PrivacyDataType): FileNoticeGap[] {
  if (privacyType === "minimal" || privacyType === "limited") return [];
  const gaps: FileNoticeGap[] = [];
  const hasConsentQuestion = report.form.questions.some((q) =>
    (q.riskTags ?? []).includes("privacy_consent"),
  );
  if (
    !report.form.hasConsent &&
    !report.form.notices?.consentText &&
    !hasConsentQuestion
  ) {
    gaps.push({
      id: "consent_absent",
      title: "동의 확인 절차 부족",
      detail:
        "동의 문구 또는 동의함/동의하지 않음 선택 문항이 확인되지 않았습니다. 개인정보보호법 제22조에 따라 명확한 동의를 받으세요.",
    });
  }
  if (privacyType === "sensitive_or_high_risk") {
    const corpus = noticeCorpus(report);
    if (!/민감|별도\s*동의|고유식별/i.test(corpus)) {
      gaps.push({
        id: "sensitive_consent",
        title: "민감·고위험정보 별도 동의 안내 부족",
        detail:
          "민감정보·고유식별정보가 포함되는 경우 일반 동의와 구분된 별도 동의 안내가 필요합니다.",
      });
    }
  }
  return gaps;
}

function collectedItemsLine(report: ScanReport): string {
  const labels = new Set<string>();
  for (const q of report.form.questions) {
    for (const cat of q.detectedCategories ?? []) {
      if (
        DIRECT.has(cat) ||
        SENSITIVE.has(cat) ||
        HIGH_RISK.has(cat) ||
        QUASI.has(cat)
      ) {
        labels.add(getDetectedCategoryDisplayLabel(cat));
      }
    }
  }
  const list = [...labels];
  if (list.length === 0) return "설문 목적 달성에 필요한 최소 항목";
  return list.slice(0, 12).join(", ");
}

function buildNoticeDraft(report: ScanReport, privacyType: PrivacyDataType): string {
  if (privacyType === "minimal") {
    return [
      "[개인정보 미수집 안내]",
      "본 설문은 개인을 식별할 수 있는 정보를 수집하지 않습니다.",
      "자유의견란에 이름, 연락처, 소속 등 개인정보를 기재하지 말아 주세요.",
    ].join("\n");
  }

  const notices = report.form.notices;
  const org =
    report.debug?.publicInstitutionEvidence?.matchedName ||
    notices?.processor ||
    notices?.contactDepartment ||
    "○○기관(또는 조사 주관 부서)";
  const purpose =
    notices?.purpose?.trim() || "설문조사 목적 달성 및 결과 분석";
  const retention =
    notices?.retention?.trim() ||
    "조사 종료 후 ○○일(또는 ○○년)까지 보관 후 파기";
  const items = collectedItemsLine(report);
  const contact =
    notices?.contactDepartment?.trim() ||
    notices?.processor?.trim() ||
    "담당부서: ○○팀 / 문의: ○○○-○○○○";

  const lines = [
    "[개인정보 수집·이용 고지문(초안)]",
    "",
    `1. 개인정보처리자: ${org}`,
    `2. 수집·이용 목적: ${purpose}`,
    `3. 수집 항목: ${items}`,
    `4. 보유·이용 기간: ${retention}`,
    "5. 파기 방법: 전자파일은 복구 불가능한 방식으로 삭제, 출력물은 파쇄",
    "6. 동의 거부권: 귀하는 동의를 거부할 수 있으며, 거부 시 설문 참여(또는 경품 지급 등)가 제한될 수 있습니다.",
    `7. 문의처: ${contact}`,
  ];

  if (privacyType === "sensitive_or_high_risk") {
    lines.push(
      "8. 민감정보·고유식별정보: 해당 항목은 별도 동의를 받아 처리하며, 목적 외 이용하지 않습니다.",
    );
  }

  const subject = classifySurveySubject(report);
  if (
    subject === "public_agency" ||
    subject === "public_commissioned_private" ||
    subject === "school_local"
  ) {
    lines.push(
      "9. 처리 위탁: 설문 수집도구 운영사(수탁자)에게 응답 수집·저장이 위탁될 수 있으며, 위탁 업무와 수탁자를 안내합니다.",
    );
  }

  if (report.platform === "google_forms") {
    lines.push(
      "10. 국외 이전·보관: Google Forms 이용 시 해외 서버에 데이터가 저장될 수 있어 국외 이전 관련 안내를 포함합니다.",
    );
  }

  lines.push(
    "",
    "※ 본 문구는 자동 진단 초안이며, 기관 내부 개인정보처리방침·법률 검토 후 확정하세요.",
  );
  return lines.join("\n");
}

function buildConsentDraft(privacyType: PrivacyDataType): string {
  if (privacyType === "minimal" || privacyType === "limited") {
    return [
      "[참여 안내]",
      "본 설문 참여는 선택 사항입니다.",
      "응답 내용은 통계·분석 목적에만 사용됩니다.",
    ].join("\n");
  }

  const lines = [
    "[개인정보 수집·이용 동의]",
    "위 고지 내용을 확인하였으며, 개인정보 수집·이용에 동의합니다.",
    "",
    "□ 동의함",
    "□ 동의하지 않음",
  ];
  if (privacyType === "sensitive_or_high_risk") {
    lines.push(
      "",
      "[민감정보(또는 고유식별정보) 수집·이용 별도 동의]",
      "민감정보/고유식별정보 수집·이용에 별도로 동의합니다.",
      "",
      "□ 동의함",
      "□ 동의하지 않음",
    );
  }
  return lines.join("\n");
}

function classifyQuestionRisk(
  q: NormalizedQuestion,
): FileQuestionRevision["riskLevel"] {
  const cats = q.detectedCategories ?? [];
  if (cats.some((c) => HIGH_RISK.has(c))) return "high_risk";
  if (cats.some((c) => SENSITIVE.has(c))) return "sensitive";
  if (cats.some((c) => DIRECT.has(c)) || q.hasPersonalData) return "personal";
  if (cats.some((c) => QUASI.has(c))) return "quasi";
  return "none";
}

function suggestionForQuestion(
  q: NormalizedQuestion,
  risk: FileQuestionRevision["riskLevel"],
): { issue: string; suggestion: string } {
  const label = q.label.replace(/\s+/g, " ").trim();
  const cats = (q.detectedCategories ?? []).map((c) =>
    getDetectedCategoryDisplayLabel(c),
  );

  if (risk === "high_risk") {
    return {
      issue: `고위험 개인정보(${cats.join(", ") || "고유식별·금융 등"}) 수집 문항입니다.`,
      suggestion: `가능하면 삭제하세요. 불가피하면 수집 근거·별도 동의·암호화 저장을 명시하고, "${label.slice(0, 40)}"을 필수에서 제외하거나 마스킹/대체 식별자를 사용하세요.`,
    };
  }
  if (risk === "sensitive") {
    return {
      issue: `민감정보(${cats.join(", ")}) 관련 문항입니다.`,
      suggestion:
        "민감정보는 별도 동의가 필요합니다. 문항을 선택형·비식별 범주로 바꾸거나, 조사 목적과 무관하면 삭제하세요.",
    };
  }
  if (risk === "personal") {
    if (/이름|성명|연락처|전화|휴대폰|이메일|주소/i.test(label)) {
      return {
        issue: "직접식별정보 수집 문항입니다.",
        suggestion:
          "경품·회신 등 꼭 필요할 때만 분리 수집하고, 본 설문 분석용 문항과 분리하세요. 미필수·보유기간·파기 안내를 함께 제시하세요.",
      };
    }
    return {
      issue: `개인정보(${cats.join(", ") || "직접식별"})가 포함될 수 있는 문항입니다.`,
      suggestion:
        "조사 목적에 필요한 최소 항목만 남기고, 자유기술란에는 개인정보 기재 금지 안내를 추가하세요.",
    };
  }
  if (risk === "quasi") {
    return {
      issue: `준식별정보(${cats.join(", ")}) 문항입니다.`,
      suggestion:
        "세부 구간을 넓히거나(예: 정확한 나이 → 연령대) 조합으로 개인 식별이 되지 않게 문항 수를 최소화하세요.",
    };
  }
  return {
    issue: "개인정보 위험이 낮거나 확인되지 않은 문항입니다.",
    suggestion: "현재 문구를 유지하되, 자유의견에 개인정보를 쓰지 말라는 안내만 확인하세요.",
  };
}

function buildQuestionRevisions(report: ScanReport): FileQuestionRevision[] {
  const revisions: FileQuestionRevision[] = [];
  for (const q of report.form.questions) {
    const risk = classifyQuestionRisk(q);
    if (risk === "none") continue;
    const { issue, suggestion } = suggestionForQuestion(q, risk);
    revisions.push({
      questionId: q.id,
      page: (q.pageIndex ?? 0) + 1,
      originalLabel: q.label.replace(/\s+/g, " ").trim(),
      riskLevel: risk,
      categories: (q.detectedCategories ?? []).map((c) =>
        getDetectedCategoryDisplayLabel(c),
      ),
      issue,
      suggestion,
    });
  }
  return revisions;
}

function buildToolOptions(
  report: ScanReport,
  privacyType: PrivacyDataType,
  tool: ToolGovernanceSummary,
): FileToolOption[] {
  const isPublic = Boolean(report.debug?.publicSectorDetected);
  const options: FileToolOption[] = [];

  if (privacyType === "minimal" || privacyType === "limited") {
    options.push({
      id: "any_basic",
      tier: "recommended",
      title: "일반 설문도구(비인증 포함) 사용 가능",
      detail:
        "개인정보가 거의 없으면 Google Forms, 네이버폼, 모아폼 등 범용 도구도 참고 수준으로 사용 가능합니다. 다만 자유의견란 개인정보 유입은 막아 주세요.",
    });
    return options;
  }

  if (privacyType === "quasi_only") {
    options.push({
      id: "generic_ok",
      tier: "conditional",
      title: "범용 도구 조건부 사용",
      detail:
        "준식별정보만 있는 경우 범용 도구도 가능하나, 보유기간·파기·담당자 안내를 보완하세요.",
    });
    options.push({
      id: "managed",
      tier: "recommended",
      title: "기관 내부·관리형 설문 시스템 권장",
      detail: "접근권한과 파기 이력이 남는 내부 설문/업무 시스템을 우선 검토하세요.",
    });
    return options;
  }

  options.push({
    id: "avoid_uncertified",
    tier: "avoid",
    title: "비인증 범용 SaaS 단독 사용 지양",
    detail:
      "직접식별·민감정보를 비인증 외부 설문도구에만 맡기면 위탁·국외이전·접근통제 리스크가 커집니다.",
  });

  if (isPublic || tool.isCsapStronglyRecommended) {
    options.push({
      id: "csap",
      tier: "recommended",
      title: "CSAP 등 공공 클라우드 보안인증 도구",
      detail:
        tool.certificationRecommendation ||
        "공공부문은 CSAP 인증(또는 이에 준하는 보안성 검토)을 받은 수집도구를 사용하세요.",
    });
    options.push({
      id: "nis",
      tier: "recommended",
      title: "국정원 보안성 검토·내부 보안 기준 충족 환경",
      detail:
        "공공 정보시스템/클라우드 이용 기준과 보안성 검토 절차를 확인한 뒤 배포하세요.",
    });
  } else {
    options.push({
      id: "isms",
      tier: "recommended",
      title: "ISMS-P 또는 보안인증 수집도구",
      detail:
        tool.certificationRecommendation ||
        "민간은 ISMS-P 수행 환경·보안인증 설문도구·내부 수집 시스템을 우선하세요.",
    });
  }

  options.push({
    id: "split_collect",
    tier: "conditional",
    title: "설문 본문과 개인정보 분리 수집",
    detail:
      "의견 조사는 범용 도구, 경품용 연락처 등은 인증 도구나 별도 안심 수집 채널로 분리하는 방식을 권장합니다.",
  });

  return options;
}

function decideVerdict(
  privacyType: PrivacyDataType,
  legalIssues: FileLegalIssue[],
  noticeGaps: FileNoticeGap[],
  consentGaps: FileNoticeGap[],
  questionRevisions: FileQuestionRevision[],
): { verdict: FilePreDeployVerdict; title: string; summary: string } {
  const high = legalIssues.filter((i) => i.severityLabel === "위반 소지 큼").length;
  const hasSensitiveQ = questionRevisions.some(
    (q) => q.riskLevel === "sensitive" || q.riskLevel === "high_risk",
  );
  const noticeMissing = noticeGaps.length + consentGaps.length;

  if (high >= 2 || (hasSensitiveQ && noticeMissing >= 2)) {
    return {
      verdict: "deploy_blocked",
      title: "배포 전 보완 필수",
      summary:
        "개인정보·민감정보 이슈와 고지/동의 부족이 함께 확인됩니다. 현재 상태로 외부 배포하는 것은 권장하지 않습니다.",
    };
  }
  if (
    privacyType === "direct_identifier" ||
    privacyType === "sensitive_or_high_risk" ||
    high >= 1 ||
    noticeMissing >= 1
  ) {
    return {
      verdict: "revise_required",
      title: "수정 후 배포",
      summary:
        "개인정보 관련 문항 또는 고지·동의·수집도구 기준을 보완한 뒤 배포하세요.",
    };
  }
  if (privacyType === "quasi_only" || questionRevisions.length > 0) {
    return {
      verdict: "improve_then_deploy",
      title: "개선 권고 후 배포 가능",
      summary:
        "치명적 위반 소지는 낮지만, 문항 최소화와 안내문 보완을 권고합니다.",
    };
  }
  return {
    verdict: "low_risk",
    title: "낮은 위험 · 배포 가능",
    summary:
      "확인된 개인정보 위험이 낮습니다. 배포 후에도 자유의견란 개인정보 유입만 주기적으로 점검하세요.",
  };
}

export function isFileSourceReport(report: ScanReport): boolean {
  return report.form.metadata?.source?.kind === "file";
}

export function buildFilePreDeployReport(
  report: ScanReport,
): FilePreDeployReportModel {
  const audience = composeAudienceReport(report);
  const summary = audience.collectedDataSummary;
  const privacyType = classifyPrivacyDataType(report, summary);
  const core = buildCoreOperatorProblems(report, summary);
  const legalIssues = core.problems.map(mapProblem);
  const appliedLaws = uniqueBasis(
    core.problems.flatMap((p) => p.basisIds),
  );
  const noticeGaps = buildNoticeGaps(report, privacyType);
  const consentGaps = buildConsentGaps(report, privacyType);
  const questionRevisions = buildQuestionRevisions(report);
  const toolGovernance = buildToolGovernanceSummary(report, summary, privacyType);
  const toolOptions = buildToolOptions(report, privacyType, toolGovernance);
  const { verdict, title, summary: verdictSummary } = decideVerdict(
    privacyType,
    legalIssues,
    noticeGaps,
    consentGaps,
    questionRevisions,
  );

  const personalCount = questionRevisions.filter((q) =>
    ["personal", "sensitive", "high_risk"].includes(q.riskLevel),
  ).length;

  const overallChecklist: string[] = [];
  if (noticeGaps.length > 0) {
    overallChecklist.push("고지문 필수 항목을 보완하고 아래 초안을 기관 문구에 맞게 확정하세요.");
  } else {
    overallChecklist.push("고지문 핵심 항목이 확인되었습니다. 배포본과 문구 일치 여부를 한 번 더 확인하세요.");
  }
  if (consentGaps.length > 0) {
    overallChecklist.push("동의(및 민감정보 별도 동의) 확인 UI·문구를 설문 앞부분에 배치하세요.");
  }
  if (personalCount > 0) {
    overallChecklist.push(
      `개인·민감정보 관련 문항 ${personalCount}개를 검토하고 수정안을 반영하세요.`,
    );
  }
  overallChecklist.push(toolOptions[0]?.detail ?? toolGovernance.body);
  if (verdict === "deploy_blocked" || verdict === "revise_required") {
    overallChecklist.push("수정 완료 후 동일 파일로 재진단하여 종합 판단이 완화되는지 확인하세요.");
  }

  return {
    fileName: report.form.metadata?.source?.fileName || "업로드 설문 파일",
    verdict,
    verdictTitle: title,
    verdictSummary,
    privacyType,
    privacyTypeLabel: PRIVACY_TYPE_LABEL[privacyType],
    legalIssues,
    appliedLaws,
    noticeGaps,
    consentGaps,
    noticeDraft: buildNoticeDraft(report, privacyType),
    consentDraft: buildConsentDraft(privacyType),
    questionRevisions,
    questionSummary:
      questionRevisions.length === 0
        ? "개인·민감정보로 분류된 문항이 없거나 위험이 낮습니다."
        : `개인·민감·준식별 관련 문항 ${questionRevisions.length}건을 확인했습니다.`,
    toolGovernance,
    toolOptions,
    overallChecklist,
  };
}
