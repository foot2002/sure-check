/**
 * Collector freshness / availability policy.
 * Dates are always computed from runtime KST — never hardcode a calendar year.
 */

import { looksLikePersonalResearch } from "@/lib/collector/candidateTriage";
import { validateSurveyPage } from "@/lib/collector/pageValidate";
import type { CollectorPlatform, CollectorSurveyStatus } from "@/lib/collector/types";
import {
  htmlLooksClosedSurvey,
  htmlLooksLoginRequired,
  isClosedSurveyUrl,
} from "@/lib/scan/surveyStatusSignals";

export const DEFAULT_RECENT_SURVEY_WINDOW_DAYS = 60;
export const MAX_COLLECTION_WINDOW_DAYS = 90;

export type FreshnessAvailabilityStatus =
  | "active"
  | "closed"
  | "restricted"
  | "stale"
  | "unknown";

export type FreshnessReasonCode =
  | "recent_window"
  | "current_year"
  | "published_recent"
  | "active_unknown_date"
  | "date_unknown_hold"
  | "in_progress_phrase"
  | "previous_year_phrase"
  | "active_candidate"
  | "end_date_passed"
  | "start_date_future"
  | "closed_phrase"
  | "closed_url"
  | "restricted_phrase"
  | "stale_year"
  | "stale_topic_year"
  | "published_too_old"
  | "personal_research"
  | "unknown_no_signal";

export type SurveyFreshnessRecord = {
  freshness_status: FreshnessAvailabilityStatus | "stale_candidate" | "scheduled" | "active_candidate";
  availability_status: FreshnessAvailabilityStatus;
  detected_start_date: string | null;
  detected_end_date: string | null;
  detected_year: number | null;
  freshness_reason: string;
  reason_code: FreshnessReasonCode;
  last_checked_at: string;
  should_diagnose: boolean;
  diagnosis_eligible_recent: boolean;
  diagnosis_exclusion_reason: string | null;
};

export type FreshnessCheckResult = {
  shouldDiagnose: boolean;
  /** Persist to survey_links.status (stale may fall back to ignored in DB). */
  status: CollectorSurveyStatus;
  availabilityStatus: FreshnessAvailabilityStatus;
  reason: string;
  reasonCode: FreshnessReasonCode;
  detectedStartDate?: string;
  detectedEndDate?: string;
  detectedYear?: number;
  evidenceText?: string;
  shouldPageValidate: boolean;
  record: SurveyFreshnessRecord;
};

export type FreshnessTextInput = {
  title?: string | null;
  snippet?: string | null;
  url?: string | null;
  pageText?: string | null;
  publishedAt?: string | null;
  /** search = pre-page filter; page = after live fetch. */
  mode?: "search" | "page";
  /** Page validator already confirmed a live survey shell. */
  confirmedLive?: boolean;
  now?: Date;
};

const CLOSED_PHRASE_RE =
  /응답\s*종료|설문\s*종료|조사\s*종료|접수\s*종료|신청\s*종료|마감되었습니다|종료되었습니다|더\s*이상\s*응답을\s*받지\s*않습니다|더\s*이상\s*응답|응답을\s*더\s*이상\s*받지|no longer accepting responses|not accepting responses|deadline\s*passed|this\s*form\s*is\s*no\s*longer\s*accepting|form\s*(is\s*)?closed|expired/i;

const CLOSED_DEADLINE_DONE_RE =
  /이미\s*마감|접수\s*마감|응답\s*마감|신청이\s*마감|모집이\s*마감|마감된\s*설문/i;

const RESTRICTED_PHRASE_RE =
  /로그인이\s*필요|로그인\s*후\s*이용|로그인\s*또는\s*접근|접근\s*권한이\s*없|권한이\s*필요|비공개\s*설문|private\s*form|sign[\s-]?in\s*required/i;

const TOPIC_YEAR_RE =
  /(\d{4})\s*년\s*도?\s*(만족도|실적|사업|평가|성과|운영|고객|교육|업무)/;

const RANGE_LABEL_RE = /(?:응답|조사|설문|접수|참여)\s*기간/;

const PREVIOUS_YEAR_PHRASE_RE = /작년|전년도|지난해/;

const IN_PROGRESS_PHRASE_RE =
  /진행\s*중|모집\s*중|응답\s*중|접수\s*중|참여\s*가능|현재\s*진행|현재\s*모집|현재\s*접수/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function getKstParts(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  ymd: string;
} {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  return {
    year,
    month,
    day,
    ymd: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

export function getRecentSurveyWindowDays(): number {
  const raw = process.env.RECENT_SURVEY_WINDOW_DAYS?.trim();
  const n = raw ? Number(raw) : DEFAULT_RECENT_SURVEY_WINDOW_DAYS;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RECENT_SURVEY_WINDOW_DAYS;
  return Math.min(MAX_COLLECTION_WINDOW_DAYS, Math.floor(n));
}

export function isStrictRecentCollection(): boolean {
  const v = process.env.STRICT_RECENT_COLLECTION?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00+09:00`);
  const b = Date.parse(`${toYmd}T00:00:00+09:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function ymdFromPublishedAt(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return getKstParts(new Date(t)).ymd;
}

function parseYmd(
  year: number,
  month: number,
  day: number,
): string | null {
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function collectExplicitYears(text: string): number[] {
  const years = new Set<number>();
  const re = /((?:19|20)\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    years.add(Number(m[1]));
  }
  return [...years];
}

function isTopicYearContext(text: string, year: number): boolean {
  const re = new RegExp(
    `${year}\\s*년\\s*도?\\s*(만족도|실적|사업|평가|성과|운영|고객|교육|업무)`,
  );
  return re.test(text) || TOPIC_YEAR_RE.test(text);
}

type ExtractedDates = {
  start: string | null;
  end: string | null;
  years: number[];
};

function extractSurveyDates(text: string, currentYear: number): ExtractedDates {
  const years = collectExplicitYears(text);
  let start: string | null = null;
  let end: string | null = null;

  const pushRange = (a: string | null, b: string | null) => {
    if (a && (!start || a < start)) start = a;
    if (b && (!end || b > end)) end = b;
  };

  const dotted =
    /((?:19|20)\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})\s*[일.]?\s*[~\-–—내지부터]+\s*(?:((?:19|20)\d{2})[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})/g;
  let m: RegExpExecArray | null;
  while ((m = dotted.exec(text))) {
    const y1 = Number(m[1]);
    const y2 = m[4] ? Number(m[4]) : y1;
    pushRange(
      parseYmd(y1, Number(m[2]), Number(m[3])),
      parseYmd(y2, Number(m[5]), Number(m[6])),
    );
  }

  const korean =
    /((?:19|20)\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*[~\-–—내지부터]+\s*(?:((?:19|20)\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/g;
  while ((m = korean.exec(text))) {
    const y1 = Number(m[1]);
    const y2 = m[4] ? Number(m[4]) : y1;
    pushRange(
      parseYmd(y1, Number(m[2]), Number(m[3])),
      parseYmd(y2, Number(m[5]), Number(m[6])),
    );
  }

  const iso =
    /((?:19|20)\d{2})-(\d{2})-(\d{2})\s*[~\-–—]+\s*((?:19|20)\d{2})-(\d{2})-(\d{2})/g;
  while ((m = iso.exec(text))) {
    pushRange(
      parseYmd(Number(m[1]), Number(m[2]), Number(m[3])),
      parseYmd(Number(m[4]), Number(m[5]), Number(m[6])),
    );
  }

  // Single labelled end date: 마감일 2026.8.31 / 종료일: 2026-08-01
  if (!end) {
    const labelledRange = RANGE_LABEL_RE.test(text);
    const single = labelledRange
      ? /(?:종료|마감|까지)[^\d]{0,8}((?:19|20)\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]?\s*(\d{1,2})?/
      : /(?:마감일|종료일|접수\s*마감|응답\s*마감)\s*[:：]?\s*((?:19|20)\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/;
    const sm = text.match(single);
    if (sm) {
      end = parseYmd(
        Number(sm[1]),
        Number(sm[2]),
        sm[3] ? Number(sm[3]) : 1,
      );
    }
  }

  void currentYear;
  return { start, end, years };
}

export function extractSurveyDateSignals(text: string): ExtractedDates {
  return extractSurveyDates(text, getKstParts().year);
}

const POSTED_DATE_RE =
  /(?:등록일|작성일|게시일|공지일|게재일|작성일자|등록일자)\s*[:：]?\s*((?:19|20)\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/;

export function extractPostedDateYmd(text: string): string | null {
  const match = text.match(POSTED_DATE_RE);
  if (!match) return null;
  return parseYmd(Number(match[1]), Number(match[2]), Number(match[3]));
}

function koreanReason(
  code: FreshnessReasonCode,
  year?: number | null,
): string {
  switch (code) {
    case "recent_window":
      return "최근 설문 기간 이내로 판단";
    case "current_year":
      return `${year ?? ""}년 설문 신호`.replace(/^년/, "현재 연도");
    case "published_recent":
      return "게시일이 최근이라 수집 대상으로 판단";
    case "active_unknown_date":
      return "날짜는 불명확해 자동진단을 보류";
    case "date_unknown_hold":
      return "날짜 불명 — 자동진단 보류";
    case "in_progress_phrase":
      return "현재 진행 중 표현이 있어 최근 설문으로 판단";
    case "previous_year_phrase":
      return "작년·전년도 신호로 과거 설문 제외";
    case "active_candidate":
      return "종료 문구 없이 최근 신호로 진단 후보";
    case "end_date_passed":
      return "마감일 경과";
    case "start_date_future":
      return "시작일이 미래라 아직 진단하지 않음";
    case "closed_phrase":
      return "응답 종료 문구 감지";
    case "closed_url":
      return "종료(closed) URL 감지";
    case "restricted_phrase":
      return "접근 권한 필요";
    case "stale_year":
      return `${year ?? "과거"}년 설문으로 판단되어 진단 제외`;
    case "stale_topic_year":
      return `${year ?? "과거"}년도 주제 설문 — 응답 가능 확인 전 진단 제외`;
    case "published_too_old":
      return "게시일이 수집 허용 기간을 초과";
    case "personal_research":
      return "개인 연구·논문 설문으로 수집 확정에서 제외";
    default:
      return "날짜·종료 신호가 없어 미확정";
  }
}

function toRecord(
  input: {
    availability: FreshnessAvailabilityStatus;
    freshnessStatus: SurveyFreshnessRecord["freshness_status"];
    code: FreshnessReasonCode;
    start?: string | null;
    end?: string | null;
    year?: number | null;
    shouldDiagnose: boolean;
    now: Date;
  },
): SurveyFreshnessRecord {
  return {
    freshness_status: input.freshnessStatus,
    availability_status: input.availability,
    detected_start_date: input.start ?? null,
    detected_end_date: input.end ?? null,
    detected_year: input.year ?? null,
    freshness_reason: koreanReason(input.code, input.year),
    reason_code: input.code,
    last_checked_at: input.now.toISOString(),
    should_diagnose: input.shouldDiagnose,
    diagnosis_eligible_recent: input.shouldDiagnose,
    diagnosis_exclusion_reason: input.shouldDiagnose ? null : input.code,
  };
}

function resultFrom(
  record: SurveyFreshnessRecord,
  extra: {
    status: CollectorSurveyStatus;
    shouldPageValidate: boolean;
    evidenceText?: string;
  },
): FreshnessCheckResult {
  return {
    shouldDiagnose: record.should_diagnose,
    status: extra.status,
    availabilityStatus: record.availability_status,
    reason: record.freshness_reason,
    reasonCode: record.reason_code,
    detectedStartDate: record.detected_start_date || undefined,
    detectedEndDate: record.detected_end_date || undefined,
    detectedYear: record.detected_year || undefined,
    evidenceText: extra.evidenceText,
    shouldPageValidate: extra.shouldPageValidate,
    record,
  };
}

export function evaluateSurveyFreshness(
  input: FreshnessTextInput,
): FreshnessCheckResult {
  const now = input.now ?? new Date();
  const kst = getKstParts(now);
  const windowDays = getRecentSurveyWindowDays();
  const blob = [input.title, input.snippet, input.pageText, input.url]
    .filter(Boolean)
    .join("\n");
  const evidence = blob.slice(0, 400);
  const mode = input.mode ?? "search";
  const dates = extractSurveyDates(blob, kst.year);

  const finish = (
    availability: FreshnessAvailabilityStatus,
    freshnessStatus: SurveyFreshnessRecord["freshness_status"],
    code: FreshnessReasonCode,
    status: CollectorSurveyStatus,
    shouldDiagnose: boolean,
    shouldPageValidate: boolean,
    year?: number | null,
  ): FreshnessCheckResult =>
    resultFrom(
      toRecord({
        availability,
        freshnessStatus,
        code,
        start: dates.start,
        end: dates.end,
        year: year ?? dates.years[0] ?? null,
        shouldDiagnose,
        now,
      }),
      { status, shouldPageValidate, evidenceText: evidence },
    );

  if (input.url && isClosedSurveyUrl(input.url)) {
    return finish("closed", "closed", "closed_url", "closed", false, false);
  }

  if (CLOSED_PHRASE_RE.test(blob) || CLOSED_DEADLINE_DONE_RE.test(blob)) {
    return finish("closed", "closed", "closed_phrase", "closed", false, false);
  }

  if (htmlLooksClosedSurvey(input.pageText || blob, input.title || "", input.url || "")) {
    return finish("closed", "closed", "closed_phrase", "closed", false, false);
  }

  if (
    RESTRICTED_PHRASE_RE.test(blob) ||
    htmlLooksLoginRequired(input.pageText || blob, input.title)
  ) {
    return finish(
      "restricted",
      "restricted",
      "restricted_phrase",
      "restricted",
      false,
      false,
    );
  }

  if (looksLikePersonalResearch(blob)) {
    return finish(
      "unknown",
      "unknown",
      "personal_research",
      "ignored",
      false,
      false,
    );
  }

  if (PREVIOUS_YEAR_PHRASE_RE.test(blob)) {
    return finish(
      "stale",
      "stale",
      "previous_year_phrase",
      "stale",
      false,
      false,
    );
  }

  if (dates.end && dates.end < kst.ymd) {
    return finish("closed", "closed", "end_date_passed", "closed", false, false);
  }

  if (dates.start && dates.start > kst.ymd && (!dates.end || dates.end >= kst.ymd)) {
    return finish(
      "unknown",
      "scheduled",
      "start_date_future",
      "discovered",
      false,
      false,
    );
  }

  const pastYears = dates.years.filter((y) => y < kst.year);
  const maxPast = pastYears.length > 0 ? Math.max(...pastYears) : null;
  const mentionsCurrentYear = dates.years.includes(kst.year);

  if (maxPast != null && !mentionsCurrentYear) {
    const topic = isTopicYearContext(blob, maxPast);
    if (topic) {
      return finish(
        "stale",
        "stale_candidate",
        "stale_topic_year",
        "stale",
        false,
        false,
        maxPast,
      );
    }
    return finish("stale", "stale", "stale_year", "stale", false, false, maxPast);
  }

  let publishedYmd: string | null = null;
  if (input.publishedAt) {
    publishedYmd = ymdFromPublishedAt(input.publishedAt);
  }
  if (!publishedYmd) {
    publishedYmd = extractPostedDateYmd(blob);
  }
  if (publishedYmd) {
    const age = daysBetweenYmd(publishedYmd, kst.ymd);
    if (Number.isFinite(age) && age > windowDays) {
      const periodOpen =
        Boolean(dates.end && dates.end >= kst.ymd) ||
        Boolean(
          dates.start &&
            dates.start <= kst.ymd &&
            (!dates.end || dates.end >= kst.ymd),
        );
      if (!periodOpen) {
        return finish(
          "stale",
          "stale",
          "published_too_old",
          "stale",
          false,
          false,
        );
      }
    }
    if (Number.isFinite(age) && age <= windowDays) {
      return finish(
        "active",
        "active",
        "published_recent",
        mode === "page" && input.confirmedLive ? "active" : "discovered",
        true,
        true,
      );
    }
  }

  if (mentionsCurrentYear) {
    return finish(
      "active",
      "active_candidate",
      "current_year",
      mode === "page" && input.confirmedLive ? "active" : "discovered",
      true,
      true,
      kst.year,
    );
  }

  if (IN_PROGRESS_PHRASE_RE.test(blob)) {
    return finish(
      "active",
      "active_candidate",
      "in_progress_phrase",
      mode === "page" && input.confirmedLive ? "active" : "discovered",
      true,
      true,
    );
  }

  if (!dates.start && !dates.end) {
    return finish(
      "unknown",
      "unknown",
      "date_unknown_hold",
      mode === "page" && input.confirmedLive ? "active" : "discovered",
      false,
      false,
    );
  }

  if (
    (dates.end && dates.end >= kst.ymd) ||
    (dates.start &&
      dates.start <= kst.ymd &&
      dates.end &&
      dates.end >= kst.ymd)
  ) {
    return finish(
      "active",
      "active",
      "recent_window",
      mode === "page" && input.confirmedLive ? "active" : "discovered",
      true,
      true,
    );
  }

  return finish(
    "unknown",
    "unknown",
    "date_unknown_hold",
    mode === "page" && input.confirmedLive ? "active" : "discovered",
    false,
    false,
  );
}

export function overlayFreshnessOnPage(input: {
  pageStatus: CollectorSurveyStatus;
  pageReason: string;
  pageTitle: string | null;
  url: string;
  searchTitle?: string | null;
  confirmedLive: boolean;
  now?: Date;
}): FreshnessCheckResult {
  if (
    input.pageStatus === "closed" ||
    input.pageStatus === "restricted" ||
    input.pageStatus === "invalid" ||
    input.pageStatus === "unreachable"
  ) {
    const code: FreshnessReasonCode =
      input.pageStatus === "closed"
        ? "closed_phrase"
        : input.pageStatus === "restricted"
          ? "restricted_phrase"
          : "unknown_no_signal";
    const availability: FreshnessAvailabilityStatus =
      input.pageStatus === "closed"
        ? "closed"
        : input.pageStatus === "restricted"
          ? "restricted"
          : "unknown";
    const now = input.now ?? new Date();
    return resultFrom(
      toRecord({
        availability,
        freshnessStatus: availability,
        code,
        shouldDiagnose: false,
        now,
      }),
      {
        status: input.pageStatus,
        shouldPageValidate: false,
        evidenceText: input.pageReason,
      },
    );
  }

  const evaluated = evaluateSurveyFreshness({
    title: input.pageTitle || input.searchTitle,
    snippet: input.searchTitle,
    url: input.url,
    pageText: `${input.pageTitle || ""}\n${input.pageReason}`,
    mode: "page",
    confirmedLive: input.confirmedLive,
    now: input.now,
  });

  if (evaluated.availabilityStatus === "closed") return evaluated;
  if (evaluated.availabilityStatus === "restricted") return evaluated;
  if (
    evaluated.reasonCode === "personal_research" ||
    evaluated.status === "ignored"
  ) {
    return evaluated;
  }
  if (evaluated.availabilityStatus === "stale") {
    return evaluated;
  }
  if (
    evaluated.reasonCode === "date_unknown_hold" ||
    evaluated.reasonCode === "active_unknown_date"
  ) {
    return {
      ...evaluated,
      shouldDiagnose: false,
      record: {
        ...evaluated.record,
        should_diagnose: false,
        diagnosis_eligible_recent: false,
        diagnosis_exclusion_reason: "date_unknown_hold",
        reason_code: "date_unknown_hold",
        freshness_reason: "날짜 불명 — 자동진단 보류",
      },
      status: input.confirmedLive ? "active" : evaluated.status,
    };
  }
  if (input.confirmedLive) {
    return {
      ...evaluated,
      status: "active",
      availabilityStatus:
        evaluated.availabilityStatus === "unknown"
          ? "active"
          : evaluated.availabilityStatus,
      shouldDiagnose: evaluated.shouldDiagnose,
    };
  }
  return evaluated;
}

export async function checkSurveyFreshnessAndAvailability(
  url: string,
  options?: {
    title?: string | null;
    snippet?: string | null;
    publishedAt?: string | null;
    platform?: CollectorPlatform;
    fetchPage?: boolean;
    now?: Date;
  },
): Promise<FreshnessCheckResult> {
  const fetchPage = options?.fetchPage !== false;
  if (!fetchPage) {
    return evaluateSurveyFreshness({
      title: options?.title,
      snippet: options?.snippet,
      url,
      publishedAt: options?.publishedAt,
      mode: "search",
      now: options?.now,
    });
  }

  const page = await validateSurveyPage(url, options?.platform);
  return overlayFreshnessOnPage({
    pageStatus: page.status,
    pageReason: page.reason,
    pageTitle: page.pageTitle,
    url: page.finalUrl || url,
    searchTitle: options?.title || options?.snippet,
    confirmedLive: page.verdict === "confirmed_survey" && page.status === "active",
    now: options?.now,
  });
}

export function freshnessQueryBoost(query: string, now: Date = new Date()): string {
  const year = getKstParts(now).year;
  const yearToken = String(year);
  if (query.includes(yearToken)) {
    if (/진행|최근|참여/.test(query)) return query;
    return `${query} 진행 중`;
  }
  return `${yearToken} ${query} 진행 중`;
}

export function isDiagnosisBlockedStatus(
  status: string | null | undefined,
): boolean {
  return (
    status === "closed" ||
    status === "restricted" ||
    status === "stale" ||
    status === "ignored" ||
    status === "invalid" ||
    status === "unreachable"
  );
}

export function dbStatusForFreshness(
  status: CollectorSurveyStatus,
): CollectorSurveyStatus {
  return status;
}

export function formatFreshnessReason(
  record: SurveyFreshnessRecord | null | undefined,
  fallbackStatus?: string | null,
): string | null {
  if (record?.freshness_reason) return record.freshness_reason;
  if (fallbackStatus === "closed") return "응답 종료 문구 감지";
  if (fallbackStatus === "restricted") return "접근 권한 필요";
  if (fallbackStatus === "stale" || fallbackStatus === "ignored") {
    return "과거 설문으로 판단되어 진단 제외";
  }
  return null;
}
