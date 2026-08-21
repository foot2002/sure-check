/**
 * Official site collector: seeds, crawl policy, same-origin, no PII.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildOfficialInstitutionSeeds,
  homepageFromUrl,
  normalizeHttpUrl,
} from "./build-public-institution-seeds";
import {
  backoffIntervalDays,
  crawlIntervalDaysForPriority,
  isPriorityOfficialPath,
  OFFICIAL_SITE_MAX_DEPTH,
  OFFICIAL_SITE_MAX_PAGES,
  OFFICIAL_SITE_TIMEOUT_PER_PAGE_MS,
  seedKey,
} from "../lib/collector/officialSiteCrawlPolicy";
import {
  crawlPriorityForType,
  loadOfficialInstitutionSeeds,
} from "../lib/collector/officialSiteSeeds";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Collector Check]\n");

{
  const gitignore = source(".gitignore");
  assert.ok(gitignore.includes("data/source/"));
  assert.ok(gitignore.includes("*.xlsx"));
  console.log("  PASS  original xlsx is gitignored");
}

{
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), null);
  assert.equal(homepageFromUrl("https://www.example.or.kr/org/list.do?x=1"), "https://www.example.or.kr/");
  const built = buildOfficialInstitutionSeeds([
    {
      "기관명(부속기관)": "한국테스트공단",
      "대분류(기관유형)": "출연기관",
      "담당자": "홍길동",
      "전화번호": "02-000-0000",
      "이메일": "a@b.c",
      "조직도 링크": "https://www.example.or.kr/org",
    },
    {
      "기관명(부속기관)": "URL없음기관",
      "대분류(기관유형)": "출연기관",
    },
  ]);
  assert.equal(built.seeds.length, 1);
  assert.equal(built.invalidUrlsExcluded, 1);
  assert.equal(built.seeds[0]!.organizationName, "한국테스트공단");
  assert.ok(!JSON.stringify(built.seeds).includes("홍길동"));
  assert.ok(!JSON.stringify(built.seeds).includes("02-000-0000"));
  console.log("  PASS  seed builder strips PII and drops invalid URLs");
}

{
  const seeds = loadOfficialInstitutionSeeds();
  assert.ok(seeds.length >= 100, `expected many seeds, got ${seeds.length}`);
  for (const seed of seeds.slice(0, 30)) {
    assert.ok(seed.homepageUrl.startsWith("http"));
    assert.ok(seed.seedUrls.length >= 1);
    assert.equal(seed.source, "wiseon_public_institution_list");
    assert.equal("담당자" in seed, false);
    assert.equal("email" in seed, false);
  }
  console.log(`  PASS  seed json loaded (${seeds.length} institutions)`);
}

{
  const built = buildOfficialInstitutionSeeds([
    {
      "기관명(부속기관)": "서구",
      "대분류(기관유형)": "기초자치단체",
      "홈페이지": "https://bsseogu.go.kr/",
      "조직도 링크": "https://www.dgs.go.kr/org",
    },
  ]);
  assert.ok(built.seeds.length >= 2);
  const keys = built.seeds.map((seed) => seedKey(seed));
  assert.ok(keys.includes("서구::bsseogu.go.kr"));
  assert.ok(keys.includes("서구::dgs.go.kr"));
  console.log("  PASS  homonym 서구 is split by homepage host");
}

{
  assert.equal(crawlPriorityForType("중앙부처"), "A");
  assert.equal(crawlPriorityForType("출연기관"), "B");
  assert.equal(crawlPriorityForType("교육지원청"), "C");
  assert.equal(crawlIntervalDaysForPriority("A"), 1);
  assert.equal(crawlIntervalDaysForPriority("B"), 3);
  assert.equal(crawlIntervalDaysForPriority("C"), 7);
  assert.ok(backoffIntervalDays({ priority: "C", consecutiveFailures: 3 }) > 7);
  assert.equal(OFFICIAL_SITE_MAX_DEPTH, 2);
  assert.ok(OFFICIAL_SITE_MAX_PAGES >= 20 && OFFICIAL_SITE_MAX_PAGES <= 30);
  assert.ok(OFFICIAL_SITE_TIMEOUT_PER_PAGE_MS >= 8000);
  assert.ok(OFFICIAL_SITE_TIMEOUT_PER_PAGE_MS <= 10000);
  assert.ok(isPriorityOfficialPath("/board/공지사항"));
  assert.equal(isPriorityOfficialPath("/intro/about"), false);
  const key = seedKey({
    organizationName: "한국테스트공단",
    homepageUrl: "https://www.example.or.kr/",
  });
  assert.ok(key.includes("한국테스트공단"));
  console.log("  PASS  crawl interval / priority / depth / timeout");
}

{
  const crawler = source("lib/collector/officialSiteCrawler.ts");
  assert.ok(crawler.includes("sameOriginOnly"));
  assert.ok(crawler.includes("OFFICIAL_SITE_MAX_DEPTH"));
  assert.ok(crawler.includes("sourcePageUrl"));
  assert.ok(!crawler.includes("scanBatch"));
  const route = source("app/api/internal/collector/official-sites/route.ts");
  assert.ok(route.includes("runOfficialSiteCollection"));
  assert.ok(route.includes("authorizeCollectorCronRequest"));
  const vercel = source("vercel.json");
  assert.ok(vercel.includes("/api/internal/collector/official-sites"));
  console.log("  PASS  crawler is same-origin + scheduled separately from search");
}

console.log("\nofficial-site-collector-check: ok");
