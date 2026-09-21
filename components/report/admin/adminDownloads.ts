"use client";

export async function downloadAdminBlob(url: string, filename: string): Promise<void> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
  if (!res.ok) {
    throw new Error("download failed");
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function reviewReportDownloadUrl(caseId: string): string {
  return `/api/report/admin/cases/${caseId}/review-report`;
}

export function reviewReportFilename(caseId: string): string {
  return `sure-check-review-report-${caseId}.docx`;
}

export function evidenceProxyDownloadUrl(fileId: string, caseId: string): string {
  return `/api/report/admin/evidence/${fileId}/download?caseId=${encodeURIComponent(caseId)}`;
}

export function detailReportDownloadUrl(caseId: string): string {
  return `/api/report/admin/cases/${caseId}/detail-report`;
}

export function detailReportFilename(caseId: string): string {
  return `sure-check-detail-report-${caseId}.html`;
}

export function officialLetterDownloadUrl(caseId: string): string {
  return `/api/report/admin/cases/${caseId}/official-letter`;
}

export function officialLetterFilename(title: string, caseId: string): string {
  const safe = (title || "제목없음")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return `[SURE-CHECK] ${safe || "제목없음"} 실태조사 분석 보고서.docx`;
}

export function officialNoticeDownloadUrl(caseId: string): string {
  return `/api/report/admin/cases/${caseId}/official-notice`;
}

export function officialNoticeFilename(title: string, caseId: string): string {
  const safe = (title || "제목없음")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return `[SURE-CHECK] ${safe || "제목없음"} 실태조사 결과 통보.docx`;
}

export function adminCasesExportUrl(query: string): string {
  return `/api/report/admin/cases/export${query ? `?${query}` : ""}`;
}

export function collectorSurveysExportUrl(query: string): string {
  return `/api/report/admin/collector/surveys/export${query ? `?${query}` : ""}`;
}
