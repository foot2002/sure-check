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
    issueStats: [
      {
        findingType: "notice_gap",
        checkDomain: "notice",
        severity: "needs_review",
        findingCount: 4,
        label: "고지문 미흡",
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
      console.log(
        `live dashboard: OK (hasData=${live.hasData}, totalScans=${live.summary.totalScans})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Clock skew / transient Supabase auth issues should not fail policy checks.
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
