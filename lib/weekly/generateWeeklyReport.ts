import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildPublicDashboard } from "@/lib/report/buildPublicDashboard";
import { buildAnonymousCases } from "@/lib/weekly/anonymousCases";
import {
  WEEKLY_CHECKLIST,
  WEEKLY_DISCLAIMER,
  buildHeadline,
  buildPressSummary,
  buildWeeklyCountBullets,
  buildWeeklyInsights,
  buildWeeklyOneLiner,
} from "@/lib/weekly/copy";
import { isPublicWeeklyIssue, weeklyIssueDescription } from "@/lib/weekly/issueCopy";
import {
  WEEKLY_PRIVACY_INDEX_DISCLAIMER,
  fourWeekWeightedPrivacyAverage,
  roundScore1,
  weeklyPrivacyGrade,
} from "@/lib/weekly/privacyIndex";
import { assertWeeklySnapshotSafe } from "@/lib/weekly/safety";
import type {
  WeeklyMetrics,
  WeeklyReportSnapshot,
  WeeklyTrendPoint,
} from "@/lib/weekly/types";
import { listWeeklyReports, updateWeeklyReportStatus, upsertWeeklyReport } from "@/lib/weekly/repository";
import {
  getKstWeek,
  isCompletedReportWeek,
  isPartialWeek,
  kstTodayIso,
  latestCompletedKstWeek,
  listRecentCompletedKstWeeks,
  type KstWeek,
} from "@/lib/weekly/week";

function gapCount(
  rows: Array<{ itemKey: string; gapCount: number }>,
  key: string,
): number {
  return rows.find((row) => row.itemKey === key)?.gapCount ?? 0;
}

function orgCount(
  rows: Array<{ typeLabel: string; surveyCount: number }>,
  label: string,
): number {
  return rows.find((row) => row.typeLabel === label)?.surveyCount ?? 0;
}

function categoryCount(
  rows: Array<{ categoryKey: string; label: string; count: number }>,
  key: string,
): number {
  return rows.find((row) => row.categoryKey === key)?.count ?? 0;
}

async function earliestObservedDate(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_records")
    .select("observed_date_kst")
    .not("observed_date_kst", "is", null)
    .order("observed_date_kst", { ascending: true })
    .limit(1);
  if (error) throw new Error(`earliest observed_date: ${error.message}`);
  return data?.[0]?.observed_date_kst ? String(data[0].observed_date_kst) : null;
}

export async function buildWeeklySnapshot(
  week: KstWeek,
  options?: { todayIso?: string; earliestDataIso?: string | null },
): Promise<WeeklyReportSnapshot> {
  const todayIso = options?.todayIso ?? kstTodayIso();
  const earliestDataIso = options?.earliestDataIso ?? (await earliestObservedDate());
  const dash = await buildPublicDashboard({
    from: week.weekStart,
    to: week.weekEnd,
  });

  const analyzable = dash.summary.totalScans;
  const isPartial = isPartialWeek(week, {
    todayIso,
    earliestDataIso,
    analyzableCount: analyzable,
  });

  const issueTop5 = dash.issueStats
    .filter((row) => isPublicWeeklyIssue(row.label))
    .slice(0, 5)
    .map((row) => ({
      label: row.label,
      findingCount: row.findingCount,
      affectedSurveyCount: row.affectedSurveyCount,
      rateOfAllScans: row.rateOfAllScans,
      description: weeklyIssueDescription(row.label),
    }));

  const noticeGaps = dash.noticeComplianceStats
    .filter((row) => row.gapCount > 0)
    .sort((a, b) => b.gapCount - a.gapCount)
    .slice(0, 4)
    .map((row) => row.label);

  const topTool =
    [...dash.platformStats].sort((a, b) => b.surveyCount - a.surveyCount)[0]
      ?.platform || "외부 설문도구";

  const schoolCount = orgCount(dash.organizationTypeStats, "학교/교육기관");
  const publicOrgCount = orgCount(dash.organizationTypeStats, "공공기관");
  const medicalCount = orgCount(dash.organizationTypeStats, "의료기관");
  const publicCount = Math.max(
    publicOrgCount,
    dash.publicSectorToolStats.publicPersonalInfoSurveyCount,
  );

  const anonymousCases = buildAnonymousCases({
    schoolCount,
    publicCount,
    medicalCount,
    personalInfoCount: dash.summary.personalInfoCount,
    sensitiveCount: dash.summary.sensitiveInfoCount,
    highRiskCount: dash.summary.highRiskInfoCount,
    publicExternalToolCount: dash.publicSectorToolStats.externalToolReviewCount,
    nameCount: categoryCount(dash.dataCategoryStats, "name"),
    phoneCount: categoryCount(dash.dataCategoryStats, "phone"),
    emailCount: categoryCount(dash.dataCategoryStats, "email"),
    affiliationCount: categoryCount(dash.dataCategoryStats, "affiliation"),
    analyzableCount: analyzable,
    noticeGaps,
    topTool,
  });

  const purposeGap = gapCount(dash.noticeComplianceStats, "purpose");
  const itemsGap = gapCount(dash.noticeComplianceStats, "items");
  const retentionGap = gapCount(dash.noticeComplianceStats, "retention");
  const destructionGap = gapCount(dash.noticeComplianceStats, "destruction");
  const contactGap = gapCount(dash.noticeComplianceStats, "contact");

  const publicNarrative =
    publicCount > 0 || dash.publicSectorToolStats.externalToolReviewCount > 0
      ? "이번 주 공공부문 개인정보 수집 설문에서는 외부 설문도구 사용 및 공공부문 클라우드 보안 기준 확인 필요 신호가 반복적으로 나타났습니다. 이는 개별 기관의 위법 여부를 확정하는 자료가 아니라, 공개 설문 화면에서 확인 가능한 고지·안내 수준을 기준으로 한 점검 결과입니다."
      : "";

  const headline = buildHeadline(analyzable, dash.summary.personalInfoCount);
  const grade = weeklyPrivacyGrade(dash.summary.avgOverallScore);
  const oneLiner = buildWeeklyOneLiner(
    week.label,
    analyzable,
    dash.summary.personalInfoCount,
  );
  const thirdBullet = publicNarrative
    ? "공공부문 설문에서는 외부 설문도구 사용 및 보안 기준 확인 필요 신호가 반복적으로 나타났습니다."
    : "고지 항목 미흡과 확인 필요 신호가 반복적으로 나타났습니다.";

  const metrics: WeeklyMetrics = {
    analyzableCount: analyzable,
    personalInfoCount: dash.summary.personalInfoCount,
    personalInfoRate: dash.summary.personalInfoRate,
    sensitiveInfoCount: dash.summary.sensitiveInfoCount,
    sensitiveInfoRate: dash.summary.sensitiveInfoRate,
    highRiskInfoCount: dash.summary.highRiskInfoCount,
    highRiskInfoRate: dash.summary.highRiskInfoRate,
    attentionNeededCount: dash.summary.attentionNeededCount,
    attentionNeededRate: dash.summary.attentionNeededRate,
    avgScore: dash.summary.avgOverallScore,
    grade,
    publicExternalToolCount: dash.publicSectorToolStats.externalToolReviewCount,
    evidenceCaptureCount: dash.diagnosisQualityStats.evidenceCaptureCount,
  };

  const snapshot: WeeklyReportSnapshot = {
    weekId: week.weekId,
    weekLabel: week.label,
    shortRange: week.shortRange,
    periodStartKst: week.weekStart,
    periodEndKst: week.weekEnd,
    generatedAt: new Date().toISOString(),
    isPartial,
    summary: {
      headline,
      oneLiner,
      bullets: buildWeeklyCountBullets({
        analyzable,
        personalInfoCount: dash.summary.personalInfoCount,
        attentionNeededCount: dash.summary.attentionNeededCount,
        thirdBullet,
      }),
      analyzableCount: analyzable,
      personalInfoCount: dash.summary.personalInfoCount,
      personalInfoRate: dash.summary.personalInfoRate,
      attentionNeededCount: dash.summary.attentionNeededCount,
      attentionNeededRate: dash.summary.attentionNeededRate,
      avgScore: dash.summary.avgOverallScore,
      grade,
      publicExternalToolCount: dash.publicSectorToolStats.externalToolReviewCount,
      scoreDelta: null,
      fourWeekAvgScore: dash.summary.avgOverallScore,
      isPartial,
    },
    metrics,
    trends: [
      {
        weekId: week.weekId,
        weekLabel: week.label,
        shortRange: week.shortRange,
        avgScore: dash.summary.avgOverallScore,
        personalInfoRate: dash.summary.personalInfoRate,
        attentionNeededRate: dash.summary.attentionNeededRate,
        analyzableCount: analyzable,
      },
    ],
    issueTop5,
    platformStats: dash.platformStats.map((row) => ({
      platform: row.platform,
      surveyCount: row.surveyCount,
      personalInfoRate: row.personalInfoRate,
      sensitiveInfoRate: row.sensitiveInfoRate,
      highRiskInfoRate: row.highRiskInfoRate,
      attentionNeededRate: row.attentionNeededRate,
      avgOverallScore: row.avgOverallScore,
    })),
    organizationStats: dash.organizationTypeStats.map((row) => ({
      typeLabel: row.typeLabel,
      surveyCount: row.surveyCount,
      personalInfoRate: row.personalInfoRate,
      sensitiveInfoRate: row.sensitiveInfoRate,
      highRiskInfoRate: row.highRiskInfoRate,
      attentionNeededRate: row.attentionNeededRate,
      avgOverallScore: row.avgOverallScore,
    })),
    publicSector: {
      publicPersonalInfoSurveyCount:
        dash.publicSectorToolStats.publicPersonalInfoSurveyCount,
      externalToolReviewCount:
        dash.publicSectorToolStats.externalToolReviewCount,
      csapOrCloudReviewCount: dash.publicSectorToolStats.csapOrCloudReviewCount,
      purposeGapCount: purposeGap,
      itemsGapCount: itemsGap,
      retentionGapCount: retentionGap,
      destructionGapCount: destructionGap,
      contactGapCount: contactGap,
      narrative: publicNarrative,
    },
    questionStats: {
      totalQuestions: dash.questionStats.totalQuestions,
      personalInfoQuestions: dash.questionStats.personalInfoQuestions,
      sensitiveQuestions: dash.questionStats.sensitiveQuestions,
      highRiskQuestions: dash.questionStats.highRiskQuestions,
      personalInfoQuestionRate: dash.questionStats.personalInfoQuestionRate,
      frequentCategories: dash.dataCategoryStats.slice(0, 8).map((row) => ({
        categoryKey: row.categoryKey,
        label: row.label,
        count: row.count,
        rate: row.rate,
      })),
    },
    anonymousCases,
    insights: buildWeeklyInsights({
      personalInfoRate: dash.summary.personalInfoRate,
      attentionNeededRate: dash.summary.attentionNeededRate,
      publicCount,
      publicExternalToolCount: dash.publicSectorToolStats.externalToolReviewCount,
      schoolCount,
      retentionGapCount: retentionGap,
      destructionGapCount: destructionGap,
    }),
    checklist: WEEKLY_CHECKLIST,
    pressSummary: buildPressSummary({
      weekLabel: week.label,
      headline,
      analyzable,
      personalInfoCount: dash.summary.personalInfoCount,
      attentionNeededCount: dash.summary.attentionNeededCount,
      publicNarrative: publicNarrative || null,
    }),
    quality: {
      completedDiagnosisCount: analyzable,
      limitedQuestionAnalysisCount:
        dash.diagnosisQualityStats.limitedQuestionAnalysisCount,
      closedExcludedCount: Math.max(0, dash.rawTotalScans - analyzable),
      restrictedExcludedCount: 0,
      evidenceCaptureCount: dash.diagnosisQualityStats.evidenceCaptureCount,
    },
    disclaimer: `${WEEKLY_DISCLAIMER} ${WEEKLY_PRIVACY_INDEX_DISCLAIMER}`,
  };

  assertWeeklySnapshotSafe(snapshot);
  return snapshot;
}

export function attachTrends(
  snapshots: WeeklyReportSnapshot[],
): WeeklyReportSnapshot[] {
  const chronological = [...snapshots].sort((a, b) =>
    a.periodStartKst.localeCompare(b.periodStartKst),
  );
  return chronological.map((snap, index) => {
    const window = chronological.slice(Math.max(0, index - 5), index + 1);
    const trends: WeeklyTrendPoint[] = window.map((row) => ({
      weekId: row.weekId,
      weekLabel: row.weekLabel,
      shortRange: row.shortRange,
      avgScore: row.metrics.avgScore,
      personalInfoRate: row.metrics.personalInfoRate,
      attentionNeededRate: row.metrics.attentionNeededRate,
      analyzableCount: row.metrics.analyzableCount,
    }));
    const prev = index > 0 ? chronological[index - 1] : null;
    const fourWeekAvg = fourWeekWeightedPrivacyAverage(
      chronological.slice(Math.max(0, index - 3), index + 1).map((row) => ({
        avgScore: row.metrics.avgScore,
        analyzableCount: row.metrics.analyzableCount,
      })),
    );
    const scoreDelta =
      snap.metrics.avgScore != null && prev?.metrics.avgScore != null
        ? roundScore1(snap.metrics.avgScore - prev.metrics.avgScore)
        : null;
    return {
      ...snap,
      trends,
      summary: {
        ...snap.summary,
        scoreDelta,
        fourWeekAvgScore: fourWeekAvg,
      },
    };
  });
}

export async function generateRecentWeeklySnapshots(
  count = 6,
): Promise<WeeklyReportSnapshot[]> {
  const todayIso = kstTodayIso();
  const earliestDataIso = await earliestObservedDate();
  const weeks = listRecentCompletedKstWeeks(count).reverse();
  const snapshots: WeeklyReportSnapshot[] = [];
  for (const week of weeks) {
    if (earliestDataIso && week.weekEnd < earliestDataIso) continue;
    snapshots.push(
      await buildWeeklySnapshot(week, { todayIso, earliestDataIso }),
    );
  }
  return attachTrends(snapshots);
}

export async function generateWeekSnapshot(
  weekId: string,
): Promise<WeeklyReportSnapshot> {
  const week = getKstWeek(weekId);
  const snap = await buildWeeklySnapshot(week);
  let neighbors: WeeklyReportSnapshot[] = [];
  try {
    const rows = await listWeeklyReports({ status: "all" });
    neighbors = rows
      .filter((row) => row.weekId !== week.weekId)
      .filter((row) => isCompletedReportWeek(row.weekId))
      .map((row) => row.snapshot);
  } catch {
    neighbors = [];
  }
  const merged = attachTrends([...neighbors, snap]);
  return merged.find((row) => row.weekId === week.weekId) ?? snap;
}

export async function publishCompletedWeeklyReports(now: Date = new Date()): Promise<{
  publishedWeekId: string;
  unpublishedWeekIds: string[];
}> {
  const todayIso = kstTodayIso(now);
  const unpublishedWeekIds: string[] = [];
  try {
    const published = await listWeeklyReports({ status: "published" });
    for (const row of published) {
      if (!isCompletedReportWeek(row.weekId, todayIso)) {
        await updateWeeklyReportStatus(row.weekId, "draft");
        unpublishedWeekIds.push(row.weekId);
      }
    }
  } catch (error) {
    console.error("[weekly-publish] unpublish in-progress", error);
  }

  const week = latestCompletedKstWeek(now);
  const snapshot = await generateWeekSnapshot(week.weekId);
  const saved = await upsertWeeklyReport({ snapshot, status: "published" });
  return { publishedWeekId: saved.weekId, unpublishedWeekIds };
}
