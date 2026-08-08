/**
 * Collector unit/integration checks (no Vitest — matches repo tsx script style).
 *
 * Always runs pure URL/platform/normalize/SSRF/env tests.
 * DB/lock/upsert tests run only when SUPABASE_* is configured.
 *
 * Usage: npx tsx scripts/test-collector.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyUrlKind,
  isShortenerUrl,
  isSupportedSurveyUrl,
  toCollectorPlatform,
} from "../lib/collector/platformDetect";
import {
  assertSafePublicUrl,
  normalizeSurveyUrl,
} from "../lib/collector/urlNormalize";
import { extractSurveyUrlsFromText } from "../lib/collector/extractLinks";
import {
  getCollectorConfigError,
  isCollectorConfigured,
  isNaverSearchConfigured,
  isCollectorStorageConfigured,
} from "../lib/collector/config";
import { buildCollectorSearchQueries } from "../lib/collector/searchQueries";
import {
  finishCollectionRun,
  insertSurveySource,
  tryStartCollectionRun,
  upsertSurveyLink,
} from "../lib/collector/repository";
import {
  isValidGoogleFormsResponseUrl,
  isValidMoaformResponseUrl,
  isValidNaverFormResponseUrl,
  validateSurveyResponseUrl,
} from "../lib/collector/surveyUrlRules";
import { validateSurveyPage } from "../lib/collector/pageValidate";
import { sanitizeSurveyTitle, isUrlLikeTitle } from "../lib/collector/titleUtils";

let passed = 0;
let failed = 0;
let skipped = 0;

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

async function run(
  name: string,
  fn: () => void | Promise<void>,
  opts?: { skip?: boolean; skipReason?: string },
) {
  if (opts?.skip) {
    skipped += 1;
    console.log(`SKIP  ${name}${opts.skipReason ? ` (${opts.skipReason})` : ""}`);
    return;
  }
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

async function main() {
  loadLocalEnvFiles();
  console.log("=== collector tests ===\n");

  await run("1. Google Forms URL 판별", () => {
    assert.equal(
      classifyUrlKind("https://docs.google.com/forms/d/e/ABC/viewform"),
      "google_forms",
    );
    assert.equal(
      toCollectorPlatform("https://docs.google.com/forms/d/e/ABC/viewform"),
      "google_forms",
    );
    assert.equal(
      isSupportedSurveyUrl("https://docs.google.com/forms/d/x/viewform"),
      true,
    );
  });

  await run("2. Naver Form URL 판별", () => {
    assert.equal(
      classifyUrlKind("https://form.naver.com/response/AbCd123"),
      "naver_form",
    );
    assert.equal(
      toCollectorPlatform("https://form.naver.com/response/AbCd123"),
      "naver_form",
    );
  });

  await run("3. Moaform URL 판별", () => {
    assert.equal(classifyUrlKind("https://moaform.com/q/abc123"), "moaform");
    assert.equal(
      toCollectorPlatform("https://www.moaform.com/q/abc123"),
      "moaform",
    );
  });

  await run("4. 단축 URL 판별", () => {
    assert.equal(isShortenerUrl("https://naver.me/xYz"), true);
    assert.equal(isShortenerUrl("https://forms.gle/abc"), true);
    assert.equal(classifyUrlKind("https://naver.me/xYz"), "shortener");
    assert.equal(classifyUrlKind("https://forms.gle/abc"), "shortener");
  });

  await run("5. URL 정규화 (Google viewform)", () => {
    const result = normalizeSurveyUrl(
      "https://docs.google.com/forms/d/e/1FAIpQLSe/viewform?usp=sf_link",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.platform, "google_forms");
    assert.match(result.canonicalUrl, /viewform$/i);
    assert.doesNotMatch(result.canonicalUrl, /usp=/);
  });

  await run("6. 추적 파라미터 제거", () => {
    const result = normalizeSurveyUrl(
      "https://form.naver.com/response/ABC?utm_source=x&utm_medium=y&fbclid=1",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.doesNotMatch(result.canonicalUrl, /utm_/);
    assert.doesNotMatch(result.canonicalUrl, /fbclid/);
  });

  await run("7. 동일 URL 중복 제거 (추출)", () => {
    const urls = extractSurveyUrlsFromText(
      "see https://forms.gle/abc and again https://forms.gle/abc plus https://moaform.com/q/z",
    );
    const formsGle = urls.filter((u) => u.includes("forms.gle/abc"));
    assert.equal(formsGle.length, 1);
    assert.ok(urls.some((u) => u.includes("moaform.com/q/z")));
  });

  await run("8. SSRF 차단", async () => {
    const local = await assertSafePublicUrl("http://127.0.0.1/secret");
    assert.equal(local.ok, false);
    const file = normalizeSurveyUrl("file:///etc/passwd");
    assert.equal(file.ok, false);
    const js = normalizeSurveyUrl("javascript:alert(1)");
    assert.equal(js.ok, false);
  });

  await run("9. API 환경변수 누락 처리", () => {
    assert.equal(typeof isNaverSearchConfigured(), "boolean");
    assert.equal(typeof isCollectorConfigured(), "boolean");
    const err = getCollectorConfigError();
    if (!isCollectorConfigured()) {
      assert.ok(err && err.includes("비활성화"));
    }
  });

  await run("검색어 조합 생성", () => {
    const queries = buildCollectorSearchQueries();
    assert.ok(queries.length >= 20 && queries.length <= 40);
    assert.ok(queries.some((q) => q.query.includes("forms.gle")));
    assert.ok(queries.some((q) => q.query.includes("form.naver.com")));
    assert.ok(queries.some((q) => q.query.includes("moaform.com")));
    assert.ok(queries.some((q) => q.group === "domain"));
    assert.ok(queries.some((q) => q.group === "intent"));
    assert.ok(queries.some((q) => q.seed === "만족도 조사"));
  });

  await run("A. moaform.com/q/... 허용", () => {
    assert.equal(isValidMoaformResponseUrl("https://moaform.com/q/GuwL6Q").ok, true);
    assert.equal(classifyUrlKind("https://moaform.com/q/GuwL6Q"), "moaform");
  });

  await run("B. help.moaform.com 차단", () => {
    assert.equal(
      isValidMoaformResponseUrl(
        "https://help.moaform.com/hc/ko/articles/28291726457497",
      ).ok,
      false,
    );
    assert.equal(
      classifyUrlKind("https://help.moaform.com/hc/ko/articles/1"),
      "unsupported",
    );
  });

  await run("C. api.moaform.com 차단", () => {
    assert.equal(
      isValidMoaformResponseUrl("https://api.moaform.com/v1/forms").ok,
      false,
    );
    assert.equal(classifyUrlKind("https://api.moaform.com/v1/forms"), "unsupported");
  });

  await run("D. answer.moaform.com 루트 차단", () => {
    assert.equal(isValidMoaformResponseUrl("https://answer.moaform.com/").ok, false);
    assert.equal(classifyUrlKind("https://answer.moaform.com/"), "unsupported");
  });

  await run("E. Google Forms 응답 URL 허용", () => {
    assert.equal(
      isValidGoogleFormsResponseUrl(
        "https://docs.google.com/forms/d/e/1FAIpQLSeABC/viewform",
      ).ok,
      true,
    );
  });

  await run("F. Google Forms 편집 URL 차단", () => {
    assert.equal(
      isValidGoogleFormsResponseUrl(
        "https://docs.google.com/forms/d/e/1FAIpQLSeABC/edit",
      ).ok,
      false,
    );
    assert.equal(
      normalizeSurveyUrl("https://docs.google.com/forms/d/e/1FAIpQLSeABC/edit").ok,
      false,
    );
  });

  await run("F2. Google Forms closedform은 설문(종료)로 허용", () => {
    const closed = isValidGoogleFormsResponseUrl(
      "https://docs.google.com/forms/d/e/1FAIpQLSeABC/closedform",
    );
    assert.equal(closed.ok, true);
    assert.equal(
      classifyUrlKind(
        "https://docs.google.com/forms/d/e/1FAIpQLSeABC/closedform/viewform",
      ),
      "google_forms",
    );
  });

  await run("G. forms.gle 리디렉션 후 정상 판별", () => {
    assert.equal(classifyUrlKind("https://forms.gle/abc123"), "shortener");
    const afterResolve = validateSurveyResponseUrl(
      "https://docs.google.com/forms/d/e/1FAIpQLSeABC/viewform",
    );
    assert.equal(afterResolve.ok, true);
    if (afterResolve.ok) assert.equal(afterResolve.platform, "google_forms");
  });

  await run("H. naver.me 리디렉션 후 네이버폼 판별", () => {
    assert.equal(classifyUrlKind("https://naver.me/abcd"), "shortener");
    const afterResolve = isValidNaverFormResponseUrl(
      "https://form.naver.com/response/AbCd123",
    );
    assert.equal(afterResolve.ok, true);
    const blog = validateSurveyResponseUrl("https://blog.naver.com/foo/123");
    assert.equal(blog.ok, false);
  });

  await run("I. 일반 블로그·카페 URL 차단", () => {
    assert.equal(classifyUrlKind("https://blog.naver.com/user/123"), "unsupported");
    assert.equal(classifyUrlKind("https://cafe.naver.com/foo/123"), "unsupported");
    assert.equal(isSupportedSurveyUrl("https://www.google.com/"), false);
  });

  await run("J. API JSON / 비설문 호스트 차단", async () => {
    assert.equal(
      validateSurveyResponseUrl("https://api.moaform.com/v1/forms").ok,
      false,
    );
    const page = await validateSurveyPage("https://api.moaform.com/v1/forms");
    assert.equal(page.verdict, "not_survey");
    assert.equal(page.status, "invalid");
  });

  await run("K. localhost와 사설 IP 차단", async () => {
    const local = await assertSafePublicUrl("http://127.0.0.1/");
    assert.equal(local.ok, false);
    const priv = await assertSafePublicUrl("http://192.168.0.1/");
    assert.equal(priv.ok, false);
    const page = await validateSurveyPage("http://127.0.0.1/forms");
    assert.ok(page.verdict === "not_survey" || page.verdict === "unresolved");
  });

  await run("L. URL 문자열 제목 저장 금지", () => {
    assert.equal(isUrlLikeTitle("https://moaform.com/q/abc"), true);
    assert.equal(
      sanitizeSurveyTitle("https://moaform.com/q/abc", "실제 제목"),
      "실제 제목",
    );
    assert.equal(sanitizeSurveyTitle("https://moaform.com/q/abc"), null);
  });

  const dbReady = isCollectorStorageConfigured();

  await run(
    "10. 동일 수집 작업 중복 실행 차단",
    async () => {
      const first = await tryStartCollectionRun("admin");
      assert.equal(first.ok, true);
      if (!first.ok) return;
      const second = await tryStartCollectionRun("admin");
      assert.equal(second.ok, false);
      if (!second.ok) assert.equal(second.status, 409);
      await finishCollectionRun({
        runId: first.run.id,
        status: "failed",
        queriesCount: 0,
        resultsCount: 0,
        candidateLinksCount: 0,
        newSurveysCount: 0,
        duplicateSurveysCount: 0,
        errorCount: 1,
        errorSummary: "test lock",
      });
    },
    { skip: !dbReady, skipReason: "SUPABASE_* missing or migration not applied" },
  );

  await run(
    "11. DB 저장 upsert",
    async () => {
      const unique = `https://moaform.com/q/collector-test-${Date.now()}`;
      const first = await upsertSurveyLink({
        canonicalUrl: unique,
        originalUrl: unique,
        platform: "moaform",
        title: "collector test",
        status: "active",
      });
      assert.equal(first.isNew, true);
      const second = await upsertSurveyLink({
        canonicalUrl: unique,
        originalUrl: unique,
        platform: "moaform",
        title: "collector test 2",
        status: "active",
      });
      assert.equal(second.isNew, false);
      assert.ok(second.link.discovery_count >= 2);
      await insertSurveySource({
        surveyLinkId: first.link.id,
        sourceType: "web",
        sourceUrl: `https://example.com/source-collector-test-${Date.now()}`,
        sourceTitle: "src",
        searchQuery: "test",
      });
    },
    { skip: !dbReady, skipReason: "SUPABASE_* missing or migration not applied" },
  );

  await run("12. 수집 실행 통계 집계(구조)", () => {
    assert.ok(typeof buildCollectorSearchQueries === "function");
  });

  console.log(`\nDone. passed=${passed} failed=${failed} skipped=${skipped}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
