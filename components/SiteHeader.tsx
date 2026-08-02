import Link from "next/link";
import { Logo } from "@/components/Logo";

export function SiteHeader() {
  return (
    <header className="border-b border-border-subtle bg-surface">
      <div className="mx-auto flex max-w-[72rem] items-center justify-between gap-4 px-5 py-3.5 md:px-8 md:py-4">
        <Logo size="header" />
        <Link
          href="/report"
          className="text-sm font-semibold text-slate-600 transition hover:text-teal-800"
        >
          공개 모니터링
        </Link>
      </div>
    </header>
  );
}
