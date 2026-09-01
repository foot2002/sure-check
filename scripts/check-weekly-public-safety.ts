import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertWeeklySnapshotSafe, checkWeeklySnapshotSafe } from "../lib/weekly/safety";
import type { WeeklyReportSnapshot } from "../lib/weekly/types";
import { PUBLIC_INDIVIDUAL_CASES_ENABLED } from "../lib/report/publicCasePolicy";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function exists(rel: string): boolean {
  return existsSync(resolve(process.cwd(), rel));
}

const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  const msg = detail ? `${name}: ${detail}` : name;
  failures.push(msg);
  console.error(`FAIL  ${msg}`);
}

function mockSnapshot(): WeeklyReportSnapshot {
  return {
    weekId: "2026-08-24",
    weekLabel: "2026년 8월 4주차 (8.24~8.30)",
    shortRange: "8.24~8.30",
    periodStartKst: "2026-08-24",
    periodEndKst: "2026-08-30",
    generatedAt: "2026-09-01T00:00:00.000Z",
    isPartial: false,
    summary: {
      headline: "공개 온라인 설문 84건 중 81건, 개인정보 수집 신호 확인",
      oneLiner: "분석 완료 설문 84건 중 81건에서 개인정보 수집 신호가 확인되었습니다.",
      bullets: [
        "이번 주 분석 완료 설문 84건 중 81건에서 개인정보 수집 신호가 확인되었습니다.",
        "78건은 응답자 관점에서 주의 또는 추가 확인이 필요한 설문으로 분류되었습니다.",
        "공공부문 설문에서는 외부 설문도구 사용 및 보안 기준 확인 필요 신호가 반복적으로 나타났습니다.",
      ],
      analyzableCount: 84,
      personalInfoCount: 81,
      personalInfoRate: 96.4,
      attentionNeededCount: 78,
      attentionNeededRate: 92.9,
      avgScore: 47.9,
      grade: "주의",
      publicExternalToolCount: 62,
      scoreDelta: -3.2,
      fourWeekAvgScore: 51.4,
      isPartial: false,
    },
    metrics: {
      analyzableCount: 84,
      personalInfoCount: 81,
      personalInfoRate: 96.4,
      sensitiveInfoCount: 4,
      sensitiveInfoRate: 4.8,
      highRiskInfoCount: 1,
      highRiskInfoRate: 1.2,
      attentionNeededCount: 78,
      attentionNeededRate: 92.9,
      avgScore: 47.9,
      grade: "주의",
      publicExternalToolCount: 62,
      evidenceCaptureCount: 70,
      evidenceSurveyCount: 68,
      evidenceImageCount: 210,
    },
    trends: [
      {
        weekId: "2026-08-24",
        weekLabel: "2026년 8월 4주차 (8.24~8.30)",
        shortRange: "8.24~8.30",
        avgScore: 47.9,
        personalInfoRate: 96.4,
        attentionNeededRate: 92.9,
        analyzableCount: 84,
      },
    ],
    issueTop5: [
      {
        label: "고지문 미흡",
        findingCount: 65,
        affectedSurveyCount: 65,
        rateOfAllScans: 77,
        description: "기본 고지 항목이 충분하지 않은 경우입니다.",
      },
    ],
    platformStats: [
      {
        platform: "Google Forms",
        surveyCount: 40,
        personalInfoCount: 38,
        personalInfoRate: 95,
        sensitiveInfoCount: 2,
        sensitiveInfoRate: 5,
        highRiskInfoCount: 0,
        highRiskInfoRate: 1,
        attentionNeededCount: 36,
        attentionNeededRate: 90,
        avgOverallScore: 48,
      },
    ],
    organizationStats: [
      {
        typeLabel: "공공기관",
        surveyCount: 20,
        personalInfoCount: 18,
        personalInfoRate: 90,
        sensitiveInfoCount: 1,
        sensitiveInfoRate: 4,
        highRiskInfoCount: 0,
        highRiskInfoRate: 1,
        attentionNeededCount: 18,
        attentionNeededRate: 88,
        avgOverallScore: 45,
      },
    ],
    publicSector: {
      publicPersonalInfoSurveyCount: 20,
      externalToolReviewCount: 62,
      csapOrCloudReviewCount: 12,
      purposeGapCount: 18,
      itemsGapCount: 16,
      retentionGapCount: 22,
      destructionGapCount: 20,
      contactGapCount: 14,
      narrative:
        "이번 주 공공부문 개인정보 수집 설문에서는 외부 설문도구 사용 및 공공부문 클라우드 보안 기준 확인 필요 신호가 반복적으로 나타났습니다. 이는 개별 기관의 위법 여부를 확정하는 자료가 아니라, 공개 설문 화면에서 확인 가능한 고지·안내 수준을 기준으로 한 점검 결과입니다.",
    },
    questionStats: {
      totalQuestions: 400,
      personalInfoQuestions: 120,
      sensitiveQuestions: 8,
      highRiskQuestions: 2,
      personalInfoQuestionRate: 30,
      frequentCategories: [{ categoryKey: "phone", label: "연락처", count: 40, rate: 10 }],
    },
    anonymousCases: [
      {
        id: "event-application",
        title: "행사·프로그램 참가신청서형",
        orgType: "공공·민간 혼재",
        surveyPattern: "참가신청·접수",
        tool: "Google Forms",
        collectedInfo: ["이름", "연락처"],
        noticeGaps: ["수집 목적 안내"],
        respondentRisk: "내 정보가 언제까지 보관되고 누가 관리하는지 알기 어렵습니다.",
        operatorFix: "설문 첫 화면에 개인정보 수집·이용 안내문을 명확히 표시해야 합니다.",
        similarCount: 23,
        whyRisky:
          "연락처가 필요할 수 있지만 보관 기간과 관리 주체를 확인하기 어려우면 제공 여부를 판단하기 어렵습니다.",
        respondentBlindSpot:
          "정보가 언제까지 보관되고 삭제 요청은 어디에 해야 하는지 확인하기 어렵습니다.",
        operatorMissed: ["수집 목적", "보유기간", "파기 기준", "담당자 연락처"],
        quickFixNotice:
          "본 설문은 안내 발송을 위해 이름과 연락처를 수집하며, 목적 달성 후 30일 이내 파기합니다.",
        weakNoticeExample: "이름과 연락처를 입력해 주세요.",
        improvedNoticeExample:
          "본 설문은 안내 발송을 위해 이름과 연락처를 수집합니다. 목적 달성 후 30일 이내 파기하며, 문의는 담당부서로 안내합니다.",
        whyThisWeek:
          "이번 주 참가신청형 설문에서 보유기간·파기 기준 안내 확인 필요 신호가 반복됐습니다.",
        signalKind: "type",
      },
    ],
    insights: [
      {
        order: 1,
        text: "온라인 설문은 개인정보 수집의 진입장벽을 낮췄지만, 고지 항목의 표준화는 따라가지 못하고 있습니다.",
      },
    ],
    checklist: ["수집 목적을 명확히 안내했는가"],
    pressSummary:
      "공개 온라인 설문 84건 중 81건, 개인정보 수집 신호 확인\n본 통계는 공개 설문 화면 기준 자동진단 결과이며, 개별 설문의 위법 여부를 확정하지 않습니다.",
    quality: {
      completedDiagnosisCount: 84,
      limitedQuestionAnalysisCount: 3,
      closedExcludedCount: 10,
      restrictedExcludedCount: 5,
      evidenceCaptureCount: 70,
      evidenceSurveyCount: 68,
      evidenceImageCount: 210,
    },
    disclaimer:
      "본 리포트는 공개 설문 화면 기준의 참고 지표이며, 개별 설문의 위법 여부를 확정하지 않습니다.",
  };
}

function main() {
  console.log("[Weekly Report Public Safety Check]");

  const safe = mockSnapshot();
  assertWeeklySnapshotSafe(safe);
  check("safe snapshot accepted", true);

  const dirtyUrl = structuredClone(safe);
  dirtyUrl.anonymousCases[0].operatorFix =
    "https://docs.google.com/forms/d/abc 를 확인하세요";
  check(
    "rejects google forms URL",
    !checkWeeklySnapshotSafe(dirtyUrl).ok,
  );

  const dirtyWording = structuredClone(safe);
  dirtyWording.insights[0].text = "이번 주 위반 확정 기관이 확인되었습니다.";
  check("rejects 위반 확정", !checkWeeklySnapshotSafe(dirtyWording).ok);

  const dirtyKeys = {
    ...safe,
    report_json: { raw: 1 },
    source_page_url: "https://example.com",
    signedUrl: "https://xxx.supabase.co/storage/v1/object/sign/x",
  };
  check("rejects report_json key", !checkWeeklySnapshotSafe(dirtyKeys).ok);

  check("individual cases disabled", PUBLIC_INDIVIDUAL_CASES_ENABLED === false);

  const header = read("components/HeaderNav.tsx");
  check("nav has 주간 리포트", header.includes('label: "주간 리포트"') && header.includes('href: "/weekly"'));
  check("nav removed 공개 진단 사례", !header.includes("공개 진단 사례"));
  check("nav not linking /cases", !header.includes('href: "/cases"'));
  check("weekly active state", header.includes('pathname.startsWith("/weekly/")'));

  const casesPage = read("app/cases/page.tsx");
  const casesDetail = read("app/cases/[publicId]/page.tsx");
  check("cases list redirects", casesPage.includes('redirect("/weekly")'));
  check("cases detail redirects", casesDetail.includes('redirect("/weekly")'));

  const nextConfig = read("next.config.ts");
  check("next.config /cases redirect", nextConfig.includes('source: "/cases"') && nextConfig.includes('destination: "/weekly"'));

  const publicCasesApi = [
    read("app/api/public/cases/route.ts"),
    read("app/api/public/cases/[publicId]/route.ts"),
    read("app/api/public/cases/[publicId]/evidence/[evidenceId]/route.ts"),
  ].join("\n");
  check("public cases API gated", publicCasesApi.includes("PUBLIC_INDIVIDUAL_CASES_ENABLED"));
  check("public cases API 410", publicCasesApi.includes("status: 410"));

  const weeklyUi = [
    read("components/weekly/WeeklyListView.tsx"),
    read("components/weekly/WeeklyDetailView.tsx"),
    read("components/weekly/PrivacyIndexTrendPanel.tsx"),
    read("components/weekly/WeeklyCharts.tsx"),
    read("lib/weekly/copy.ts"),
    read("lib/weekly/anonymousCases.ts"),
    read("lib/weekly/privacyIndex.ts"),
  ].join("\n");
  const forbidden = ["불법 설문", "위반 기관", "위반 확정", "신고 대상 확정"];
  for (const phrase of forbidden) {
    check(`weekly UI has no ${phrase}`, !weeklyUi.includes(phrase));
  }
  check("weekly UI has no storage_path", !weeklyUi.includes("storage_path"));
  check("weekly UI has no signedUrl", !weeklyUi.includes("signedUrl"));
  check("weekly UI has no report_json", !weeklyUi.includes("report_json"));
  check("anonymous section copy", weeklyUi.includes("실제 기관명") || weeklyUi.includes("개별 기관명"));

  const publicWeekly = [
    read("app/api/public/weekly/route.ts"),
    read("app/api/public/weekly/[weekId]/route.ts"),
    read("lib/weekly/repository.ts"),
  ].join("\n");
  check("public weekly uses published-only", publicWeekly.includes("listPublishedWeeklyCards") || publicWeekly.includes("getPublishedWeeklyReport"));
  check("public weekly safety assert", publicWeekly.includes("assertWeeklySnapshotSafe") || publicWeekly.includes("checkWeeklySnapshotSafe"));
  check("files exist", exists("app/api/public/weekly/route.ts") && exists("app/weekly/[weekId]/page.tsx"));

  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check(
    "package.json weekly:public-safety",
    pkg.scripts["weekly:public-safety"] === "tsx scripts/check-weekly-public-safety.ts",
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:public-safety PASS");
}

main();
