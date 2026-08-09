/**
 * Split "문항 분석 불가/제한" into operational outcome buckets.
 * Uses limited_reason / diagnosis status / decision labels — not diagnosis rules.
 */

export type LimitedOutcomeBucket =
  | "normal_diagnosis"
  | "survey_closed"
  | "access_restricted"
  | "extraction_limited"
  | "system_failure";

export type LimitedOutcomeCounts = Record<LimitedOutcomeBucket, number>;

export function emptyLimitedOutcomeCounts(): LimitedOutcomeCounts {
  return {
    normal_diagnosis: 0,
    survey_closed: 0,
    access_restricted: 0,
    extraction_limited: 0,
    system_failure: 0,
  };
}

const CLOSED_RE =
  /응답이\s*종료|설문이\s*종료|종료된\s*(모아폼|설문|Google)|모아폼\s*응답이\s*종료|네이버폼\s*응답이\s*종료|응답\s*기간이?\s*종료|응답이\s*마감|더\s*이상\s*응답|마감된\s*설문|this\s*form\s*is\s*no\s*longer\s*accepting|form\s*(is\s*)?closed|종료되었거나\s*비공개/i;

const ACCESS_RE =
  /로그인\s*필요|로그인이\s*필요|로그인\s*또는\s*접근|접근\s*권한|권한이\s*필요|비공개|access\s*denied|private|restricted|permission/i;

const EXTRACT_RE =
  /JavaScript|fetch\s*기반|문항을\s*자동|확인하지\s*못했|읽지\s*못했|동적|문항\s*후보|구조를\s*자동|추출이\s*제한|분석이\s*제한/i;

const SYSTEM_RE =
  /시간이\s*초과|timeout|timed?\s*out|unexpected|exception|다시\s*시도|FUNCTION_INVOCATION|INTERNAL|ECONNRESET/i;

export function classifyLimitedOutcome(input: {
  overallRiskLevel?: string | null;
  diagnosisStatus?: string | null;
  userDecisionLabel?: string | null;
  limitedReason?: string | null;
  errorMessage?: string | null;
  summary?: string | null;
  scanStatus?: string | null;
}): LimitedOutcomeBucket {
  const risk = String(input.overallRiskLevel || "");
  const diagnosis = String(input.diagnosisStatus || "");
  const decision = String(input.userDecisionLabel || "");
  const scanStatus = String(input.scanStatus || "");
  const text = [
    input.limitedReason || "",
    input.errorMessage || "",
    input.summary || "",
    decision,
  ].join(" ");

  const looksLimited =
    risk === "limited" ||
    diagnosis === "limited" ||
    /문항 분석 불가|문항 분석 제한/.test(decision) ||
    scanStatus === "limited" ||
    scanStatus === "failed";

  if (!looksLimited) return "normal_diagnosis";

  if (scanStatus === "failed" || SYSTEM_RE.test(text)) {
    // Prefer closed/access if those are clearer than generic retry copy.
    if (CLOSED_RE.test(text) && !/다시\s*시도/.test(text)) return "survey_closed";
    if (ACCESS_RE.test(text) && !EXTRACT_RE.test(text)) return "access_restricted";
    if (/다시\s*시도|timeout|시간이\s*초과|unexpected|exception/i.test(text)) {
      return "system_failure";
    }
  }

  if (CLOSED_RE.test(text)) return "survey_closed";
  if (ACCESS_RE.test(text) && !EXTRACT_RE.test(text)) return "access_restricted";
  // Login message that also mentions extract noise still counts as access.
  if (/로그인/.test(text) && !/JavaScript|fetch\s*기반|문항을\s*자동으로\s*읽지/.test(text)) {
    return "access_restricted";
  }
  if (EXTRACT_RE.test(text)) return "extraction_limited";
  if (SYSTEM_RE.test(text)) return "system_failure";
  return "extraction_limited";
}

/** Clear closed/login signals safe for Collector status feedback. */
/** Cases that belong in general admin reporting (questions were analyzable). */
export function isReportableAdminOutcome(
  bucket: LimitedOutcomeBucket,
): boolean {
  return bucket === "normal_diagnosis";
}

export function collectorFeedbackFromLimitedReason(
  limitedReason: string | null | undefined,
): "closed" | "restricted" | null {
  const text = limitedReason || "";
  if (!text.trim()) return null;
  if (/JavaScript|fetch\s*기반|문항을\s*자동|확인하지\s*못했|읽지\s*못했|동적|timeout|시간이\s*초과/i.test(text)) {
    return null;
  }
  if (
    /네이버폼\s*응답이\s*종료|모아폼\s*응답이\s*종료|응답이\s*종료되었습니다|설문이\s*종료|응답이\s*마감|더\s*이상\s*응답/i.test(
      text,
    )
  ) {
    return "closed";
  }
  // Ambiguous "종료되었거나 비공개" → closed (response window over or unavailable)
  if (/종료되었거나\s*비공개/i.test(text)) {
    return "closed";
  }
  if (
    /로그인\s*또는\s*접근|로그인이\s*필요|로그인\s*필요|접근\s*권한이\s*필요|권한이\s*필요/i.test(
      text,
    )
  ) {
    return "restricted";
  }
  return null;
}
