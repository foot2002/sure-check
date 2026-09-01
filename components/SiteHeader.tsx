import { Logo } from "@/components/Logo";
import { HeaderNav } from "@/components/HeaderNav";

/**
 * Canonical site chrome — identical on /, /report, /weekly, and /about.
 * No page-specific size/padding variants.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-border-subtle bg-surface">
      <div className="mx-auto flex max-w-[72rem] items-center justify-between gap-3 px-5 py-3.5 md:px-8 md:py-4">
        <div className="min-w-0 flex-1">
          <Logo size="header" />
        </div>
        <HeaderNav />
      </div>
    </header>
  );
}
