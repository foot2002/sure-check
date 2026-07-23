import JSZip from "jszip";
import { buildComplaintDraft } from "@/lib/evidence/buildComplaintDraft";
import { buildEvidenceSummaryHtml } from "@/lib/evidence/buildEvidenceSummaryHtml";
import { sha256Hex } from "@/lib/evidence/hash";
import {
  EVIDENCE_DISCLAIMER,
  MAX_SOURCE_EXCERPT_BYTES,
  type EvidencePackageCaptureOptions,
  type ManualEvidenceFile,
  type ReportEvidenceModel,
  type ScreenCaptureEvidenceMeta,
} from "@/lib/evidence/evidenceTypes";
import {
  formatEvidenceTimestamp,
  sanitizeFilename,
  truncateText,
} from "@/lib/evidence/sanitizeFilename";
import { toCsv } from "@/lib/evidence/toCsv";

export interface BuiltEvidencePackage {
  blob: Blob;
  fileName: string;
  fileCount: number;
}

function readmeText(): string {
  return [
    "이 자료는 SURE Check 진단 결과를 바탕으로 생성된 신고 참고자료입니다.",
    "신고기관의 사실관계 확인을 돕기 위한 자료입니다.",
    "최종 위법 여부는 개인정보보호위원회 또는 KISA의 검토·조사 결과에 따라 판단됩니다.",
    "설문 링크가 종료되었거나 수정된 경우, 본 자료는 진단 당시 확인된 내용의 참고자료로 활용될 수 있습니다.",
    "화면 캡처가 포함된 경우, 캡처 이미지는 진단 또는 사용자가 추가한 당시의 화면입니다.",
    "",
  ].join("\n");
}

function captureFolderReadme(options: {
  autoCount: number;
  manualCount: number;
  captureAttempted: boolean;
  limitations: string[];
}): string {
  if (options.autoCount > 0 || options.manualCount > 0) {
    return [
      "이 폴더에는 SURE Check가 진단 당시 자동으로 캡처한 공개 설문 화면이 포함되어 있습니다.",
      options.manualCount > 0
        ? "사용자가 추가로 첨부한 캡처 이미지도 함께 포함되어 있습니다."
        : "",
      "",
      "자동 캡처는 응답자가 아무것도 입력하지 않은 상태에서 수행되었습니다.",
      "SURE Check는 임의 응답 입력, 다음 단계 강제 이동, 제출 버튼 클릭을 수행하지 않습니다.",
      "",
      "캡처 이미지는 신고기관의 사실관계 확인을 돕기 위한 참고자료입니다.",
      "최종 위법 여부는 개인정보보호위원회 또는 KISA의 검토·조사 결과에 따라 판단됩니다.",
      "",
      ...(options.limitations.length > 0
        ? ["[추가 제한 사항]", ...options.limitations.map((l) => `- ${l}`), ""]
        : []),
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  if (options.captureAttempted) {
    return [
      "자동 화면 캡처를 완료하지 못했습니다.",
      "",
      "가능한 사유:",
      "",
      "설문 페이지 접근 제한",
      "로딩 시간 초과",
      "브라우저 자동화 차단",
      "로그인 필요",
      "필수응답이 있어 다음 페이지 이동 불가",
      "",
      ...(options.limitations.length > 0
        ? ["[기록된 사유]", ...options.limitations.map((l) => `- ${l}`), ""]
        : []),
      "본 패키지는 문항 원문, 고지문 원문, 원본 추출자료, 진단일시, URL, 해시값을 중심으로 구성되었습니다.",
      "",
    ].join("\n");
  }

  return [
    "자동 또는 수동으로 추가된 화면 캡처가 없습니다. 본 패키지는 문항 원문, 고지문, 원본 추출자료, 진단일시와 해시값을 중심으로 구성되었습니다.",
    "",
  ].join("\n");
}

function noticeResultText(model: ReportEvidenceModel): string {
  const lines = [
    "[개인정보 수집·이용 고지문 원문 또는 추출된 부분]",
    model.noticeExcerpt,
    "",
    "[확인 결과]",
  ];
  for (const check of model.noticeChecks) {
    lines.push(`- ${check.item}: ${check.status} (${check.evidence})`);
  }
  const missing = model.noticeChecks
    .filter((c) => c.status.includes("미확인") || c.status.includes("부족"))
    .map((c) => c.item);
  lines.push("", "[미확인·부족 항목 목록]");
  if (missing.length === 0) {
    lines.push("- (해당 없음)");
  } else {
    for (const item of missing) lines.push(`- ${item}`);
  }
  lines.push("");
  return lines.join("\n");
}

function legalGroundsText(model: ReportEvidenceModel): string {
  const lines = [
    "실제 진단에 적용된 법·정책 근거입니다.",
    "아래 내용은 ‘위반 확정’이 아니라 ‘위반 소지·확인 필요·검토 필요’ 관점의 참고입니다.",
    "",
  ];
  if (model.legalGrounds.length === 0) {
    lines.push("(해당 케이스에 적용된 추가 법·정책 태그 없음)");
  } else {
    for (const ground of model.legalGrounds) {
      lines.push(`${ground.label}: ${ground.reviewNote}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function manualScreenshotFileName(index: number, originalName: string): string {
  const safe = sanitizeFilename(originalName.replace(/\.[^.]+$/, ""), 28);
  const extMatch = originalName.match(/\.(png|jpe?g|pdf)$/i);
  const ext = (extMatch?.[1] || "bin").toLowerCase().replace("jpeg", "jpg");
  const padded = String(index).padStart(2, "0");
  return `screenshot_${padded}_user_added_${safe}.${ext}`;
}

function escapeForHtmlExcerpt(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function buildEvidencePackage(
  model: ReportEvidenceModel,
  manualFiles: ManualEvidenceFile[] = [],
  capture: EvidencePackageCaptureOptions = {},
): Promise<BuiltEvidencePackage> {
  const zip = new JSZip();
  const stamp = formatEvidenceTimestamp(new Date(model.generatedAt));
  const safeTitle = sanitizeFilename(model.surveyTitle);
  const fileName = `SURE_Check_신고증빙_${stamp}_${safeTitle}.zip`;

  const autoScreenshots = capture.autoScreenshots ?? [];
  const captureLimitations = capture.captureLimitations ?? [];
  const captureAttempted = Boolean(capture.captureAttempted);

  const screenshotEntries: Array<{
    path: string;
    content: Uint8Array;
    meta: Omit<ScreenCaptureEvidenceMeta, "sha256">;
  }> = [];

  for (const shot of autoScreenshots) {
    const path = `08_화면캡처/${shot.fileName}`;
    screenshotEntries.push({
      path,
      content: shot.bytes,
      meta: {
        id: shot.id,
        storedName: path,
        mimeType: shot.mimeType,
        size: shot.size || shot.bytes.byteLength,
        source: "auto_browser_capture",
        capturedAt: shot.capturedAt,
        capturedAtKST: shot.capturedAtKst,
        capturedUrl: shot.capturedUrl,
        finalUrl: shot.finalUrl,
        pageTitle: shot.pageTitle,
        viewport: shot.viewport,
        label: shot.label,
      },
    });
  }

  manualFiles.forEach((file, index) => {
    const stored = manualScreenshotFileName(index + 1, file.fileName);
    const path = `08_화면캡처/${stored}`;
    screenshotEntries.push({
      path,
      content: file.bytes,
      meta: {
        id: `manual_screenshot_${String(index + 1).padStart(2, "0")}`,
        storedName: path,
        mimeType: file.mimeType,
        size: file.bytes.byteLength,
        source: "manual_upload",
        capturedAt: new Date().toISOString(),
        label: file.label || file.fileName,
      },
    });
  });

  const screenCaptureEvidence: ScreenCaptureEvidenceMeta[] = [];
  for (const entry of screenshotEntries) {
    const sha256 = await sha256Hex(entry.content);
    screenCaptureEvidence.push({ ...entry.meta, sha256 });
  }

  const files: Array<{ path: string; content: string | Uint8Array }> = [];

  files.push({ path: "00_읽어주세요.txt", content: readmeText() });
  files.push({
    path: "01_신고내용_요약서.html",
    content: buildEvidenceSummaryHtml(model, {
      screenCaptureEvidence,
      captureLimitations,
      captureAttempted,
    }),
  });
  files.push({
    path: "02_신고서_작성_초안.txt",
    content: buildComplaintDraft(model, {
      screenCaptureEvidence,
      captureLimitations,
      captureAttempted,
    }),
  });
  files.push({
    path: "03_탐지문항_목록.csv",
    content: toCsv(
      [
        "questionNumber",
        "questionText",
        "detectedDataType",
        "riskCategory",
        "matchedKeyword",
        "source",
        "confidence",
      ],
      model.detectedQuestions.map((q) => [
        q.questionNumber,
        q.questionText,
        q.detectedDataType,
        q.riskCategory,
        q.matchedKeyword,
        q.source,
        q.confidence,
      ]),
    ),
  });
  files.push({
    path: "04_개인정보_분류표.csv",
    content: toCsv(
      [
        "dataItem",
        "category",
        "examples",
        "detectedQuestions",
        "riskReason",
      ],
      model.detectedDataItems.map((d) => [
        d.dataItem,
        d.category,
        d.examples,
        d.detectedQuestions,
        d.riskReason,
      ]),
    ),
  });
  files.push({
    path: "05_고지문_확인결과.txt",
    content: noticeResultText(model),
  });
  files.push({
    path: "06_법정책_검토근거.txt",
    content: legalGroundsText(model),
  });

  for (const source of model.extractionSources) {
    const excerpt = truncateText(source.excerpt, MAX_SOURCE_EXCERPT_BYTES);
    if (source.label === "extracted_questions.json") {
      files.push({
        path: "07_원본추출자료/extracted_questions.json",
        content: excerpt,
      });
    } else if (source.label === "extracted_notice.txt") {
      files.push({
        path: "07_원본추출자료/extracted_notice.txt",
        content: excerpt,
      });
    } else if (source.label === "extracted_source_excerpt.txt") {
      files.push({
        path: "07_원본추출자료/extracted_source_excerpt.txt",
        content: excerpt,
      });
    }
  }

  if (model.sourceType === "file") {
    const meta = {
      fileName: model.fileName || null,
      sourceType: model.sourceType,
      diagnosisId: model.diagnosisId,
      extractedAt: model.generatedAt,
      note: "업로드 파일 메타데이터만 포함하며, 응답 결과·개인 응답값은 포함하지 않습니다.",
    };
    files.push({
      path: "07_원본추출자료/uploaded_file_metadata.json",
      content: JSON.stringify(meta, null, 2),
    });
    files.push({
      path: "07_원본추출자료/extracted_text.txt",
      content: truncateText(
        [
          `설문 제목: ${model.surveyTitle}`,
          `운영기관: ${model.operatorName}`,
          "",
          "[고지문 원문]",
          model.privacyNotice?.rawText || model.noticeExcerpt,
          "",
          "[탐지된 개인정보 문항 원문]",
          ...model.detectedQuestions.map(
            (q) => `${q.questionNumber}. ${q.questionText}`,
          ),
        ].join("\n"),
        MAX_SOURCE_EXCERPT_BYTES,
      ),
    });
  } else {
    const noticeHtml = escapeForHtmlExcerpt(
      model.privacyNotice?.rawText || model.noticeExcerpt,
    );
    const questionHtml = model.detectedQuestions
      .slice(0, 30)
      .map(
        (q) =>
          `<li><strong>${escapeForHtmlExcerpt(q.questionNumber)}</strong> ${escapeForHtmlExcerpt(q.questionText)}</li>`,
      )
      .join("\n");
    files.push({
      path: "07_원본추출자료/raw_public_html_excerpt.html",
      content: truncateText(
        `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8" /><title>${escapeForHtmlExcerpt(model.surveyTitle)}</title></head>
<body>
  <h1>${escapeForHtmlExcerpt(model.surveyTitle)}</h1>
  <p>Survey URL: ${escapeForHtmlExcerpt(model.surveyUrl)}</p>
  <p>Final URL: ${escapeForHtmlExcerpt(model.finalUrl)}</p>
  <p>Tool: ${escapeForHtmlExcerpt(model.toolName)}</p>
  <p>Operator: ${escapeForHtmlExcerpt(model.operatorName)}</p>
  <h2>개인정보 고지문 (추출)</h2>
  <pre>${noticeHtml}</pre>
  <h2>탐지된 개인정보 문항 (추출)</h2>
  <ul>
${questionHtml || "    <li>(해당 없음)</li>"}
  </ul>
</body>
</html>
`,
        MAX_SOURCE_EXCERPT_BYTES,
      ),
    });
    files.push({
      path: "07_원본추출자료/raw_embedded_json_excerpt.json",
      content: truncateText(
        JSON.stringify(
          {
            note: "공개 문항·고지문·메타 요약만 포함. 응답값·세션·쿠키·토큰 제외.",
            surveyTitle: model.surveyTitle,
            surveyUrl: model.surveyUrl,
            finalUrl: model.finalUrl,
            toolName: model.toolName,
            operatorName: model.operatorName,
            totalQuestionCount: model.totalQuestionCount,
            detectedPersonalDataQuestionCount:
              model.detectedPersonalDataQuestionCount,
            detectedSensitiveQuestionCount:
              model.detectedSensitiveQuestionCount,
            detectedHighRiskQuestionCount: model.detectedHighRiskQuestionCount,
            detectedPersonalDataItems: model.detectedPersonalDataItems,
            privacyNoticeExcerpt: (
              model.privacyNotice?.rawText || model.noticeExcerpt
            ).slice(0, 4000),
            detectedQuestions: model.detectedQuestions.map((q) => ({
              questionNumber: q.questionNumber,
              questionText: q.questionText,
              detectedDataType: q.detectedDataType,
              riskCategory: q.riskCategory,
            })),
          },
          null,
          2,
        ),
        MAX_SOURCE_EXCERPT_BYTES,
      ),
    });
  }

  for (const entry of screenshotEntries) {
    files.push({ path: entry.path, content: entry.content });
  }
  files.push({
    path: "08_화면캡처/README.txt",
    content: captureFolderReadme({
      autoCount: autoScreenshots.length,
      manualCount: manualFiles.length,
      captureAttempted,
      limitations: captureLimitations,
    }),
  });

  const hashLines: string[] = [
    `생성일시(KST): ${model.generatedAtKst}`,
    `생성일시(ISO): ${model.generatedAt}`,
    "",
    "목적: 파일 위·변조 여부 확인을 돕기 위한 SHA-256 값입니다.",
    "",
  ];
  const fileHashes: Record<string, string> = {};

  for (const file of files) {
    const hash = await sha256Hex(file.content);
    fileHashes[file.path] = hash;
    hashLines.push(file.path);
    hashLines.push(`SHA-256: ${hash}`);
    hashLines.push("");
  }

  const hashText = hashLines.join("\n");
  const hashOfHashList = await sha256Hex(hashText);
  fileHashes["09_해시값_SHA256.txt"] = hashOfHashList;

  const evidenceFiles = [
    ...files.map((f) => f.path),
    "09_해시값_SHA256.txt",
    "evidence-manifest.json",
  ];

  const enrichedLimitations = [
    ...model.limitations,
    ...captureLimitations.filter((l) => !model.limitations.includes(l)),
  ];

  const manifest = {
    packageVersion: model.packageVersion,
    generatedAt: model.generatedAt,
    generatedAtKST: model.generatedAtKst,
    diagnosisId: model.diagnosisId,
    surveyTitle: model.surveyTitle,
    surveyUrl: model.surveyUrl,
    finalUrl: model.finalUrl,
    sourceType: model.sourceType,
    toolName: model.toolName,
    operatorName: model.operatorName,
    subjectType: model.subjectType,
    subjectEvidence: model.subjectEvidence,
    userDecision: model.userDecision,
    internalVerdict: model.internalVerdict,
    totalQuestionCount: model.totalQuestionCount,
    detectedPersonalDataQuestionCount: model.detectedPersonalDataQuestionCount,
    detectedSensitiveQuestionCount: model.detectedSensitiveQuestionCount,
    detectedHighRiskQuestionCount: model.detectedHighRiskQuestionCount,
    detectedPersonalDataItems: model.detectedPersonalDataItems,
    detectedSensitiveDataItems: model.detectedSensitiveDataItems,
    detectedHighRiskDataItems: model.detectedHighRiskDataItems,
    noticeCheckSummary: model.noticeChecks.map((n) => ({
      item: n.item,
      status: n.status,
    })),
    privacyNoticeDetectedItems: model.privacyNotice?.detectedItems ?? [],
    screenCaptureEvidence,
    captureLimitations,
    evidenceFiles,
    fileHashes,
    limitations: enrichedLimitations,
    disclaimer: model.disclaimer || EVIDENCE_DISCLAIMER,
  };

  const finalManifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  for (const file of files) {
    zip.file(file.path, file.content);
  }
  zip.file("09_해시값_SHA256.txt", hashText);
  zip.file("evidence-manifest.json", finalManifestText);

  const blob = await zip.generateAsync({ type: "blob" });
  return {
    blob,
    fileName,
    fileCount: evidenceFiles.length,
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
