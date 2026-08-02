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
      highOrCriticalCount: 5,
      highOrCriticalRate: 50,
      attentionNeededCount: 5,
      attentionNeededRate: 50,
      judgmentUnknownCount: 2,
      judgmentUnknownRate: 20,
      avgOverallScore: 62.5,
    },
    insights: {
      rangeLabel: "최근 7일",
      oneLineConclusion:
        "최근 7일 진단된 온라인 설문 10건 중 4건이 개인정보를 수집했고, 5건은 응답자 관점에서 주의가 필요한 설문으로 분류되었습니다. 문항 분석이 제한된 설문은 2건입니다.",
      keySignals: [
        {
          order: 1,
          headline: "개인정보 수집 설문이 확인되었습니다.",
          detail: "최근 7일 진단 설문 10건 중 4건이 개인정보를 포함했습니다.",
        },
        {
          order: 2,
          headline: "응답 전 확인이 필요한 설문이 확인되었습니다.",
          detail:
            "5건은 응답 거부·신고 검토 또는 이에 준하는 주의 판단으로 분류되었습니다.",
        },
        {
          order: 3,
          headline: "공공부문 외부도구 사용 확인 신호가 있었습니다.",
          detail:
            "공공부문 개인정보 수집 설문 2건 중 2건에서 외부도구 또는 CSAP 확인 필요 신호가 있었습니다.",
        },
      ],
      keyFindings: [
        {
          id: "personal_info",
          title: "개인정보 수집 현황",
          headline: "개인정보를 수집하는 설문이 확인되었습니다.",
          detail: "진단 설문 10건 중 4건이 개인정보를 포함했습니다.",
          available: true,
        },
        {
          id: "respondent_caution",
          title: "응답자 관점 판단",
          headline: "응답 전 확인이 필요한 설문이 확인되었습니다.",
          detail:
            "5건은 응답 거부·신고 검토 또는 이에 준하는 주의 판단으로 분류되었습니다.",
          available: true,
        },
        {
          id: "public_external_tool",
          title: "공공부문 외부도구 확인",
          headline: "공공부문 설문은 외부도구·보안 기준 확인이 필요합니다.",
          detail:
            "공공부문 개인정보 수집 설문 2건 중 2건에서 외부 설문도구 또는 CSAP 확인 필요 신호가 있었습니다.",
          available: true,
        },
      ],
      platformInsight:
        "이번 기간에는 Google Forms에서 개인정보 포함 비율이 가장 높게 나타났습니다. 다만 표본이 적은 초기 통계이므로, 플랫폼 자체의 위험도를 단정하는 자료는 아닙니다.",
      pressShareSummary:
        "최근 7일간 SURE Check가 자동진단한 공개 온라인 설문 10건 중 4건이 개인정보를 포함했고, 5건은 응답자 관점에서 주의가 필요한 설문으로 분류되었습니다. 본 통계는 자동진단 기반 참고 지표이며, 개별 설문의 위법 여부를 확정하지 않습니다.",
      cautionDecisionCount: 5,
      attentionNeededCount: 5,
      judgmentUnknownCount: 2,
      reportLikeDecisionCount: 5,
      publicExternalToolCheckCount: 2,
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
      assert(live.insights != null, "insights missing");
      assert(
        typeof live.insights.oneLineConclusion === "string",
        "oneLineConclusion missing",
      );
      assert(
        live.insights.keyFindings.length === 3,
        "keyFindings should have 3 cards",
      );
      assert(
        Array.isArray(live.insights.keySignals),
        "keySignals missing",
      );
      assert(
        typeof live.insights.pressShareSummary === "string",
        "pressShareSummary missing",
      );
      assert(
        live.summary.attentionNeededCount === live.insights.attentionNeededCount,
        "attentionNeededCount mismatch between summary and insights",
      );
      assert(
        live.summary.attentionNeededCount === live.summary.highOrCriticalCount,
        "legacy highOrCriticalCount should match attentionNeededCount",
      );
      const attentionFromDecisions = live.decisionStats
        .filter((d) =>
          ["STOP_RESPONSE", "NOTICE_CHECK", "SECURITY_CHECK"].includes(
            d.decisionKey,
          ),
        )
        .reduce((s, d) => s + d.count, 0);
      assert(
        live.summary.attentionNeededCount === attentionFromDecisions,
        "attentionNeededCount must equal decision-label sum",
      );
      // Labels should be unique in issueStats
      const labels = live.issueStats.map((i) => i.label);
      assert(
        new Set(labels).size === labels.length,
        "issueStats labels must be unique",
      );
      if (labels.some((l) => l !== "기타 확인 필요")) {
        assert(
          !labels.includes("기타 확인 필요"),
          "기타 확인 필요 should be excluded when specific issues exist",
        );
      }
      console.log(
        `live dashboard: OK (hasData=${live.hasData}, totalScans=${live.summary.totalScans}, attention=${live.summary.attentionNeededCount}, unknown=${live.summary.judgmentUnknownCount}, issues=${live.issueStats.length})`,
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
