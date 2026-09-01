import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildArticleLead,
  buildWeeklyNarrative,
  composeWeeklyEditorial,
} from "../lib/weekly/narrative";
import { normalizeWeeklySnapshotCopy } from "../lib/weekly/copy";
import type { WeeklyReportSnapshot } from "../lib/weekly/types";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures.push(detail ? `${name}: ${detail}` : name);
  console.error(`FAIL  ${failures[failures.length - 1]}`);
}

function baseInput(overrides: Partial<Parameters<typeof buildWeeklyNarrative>[0]> = {}) {
  return {
    weekLabel: "2026년 8월 4주차 (8.24~8.30)",
    analyzable: 144,
    personalInfoCount: 132,
    personalInfoRate: 91.7,
    attentionNeededCount: 119,
    attentionNeededRate: 82.6,
    sensitiveCount: 11,
    sensitiveRate: 7.6,
    avgScore: 49.2,
    grade: "주의",
    scoreDelta: 1.6,
    publicPersonalInfoCount: 83,
    publicExternalToolCount: 83,
    schoolCount: 7,
    topIssue: "고지문 미흡",
    previousTopIssue: "고지문 미흡",
    previousPersonalInfoRate: 90,
    previousAttentionRate: 80,
    previousPublicExternalTool: 70,
    platforms: [
      { label: "Google Forms", surveyCount: 77, attentionNeededRate: 89.6, personalInfoRate: 94.8 },
    ],
    orgs: [
      { label: "공공기관", surveyCount: 80, personalInfoRate: 93.8, attentionNeededRate: 78.8 },
    ],
    questionTop: [{ label: "연락처", count: 200 }],
    retentionGap: 53,
    destructionGap: 56,
    ...overrides,
  };
}

function main() {
  console.log("[Weekly Editorial Narrative Check]");

  const lead = buildArticleLead(baseInput());
  check("lead 2-3 paragraphs", lead.length >= 2 && lead.length <= 3);
  check("lead has analyzable count", lead.join(" ").includes("144건"));
  check("lead has PII count", lead.join(" ").includes("132건"));

  const body = buildWeeklyNarrative(baseInput());
  check("narrative at least 4 paragraphs", body.length >= 4 && body.length <= 6);
  check("narrative mentions 주의", body.join(" ").includes("주의"));

  const down = buildWeeklyNarrative(baseInput({ scoreDelta: -2.1, grade: "위험", avgScore: 38 }));
  check("down week text differs", down.join(" ") !== body.join(" "));
  check("down week mentions 하락", down.join(" ").includes("하락"));

  const noPrior = buildWeeklyNarrative(baseInput({ scoreDelta: null, previousPersonalInfoRate: null }));
  check("no prior week sentence", noPrior.join(" ").includes("단일 주차"));

  const detail = read("components/weekly/WeeklyDetailView.tsx");
  const editorialUi = read("components/weekly/WeeklyEditorial.tsx");
  check("detail has 이번 주 해설", detail.includes("이번 주 해설"));
  check("detail has lead paragraphs", detail.includes("leadParagraphs"));
  check(
    "detail has 전주 대비",
    detail.includes("전주 대비 무엇이 달라졌나") ||
      editorialUi.includes("전주 대비 무엇이 달라졌나"),
  );
  check("normalize composes editorial", read("lib/weekly/copy.ts").includes("composeWeeklyEditorial"));

  const mock = {
    weekId: "2026-08-24",
    weekLabel: "2026년 8월 4주차 (8.24~8.30)",
    shortRange: "8.24~8.30",
    periodStartKst: "2026-08-24",
    periodEndKst: "2026-08-30",
    generatedAt: "2026-09-01T00:00:00.000Z",
    isPartial: false,
    summary: {
      headline: "x",
      oneLiner: "y",
      bullets: ["a", "b", "c"] as [string, string, string],
      analyzableCount: 144,
      personalInfoCount: 132,
      personalInfoRate: 91.7,
      attentionNeededCount: 119,
      attentionNeededRate: 82.6,
      avgScore: 49.2,
      grade: "주의" as const,
      publicExternalToolCount: 83,
      scoreDelta: 1.6,
      fourWeekAvgScore: 48,
      isPartial: false,
    },
    metrics: {
      analyzableCount: 144,
      personalInfoCount: 132,
      personalInfoRate: 91.7,
      sensitiveInfoCount: 11,
      sensitiveInfoRate: 7.6,
      highRiskInfoCount: 9,
      highRiskInfoRate: 6.3,
      attentionNeededCount: 119,
      attentionNeededRate: 82.6,
      avgScore: 49.2,
      grade: "주의" as const,
      publicExternalToolCount: 83,
      evidenceCaptureCount: 200,
      evidenceSurveyCount: 205,
      evidenceImageCount: 284,
    },
    trends: [],
    issueTop5: [
      {
        label: "고지문 미흡",
        findingCount: 1,
        affectedSurveyCount: 1,
        rateOfAllScans: 1,
        description: "d",
      },
    ],
    platformStats: [],
    organizationStats: [],
    publicSector: {
      publicPersonalInfoSurveyCount: 83,
      externalToolReviewCount: 83,
      csapOrCloudReviewCount: 83,
      purposeGapCount: 1,
      itemsGapCount: 1,
      retentionGapCount: 1,
      destructionGapCount: 1,
      contactGapCount: 1,
      narrative: "n",
    },
    questionStats: {
      totalQuestions: 1,
      personalInfoQuestions: 1,
      sensitiveQuestions: 1,
      highRiskQuestions: 1,
      personalInfoQuestionRate: 1,
      frequentCategories: [],
    },
    anonymousCases: [],
    insights: [],
    checklist: [],
    pressSummary: "",
    quality: {
      completedDiagnosisCount: 144,
      limitedQuestionAnalysisCount: 0,
      closedExcludedCount: 0,
      restrictedExcludedCount: 0,
      evidenceCaptureCount: 200,
      evidenceSurveyCount: 205,
      evidenceImageCount: 284,
    },
    disclaimer: "d",
  } satisfies WeeklyReportSnapshot;

  const normalized = normalizeWeeklySnapshotCopy(mock);
  check("normalize fills editorial", (normalized.editorial?.bodyParagraphs.length || 0) >= 4);
  check("compose produces keywords", composeWeeklyEditorial(mock).keywords.length >= 1);

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly-editorial-narrative-check PASS");
}

main();
