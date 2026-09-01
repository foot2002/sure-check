import { buildPressSummary } from "../lib/weekly/copy";

const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures.push(detail ? `${name}: ${detail}` : name);
    console.error(`FAIL  ${failures[failures.length - 1]}`);
  }
}

function main() {
  console.log("[Weekly Press Style Summary Check]");
  const press = buildPressSummary({
    weekLabel: "2026년 8월 4주차 (8.24~8.30)",
    headline: "공개 온라인 설문 144건 중 132건, 개인정보 수집 신호 확인",
    analyzable: 144,
    personalInfoCount: 132,
    personalInfoRate: 91.7,
    attentionNeededCount: 119,
    attentionNeededRate: 82.6,
    publicExternalToolCount: 83,
    publicNarrative: "공공부문 확인 필요",
    interpretation:
      "이번 주 결과에서 가장 두드러진 신호는 고지문 미흡과 공공부문 외부 설문도구 사용 확인 필요였다.",
  });
  check("news headline", press.includes("보도 제목 후보"));
  check("lead paragraph", press.includes("리드문") && press.includes("분석한 결과"));
  check("interpretation", press.includes("주요 해석"));
  check("operator quote", press.includes("운영팀 코멘트"));
  check("disclaimer", press.includes("위법 여부를 확정하지 않으며"));
  check("no 위반 확정", !press.includes("위반 확정") && !press.includes("불법 설문"));

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly-press-style-summary-check PASS");
}

main();
