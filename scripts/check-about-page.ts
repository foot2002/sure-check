import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

function main() {
  console.log("[About Page Check]\n");

  check("about page exists", exists("app/about/page.tsx"));
  check("about layout exists", exists("app/about/layout.tsx"));
  check("about view exists", exists("components/about/AboutView.tsx"));
  check("about reveal exists", exists("components/about/Reveal.tsx"));
  check("kcf logo asset exists", exists("public/images/kcf_logo.jpg"));
  check("kcf logo component exists", exists("components/KcfLogo.tsx"));

  const header = read("components/HeaderNav.tsx");
  const items = [
    ...header.matchAll(/href: "([^"]+)", label: "([^"]+)"/g),
  ].map((m) => ({ href: m[1], label: m[2] }));
  check(
    "nav order",
    items.length === 4 &&
      items[0]?.href === "/" &&
      items[1]?.href === "/report" &&
      items[2]?.href === "/cases" &&
      items[3]?.href === "/about" &&
      items[3]?.label === "개인정보보호진흥원 소개",
  );
  check("admin header stays inactive", header.includes('pathname.startsWith("/report/admin")'));

  const page = [
    read("app/about/page.tsx"),
    read("components/about/AboutView.tsx"),
    read("components/KcfLogo.tsx"),
    read("components/about/Reveal.tsx"),
  ].join("\n");
  const required = [
    "대한민국 온라인 개인정보 보호 수준을 높입니다",
    "인사말",
    "한국컨설팅산업재단 이사장 정옥래",
    "개인정보보호진흥원 소개",
    "SURE-CHECK 운영 목적",
    "주요 활동",
    "운영 원칙",
    "유의사항",
    "설문 진단하기",
    "수집실태 리포트 보기",
    "공개 진단 사례 보기",
    "공익형 모니터링",
    "자율 개선",
    "공개 설문 화면 기준",
    "/images/kcf_logo.jpg",
    "개인정보보호진흥원 바로가기",
    "https://www.kcf-korea.org/privacy-center",
  ];
  for (const text of required) {
    check(`copy includes ${text}`, page.includes(text));
  }

  check(
    "old hero title removed",
    !page.includes("공개 온라인 설문의 개인정보 보호 수준을 높입니다"),
  );
  check("inquiry section removed", !page.includes("소명·정정 및 문의"));
  check("inquiry buttons removed", !page.includes("소명·정정 요청하기"));
  check("about uses reveal", page.includes("Reveal"));
  check(
    "privacy center opens in a new tab",
    page.includes('href={PRIVACY_CENTER_URL}') && page.includes('target="_blank"'),
  );

  const footer = read("components/SiteFooter.tsx");
  check("footer includes kcf logo", footer.includes("/images/kcf_logo.jpg") || footer.includes("KcfLogo"));
  check("footer mailto uses org contact", footer.includes("mailto:cs@kcf-korea.org"));

  const forbidden = [
    "불법 설문 적발",
    "위반 기관 공개",
    "문제 기관 명단",
    "개인정보법 위반 확정",
    "신고 대상 확정",
  ];
  for (const text of forbidden) {
    check(`no forbidden phrase: ${text}`, !page.includes(text));
  }
  check("does not claim 위반 확정입니다", !/위반 확정입니다/.test(page));

  const layout = read("app/about/layout.tsx");
  check("about metadata title", layout.includes("개인정보보호진흥원 소개"));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nabout-page-check: ok");
}

main();
