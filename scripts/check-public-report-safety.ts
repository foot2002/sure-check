import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertPublicReportSafe,
  checkPublicReportSafe,
  PUBLIC_REPORT_FORBIDDEN_KEYS,
} from "@/lib/report/publicReportPolicy";
import {
  buildPublicDashboard,
  type PublicDashboardPayload,
} from "@/lib/report/buildPublicDashboard";
import {
  getSupabaseServiceRoleKeyStatus,
  getSupabaseUrlStatus,
} from "@/lib/supabase/server";

function loadLocalEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]?.trim()) {
        process.env[key] = value;
      }
    }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mockSafePayload(): PublicDashboardPayload {
  return {
    range: "7d",
    from: "2026-07-26",
    to: "2026-08-01",
    generatedAt: new Date().toISOString(),
    hasData: true,
    isEarlyData: true,
    summary: {
      totalScans: 10,
      personalInfoCount: 4,
      personalInfoRate: 40,
      sensitiveInfoCount: 2,
      sensitiveInfoRate: 20,
      highRiskInfoCount: 1,
      highRiskInfoRate: 10,
      highOrCriticalCount: 3,
      highOrCriticalRate: 30,
      avgOverallScore: 62.5,
    },
    privacyIndex: {
      avgScore: 62.5,
      grade: "개선 필요",
      interpretation: "60~79점: 개선 필요",
      disclaimer:
        "이 지수는 자동진단 결과를 바탕으로 산출한 참고 지표이며, 개별 설문의 위법 여부를 확정하는 기준은 아닙니다.",
    },
    trends: [
      {
        date: "2026-08-01",
        surveyCount: 3,
        personalInfoRate: 33.3,
        sensitiveInfoRate: 0,
        highRiskInfoRate: 0,
        avgOverallScore: 70,
      },
    ],
    decisionStats: [
      {
        decisionKey: "SAFE_RESPOND",
        label: "응답 가능",
        count: 2,
        rate: 20,
      },
    ],
    questionStats: {
      totalQuestions: 40,
      personalInfoQuestions: 8,
      sensitiveQuestions: 1,
      highRiskQuestions: 0,
      personalInfoQuestionRate: 20,
    },
    dataCategoryStats: [
      {
        categoryKey: "name",
        label: "이름",
        riskCategory: "direct_identifier",
        count: 5,
        rate: 50,
      },
    ],
    noticeComplianceStats: [
      {
        itemKey: "purpose",
        label: "수집 목적 안내",
        applicableCount: 10,
        compliantCount: 4,
        gapCount: 6,
        complianceRate: 40,
      },
    ],
    platformStats: [
      {
        platform: "Google Forms",
        surveyCount: 5,
        personalInfoRate: 40,
        sensitiveInfoRate: 20,
        highRiskInfoRate: 10,
        avgOverallScore: 60,
      },
    ],
    publicSectorToolStats: {
      publicPersonalInfoSurveyCount: 2,
      externalToolReviewCount: 2,
      csapOrCloudReviewCount: 2,
      byPlatform: [{ platform: "Google Forms", surveyCount: 2 }],
      byOrgType: [{ typeLabel: "공공기관", surveyCount: 2 }],
    },
    issueStats: [
      {
        label: "고지문 미흡",
        findingCount: 4,
        affectedSurveyCount: 3,
        rateOfAllScans: 30,
      },
    ],
    organizationTypeStats: [
      {
        typeLabel: "공공기관",
        surveyCount: 3,
        personalInfoRate: 66.7,
        sensitiveInfoRate: 33.3,
        highRiskInfoRate: 0,
        avgOverallScore: null,
      },
    ],
    diagnosisQualityStats: {
      completedDiagnosisCount: 8,
      limitedQuestionAnalysisCount: 2,
      evidenceCaptureCount: 5,
      fullPathCaptureCount: 3,
      avgCapturedPageCount: 4.2,
    },
    disclosurePolicy: {
      mode: "aggregate_only",
      message: "aggregate only",
    },
  };
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  console.log("[Public Report Safety Check]");

  const safe = mockSafePayload();
  assertPublicReportSafe(safe);
  console.log("mock aggregate payload: OK");

  const dirty = {
    ...safe,
    leak: {
      survey_url: "https://example.com/form",
      operator_name: "테스트기관",
      storage_path: "evidence/x/package.zip",
      question_label: "이름을 입력하세요",
      report_json: { x: 1 },
    },
  };
  const dirtyCheck = checkPublicReportSafe(dirty);
  assert(!dirtyCheck.ok, "dirty payload should fail");
  assert(
    dirtyCheck.violations.some((v) => v.includes("survey_url")),
    "should flag survey_url",
  );
  console.log("forbidden-key rejection: OK");
  console.log(`forbidden keys covered: ${PUBLIC_REPORT_FORBIDDEN_KEYS.length}`);

  const urlStatus = getSupabaseUrlStatus();
  const keyStatus = getSupabaseServiceRoleKeyStatus();
  if (urlStatus === "OK" && keyStatus === "OK") {
    try {
      const live = await buildPublicDashboard({ range: "7d" });
      assertPublicReportSafe(live);
      assert(
        Array.isArray(live.decisionStats),
        "decisionStats missing",
      );
      assert(live.questionStats != null, "questionStats missing");
      assert(Array.isArray(live.dataCategoryStats), "dataCategoryStats missing");
      assert(
        Array.isArray(live.noticeComplianceStats),
        "noticeComplianceStats missing",
      );
      assert(live.publicSectorToolStats != null, "publicSectorToolStats missing");
      assert(live.diagnosisQualityStats != null, "diagnosisQualityStats missing");
      assert(live.privacyIndex != null, "privacyIndex missing");
      // Labels should be unique in issueStats
      const labels = live.issueStats.map((i) => i.label);
      assert(
        new Set(labels).size === labels.length,
        "issueStats labels must be unique",
      );
      console.log(
        `live dashboard: OK (hasData=${live.hasData}, totalScans=${live.summary.totalScans}, issues=${live.issueStats.length})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/JWT|issued at future|fetch failed|network/i.test(message)) {
        console.log(`live dashboard: SKIP (${message})`);
      } else {
        throw error;
      }
    }
  } else {
    console.log("live dashboard: SKIP (missing env)");
  }

  console.log("Result: PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.log("Result: FAIL");
  process.exit(1);
});
