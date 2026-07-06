import type { AnalysisResult } from "@/lib/types/analyzer";
import { GRADE_LABELS } from "@/lib/utils/grade";
import type { MockReportKey, ScanFinding, ScanReport } from "@/lib/types/scan";
import type { NormalizedForm } from "@/lib/types/scan";
import {
  hasDirectIdentifier,
  hasSensitiveData,
  isQuasiIdentifierOnly,
} from "@/lib/rules/dataRiskRules";
import { getNoticeGapSeverity } from "@/lib/rules/noticeComplianceRules";
import { isOverseasSaaS } from "@/lib/rules/toolRouteRules";

const DISCLAIMER =
  "본 서비스는 법률 자문이 아닌 자동 위험 진단 결과입니다. 실제 법 위반 여부는 수집·이용·보관·위탁·파기 방식에 따라 달라질 수 있습니다.";

const EMPLOYEE_ONLY_OBLIGATION_KEYS = new Set([
  "anonymity_standard",
  "raw_data_scope",
  "no_disadvantage",
  "small_group_privacy",
]);

function isEmployeeContext(analysis: AnalysisResult): boolean {
  return analysis.context.flags.includes("employee_survey");
}

function shouldShowPartialScanFinding(form: NormalizedForm): boolean {
  if (!form.partialScan) return false;
  if (
    (form.platform === "naver_forms" || form.platform === "google_forms" || form.platform === "moaform") &&
    form.questions.length > 0
  ) {
    return false;
  }
  return true;
}

function filterVisibleGaps(analysis: AnalysisResult) {
  const employeeContext = isEmployeeContext(analysis);
  return analysis.complianceGaps.filter((gap) => {
    if (gap.status === "present") return false;
    if (!employeeContext && EMPLOYEE_ONLY_OBLIGATION_KEYS.has(gap.key)) {
      return false;
    }
    return true;
  });
}

function buildSummary(
  form: NormalizedForm,
  analysis: AnalysisResult,
): string {
  const grade = GRADE_LABELS[analysis.score.finalGrade];
  const parts: string[] = [];

  if (form.platform === "naver_forms" && form.questions.length > 0) {
    parts.push("네이버폼 공개 응답 화면 기준 자동 진단");
  } else if (form.platform === "moaform" && form.questions.length > 0) {
    parts.push("모아폼 공개 응답 화면 기준 자동 진단");
  } else if (form.platform === "google_forms" && form.questions.length > 0) {
    parts.push("Google Forms 공개 응답 화면 기준 자동 진단");
  } else if (form.extractedFromHtml) {
    parts.push("HTML 베타 추출 진단");
  } else if (form.partialScan) {
    parts.push("일부 문항만 베타 진단되었습니다.");
  }

  const contextLabels = analysis.context.labels.filter(
    (label) => employeeContextLabel(label, analysis),
  );
  if (contextLabels.length > 0) {
    parts.push(`${contextLabels.join("/")} 맥락`);
  }

  parts.push(`수집정보 등급 ${analysis.dataRisk.level}(${analysis.dataRisk.levelLabel})`);
  parts.push(`종합 ${grade}(${analysis.score.finalScore}점)`);

  const missingCount = filterVisibleGaps(analysis).length;
  if (missingCount > 0) {
    parts.push(`고지·동의 보완 필요 ${missingCount}건`);
  }

  if (analysis.overrides.length > 0) {
    parts.push(`최소등급 강제 룰 ${analysis.overrides.length}건 적용`);
  }

  return parts.join(". ") + ".";
}

function employeeContextLabel(label: string, analysis: AnalysisResult): boolean {
  if (!isEmployeeContext(analysis)) {
    return !/근로자|조직진단|직원/.test(label);
  }
  return true;
}

function buildDataCollectionRiskText(analysis: AnalysisResult): string {
  const { dataRisk } = analysis;

  if (isQuasiIdentifierOnly(dataRisk.level)) {
    const quasiItems = dataRisk.detectedItems.length > 0
      ? dataRisk.detectedItems.join(", ")
      : "세부 항목 확인 필요";
    return `준식별정보(D2) 수준입니다. ${quasiItems} 수집이 확인됩니다.`;
  }

  if (!hasDirectIdentifier(dataRisk.level) && !hasSensitiveData(dataRisk.level)) {
    return `${dataRisk.levelLabel}(${dataRisk.level}) 수준입니다. ${
      dataRisk.detectedItems.length > 0
        ? `탐지 항목: ${dataRisk.detectedItems.join(", ")}.`
        : "개인정보 수집 항목이 제한적입니다."
    }`;
  }

  return `${dataRisk.levelLabel}(${dataRisk.level}) 수준입니다. ${
    dataRisk.detectedItems.length > 0
      ? `탐지 항목: ${dataRisk.detectedItems.join(", ")}.`
      : "개인정보 수집 항목이 확인됩니다."
  }`;
}

function buildLegalBasisSummary(form: NormalizedForm, analysis: AnalysisResult): string {
  const clauses = [
    "개인정보보호법 제15조(수집·이용)",
    "제17조(제3자 제공)",
    "제21조(파기)",
  ];

  if (isOverseasSaaS(analysis.toolRisk.level)) {
    clauses.push("제28조의8(국외이전)");
  }

  clauses.push("제29조(안전조치)");

  const platformNote =
    form.platform === "naver_forms" || form.platform === "moaform"
      ? "국내 SaaS 플랫폼 기준으로 화면상 확인 가능한 고지·동의·수집 최소화·관리 조치를 점검했습니다."
      : "화면상 확인 가능한 고지·동의·수집 최소화·관리 조치를 점검했습니다.";

  return `${clauses.join(", ")} 등을 참고하여 ${platformNote} 본 결과는 법률 위반을 확정하지 않습니다.`;
}

function buildFindings(analysis: AnalysisResult, form: NormalizedForm): ScanFinding[] {
  const findings: ScanFinding[] = [];
  let id = 1;

  if (analysis.context.publicSectorDetected) {
    findings.push({
      id: `f${id++}`,
      category: "context",
      severity: "medium",
      title: "공공부문 설문 운영 주체 탐지",
      description:
        "조사기관 또는 설문 운영 주체로 공공부문 기관이 탐지되었습니다. 공공기관 또는 지방자치단체 출자·출연기관이 외부 설문 SaaS를 통해 정보를 수집하는 경우, 수집 항목과 보유기간뿐 아니라 위탁, 기관 계정 관리, 목적 달성 후 파기, 공공부문 보안검증 여부를 함께 확인해야 합니다.",
      evidence: [
        ...analysis.context.publicSectorEvidence,
        ...analysis.context.detectedOrganizations,
      ].filter(Boolean),
    });
  }

  for (const gap of filterVisibleGaps(analysis)) {
    const severity = getNoticeGapSeverity(gap, analysis.dataRisk.level);
    if (severity === "info") continue;

    findings.push({
      id: `f${id++}`,
      category: gap.key.startsWith("overseas") ? "tool" : "notice",
      severity,
      title: `${gap.label} ${gap.status === "missing" ? "누락" : "미흡"}`,
      description: gap.detail,
      recommendation: `${gap.label} 관련 고지·동의 문구를 명확히 추가하세요.`,
    });
  }

  if (hasSensitiveData(analysis.dataRisk.level)) {
    findings.push({
      id: `f${id++}`,
      category: "data",
      severity: "high",
      title: "민감정보 또는 민감 맥락 수집",
      description: `수집정보 등급 ${analysis.dataRisk.level} 수준의 항목이 확인됩니다.`,
      evidence: analysis.dataRisk.detectedItems,
    });
  }

  for (const override of analysis.overrides) {
    findings.push({
      id: `f${id++}`,
      category: "override",
      severity: override.minGrade === "high_risk" ? "critical" : "high",
      title: "최소등급 강제 룰 적용",
      description: override.reason,
    });
  }

  if (shouldShowPartialScanFinding(form)) {
    findings.push({
      id: `f${id++}`,
      category: "override",
      severity: "info",
      title: "베타 진단 제한",
      description: "플랫폼 미식별 또는 부분 스캔으로 전체 위험도가 실제와 다를 수 있습니다.",
    });
  }

  return findings;
}

function buildRespondentGuidance(
  analysis: AnalysisResult,
  form: NormalizedForm,
): string[] {
  const items: string[] = [];

  if (analysis.score.finalGrade === "high_risk" || analysis.score.finalGrade === "risk") {
    items.push("응답 전 수집 목적·보유 기간·제3자 제공·국외이전 안내를 꼼꼼히 확인하세요.");
  }

  if (hasSensitiveData(analysis.dataRisk.level)) {
    items.push("민감한 내용은 특정될 수 있으니 신중하게 작성하세요.");
  }

  if (
    form.contextHints?.claimsAnonymous &&
    isEmployeeContext(analysis)
  ) {
    items.push("익명이라고 안내되어도 부서·직급 등과 결합 시 특정될 수 있습니다.");
  }

  if (shouldShowPartialScanFinding(form)) {
    items.push("베타 진단 결과이므로 전체 문항 분석이 되지 않았을 수 있습니다.");
  }

  if (items.length === 0) {
    items.push("제출 전 수집 항목과 보유 기간 안내를 확인하세요.");
  }

  return items;
}

function buildOperatorRecommendations(analysis: AnalysisResult): string[] {
  const items: string[] = [];
  const employeeContext = isEmployeeContext(analysis);

  for (const gap of filterVisibleGaps(analysis)) {
    items.push(`${gap.label} 관련 고지·동의 문구를 보완하세요.`);
  }

  for (const mgmt of analysis.management.items.filter((i) => i.status !== "confirmed")) {
    if (
      !employeeContext &&
      (mgmt.label === "원자료 제공 범위" ||
        mgmt.label === "익명성 보장" ||
        mgmt.label === "원자료 다운로드 관리")
    ) {
      continue;
    }
    items.push(mgmt.detail);
  }

  if (items.length === 0) {
    items.push("현재 수준을 유지하되, 정기적인 접근 로그 점검·교육을 권장합니다.");
  }

  return [...new Set(items)].slice(0, 8);
}

export function generateReport(
  form: NormalizedForm,
  analysis: AnalysisResult,
  scanId: string,
  formUrl: string,
  mockKey: MockReportKey,
): ScanReport {
  const now = new Date().toISOString();
  const visibleGaps = filterVisibleGaps(analysis);
  const missingObligations = visibleGaps.map((g) => `${g.label}: ${g.detail}`);

  return {
    scanId,
    formUrl,
    platform: form.platform,
    mockKey,
    diagnosisStatus: "completed",
    grade: analysis.score.finalGrade,
    score: analysis.score.finalScore,
    summary: buildSummary(form, analysis),
    sections: {
      dataCollectionRisk: buildDataCollectionRiskText(analysis),
      toolProcessingRisk: analysis.toolRisk.description,
      noticeConsentGap:
        missingObligations.length > 0
          ? `필요한 고지·동의 항목 중 ${missingObligations.length}건이 미충족 또는 확인 필요합니다. 단순 제출 버튼만으로는 동의로 보지 않습니다.`
          : "필요한 고지·동의 항목이 대체로 충족된 것으로 보입니다.",
      managementRisk: analysis.management.summary,
      detectedPersonalData: analysis.dataRisk.detectedItems,
      missingObligations,
      respondentGuidance: buildRespondentGuidance(analysis, form),
      operatorRecommendations: buildOperatorRecommendations(analysis),
      evidenceItems: [
        ...analysis.dataRisk.evidenceQuestions,
        ...analysis.context.publicSectorEvidence.map((item) => `공공부문 근거: ${item}`),
        ...visibleGaps.map((g) => `고지 누락: ${g.label}`),
      ],
      legalBasisSummary: buildLegalBasisSummary(form, analysis),
      disclaimer: DISCLAIMER,
    },
    findings: buildFindings(analysis, form),
    form: { ...form, url: formUrl },
    createdAt: now,
    completedAt: now,
  };
}
