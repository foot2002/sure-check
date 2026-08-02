import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assertPublicReportSafe,
  PUBLIC_DISCLOSURE_MESSAGE,
} from "@/lib/report/publicReportPolicy";

export type PublicDashboardRange = "today" | "7d" | "30d" | "custom";

export interface PublicDashboardQuery {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface PublicDashboardSummary {
  totalScans: number;
  personalInfoCount: number;
  personalInfoRate: number;
  sensitiveInfoCount: number;
  sensitiveInfoRate: number;
  highRiskInfoCount: number;
  highRiskInfoRate: number;
  highOrCriticalCount: number;
  highOrCriticalRate: number;
  avgOverallScore: number | null;
}

export interface PublicDashboardTrendRow {
  date: string;
  surveyCount: number;
  personalInfoRate: number;
  sensitiveInfoRate: number;
  highRiskInfoRate: number;
  avgOverallScore: number | null;
}

export interface PublicDashboardPlatformRow {
  platform: string;
  surveyCount: number;
  personalInfoRate: number;
  sensitiveInfoRate: number;
  highRiskInfoRate: number;
  avgOverallScore: number | null;
}

export interface PublicDashboardIssueRow {
  findingType: string;
  checkDomain: string | null;
  severity: string;
  findingCount: number;
  label: string;
}

export interface PublicDashboardOrgTypeRow {
  typeLabel: string;
  surveyCount: number;
  personalInfoRate: number;
  sensitiveInfoRate: number;
  highRiskInfoRate: number;
  avgOverallScore: number | null;
}

export interface PublicDashboardPayload {
  range: PublicDashboardRange;
  from: string;
  to: string;
  generatedAt: string;
  hasData: boolean;
  summary: PublicDashboardSummary;
  trends: PublicDashboardTrendRow[];
  platformStats: PublicDashboardPlatformRow[];
  issueStats: PublicDashboardIssueRow[];
  organizationTypeStats: PublicDashboardOrgTypeRow[];
  disclosurePolicy: {
    mode: "aggregate_only";
    message: string;
  };
}

const PLATFORM_LABEL: Record<string, string> = {
  google_forms: "Google Forms",
  naver_form: "Naver Form",
  moaform: "Moaform",
  generic: "Generic",
  wiseon_csap: "WiseON",
  unknown: "Unknown",
};

const SUBJECT_LABEL: Record<string, string> = {
  public_agency: "공공기관",
  private_company: "민간기업",
  public_commissioned_private: "공공위탁 민간",
  school_local: "학교/교육기관",
  nonprofit: "비영리/협회",
  medical: "의료기관",
  unknown: "확인 불가",
};

const FINDING_LABEL: Record<string, string> = {
  personal_info_risk: "개인정보 문항 포함",
  sensitive_info_risk: "민감정보 문항 포함",
  high_risk_info: "고위험정보 문항 포함",
  notice_gap: "고지문 미흡",
  consent_gap: "동의 안내 미흡",
  tool_governance: "외부 설문도구·처리경로 확인 필요",
  management_gap: "관리·운영 기준 미흡",
  operator_unclear: "운영주체 확인 필요",
  overseas_transfer: "국외이전 확인 필요",
  outsourcing: "위탁 안내 미흡",
  public_sector_cloud: "공공기관 외부 SaaS 사용 확인 필요",
  limited_diagnosis: "문항 분석 제한",
  other: "기타 확인 필요",
};

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysKst(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function parseDateParam(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export function resolvePublicDashboardRange(
  query: PublicDashboardQuery,
): { range: PublicDashboardRange; from: string; to: string } {
  const today = kstToday();
  const fromParam = parseDateParam(query.from);
  const toParam = parseDateParam(query.to);

  if (fromParam && toParam) {
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    return { range: "custom", from, to };
  }

  const rangeRaw = (query.range || "7d").toLowerCase();
  if (rangeRaw === "today") {
    return { range: "today", from: today, to: today };
  }
  if (rangeRaw === "30d") {
    return { range: "30d", from: addDaysKst(today, -29), to: today };
  }
  return { range: "7d", from: addDaysKst(today, -6), to: today };
}

function rate(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function emptySummary(): PublicDashboardSummary {
  return {
    totalScans: 0,
    personalInfoCount: 0,
    personalInfoRate: 0,
    sensitiveInfoCount: 0,
    sensitiveInfoRate: 0,
    highRiskInfoCount: 0,
    highRiskInfoRate: 0,
    highOrCriticalCount: 0,
    highOrCriticalRate: 0,
    avgOverallScore: null,
  };
}

function platformLabel(platform: string): string {
  return PLATFORM_LABEL[platform] || PLATFORM_LABEL.unknown;
}

function subjectLabel(subject: string | null | undefined): string {
  if (!subject) return SUBJECT_LABEL.unknown;
  return SUBJECT_LABEL[subject] || SUBJECT_LABEL.unknown;
}

function findingLabel(findingType: string): string {
  return FINDING_LABEL[findingType] || findingType;
}

interface DailyRow {
  observed_date_kst: string;
  survey_count: number;
  personal_info_count: number;
  sensitive_info_count: number;
  high_risk_info_count: number;
  high_or_critical_count: number;
  avg_overall_score: number | null;
}

interface PlatformRow {
  observed_date_kst: string;
  platform: string;
  survey_count: number;
  personal_info_count: number;
  sensitive_info_count: number;
  high_risk_info_count: number;
  avg_overall_score: number | null;
}

interface IssueRow {
  observed_date_kst: string;
  finding_type: string;
  check_domain: string | null;
  severity: string;
  finding_count: number;
}

interface SurveyAggRow {
  subject_type: string | null;
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
  overall_risk_level: string | null;
}

export async function buildPublicDashboard(
  query: PublicDashboardQuery = {},
): Promise<PublicDashboardPayload> {
  const { range, from, to } = resolvePublicDashboardRange(query);
  const supabase = createSupabaseServerClient();

  const [dailyRes, platformRes, issueRes, surveyRes] = await Promise.all([
    supabase
      .from("v_dashboard_daily_overview")
      .select(
        "observed_date_kst, survey_count, personal_info_count, sensitive_info_count, high_risk_info_count, high_or_critical_count, avg_overall_score",
      )
      .gte("observed_date_kst", from)
      .lte("observed_date_kst", to)
      .order("observed_date_kst", { ascending: true }),
    supabase
      .from("v_dashboard_platform_stats")
      .select(
        "observed_date_kst, platform, survey_count, personal_info_count, sensitive_info_count, high_risk_info_count, avg_overall_score",
      )
      .gte("observed_date_kst", from)
      .lte("observed_date_kst", to),
    supabase
      .from("v_dashboard_issue_stats")
      .select(
        "observed_date_kst, finding_type, check_domain, severity, finding_count",
      )
      .gte("observed_date_kst", from)
      .lte("observed_date_kst", to),
    supabase
      .from("survey_records")
      .select(
        "subject_type, has_personal_info, has_sensitive_info, has_high_risk_info, overall_risk_level",
      )
      .gte("observed_date_kst", from)
      .lte("observed_date_kst", to),
  ]);

  if (dailyRes.error) throw new Error(`daily overview: ${dailyRes.error.message}`);
  if (platformRes.error) throw new Error(`platform stats: ${platformRes.error.message}`);
  if (issueRes.error) throw new Error(`issue stats: ${issueRes.error.message}`);
  if (surveyRes.error) throw new Error(`survey records: ${surveyRes.error.message}`);

  const daily = (dailyRes.data || []) as DailyRow[];
  const platforms = (platformRes.data || []) as PlatformRow[];
  const issues = (issueRes.data || []) as IssueRow[];
  const surveys = (surveyRes.data || []) as SurveyAggRow[];

  const summaryTotals = daily.reduce(
    (acc, row) => {
      acc.totalScans += row.survey_count || 0;
      acc.personalInfoCount += row.personal_info_count || 0;
      acc.sensitiveInfoCount += row.sensitive_info_count || 0;
      acc.highRiskInfoCount += row.high_risk_info_count || 0;
      acc.highOrCriticalCount += row.high_or_critical_count || 0;
      if (row.avg_overall_score != null) acc.scores.push(Number(row.avg_overall_score));
      return acc;
    },
    {
      totalScans: 0,
      personalInfoCount: 0,
      sensitiveInfoCount: 0,
      highRiskInfoCount: 0,
      highOrCriticalCount: 0,
      scores: [] as number[],
    },
  );

  const summary: PublicDashboardSummary =
    summaryTotals.totalScans === 0
      ? emptySummary()
      : {
          totalScans: summaryTotals.totalScans,
          personalInfoCount: summaryTotals.personalInfoCount,
          personalInfoRate: rate(
            summaryTotals.personalInfoCount,
            summaryTotals.totalScans,
          ),
          sensitiveInfoCount: summaryTotals.sensitiveInfoCount,
          sensitiveInfoRate: rate(
            summaryTotals.sensitiveInfoCount,
            summaryTotals.totalScans,
          ),
          highRiskInfoCount: summaryTotals.highRiskInfoCount,
          highRiskInfoRate: rate(
            summaryTotals.highRiskInfoCount,
            summaryTotals.totalScans,
          ),
          highOrCriticalCount: summaryTotals.highOrCriticalCount,
          highOrCriticalRate: rate(
            summaryTotals.highOrCriticalCount,
            summaryTotals.totalScans,
          ),
          avgOverallScore: avg(summaryTotals.scores),
        };

  const trends: PublicDashboardTrendRow[] = daily.map((row) => {
    const count = row.survey_count || 0;
    return {
      date: row.observed_date_kst,
      surveyCount: count,
      personalInfoRate: rate(row.personal_info_count || 0, count),
      sensitiveInfoRate: rate(row.sensitive_info_count || 0, count),
      highRiskInfoRate: rate(row.high_risk_info_count || 0, count),
      avgOverallScore:
        row.avg_overall_score == null ? null : Number(row.avg_overall_score),
    };
  });

  const platformMap = new Map<
    string,
    {
      surveyCount: number;
      personalInfoCount: number;
      sensitiveInfoCount: number;
      highRiskInfoCount: number;
      scores: number[];
    }
  >();

  for (const key of Object.keys(PLATFORM_LABEL)) {
    platformMap.set(key, {
      surveyCount: 0,
      personalInfoCount: 0,
      sensitiveInfoCount: 0,
      highRiskInfoCount: 0,
      scores: [],
    });
  }

  for (const row of platforms) {
    const key = row.platform in PLATFORM_LABEL ? row.platform : "unknown";
    const bucket = platformMap.get(key)!;
    bucket.surveyCount += row.survey_count || 0;
    bucket.personalInfoCount += row.personal_info_count || 0;
    bucket.sensitiveInfoCount += row.sensitive_info_count || 0;
    bucket.highRiskInfoCount += row.high_risk_info_count || 0;
    if (row.avg_overall_score != null) bucket.scores.push(Number(row.avg_overall_score));
  }

  const platformStats: PublicDashboardPlatformRow[] = [...platformMap.entries()]
    .map(([platform, bucket]) => ({
      platform: platformLabel(platform),
      surveyCount: bucket.surveyCount,
      personalInfoRate: rate(bucket.personalInfoCount, bucket.surveyCount),
      sensitiveInfoRate: rate(bucket.sensitiveInfoCount, bucket.surveyCount),
      highRiskInfoRate: rate(bucket.highRiskInfoCount, bucket.surveyCount),
      avgOverallScore: avg(bucket.scores),
    }))
    .filter((row) => row.surveyCount > 0 || summary.totalScans === 0)
    .sort((a, b) => b.surveyCount - a.surveyCount);

  const issueMap = new Map<string, PublicDashboardIssueRow>();
  for (const row of issues) {
    const key = `${row.finding_type}|${row.check_domain || ""}|${row.severity}`;
    const existing = issueMap.get(key);
    if (existing) {
      existing.findingCount += row.finding_count || 0;
    } else {
      issueMap.set(key, {
        findingType: row.finding_type,
        checkDomain: row.check_domain,
        severity: row.severity,
        findingCount: row.finding_count || 0,
        label: findingLabel(row.finding_type),
      });
    }
  }
  const issueStats = [...issueMap.values()]
    .sort((a, b) => b.findingCount - a.findingCount)
    .slice(0, 12);

  const orgMap = new Map<
    string,
    {
      surveyCount: number;
      personalInfoCount: number;
      sensitiveInfoCount: number;
      highRiskInfoCount: number;
      highOrCriticalCount: number;
    }
  >();
  for (const label of Object.values(SUBJECT_LABEL)) {
    orgMap.set(label, {
      surveyCount: 0,
      personalInfoCount: 0,
      sensitiveInfoCount: 0,
      highRiskInfoCount: 0,
      highOrCriticalCount: 0,
    });
  }
  for (const row of surveys) {
    const label = subjectLabel(row.subject_type);
    const bucket = orgMap.get(label)!;
    bucket.surveyCount += 1;
    if (row.has_personal_info) bucket.personalInfoCount += 1;
    if (row.has_sensitive_info) bucket.sensitiveInfoCount += 1;
    if (row.has_high_risk_info) bucket.highRiskInfoCount += 1;
    if (
      row.overall_risk_level === "high" ||
      row.overall_risk_level === "critical"
    ) {
      bucket.highOrCriticalCount += 1;
    }
  }

  const organizationTypeStats: PublicDashboardOrgTypeRow[] = [...orgMap.entries()]
    .map(([typeLabel, bucket]) => ({
      typeLabel,
      surveyCount: bucket.surveyCount,
      personalInfoRate: rate(bucket.personalInfoCount, bucket.surveyCount),
      sensitiveInfoRate: rate(bucket.sensitiveInfoCount, bucket.surveyCount),
      highRiskInfoRate: rate(bucket.highRiskInfoCount, bucket.surveyCount),
      avgOverallScore: null,
    }))
    .filter((row) => row.surveyCount > 0)
    .sort((a, b) => b.surveyCount - a.surveyCount);

  const payload: PublicDashboardPayload = {
    range,
    from,
    to,
    generatedAt: new Date().toISOString(),
    hasData: summary.totalScans > 0,
    summary,
    trends,
    platformStats:
      summary.totalScans === 0
        ? Object.values(PLATFORM_LABEL).map((platform) => ({
            platform,
            surveyCount: 0,
            personalInfoRate: 0,
            sensitiveInfoRate: 0,
            highRiskInfoRate: 0,
            avgOverallScore: null,
          }))
        : platformStats,
    issueStats,
    organizationTypeStats,
    disclosurePolicy: {
      mode: "aggregate_only",
      message: PUBLIC_DISCLOSURE_MESSAGE,
    },
  };

  assertPublicReportSafe(payload);
  return payload;
}
