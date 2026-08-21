import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildOutreachCopy,
  formatDataCollectionSummary,
  improvementChecklist,
  pickIssueBadges,
  publicPrivateKo,
  riskLabelKo,
} from "@/lib/report/adminOutreach";
import { publicPlatformLabel } from "@/lib/report/publicCases";

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listHtml(items: string[]): string {
  if (items.length === 0) return "<p>—</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function detailReportFilename(caseId: string): string {
  return `sure-check-detail-report-${caseId}.html`;
}

export function buildAdminDetailReportHtml(detail: AdminCaseDetail): string {
  const s = detail.summary;
  const categoryLabels = [
    ...new Set(
      detail.questions.flatMap((q) => q.categories.map((c) => c.categoryLabel)),
    ),
  ];
  const issueBadges = pickIssueBadges({
    userDecisionLabel: s.userDecisionLabel,
    complianceLabels: detail.complianceChecks.map(
      (c) => `${c.checkItem} ${c.statusLabel}`,
    ),
    findingTitles: detail.findings.map((f) => f.title),
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    isPublic: s.publicPrivateType === "public",
  });
  const copy = buildOutreachCopy({ categoryLabels, issueBadges });
  const checks = improvementChecklist({
    issueBadges,
    isPublic: s.publicPrivateType === "public",
  });
  const dataSummary = formatDataCollectionSummary({
    personalCount: s.personalInfoQuestionCount,
    sensitiveCount: s.sensitiveQuestionCount,
    highRiskCount: s.highRiskQuestionCount,
    hasPersonalInfo: s.hasPersonalInfo,
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    categoryLabels,
  });
  const noticeGaps = detail.complianceChecks.filter((c) =>
    /missing|fail|미흡|없음|확인/.test(`${c.status} ${c.statusLabel}`),
  );
  const questions = detail.questions
    .map((q) => {
      const kind = q.hasHighRiskInfo
        ? "고위험정보"
        : q.hasSensitiveInfo
          ? "민감정보"
          : q.hasPersonalInfo
            ? "개인정보"
            : "일반";
      const cats = q.categories.map((c) => c.categoryLabel).join(", ") || "—";
      return `<tr><td>${escapeHtml(q.questionNumber)}</td><td>${escapeHtml(q.questionLabel)}</td><td>${escapeHtml(kind)}</td><td>${escapeHtml(cats)}</td><td>${escapeHtml(q.dataRiskLevel)}</td></tr>`;
    })
    .join("");
  const findings = detail.findings
    .map(
      (f) =>
        `<li><strong>${escapeHtml(f.severity)} · ${escapeHtml(f.title)}</strong><div>${escapeHtml(f.description || f.evidenceNote)}</div><div>권고: ${escapeHtml(f.recommendation)}</div></li>`,
    )
    .join("");
  const evidence = detail.evidenceFiles
    .map(
      (f) =>
        `<li>${escapeHtml(f.evidenceTypeLabel)}${f.label ? ` · ${escapeHtml(f.label)}` : ""}${f.pageNumber != null ? ` · p.${f.pageNumber}` : ""}</li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>SURE Check 상세리포트 — ${escapeHtml(s.surveyTitle)}</title>
  <style>
    body { font-family: "Malgun Gothic", "Noto Sans KR", sans-serif; color: #0f172a; max-width: 920px; margin: 32px auto; padding: 0 20px; line-height: 1.6; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; }
    .note { background: #fffbeb; border: 1px solid #fde68a; padding: 12px 14px; border-radius: 8px; }
    .meta { color: #475569; font-size: 14px; }
  </style>
</head>
<body>
  <p class="meta">관리자 내부 상세리포트 · 공개 페이지에 그대로 게시하지 마세요.</p>
  <h1>${escapeHtml(s.surveyTitle || "제목 없음")}</h1>
  <p class="meta">${escapeHtml(s.operatorName || "운영주체 미확인")} · ${escapeHtml(publicPrivateKo(s.publicPrivateType))} · ${escapeHtml(publicPlatformLabel(s.platform))}</p>

  <h2>설문 기본정보</h2>
  <table>
    <tr><th>기관/기업</th><td>${escapeHtml(s.operatorName)}</td></tr>
    <tr><th>공공/민간</th><td>${escapeHtml(publicPrivateKo(s.publicPrivateType))}</td></tr>
    <tr><th>설문 URL</th><td>${escapeHtml(s.surveyUrl)}</td></tr>
    <tr><th>진단일</th><td>${escapeHtml(s.observedDateKst)}</td></tr>
    <tr><th>플랫폼</th><td>${escapeHtml(publicPlatformLabel(s.platform))}</td></tr>
    <tr><th>위험도/점수</th><td>${escapeHtml(riskLabelKo(s.overallRiskLevel))} / ${escapeHtml(s.score)}</td></tr>
    <tr><th>응답 판단</th><td>${escapeHtml(s.userDecisionLabel)}</td></tr>
  </table>

  <h2>개인정보/민감정보/고위험정보 탐지</h2>
  <p>${escapeHtml(dataSummary)}</p>

  <h2>전체 문항 목록</h2>
  <table>
    <thead><tr><th>번호</th><th>문항</th><th>분류</th><th>수집 유형</th><th>등급</th></tr></thead>
    <tbody>${questions || "<tr><td colspan='5'>문항 없음</td></tr>"}</tbody>
  </table>

  <h2>고지 항목 판단</h2>
  ${listHtml(
    detail.complianceChecks.map(
      (c) => `${c.checkItem}: ${c.statusLabel || c.status}${c.evidenceNote ? ` · ${c.evidenceNote}` : ""}`,
    ),
  )}
  <p>고지 미흡/확인 필요: ${noticeGaps.length}건</p>

  <h2>외부도구·위탁·국외이전·CSAP 확인 필요</h2>
  ${listHtml(issueBadges.filter((b) => /외부|위탁|국외|CSAP|클라우드/.test(b)))}

  <h2>주요 문제</h2>
  <p>${escapeHtml(copy.problemReason)}</p>
  <ol>${findings || "<li>자동진단 finding 없음</li>"}</ol>

  <h2>개선 권고</h2>
  <p>${escapeHtml(copy.improvementRequest)}</p>
  ${listHtml(checks)}

  <h2>공문용 문구</h2>
  <pre>${escapeHtml(copy.letterSummary)}</pre>

  <h2>증빙 목록</h2>
  <ul>${evidence || "<li>저장된 증빙 없음</li>"}</ul>

  <h2>진단 한계 및 유의사항</h2>
  <div class="note">
    본 상세리포트는 관리자 내부 검토용입니다. 공개 설문 화면에 대한 자동진단 결과이며
    위법 여부를 확정하지 않습니다. 위반 소지, 확인 필요, 개선 필요로 해석하세요.
    공개 진단 사례 페이지에는 이 문서 전체를 게시하지 마세요.
  </div>
</body>
</html>`;
}
