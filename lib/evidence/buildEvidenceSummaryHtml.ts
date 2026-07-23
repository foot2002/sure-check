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
  if (items.length === 0) return "<p>해당 항목 없음</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export interface EvidenceSummaryCaptureContext {
  screenCaptureEvidence?: ScreenCaptureEvidenceMeta[];
  captureLimitations?: string[];
  captureAttempted?: boolean;
}

export function buildEvidenceSummaryHtml(
  model: ReportEvidenceModel,
  capture: EvidenceSummaryCaptureContext = {},
): string {
  const questionRows =
    model.detectedQuestions.length === 0
      ? "<tr><td colspan='5'>탐지된 개인정보·민감정보 문항 없음</td></tr>"
      : model.detectedQuestions
          .map(
            (q) => `<tr>
  <td>${escapeHtml(q.questionNumber)}</td>
  <td>${escapeHtml(q.questionText)}</td>
  <td>${escapeHtml(q.detectedDataType)}</td>
  <td>${escapeHtml(q.riskCategory)}</td>
  <td>${escapeHtml(q.matchedKeyword)} / ${escapeHtml(q.source)}</td>
</tr>`,
          )
          .join("\n");

  const noticeRows =
    model.noticeChecks.length === 0
      ? "<tr><td colspan='3'>고지문 확인 항목 없음</td></tr>"
      : model.noticeChecks
          .map(
            (n) => `<tr>
  <td>${escapeHtml(n.item)}</td>
  <td>${escapeHtml(n.status)}</td>
  <td>${escapeHtml(n.evidence)}</td>
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

  const captures = capture.screenCaptureEvidence ?? [];
  const autoCaptures = captures.filter((c) => c.source === "auto_browser_capture");
  let captureSection: string;
  if (autoCaptures.length > 0) {
    const rows = autoCaptures
      .map(
        (c) => `<tr>
  <td>${escapeHtml(c.storedName)}</td>
  <td>${escapeHtml(c.capturedUrl || "-")}</td>
  <td>${escapeHtml(c.capturedAtKST || c.capturedAt)}</td>
  <td><code>${escapeHtml(c.sha256)}</code></td>
</tr>`,
      )
      .join("\n");
    captureSection = `
  <p>자동 캡처 수: ${autoCaptures.length}개</p>
  <p>응답값 입력 없이 공개 설문 화면을 캡처함</p>
  <table>
    <thead>
      <tr><th>파일명</th><th>캡처 URL</th><th>캡처 일시</th><th>SHA-256</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
  } else if (capture.captureAttempted) {
    captureSection = `
  <p><strong>자동 캡처 실패</strong></p>
  ${listHtml(
    capture.captureLimitations?.length
      ? capture.captureLimitations
      : ["자동 화면 캡처를 완료하지 못했습니다."],
  )}
  <p>문항 원문 및 원본 추출자료 중심으로 증빙자료가 구성됨</p>`;
  } else {
    captureSection = `<p>자동 화면 캡처가 시도되지 않았거나 해당되지 않습니다.</p>`;
  }

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>SURE Check 신고내용 요약서</title>
  <style>
    body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; line-height: 1.55; color: #1f2937; max-width: 920px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.15rem; margin-top: 1.75rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.35rem; }
    .meta { color: #4b5563; font-size: 0.95rem; }
    .note { background: #fff7ed; border: 1px solid #fed7aa; padding: 12px 14px; border-radius: 8px; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.92rem; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; vertical-align: top; text-align: left; }
    th { background: #f8fafc; }
    code { font-size: 0.8rem; word-break: break-all; }
  </style>
</head>
<body>
  <h1>SURE Check 신고내용 요약서</h1>
  <p class="meta">진단일시(KST): ${escapeHtml(model.generatedAtKst)}</p>
  <div class="note">${escapeHtml(model.disclaimer)}</div>

  <h2>1. 진단 개요</h2>
  <ul>
    <li>진단 ID: ${escapeHtml(model.diagnosisId)}</li>
    <li>설문 제목: ${escapeHtml(model.surveyTitle)}</li>
    <li>설문 URL: ${escapeHtml(model.surveyUrl || "(파일 진단)")}</li>
    <li>최종 URL: ${escapeHtml(model.finalUrl || "(없음)")}</li>
    <li>설문 주체: ${escapeHtml(model.operatorName)} (${escapeHtml(model.subjectType)})</li>
    <li>사용도구: ${escapeHtml(model.toolName)}</li>
    <li>진단 방식: ${escapeHtml(model.diagnosisMethod)}</li>
    <li>판단 결과: ${escapeHtml(model.userDecision)}</li>
  </ul>

  <h2>2. 핵심 신고 사유</h2>
  ${listHtml(model.coreReasons)}

  <h2>3. 탐지된 개인정보·민감정보 문항</h2>
  <table>
    <thead>
      <tr>
        <th>문항번호</th>
        <th>문항 원문</th>
        <th>탐지 유형</th>
        <th>분류</th>
        <th>키워드/출처</th>
      </tr>
    </thead>
    <tbody>
      ${questionRows}
    </tbody>
  </table>

  <h2>4. 고지문 확인 결과</h2>
  <table>
    <thead>
      <tr><th>항목</th><th>확인 여부</th><th>근거</th></tr>
    </thead>
    <tbody>
      ${noticeRows}
    </tbody>
  </table>

  <h2>5. 화면 캡처 증빙</h2>
  ${captureSection}

  <h2>6. 법·정책 기준 (해당 케이스만)</h2>
  <table>
    <thead>
      <tr><th>기준</th><th>검토 포인트</th></tr>
    </thead>
    <tbody>
      ${legalRows}
    </tbody>
  </table>

  <h2>7. 진단 한계</h2>
  ${listHtml([
    ...model.limitations,
    ...(capture.captureLimitations ?? []).filter(
      (item) => !model.limitations.includes(item),
    ),
  ])}
</body>
</html>
`;
}
