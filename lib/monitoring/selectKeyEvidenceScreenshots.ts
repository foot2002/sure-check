import type {
  AutoScreenshotPayload,
  CapturePageMeta,
} from "@/lib/evidence/capture/captureTypes";
import type { EvidenceType, RetentionLevel } from "@/lib/db/types";

export interface KeyEvidenceSelection {
  screenshot: AutoScreenshotPayload;
  pageMeta: CapturePageMeta | null;
  evidenceType: EvidenceType;
  retentionLevel: RetentionLevel;
  label: string;
}

const NOTICE_PATTERN =
  /개인정보|수집\s*·?\s*이용|수집이용|보유\s*기간|파기|동의|고지|안내문|처리\s*방침|privacy|consent/i;

function metaText(meta: CapturePageMeta): string {
  return [
    meta.pageTitle,
    ...(meta.detectedQuestions || []),
    ...(meta.visibleQuestions || []),
    ...(meta.personalInfoQuestions || []),
  ].join("\n");
}

function isNoticePage(meta: CapturePageMeta): boolean {
  return NOTICE_PATTERN.test(metaText(meta));
}

function resolveEvidenceType(meta: CapturePageMeta): {
  evidenceType: EvidenceType;
  retentionLevel: RetentionLevel;
  label: string;
} | null {
  if ((meta.highRiskQuestions || []).length > 0) {
    return {
      evidenceType: "high_risk_question_screenshot",
      retentionLevel: "key_evidence",
      label: `고위험정보 문항 p.${meta.pageNumber}`,
    };
  }
  if ((meta.sensitiveInfoQuestions || []).length > 0) {
    return {
      evidenceType: "sensitive_question_screenshot",
      retentionLevel: "key_evidence",
      label: `민감정보 문항 p.${meta.pageNumber}`,
    };
  }
  if ((meta.personalInfoQuestions || []).length > 0) {
    return {
      evidenceType: "pii_question_screenshot",
      retentionLevel: "key_evidence",
      label: `개인정보 문항 p.${meta.pageNumber}`,
    };
  }
  if (isNoticePage(meta)) {
    return {
      evidenceType: "notice_screenshot",
      retentionLevel: "short_term",
      label: `고지·안내 p.${meta.pageNumber}`,
    };
  }
  if (meta.finalSubmitDetected) {
    return {
      evidenceType: "key_screenshot",
      retentionLevel: "short_term",
      label: `제출 직전 p.${meta.pageNumber}`,
    };
  }
  if (meta.pageNumber === 1) {
    return {
      evidenceType: "key_screenshot",
      retentionLevel: "short_term",
      label: `첫 페이지 p.${meta.pageNumber}`,
    };
  }
  return null;
}

function screenshotKey(shot: AutoScreenshotPayload): string {
  return (
    shot.fileName ||
    (typeof shot.pageNumber === "number" ? `page_${shot.pageNumber}` : shot.id)
  );
}

/**
 * Select key evidence screenshots only — never the full capture set for long-term storage.
 */
export function selectKeyEvidenceScreenshots(
  screenshots: AutoScreenshotPayload[],
  pageMetas: CapturePageMeta[],
): KeyEvidenceSelection[] {
  const metaByFile = new Map<string, CapturePageMeta>();
  const metaByPage = new Map<number, CapturePageMeta>();
  for (const meta of pageMetas) {
    metaByFile.set(meta.screenshotFileName, meta);
    metaByPage.set(meta.pageNumber, meta);
  }

  const selected = new Map<string, KeyEvidenceSelection>();

  for (const shot of screenshots) {
    const meta =
      metaByFile.get(shot.fileName) ||
      (typeof shot.pageNumber === "number"
        ? metaByPage.get(shot.pageNumber) || null
        : null);
    if (!meta) {
      // Keep page 1 / labeled first shot if meta missing
      if (shot.pageNumber === 1 || /page_0?1\./i.test(shot.fileName)) {
        selected.set(screenshotKey(shot), {
          screenshot: shot,
          pageMeta: null,
          evidenceType: "key_screenshot",
          retentionLevel: "short_term",
          label: "첫 페이지",
        });
      }
      continue;
    }

    const resolved = resolveEvidenceType(meta);
    if (!resolved) continue;

    const key = screenshotKey(shot);
    const existing = selected.get(key);
    // Prefer higher-severity type if already selected
    const rank = (t: EvidenceType) =>
      t === "high_risk_question_screenshot"
        ? 5
        : t === "sensitive_question_screenshot"
          ? 4
          : t === "pii_question_screenshot"
            ? 3
            : t === "notice_screenshot"
              ? 2
              : 1;
    if (!existing || rank(resolved.evidenceType) > rank(existing.evidenceType)) {
      selected.set(key, {
        screenshot: shot,
        pageMeta: meta,
        evidenceType: resolved.evidenceType,
        retentionLevel: resolved.retentionLevel,
        label: resolved.label,
      });
    }
  }

  return [...selected.values()].sort(
    (a, b) =>
      (a.pageMeta?.pageNumber ?? a.screenshot.pageNumber ?? 0) -
      (b.pageMeta?.pageNumber ?? b.screenshot.pageNumber ?? 0),
  );
}
