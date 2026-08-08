/**
 * Re-review prior unknown samples with org_v1.2 classifier.
 * Usage: npx tsx scripts/reclassify-unknown-samples.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyOrganizationLowCost } from "../lib/collector/candidateTriage";

type Sample = {
  surveyTitle?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  searchQuery?: string | null;
  label?: string;
};

function main() {
  const path = resolve(process.cwd(), "scripts/tmp-org-sample-100.json");
  if (!existsSync(path)) {
    console.error("missing tmp-org-sample-100.json");
    process.exit(1);
  }
  const prev = JSON.parse(readFileSync(path, "utf8")) as {
    samples: Sample[];
  };
  const unknowns = (prev.samples || []).filter((s) => s.label === "unknown");
  const take = unknowns.slice(0, 35);

  const recount: Record<string, number> = {
    public: 0,
    company: 0,
    university_official: 0,
    individual_or_academic: 0,
    genuinely_unknown: 0,
  };

  const rows = take.map((s) => {
    const r = classifyOrganizationLowCost({
      surveyTitle: s.surveyTitle,
      sourceTitle: s.sourceTitle,
      sourceUrl: s.sourceUrl,
      searchQuery: s.searchQuery,
    });
    const label =
      r.organization === "unknown" ? "genuinely_unknown" : r.organization;
    recount[label] += 1;
    return {
      surveyTitle: (s.surveyTitle || "").slice(0, 100),
      sourceTitle: (s.sourceTitle || "").slice(0, 100),
      sourceUrl: s.sourceUrl,
      searchQuery: s.searchQuery,
      previous: "unknown",
      reclassified: label,
      signals: r.signals,
      organizationScore: r.organizationScore,
      evidence: r.signals.join(", ") || "no_clear_signal",
    };
  });

  const report = {
    disclaimer:
      "이전 unknown 표본을 org_v1.2 classifier로 재검토. 정확도 주장 아님 — blind spot 분석용.",
    reviewed: rows.length,
    recount,
    companyBlindSpotFinding:
      "기존 COMPANY_TEXT가 주식회사/(주) 중심이라 산돌·메가박스·뱅크샐러드·CGV 등 브랜드명이 unknown으로 떨어짐. 구청명(중랑구 등)도 PUBLIC_DISTRICT 부재로 unknown.",
    improvements:
      "COMPANY_BRAND 목록 + 고객만족/이벤트/상담 신호, PUBLIC_DISTRICT(○○구/시), 국립·도서관·구정 키워드 추가",
    rows,
  };

  const out = resolve(process.cwd(), "scripts/tmp-unknown-reclassify.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ...report, rows: report.rows.slice(0, 8) }, null, 2));
  console.log(`wrote ${out} (full ${rows.length} rows)`);
}

main();
