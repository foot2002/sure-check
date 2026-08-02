import Link from "next/link";
import { Logo } from "@/components/Logo";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="border-b border-border-subtle bg-surface">
      <div
        className={`mx-auto flex max-w-[72rem] items-center justify-between gap-3 px-5 md:px-8 ${
          compact ? "py-2 md:py-2.5" : "py-3.5 md:py-4"
        }`}
      >
        <Logo size={compact ? "headerCompact" : "header"} />
        <Link
          href="/report"
          className="shrink-0 whitespace-nowrap text-sm font-semibold text-slate-600 transition hover:text-teal-800"
        >
          공개 모니터링
        </Link>
      </div>
    </header>
  );
}
