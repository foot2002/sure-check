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
  console.log("[Cases Route Redirect Check]");

  check("cases list page exists", exists("app/cases/page.tsx"));
  check("cases detail page exists", exists("app/cases/[publicId]/page.tsx"));
  check("list redirects to /weekly", read("app/cases/page.tsx").includes('redirect("/weekly")'));
  check(
    "detail redirects to /weekly",
    read("app/cases/[publicId]/page.tsx").includes('redirect("/weekly")'),
  );

  const nextConfig = read("next.config.ts");
  check(
    "next.config redirects /cases",
    nextConfig.includes('source: "/cases"') &&
      nextConfig.includes('destination: "/weekly"'),
  );
  check(
    "next.config redirects /cases/:path*",
    nextConfig.includes('source: "/cases/:path*"'),
  );

  const header = read("components/HeaderNav.tsx");
  check("header has no /cases menu", !header.includes('href: "/cases"'));
  check("header has /weekly menu", header.includes('href: "/weekly"'));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\ncases-route-redirect-check PASS");
}

main();
