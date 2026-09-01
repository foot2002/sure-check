"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "설문 진단", id: "scan" as const },
  { href: "/report", label: "수집실태 리포트", id: "report" as const },
  { href: "/cases", label: "공개 진단 사례", id: "cases" as const },
  { href: "/about", label: "개인정보보호진흥원 소개", id: "about" as const },
];

function resolveActive(
  pathname: string,
): "scan" | "report" | "cases" | "about" | null {
  if (pathname.startsWith("/report/admin")) return null;
  if (pathname === "/about" || pathname.startsWith("/about/")) return "about";
  if (pathname === "/cases" || pathname.startsWith("/cases/")) return "cases";
  if (pathname === "/report") return "report";
  // Individual diagnosis result lives under /report/[scanId]
  if (pathname.startsWith("/report/")) return "scan";
  if (pathname === "/" || pathname === "") return "scan";
  return null;
}

export function HeaderNav() {
  const pathname = usePathname() || "/";
  const active = resolveActive(pathname);

  return (
    <nav
      className="flex min-w-0 max-w-[min(100%,36rem)] shrink flex-wrap items-center justify-end gap-1.5 sm:max-w-none sm:shrink-0 sm:gap-2"
      aria-label="주요 메뉴"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[12px] leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:h-10 sm:px-4 sm:text-sm",
              isActive
                ? "border-[var(--brand-deep)] bg-[var(--brand-deep)] font-bold text-white shadow-none"
                : "border-slate-200 bg-white font-semibold text-[var(--brand-deep)] hover:border-teal-300 hover:bg-[var(--brand-light)]",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
