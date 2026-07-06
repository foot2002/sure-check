import type { ScanReport } from "@/lib/types/scan";
import { GRADE_LABELS } from "@/lib/utils/grade";
import { isExtractionLimitedReport } from "@/lib/scan/limitedReport";

export function reportToMarkdown(report: ScanReport): string {
  const { sections } = report;
  const limited = isExtractionLimitedReport(report);
  const gradeLine = limited
    ? `- **종합 등급**: 진단 제한`
    : `- **종합 등급**: ${report.grade ? GRADE_LABELS[report.grade] : "미산정"}`;
  const scoreLine = limited
    ? `- **점수**: 산정 불가`
    : `- **점수**: ${report.score ?? "미산정"}점 / 100점`;

  const lines: string[] = [
    `# SURE Check 진단 리포트`,
    ``,
    `> 본 리포트는 법률 자문이 아닌 자동 위험 진단 결과입니다.`,
    ``,
    `## 기본 정보`,
    `- **진단 URL**: ${report.formUrl}`,
    `- **플랫폼**: ${report.platform}`,
    gradeLine,
    scoreLine,
    `- **진단 완료**: ${new Date(report.completedAt).toLocaleString("ko-KR")}`,
    ``,
    `## 핵심 요약`,
    report.summary,
    ``,
    ...(limited
      ? []
      : sections.detectedPersonalData.length > 0
        ? [
            `## 탐지된 개인정보 항목`,
            ...sections.detectedPersonalData.map((item) => `- ${item}`),
            ``,
          ]
        : []),
    ...(limited
      ? []
      : [
          `## 수집정보 위험`,
          sections.dataCollectionRisk,
          ``,
          `## 도구·처리경로 위험`,
          sections.toolProcessingRisk,
          ``,
          `## 고지·동의 누락`,
          sections.noticeConsentGap,
          ``,
        ]),
    ...(limited || sections.missingObligations.length === 0
      ? []
      : [
          `## 필요한데 누락된 고지사항`,
          ...sections.missingObligations.map((item) => `- ${item}`),
          ``,
        ]),
    ...(limited
      ? []
      : [`## 관리·운영 위험`, sections.managementRisk, ``]),
    `## 응답자 주의사항`,
    ...sections.respondentGuidance.map((item) => `- ${item}`),
    ``,
    ...(limited
      ? []
      : [
          `## 운영자 보완사항`,
          ...sections.operatorRecommendations.map((item) => `- ${item}`),
          ``,
          `## 근거 문항`,
          ...sections.evidenceItems.map((item) => `- ${item}`),
          ``,
        ]),
    `## 법적 기준 요약`,
    sections.legalBasisSummary,
    ``,
    `## 상세 발견 사항`,
    ...report.findings.map(
      (f) =>
        `### ${f.title}\n- **심각도**: ${f.severity}\n- ${f.description}${f.recommendation ? `\n- **권고**: ${f.recommendation}` : ""}`,
    ),
    ``,
    `---`,
    `*SURE Check — 설문 링크 개인정보 위험 진단 서비스*`,
  ];
  return lines.join("\n");
}

export function reportToSummaryText(report: ScanReport): string {
  const limited = isExtractionLimitedReport(report);
  const headline = limited
    ? `등급: 진단 제한 (점수 산정 불가)`
    : `등급: ${report.grade ? GRADE_LABELS[report.grade] : "미산정"} (${report.score ?? "-"}점)`;

  return [
    `[SURE Check 진단 결과]`,
    headline,
    ``,
    report.summary,
    ``,
    `응답 전 확인: ${report.sections.respondentGuidance[0] ?? "고지·동의·수집 항목을 확인하세요."}`,
    ``,
    `상세 리포트: ${typeof window !== "undefined" ? window.location.href : report.scanId}`,
  ].join("\n");
}

export function downloadMarkdown(report: ScanReport): void {
  const content = reportToMarkdown(report);
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sure-check-report-${report.scanId.slice(0, 8)}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
