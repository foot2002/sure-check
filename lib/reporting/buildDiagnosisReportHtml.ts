import { downloadBlob } from "@/lib/utils/download";
import {
  formatEvidenceTimestamp,
  sanitizeFilename,
} from "@/lib/evidence/sanitizeFilename";
import {
  buildFilePreDeployReport,
  isFileSourceReport,
} from "@/lib/reporting/buildFilePreDeployReport";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { ScanReport } from "@/lib/types/scan";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listHtml(items: string[]): string {
  if (items.length === 0) return `<p class="muted">해당 항목 없음</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function preHtml(text: string): string {
  return `<pre class="draft">${escapeHtml(text)}</pre>`;
}

function documentShell(options: {
  title: string;
  metaLines: string[];
  body: string;
  disclaimer: string;
}): string {
  const meta = options.metaLines
    .map((line) => `<p class="meta">${escapeHtml(line)}</p>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    @page { size: A4; margin: 18mm 14mm; }
    body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; line-height: 1.55; color: #111827; max-width: 860px; margin: 0 auto; padding: 20px 16px 40px; font-size: 13px; }
    h1 { font-size: 1.45rem; margin: 0 0 0.35rem; }
    h2 { font-size: 1.08rem; margin: 1.6rem 0 0.55rem; padding-bottom: 0.3rem; border-bottom: 2px solid #0f766e; color: #134e4a; }
    h3 { font-size: 0.95rem; margin: 1rem 0 0.35rem; color: #1f2937; }
    .meta { color: #4b5563; font-size: 0.9rem; margin: 0.2rem 0; }
    .hint { background: #ecfdf5; border: 1px solid #a7f3d0; padding: 10px 12px; border-radius: 8px; margin: 12px 0 18px; font-size: 0.88rem; color: #065f46; }
    .note { background: #fff7ed; border: 1px solid #fed7aa; padding: 10px 12px; border-radius: 8px; margin: 12px 0; font-size: 0.88rem; }
    .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; background: #fafafa; margin: 8px 0; }
    .verdict { border: 1px solid #99f6e4; background: #f0fdfa; border-radius: 10px; padding: 14px 16px; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 0.88rem; }
    th, td { border: 1px solid #e5e7eb; padding: 7px 8px; vertical-align: top; text-align: left; }
    th { background: #f1f5f9; }
    .muted { color: #6b7280; }
    .draft { white-space: pre-wrap; word-break: break-word; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; font-family: inherit; font-size: 0.88rem; margin: 6px 0; }
    ul { margin: 0.35rem 0 0.6rem; padding-left: 1.2rem; }
    @media print {
      .hint { display: none; }
      body { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.title)}</h1>
  ${meta}
  <div class="hint">PDF가 필요하면 이 파일을 브라우저에서 연 뒤 <strong>Ctrl+P → PDF로 저장</strong>하세요.</div>
  <div class="note">${escapeHtml(options.disclaimer)}</div>
  ${options.body}
</body>
</html>`;
}

function buildUrlDiagnosisBody(
  report: ScanReport,
  audience: AudienceReport,
): string {
  const { safetyType, userEvidenceCards, operatorImprovement, collectedDataSummary } =
    audience;

  const evidenceRows =
    userEvidenceCards.length === 0
      ? `<tr><td colspan="3">핵심 근거 카드 없음</td></tr>`
      : userEvidenceCards
          .map(
            (card) => `<tr>
  <td>${escapeHtml(card.title)}</td>
  <td>${escapeHtml(card.fact)}<br/><span class="muted">${escapeHtml(card.whyProblem)}</span></td>
  <td>${escapeHtml(card.action)}</td>
</tr>`,
          )
          .join("\n");

  const fixRows =
    operatorImprovement.topFixes.length === 0
      ? `<tr><td colspan="2">우선 개선 항목 없음</td></tr>`
      : operatorImprovement.topFixes
          .map(
            (fix) => `<tr>
  <td>${escapeHtml(fix.title)}</td>
  <td>${escapeHtml(fix.reason)} → ${escapeHtml(fix.action)}</td>
</tr>`,
          )
          .join("\n");

  const legalRows =
    operatorImprovement.legalBasisDetails.length === 0
      ? `<tr><td colspan="2">적용 법·기준 없음</td></tr>`
      : operatorImprovement.legalBasisDetails
          .map(
            (law) => `<tr>
  <td>${escapeHtml(law.label)}</td>
  <td>${escapeHtml(law.description)}</td>
</tr>`,
          )
          .join("\n");

  const personal =
    collectedDataSummary.directIdentifiers.join(", ") || "없음";
  const sensitive = collectedDataSummary.sensitiveItems.join(", ") || "없음";
  const highRisk = collectedDataSummary.highRiskItems.join(", ") || "없음";
  const quasi = collectedDataSummary.quasiIdentifiers.join(", ") || "없음";

  return `
  <h2>1. 응답자 판단</h2>
  <div class="verdict">
    <h3>${escapeHtml(safetyType.displayName || safetyType.typeName)}</h3>
    <p><strong>${escapeHtml(safetyType.headline)}</strong></p>
    <p>${escapeHtml(safetyType.description)}</p>
    <p>${escapeHtml(safetyType.action)}</p>
  </div>
  <div class="box">
    <ul>
      <li>설문주체: ${escapeHtml(safetyType.subjectLabel)}</li>
      <li>수집정보: ${escapeHtml(safetyType.dataBadge)}</li>
      <li>사용도구: ${escapeHtml(safetyType.toolBadge)}</li>
      <li>도구 판단: ${escapeHtml(safetyType.toolJudgmentBadge)}</li>
      <li>진단 방식: ${escapeHtml(safetyType.diagnosisMethodLabel)}</li>
    </ul>
  </div>
  <h3>왜 문제인가요 / 법적 위험·한계</h3>
  <div class="box">
    <p>${escapeHtml(safetyType.whyProblem)}</p>
    <p><strong>${escapeHtml(safetyType.legalOrLimitTitle)}</strong></p>
    <p>${escapeHtml(safetyType.legalOrLimitBody)}</p>
    <p>${escapeHtml(safetyType.howToAct)}</p>
  </div>

  <h2>2. 핵심 근거</h2>
  <table>
    <thead><tr><th>항목</th><th>확인 사실</th><th>조치</th></tr></thead>
    <tbody>${evidenceRows}</tbody>
  </table>

  <h2>3. 탐지된 수집정보</h2>
  <div class="box">
    <ul>
      <li>개인정보: ${escapeHtml(personal)}</li>
      <li>준식별정보: ${escapeHtml(quasi)}</li>
      <li>민감정보: ${escapeHtml(sensitive)}</li>
      <li>고위험정보: ${escapeHtml(highRisk)}</li>
    </ul>
  </div>

  <h2>4. 담당자 우선 개선</h2>
  <table>
    <thead><tr><th>개선 항목</th><th>내용</th></tr></thead>
    <tbody>${fixRows}</tbody>
  </table>
  <h3>고지·동의</h3>
  ${listHtml(operatorImprovement.noticeItems.map((i) => `${i.title}: ${i.detail}`))}
  <h3>문항</h3>
  ${listHtml(operatorImprovement.questionItems.map((i) => `${i.title}: ${i.detail}`))}
  <h3>관리·도구</h3>
  <p>${escapeHtml(operatorImprovement.tool.summary)}</p>
  ${listHtml(operatorImprovement.managementItems.map((i) => `${i.title}: ${i.detail}`))}

  <h2>5. 법·정책 기준</h2>
  <table>
    <thead><tr><th>기준</th><th>요지</th></tr></thead>
    <tbody>${legalRows}</tbody>
  </table>

  <h2>6. 응답 전 확인</h2>
  ${listHtml(audience.respondentDoList)}
  <h3>하지 말 것</h3>
  ${listHtml(audience.respondentDontList)}

  ${
    report.limitationReasons && report.limitationReasons.length > 0
      ? `<h2>진단 한계</h2>${listHtml(report.limitationReasons)}`
      : ""
  }
`;
}

function buildFileDiagnosisBody(
  report: ScanReport,
  model: ReturnType<typeof buildFilePreDeployReport>,
): string {

  const legalRows =
    model.legalIssues.length === 0
      ? `<tr><td colspan="3">법 이슈 없음</td></tr>`
      : model.legalIssues
          .map(
            (issue) => `<tr>
  <td>${escapeHtml(issue.severityLabel)}</td>
  <td>${escapeHtml(issue.title)}<br/><span class="muted">${escapeHtml(issue.why)}</span></td>
  <td>${escapeHtml(issue.action)}</td>
</tr>`,
          )
          .join("\n");

  const revisionRows =
    model.questionRevisions.length === 0
      ? `<tr><td colspan="4">수정 권고 문항 없음</td></tr>`
      : model.questionRevisions
          .map(
            (q) => `<tr>
  <td>${escapeHtml(q.originalLabel)}</td>
  <td>${escapeHtml(q.categories.join(", ") || q.riskLevel)}</td>
  <td>${escapeHtml(q.issue)}</td>
  <td>${escapeHtml(q.suggestion)}</td>
</tr>`,
          )
          .join("\n");

  const toolRows =
    model.toolOptions.length === 0
      ? `<tr><td colspan="3">도구 권고 없음</td></tr>`
      : model.toolOptions
          .map(
            (t) => `<tr>
  <td>${escapeHtml(t.tier)}</td>
  <td>${escapeHtml(t.title)}</td>
  <td>${escapeHtml(t.detail)}</td>
</tr>`,
          )
          .join("\n");

  const lawRows =
    model.appliedLaws.length === 0
      ? `<tr><td colspan="2">적용 법·기준 없음</td></tr>`
      : model.appliedLaws
          .map(
            (law) => `<tr>
  <td>${escapeHtml(law.label)}</td>
  <td>${escapeHtml(law.description)}</td>
</tr>`,
          )
          .join("\n");

  return `
  <h2>1. 배포 전 판단</h2>
  <div class="verdict">
    <h3>${escapeHtml(model.verdictTitle)}</h3>
    <p>${escapeHtml(model.verdictSummary)}</p>
    <p class="muted">수집정보 유형: ${escapeHtml(model.privacyTypeLabel)}</p>
  </div>

  <h2>2. 법 문제</h2>
  <table>
    <thead><tr><th>심각도</th><th>이슈</th><th>조치</th></tr></thead>
    <tbody>${legalRows}</tbody>
  </table>
  <h3>적용 법·정책</h3>
  <table>
    <thead><tr><th>기준</th><th>요지</th></tr></thead>
    <tbody>${lawRows}</tbody>
  </table>

  <h2>3. 고지·동의 보완</h2>
  <h3>고지 누락</h3>
  ${listHtml(model.noticeGaps.map((g) => `${g.title}: ${g.detail}`))}
  <h3>동의 누락</h3>
  ${listHtml(model.consentGaps.map((g) => `${g.title}: ${g.detail}`))}
  <h3>고지문 초안</h3>
  ${preHtml(model.noticeDraft)}
  <h3>동의문 초안</h3>
  ${preHtml(model.consentDraft)}

  <h2>4. 문항 수정 권고</h2>
  <p class="muted">${escapeHtml(model.questionSummary)}</p>
  <table>
    <thead><tr><th>문항</th><th>분류</th><th>문제</th><th>수정 제안</th></tr></thead>
    <tbody>${revisionRows}</tbody>
  </table>

  <h2>5. 수집 도구 권고</h2>
  <p>${escapeHtml(model.toolGovernance.body || model.toolGovernance.title)}</p>
  <table>
    <thead><tr><th>등급</th><th>도구</th><th>설명</th></tr></thead>
    <tbody>${toolRows}</tbody>
  </table>

  <h2>6. 배포 전 체크리스트</h2>
  ${listHtml(model.overallChecklist)}

  ${
    report.limitationReasons && report.limitationReasons.length > 0
      ? `<h2>진단 한계</h2>${listHtml(report.limitationReasons)}`
      : ""
  }
`;
}

/** Printable diagnosis document HTML (open in browser → Ctrl+P → Save as PDF). */
export function buildDiagnosisReportHtml(report: ScanReport): string {
  const disclaimer =
    report.sections.disclaimer ||
    "본 문서는 법률 자문이 아닌 자동 위험 진단 결과입니다. 최종 위법 여부는 관할 기관의 검토·조사 결과에 따릅니다.";
  const completed = new Date(report.completedAt).toLocaleString("ko-KR");

  if (isFileSourceReport(report)) {
    const model = buildFilePreDeployReport(report);
    return documentShell({
      title: "SURE Check 설문파일 배포 전 진단 결과",
      metaLines: [
        `진단일시: ${completed} · 진단 ID: ${report.scanId}`,
        `파일명: ${model.fileName}`,
        `플랫폼/형식: ${report.platform}`,
      ],
      body: buildFileDiagnosisBody(report, model),
      disclaimer,
    });
  }

  const audience = composeAudienceReport(report);
  return documentShell({
    title: "SURE Check 개인정보 리스크 진단 결과",
    metaLines: [
      `진단일시: ${completed} · 진단 ID: ${report.scanId}`,
      `설문 URL: ${report.formUrl || "(없음)"}`,
      `플랫폼: ${report.platform}`,
      `제목: ${report.form.title || "(제목 없음)"}`,
    ],
    body: buildUrlDiagnosisBody(report, audience),
    disclaimer,
  });
}

export function diagnosisReportFileName(report: ScanReport): string {
  const stamp = formatEvidenceTimestamp(new Date(report.completedAt || Date.now()));
  const title = isFileSourceReport(report)
    ? buildFilePreDeployReport(report).fileName
    : report.form.title || "설문";
  return `SURE_Check_진단결과_${stamp}_${sanitizeFilename(title)}.html`;
}

export function downloadDiagnosisReport(report: ScanReport): void {
  const html = buildDiagnosisReportHtml(report);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  downloadBlob(blob, diagnosisReportFileName(report));
}
