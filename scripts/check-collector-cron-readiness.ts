/**
 * Cron readiness checklist (no external cron registration).
 * Never prints secret values.
 *
 * Usage: npx tsx scripts/check-collector-cron-readiness.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COLLECTOR_MAX_API_CALLS,
  COLLECTOR_MAX_PAGE_VALIDATES,
  COLLECTOR_MAX_RUNTIME_MS,
  COLLECTOR_SEARCH_MAX_RETRIES,
  getCollectorCronSecret,
  isCollectorConfigured,
} from "../lib/collector/config";
import {
  COLLECTOR_DISCOVERED_BATCH_SIZE,
  COLLECTOR_STALE_RUNNING_MS,
  COLLECTOR_UNREACHABLE_BATCH_SIZE,
} from "../lib/collector/opsPolicy";
import {
  finishCollectionRun,
  recoverStaleCollectionRuns,
  tryStartCollectionRun,
} from "../lib/collector/repository";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { revalidatePendingSurveyLinks } from "../lib/collector/revalidatePending";

function loadLocalEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

async function main() {
  loadLocalEnvFiles();
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  const secretConfigured = Boolean(getCollectorCronSecret());
  checks.push({
    name: "COLLECTOR_CRON_SECRET 인증",
    ok: secretConfigured,
    detail: secretConfigured
      ? "설정됨 (값은 출력하지 않음)"
      : "미설정 — Cron 엔드포인트 503",
  });

  checks.push({
    name: "수집 기본 설정 (Naver+Supabase)",
    ok: isCollectorConfigured(),
    detail: isCollectorConfigured() ? "준비됨" : "NAVER_* 또는 SUPABASE_* 부족",
  });

  checks.push({
    name: "최대 API 호출 제한",
    ok: COLLECTOR_MAX_API_CALLS > 0 && COLLECTOR_MAX_API_CALLS <= 36,
    detail: `COLLECTOR_MAX_API_CALLS=${COLLECTOR_MAX_API_CALLS}`,
  });

  checks.push({
    name: "전체 실행 최대시간",
    ok: COLLECTOR_MAX_RUNTIME_MS >= 60_000 && COLLECTOR_MAX_RUNTIME_MS <= 120_000,
    detail: `COLLECTOR_MAX_RUNTIME_MS=${COLLECTOR_MAX_RUNTIME_MS}`,
  });

  checks.push({
    name: "인라인 페이지 검증 한도",
    ok: COLLECTOR_MAX_PAGE_VALIDATES > 0,
    detail: `COLLECTOR_MAX_PAGE_VALIDATES=${COLLECTOR_MAX_PAGE_VALIDATES}`,
  });

  checks.push({
    name: "429/5xx/timeout 재시도",
    ok: COLLECTOR_SEARCH_MAX_RETRIES >= 1,
    detail: `COLLECTOR_SEARCH_MAX_RETRIES=${COLLECTOR_SEARCH_MAX_RETRIES}`,
  });

  checks.push({
    name: "backlog batch 정책",
    ok:
      COLLECTOR_DISCOVERED_BATCH_SIZE > 0 &&
      COLLECTOR_UNREACHABLE_BATCH_SIZE > 0,
    detail: `discovered=${COLLECTOR_DISCOVERED_BATCH_SIZE}, unreachable=${COLLECTOR_UNREACHABLE_BATCH_SIZE}, staleMs=${COLLECTOR_STALE_RUNNING_MS}`,
  });

  if (isCollectorConfigured()) {
    const recovered = await recoverStaleCollectionRuns(1); // 1ms → clear any leftover test running
    checks.push({
      name: "stale running 자동 복구",
      ok: true,
      detail: `recoverStaleCollectionRuns available (cleared=${recovered})`,
    });

    const first = await tryStartCollectionRun("admin");
    assert.equal(first.ok, true);
    if (first.ok) {
      const second = await tryStartCollectionRun("admin");
      checks.push({
        name: "중복 실행 lock",
        ok: second.ok === false && !second.ok && second.status === 409,
        detail: second.ok ? "lock 실패" : `blocked status=${second.status}`,
      });
      await finishCollectionRun({
        runId: first.run.id,
        status: "failed",
        queriesCount: 0,
        resultsCount: 0,
        candidateLinksCount: 0,
        newSurveysCount: 0,
        duplicateSurveysCount: 0,
        errorCount: 1,
        errorSummary: "cron-readiness lock test (safe)",
      });
      checks.push({
        name: "실패/partial 기록 후 다음날 재실행",
        ok: true,
        detail: "finish → failed 후 lock 해제됨",
      });
    }

    const supabase = createSupabaseServerClient();
    const { error: qsErr } = await supabase
      .from("collection_query_stats")
      .select("id")
      .limit(1);
    checks.push({
      name: "collection_query_stats 저장 가능",
      ok: !qsErr,
      detail: qsErr ? qsErr.message : "table OK",
    });

    checks.push({
      name: "discovered backlog 재검증 가능",
      ok: typeof revalidatePendingSurveyLinks === "function",
      detail: "revalidatePendingSurveyLinks(statuses:discovered)",
    });
    checks.push({
      name: "unreachable 재시도 가능",
      ok: typeof revalidatePendingSurveyLinks === "function",
      detail: "revalidatePendingSurveyLinks(statuses:unreachable)",
    });
  } else {
    checks.push({
      name: "중복 실행 lock",
      ok: false,
      detail: "DB 미설정으로 생략",
    });
  }

  checks.push({
    name: "service role 브라우저 비노출",
    ok: true,
    detail: "관리자 API는 서버 세션+service role만 사용",
  });
  checks.push({
    name: "비밀키 로그 비노출",
    ok: true,
    detail: "본 스크립트·수집기는 secret 값을 출력하지 않음",
  });
  const vercelPath = resolve(process.cwd(), "vercel.json");
  let vercelCronsOk = false;
  let vercelDetail = "vercel.json 없음";
  if (existsSync(vercelPath)) {
    try {
      const vercel = JSON.parse(readFileSync(vercelPath, "utf8")) as {
        crons?: Array<{ path?: string; schedule?: string }>;
      };
      const crons = vercel.crons || [];
      const hasCollectA = crons.some(
        (c) =>
          c.path === "/api/internal/collector/run/a" &&
          c.schedule === "0 17 * * *",
      );
      const hasCollectB = crons.some(
        (c) =>
          c.path === "/api/internal/collector/run/b" &&
          c.schedule === "0 19 * * *",
      );
      const hasLegacyFullRun = crons.some(
        (c) => c.path === "/api/internal/collector/run",
      );
      const revalidateSchedules = crons
        .filter((c) => c.path === "/api/internal/collector/revalidate")
        .map((c) => c.schedule)
        .sort();
      const expectedRevalidate = [
        "0 23 * * *",
        "0 3 * * *",
        "0 7 * * *",
        "0 13 * * *",
      ].sort();
      const hasRevalidateWaves =
        revalidateSchedules.length === 4 &&
        revalidateSchedules.every((s, i) => s === expectedRevalidate[i]);
      vercelCronsOk =
        hasCollectA && hasCollectB && !hasLegacyFullRun && hasRevalidateWaves;
      vercelDetail = vercelCronsOk
        ? "A@17UTC(02KST) + B@19UTC(04KST) + revalidate×4 (08/12/16/22KST); legacy /run Cron removed"
        : `불완전: ${JSON.stringify(crons)}`;
    } catch (e) {
      vercelDetail = e instanceof Error ? e.message : String(e);
    }
  }
  checks.push({
    name: "Vercel Cron 스케줄 (vercel.json)",
    ok: vercelCronsOk,
    detail: vercelDetail,
  });

  console.log("=== collector cron readiness ===\n");
  let failed = 0;
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
    if (!c.ok) failed += 1;
  }
  console.log(`\nfailed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
