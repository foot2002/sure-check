/**
 * Unit checks for collector freshness / availability filtering.
 * Dates use runtime KST — cases are built from the current year.
 */
import assert from "node:assert/strict";
import {
  checkSurveyFreshnessAndAvailability,
  evaluateSurveyFreshness,
  freshnessQueryBoost,
  getKstParts,
  getRecentSurveyWindowDays,
  isDiagnosisBlockedStatus,
} from "../lib/collector/surveyFreshness";
import {
  diagnosisCoverage,
  isAutoDiagnosisTarget,
  isCollectConfirmed,
} from "../lib/collector/collectConfirmedPolicy";
import { isImprovementCandidate } from "../lib/report/improvementCandidates";
import {
  NON_ACTIONABLE_LIMITED_MESSAGE,
  shouldSkipBrowserFallback,
} from "../lib/scan/nonActionableForm";
import { buildCollectorSearchQueries } from "../lib/collector/searchQueries";

function ymdOffset(days: number, now = new Date()): string {
  const kst = getKstParts(new Date(now.getTime() + days * 24 * 60 * 60 * 1000));
  return kst.ymd;
}

function assertCase(
  label: string,
  got: { availabilityStatus: string; shouldDiagnose: boolean; status: string },
  expected: { availability?: string; diagnose?: boolean; status?: string },
): void {
  if (expected.availability) {
    assert.equal(
      got.availabilityStatus,
      expected.availability,
      `${label}: availability ${got.availabilityStatus} != ${expected.availability}`,
    );
  }
  if (expected.diagnose != null) {
    assert.equal(
      got.shouldDiagnose,
      expected.diagnose,
      `${label}: shouldDiagnose ${got.shouldDiagnose} != ${expected.diagnose}`,
    );
  }
  if (expected.status) {
    assert.equal(
      got.status,
      expected.status,
      `${label}: status ${got.status} != ${expected.status}`,
    );
  }
  console.log(`  PASS  ${label}`);
}

async function main(): Promise<void> {
  console.log("[Collector Freshness Filter]\n");
  const kst = getKstParts();
  const year = kst.year;

  assert.ok(getRecentSurveyWindowDays() > 0 && getRecentSurveyWindowDays() <= 90);
  console.log(`  KST today: ${kst.ymd}  windowDays=${getRecentSurveyWindowDays()}`);

  {
    const r = evaluateSurveyFreshness({
      title: `${year} 최근 만족도 조사`,
      snippet: "참여 설문조사 진행 중",
      url: "https://forms.gle/recent",
      mode: "search",
    });
    assertCase(`${year}년 최근 설문 → active/diagnose`, r, {
      availability: "active",
      diagnose: true,
    });
  }

  {
    const end = ymdOffset(-2).replace(/-/g, ".");
    const ended = evaluateSurveyFreshness({
      title: `${year} 설문`,
      snippet: `응답기간: ${year}.01.01 ~ ${end}`,
      url: "https://forms.gle/ended2",
      mode: "search",
    });
    assertCase(`${year}년이지만 마감일 경과 → closed`, ended, {
      availability: "closed",
      diagnose: false,
      status: "closed",
    });
  }

  {
    const r = evaluateSurveyFreshness({
      title: `${year - 1} 설문`,
      snippet: `${year - 1}년 주민 설문조사`,
      url: "https://forms.gle/y1",
      mode: "search",
    });
    assertCase(`${year - 1}년 설문 → stale`, r, {
      availability: "stale",
      diagnose: false,
      status: "stale",
    });
  }

  {
    const r = evaluateSurveyFreshness({
      title: `${year - 3} 온라인 설문`,
      snippet: `${year - 3}년도 안내`,
      url: "https://forms.gle/y3",
      mode: "search",
    });
    assertCase(`${year - 3}년 설문 → stale`, r, {
      availability: "stale",
      diagnose: false,
      status: "stale",
    });
  }

  {
    const r = evaluateSurveyFreshness({
      title: "구청 만족도 조사",
      snippet: "이 설문은 응답이 종료되었습니다. 더 이상 응답을 받지 않습니다.",
      url: "https://forms.gle/closed",
      mode: "search",
    });
    assertCase("응답 종료 문구 → closed", r, {
      availability: "closed",
      diagnose: false,
      status: "closed",
    });
  }

  {
    const r = evaluateSurveyFreshness({
      title: "직원 설문",
      snippet: "로그인이 필요합니다. 접근 권한이 없습니다.",
      url: "https://form.naver.com/response/restricted",
      mode: "search",
    });
    assertCase("비공개/로그인 필요 → restricted", r, {
      availability: "restricted",
      diagnose: false,
      status: "restricted",
    });
  }

  {
    const r = evaluateSurveyFreshness({
      title: "의견 설문",
      snippet: "아래 링크에서 응답해 주세요",
      url: "https://forms.gle/nodate",
      mode: "search",
    });
    assert.ok(
      r.availabilityStatus === "unknown" || r.record.freshness_status === "unknown",
      "날짜 없음 → unknown",
    );
    assert.equal(r.shouldDiagnose, false);
    console.log("  PASS  날짜 없지만 종료 문구 없음 → unknown");
  }

  {
    const r = evaluateSurveyFreshness({
      title: `${year - 1}년도 만족도 조사`,
      snippet: `${year - 1}년 실적조사`,
      url: "https://forms.gle/topic",
      mode: "search",
    });
    assert.equal(r.record.freshness_status, "stale_candidate");
    assert.equal(r.shouldDiagnose, false);
    console.log("  PASS  주제 연도 과거 설문 → stale_candidate (진단 제외)");
  }

  {
    const live = evaluateSurveyFreshness({
      title: `${year - 1}년도 만족도 조사`,
      snippet: "현재 참여 가능",
      url: "https://forms.gle/live-old-year",
      mode: "page",
      confirmedLive: true,
    });
    assertCase("과거 연도 신호는 응답 가능해도 진단 제외", live, {
      availability: "stale",
      diagnose: false,
      status: "stale",
    });
  }

  {
    const boosted = freshnessQueryBoost("공공기관 forms.gle 설문");
    assert.ok(boosted.includes(String(year)));
    assert.ok(/진행/.test(boosted));
    const queries = buildCollectorSearchQueries({ strategy: "org_v1" });
    assert.ok(queries.some((q) => q.query.includes(String(year))));
    console.log("  PASS  검색 쿼리 최신성 강화");
  }

  assert.equal(isDiagnosisBlockedStatus("closed"), true);
  assert.equal(isDiagnosisBlockedStatus("stale"), true);
  assert.equal(isDiagnosisBlockedStatus("restricted"), true);
  assert.equal(isDiagnosisBlockedStatus("active"), false);
  console.log("  PASS  진단 큐 차단 상태");

  {
    const skip = shouldSkipBrowserFallback({
      platform: "google_forms",
      title: "종료",
      url: "https://forms.gle/x",
      questions: [],
      hasPrivacyNotice: false,
      hasConsent: false,
      hasRetentionNotice: false,
      hasOverseasTransferNotice: false,
      isLimited: true,
      limitedReason: "Google Forms 응답이 종료되었습니다.",
      confidence: "none",
      metadata: { extractionWarnings: [] },
    });
    assert.equal(skip, true);
    assert.match(
      NON_ACTIONABLE_LIMITED_MESSAGE,
      /응답이 종료되었거나 접근이 제한되어 진단이 제한/,
    );
    console.log("  PASS  사용자 직접 URL 종료 시 빠른 limited + 문구");
  }

  {
    const liveUnknown = evaluateSurveyFreshness({
      title: "의견 설문",
      snippet: "아래 링크에서 응답해 주세요",
      url: "https://forms.gle/live-nodate",
      mode: "page",
      confirmedLive: true,
    });
    assertCase("날짜 불명 설문은 보류", liveUnknown, {
      diagnose: false,
    });
    assert.equal(liveUnknown.reasonCode, "date_unknown_hold");
    assert.equal(liveUnknown.record.diagnosis_exclusion_reason, "date_unknown_hold");
    assert.equal(
      isAutoDiagnosisTarget({
        status: liveUnknown.status,
        freshness: liveUnknown.record,
      }),
      false,
      "date_unknown_hold must not be auto-diagnosis target",
    );
    console.log("  PASS  날짜 불명 → date_unknown_hold (자동진단 제외)");
    assert.equal(
      isAutoDiagnosisTarget({
        status: liveUnknown.status,
        freshness: liveUnknown.record,
        sourceTypes: ["official_site"],
      }),
      true,
      "official_site date_unknown_hold must enter auto diagnosis",
    );
    console.log("  PASS  공식 사이트 날짜 불명 → 자동진단 대상");
  }

  {
    const thesis = evaluateSurveyFreshness({
      title: "석사 논문 연구 참여자 모집 설문",
      snippet: "학위논문 설문입니다",
      url: "https://forms.gle/thesis",
      mode: "search",
    });
    assert.equal(thesis.shouldDiagnose, false);
    assert.ok(
      thesis.status === "ignored" || thesis.reasonCode === "personal_research",
    );
    assert.equal(
      isAutoDiagnosisTarget({
        status: "active",
        title: "석사 논문 연구 참여자 모집 설문",
        freshness: { should_diagnose: true, freshness_status: "active" },
      }),
      false,
    );
    console.log("  PASS  논문/학위/개인 연구 설문 → 자동진단 제외");
  }

  {
    const recent = evaluateSurveyFreshness({
      title: `${year} 최근 만족도 조사`,
      snippet: "참여 설문조사 진행 중",
      url: "https://forms.gle/recent-page",
      mode: "page",
      confirmedLive: true,
    });
    assert.equal(recent.status, "active");
    assert.equal(recent.shouldDiagnose, true);
    assert.ok(
      isCollectConfirmed({ status: recent.status, freshness: recent.record }),
    );
    assert.ok(
      isAutoDiagnosisTarget({
        status: recent.status,
        freshness: recent.record,
      }),
      "collect_confirmed must enter diagnosis queue",
    );
    console.log("  PASS  수집 확정(active) → 반드시 자동진단 대상");
  }

  {
    const missing = diagnosisCoverage(10, 9);
    assert.equal(missing.fail, true);
    assert.equal(missing.missing, 1);
    const full = diagnosisCoverage(10, 10);
    assert.equal(full.fail, false);
    console.log("  PASS  collect_confirmed 중 자동진단 누락 → FAIL");
  }

  {
    assert.equal(
      isImprovementCandidate({
        hasPersonalInfo: true,
        userDecisionLabel: "고지문 미흡",
      }),
      true,
    );
    assert.equal(
      isImprovementCandidate({
        hasPersonalInfo: false,
        hasSensitiveInfo: false,
        hasHighRiskInfo: false,
        overallRiskLevel: "low",
        userDecisionLabel: "응답 가능",
      }),
      false,
    );
    console.log("  PASS  개선안내 후보 조건 (위반 확정 표현 없음)");
  }

  const fetched = await checkSurveyFreshnessAndAvailability(
    "https://forms.gle/example",
    {
      title: `${year} 설문조사`,
      fetchPage: false,
    },
  );
  assert.equal(fetched.shouldDiagnose, false);
  assert.equal(fetched.reasonCode, "date_unknown_hold");
  console.log("  PASS  checkSurveyFreshnessAndAvailability year-only → date_unknown_hold");

  console.log("\ncollector:freshness-check: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
