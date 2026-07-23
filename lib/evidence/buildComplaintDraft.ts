import type {
  ReportEvidenceModel,
  ScreenCaptureEvidenceMeta,
} from "@/lib/evidence/evidenceTypes";

function isPublicSubject(subjectType: string): boolean {
  return (
    subjectType === "public_agency" ||
    subjectType === "public_commissioned_private" ||
    subjectType === "school_local"
  );
}

function formatItems(items: string[]): string {
  const list = items.filter(Boolean);
  if (list.length === 0) return "개인정보 관련 항목";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]}, ${list[1]}`;
  return `${list.slice(0, 3).join(", ")} 등`;
}

function isMissing(status: string): boolean {
  return status.includes("미확인") || status.includes("부족");
}

function isConfirmed(status: string): boolean {
  return status.includes("확인됨");
}

export interface ComplaintDraftCaptureContext {
  screenCaptureEvidence?: ScreenCaptureEvidenceMeta[];
  captureLimitations?: string[];
  captureAttempted?: boolean;
}

export function buildComplaintDraft(
  model: ReportEvidenceModel,
  capture: ComplaintDraftCaptureContext = {},
): string {
  const publicLike = isPublicSubject(model.subjectType);
  const tool = model.toolName;
  const isGoogle = /google/i.test(tool);
  const detected = formatItems([
    ...model.detectedPersonalDataItems,
    ...model.detectedSensitiveDataItems,
    ...model.detectedHighRiskDataItems,
  ]);

  const confirmedCore = model.noticeChecks.filter(
    (n) =>
      /수집 목적|수집 항목|보유기간|파기|거부권/.test(n.item) &&
      isConfirmed(n.status),
  );
  const missingActionable = model.noticeChecks.filter(
    (n) =>
      isMissing(n.status) &&
      /담당|문의|위탁|외부도구|원자료|국외/.test(n.item),
  );

  let noticePhrase: string;
  if (confirmedCore.length >= 3) {
    const confirmedLabels = confirmedCore.map((n) => n.item).slice(0, 5);
    noticePhrase = `개인정보 ${confirmedLabels.join(", ")} 안내는 일부 확인됩니다.`;
    const followUps: string[] = [];
    if (publicLike) {
      followUps.push(
        `다만 공공기관이 외부 설문도구인 ${tool}을 통해 ${detected} 등 직접식별정보를 수집하고 있어, 위탁 또는 외부도구 처리 기준, 원자료 접근권한, 보관 위치, 파기 방식, CSAP 등 공공부문 클라우드 보안 기준 충족 여부 확인이 필요해 보입니다.`,
      );
    } else {
      followUps.push(
        `다만 외부 설문도구인 ${tool}을 통해 ${detected} 등을 수집하고 있어, 위탁 또는 외부도구 처리 기준, 원자료 접근권한, 보관·파기 기준 확인이 필요해 보입니다.`,
      );
    }
    if (missingActionable.some((n) => /담당|문의/.test(n.item))) {
      followUps.push(
        "담당부서 또는 문의처는 고지문에서 충분히 확인되지 않았습니다.",
      );
    }
    if (isGoogle) {
      followUps.push(
        "국외 보관·이전 안내 여부도 함께 확인이 필요할 수 있습니다.",
      );
    }
    noticePhrase = `${noticePhrase} ${followUps.join(" ")}`;
  } else {
    const missingCore = model.noticeChecks
      .filter(
        (n) =>
          isMissing(n.status) &&
          /수집 목적|수집 항목|보유기간|파기|거부권/.test(n.item),
      )
      .map((n) => n.item);
    noticePhrase =
      missingCore.length > 0
        ? `${missingCore.slice(0, 4).join(", ")} 등이 충분히 확인되지 않았습니다.`
        : "개인정보 수집·이용 관련 안내가 충분히 확인되지 않은 부분이 있습니다.";
  }

  const subjectPhrase = publicLike
    ? `아래 설문은 ${model.operatorName}에서 운영하는 것으로 보이며`
    : `아래 설문은 ${model.operatorName} 측에서 운영하는 것으로 보이며`;

  const title = publicLike
    ? "공공기관 설문에서 개인정보 수집 및 외부 설문도구 사용 관련 신고 검토 요청"
    : "설문에서 개인정보 수집 및 외부 설문도구 사용 관련 신고 검토 요청";

  const body = [
    `${subjectPhrase}, ${tool}를 통해 개인정보를 수집하고 있습니다.`,
    `진단 당시 확인된 문항에는 ${detected}이(가) 포함되어 있었고, ${noticePhrase}`,
    "이에 개인정보보호법 및 관련 기준 위반 소지가 있는지 검토를 요청드립니다.",
  ].join(" ");

  const autoCount = (capture.screenCaptureEvidence ?? []).filter(
    (c) => c.source === "auto_browser_capture",
  ).length;
  const captureAttachmentNote =
    autoCount > 0
      ? "화면 캡처 자료"
      : capture.captureAttempted
        ? "화면 캡처 자료는 자동 수집되지 않았습니다."
        : "08_화면캡처/ (있는 경우)";

  const attachments = [
    "00_읽어주세요.txt",
    "01_신고내용_요약서.html",
    "02_신고서_작성_초안.txt",
    "03_탐지문항_목록.csv",
    "04_개인정보_분류표.csv",
    "05_고지문_확인결과.txt",
    "06_법정책_검토근거.txt",
    "07_원본추출자료/",
    captureAttachmentNote,
    "09_해시값_SHA256.txt",
    "evidence-manifest.json",
  ];

  return [
    "제목:",
    title,
    "",
    "본문:",
    body,
    "",
    "———",
    `설문 URL: ${model.surveyUrl || "(파일 진단)"}`,
    `진단일시(KST): ${model.generatedAtKst}`,
    `사용도구: ${model.toolName}`,
    `운영기관: ${model.operatorName}`,
    `탐지된 개인정보 항목: ${detected}`,
    "",
    "첨부자료 목록:",
    ...attachments.map((item) => `- ${item}`),
    "",
    "참고:",
    "이 문안은 SURE Check 자동 진단 결과를 바탕으로 한 신고 작성 참고용입니다.",
    "최종 위법 여부는 개인정보보호위원회 또는 KISA의 검토·조사 결과에 따라 판단됩니다.",
    "",
  ].join("\n");
}
