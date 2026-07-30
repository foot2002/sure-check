import type {
  ReportEvidenceModel,
  ScreenCaptureEvidenceMeta,
} from "@/lib/evidence/evidenceTypes";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listHtml(items: string[]): string {
  if (items.length === 0) return "<p class='muted'>해당 항목 없음</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export interface EvidenceSummaryCaptureContext {
  screenCaptureEvidence?: ScreenCaptureEvidenceMeta[];
  captureLimitations?: string[];
  captureAttempted?: boolean;
  /** Short complaint / report reason body */
  reportReason?: string;
}

/**
 * Single printable evidence document (open in browser → Ctrl+P → Save as PDF).
 */
export function buildEvidenceSummaryHtml(
  model: ReportEvidenceModel,
  capture: EvidenceSummaryCaptureContext = {},
): string {
  const questionRows =
    model.detectedQuestions.length === 0
      ? "<tr><td colspan='4'>탐지된 개인정보·민감정보 문항 없음</td></tr>"
      : model.detectedQuestions
          .map(
            (q) => `<tr>
  <td>${escapeHtml(q.questionNumber)}</td>
  <td>${escapeHtml(q.questionText)}</td>
  <td>${escapeHtml(q.detectedDataType)}</td>
  <td>${escapeHtml(q.riskCategory)}</td>
</tr>`,
          )
          .join("\n");

  const legalRows =
    model.legalGrounds.length === 0
      ? "<tr><td colspan='2'>적용된 법·정책 기준 없음</td></tr>"
      : model.legalGrounds
          .map(
            (g) => `<tr>
  <td>${escapeHtml(g.label)}</td>
  <td>${escapeHtml(g.reviewNote)}</td>
</tr>`,
          )
          .join("\n");

  const noticeRows =
    model.noticeChecks.length === 0
      ? "<tr><td colspan='2'>고지문 확인 항목 없음</td></tr>"
      : model.noticeChecks
          .map(
            (n) => `<tr>
  <td>${escapeHtml(n.item)}</td>
  <td>${escapeHtml(n.status)}</td>
</tr>`,
          )
          .join("\n");

  const captures = capture.screenCaptureEvidence ?? [];
  const captureNames = captures.map((c) => c.storedName.replace(/^02_화면캡처\//, ""));
  const reportReason =
    capture.reportReason?.trim() ||
    model.coreReasons.filter(Boolean).join(" ") ||
    model.userDecision;

  const personal = model.detectedPersonalDataItems.join(", ") || "없음";
  const sensitive = model.detectedSensitiveDataItems.join(", ") || "없음";
  const highRisk = model.detectedHighRiskDataItems.join(", ") || "없음";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>SURE Check 신고증빙 요약서</title>
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
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 0.88rem; }
    th, td { border: 1px solid #e5e7eb; padding: 7px 8px; vertical-align: top; text-align: left; }
    th { background: #f1f5f9; }
    .muted { color: #6b7280; }
    @media print {
      .hint { display: none; }
      body { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <h1>SURE Check 신고증빙 요약서</h1>
  <p class="meta">진단일시(KST): ${escapeHtml(model.generatedAtKst)} · 진단 ID: ${escapeHtml(model.diagnosisId)}</p>
  <div class="hint">PDF가 필요하면 이 파일을 브라우저에서 연 뒤 <strong>Ctrl+P → PDF로 저장</strong>하세요. ZIP의 다른 문서는 화면 캡처 이미지뿐입니다.</div>
  <div class="note">${escapeHtml(model.disclaimer)}</div>

  <h2>1. 설문 기본 내용과 진단 결과 (법 문제)</h2>
  <div class="box">
    <h3>설문 기본 정보</h3>
    <ul>
      <li>설문 제목: ${escapeHtml(model.surveyTitle)}</li>
      <li>설문 URL: ${escapeHtml(model.surveyUrl || "(파일 진단)")}</li>
      <li>최종 URL: ${escapeHtml(model.finalUrl || "(없음)")}</li>
      <li>설문 주체: ${escapeHtml(model.operatorName)} (${escapeHtml(model.subjectType)})</li>
      <li>사용도구: ${escapeHtml(model.toolName)}</li>
      <li>진단 방식: ${escapeHtml(model.diagnosisMethod)}</li>
      <li>판단 결과: ${escapeHtml(model.userDecision)}</li>
    </ul>
    <h3>탐지 데이터 요약</h3>
    <ul>
      <li>개인정보: ${escapeHtml(personal)}</li>
      <li>민감정보: ${escapeHtml(sensitive)}</li>
      <li>고위험정보: ${escapeHtml(highRisk)}</li>
    </ul>
  </div>

  <h3>법·정책 저촉·검토 포인트</h3>
  <table>
    <thead>
      <tr><th>기준</th><th>검토 포인트</th></tr>
    </thead>
    <tbody>
      ${legalRows}
    </tbody>
  </table>

  <h3>고지문 확인</h3>
  <table>
    <thead>
      <tr><th>항목</th><th>확인 여부</th></tr>
    </thead>
    <tbody>
      ${noticeRows}
    </tbody>
  </table>

  <h3>개인정보·민감정보 문항</h3>
  <table>
    <thead>
      <tr><th>번호</th><th>문항 원문</th><th>탐지 유형</th><th>분류</th></tr>
    </thead>
    <tbody>
      ${questionRows}
    </tbody>
  </table>

  <h2>2. 신고 이유</h2>
  <div class="box">
    <p>${escapeHtml(reportReason)}</p>
    <h3>핵심 사유</h3>
    ${listHtml(model.coreReasons)}
  </div>

  <h2>3. 증빙 주요 내용</h2>
  <div class="box">
    <ul>
      <li>첨부 화면 캡처 수: ${captures.length}개</li>
      <li>캡처 파일 위치: <code>02_화면캡처/</code></li>
      <li>캡처 파일명: ${
        captureNames.length > 0
          ? escapeHtml(captureNames.join(", "))
          : capture.captureAttempted
            ? "자동 캡처 실패 또는 없음"
            : "없음"
      }</li>
    </ul>
    <h3>진단 한계</h3>
    ${listHtml([
      ...model.limitations,
      ...(capture.captureLimitations ?? []).filter(
        (item) => !model.limitations.includes(item),
      ),
    ])}
  </div>
</body>
</html>
`;
}
