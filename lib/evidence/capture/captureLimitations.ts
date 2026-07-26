import type { CaptureStatus } from "@/lib/evidence/capture/captureTypes";

export function limitationNoInputPolicy(): string {
  return "임의 응답 입력·선택·파일 업로드·제출은 수행하지 않았습니다.";
}

export function limitationEvidenceTempPolicy(): string {
  return "증빙용 자동 탐색 캡처입니다. 중간 페이지 진행을 위해 임시 응답값이 사용될 수 있으며, 최종 제출은 하지 않습니다.";
}

export function limitationCaptureFailed(detail?: string): string[] {
  const lines = [
    "자동 화면 캡처에 실패했습니다.",
    "캡처 없이도 신고용 증빙자료를 다운로드할 수 있습니다.",
  ];
  if (detail) lines.push(detail);
  return lines;
}

export function limitationTimeout(): string[] {
  return [
    "자동 화면 캡처 시간이 초과되었습니다.",
    "캡처 없이도 신고용 증빙자료를 다운로드할 수 있습니다.",
  ];
}

export function limitationRequiredBlocked(pageCount: number): string {
  return `필수응답이 필요한 다음 페이지는 자동 캡처하지 않았습니다. (공개 화면 ${pageCount}장까지 확보)`;
}

export function limitationNoMorePages(pageCount: number): string {
  return pageCount <= 1
    ? "다음 페이지 버튼을 찾지 못했거나 한 화면짜리 설문으로, 현재 공개 화면만 캡처했습니다."
    : `더 이상 입력 없이 이동할 다음 페이지가 없어 ${pageCount}장까지 캡처했습니다.`;
}

export function limitationMaxPages(maxPages: number): string {
  return `안전한 공개 화면 캡처는 최대 ${maxPages}장까지입니다.`;
}

export function limitationSubmitDetected(pageNo: number): string {
  return `최종 제출 버튼을 감지하여 ${pageNo}페이지를 캡처한 뒤 제출하지 않고 종료했습니다.`;
}

export function limitationEvidenceBlocked(pageNo: number): string {
  return `${pageNo}페이지에서 필수응답·검증·CAPTCHA·파일 업로드 제한 등으로 이후 탐색을 중단했습니다.`;
}

export function limitationStatusSummary(
  status: CaptureStatus,
  count: number,
): string {
  switch (status) {
    case "success":
      return `자동 화면 캡처 완료: ${count}장.`;
    case "partial":
      return `일부 화면만 자동 캡처되었습니다. (${count}장)`;
    case "timeout":
      return count > 0
        ? `캡처 제한 시간 초과 전까지 ${count}장은 확보했습니다.`
        : "캡처 제한 시간을 초과했습니다.";
    case "failed":
    default:
      return "자동 화면 캡처를 완료하지 못했습니다.";
  }
}

export function deriveCaptureStatus(
  shotCount: number,
  stoppedEarly: boolean,
  timedOut: boolean,
): CaptureStatus {
  if (timedOut) return shotCount > 0 ? "partial" : "timeout";
  if (shotCount === 0) return "failed";
  if (stoppedEarly) return "partial";
  return "success";
}
