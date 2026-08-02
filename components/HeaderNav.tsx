"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "설문 진단", id: "scan" as const },
  { href: "/report", label: "수집실태 리포트", id: "report" as const },
];

function resolveActive(
  pathname: string,
): "scan" | "report" | null {
  if (pathname.startsWith("/report/admin")) return null;
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
      className="flex shrink-0 flex-wrap items-center justify-end gap-2"
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
              "inline-flex items-center justify-center rounded-full border px-3.5 py-2 text-[13px] leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:px-4 sm:text-sm",
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
