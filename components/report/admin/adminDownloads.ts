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
