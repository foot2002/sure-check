import { Logo } from "@/components/Logo";
import { HeaderNav } from "@/components/HeaderNav";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="border-b border-border-subtle bg-surface">
      <div
        className={`mx-auto flex max-w-[72rem] items-center justify-between gap-3 px-5 md:px-8 ${
          compact ? "py-2 md:py-2.5" : "py-3.5 md:py-4"
        }`}
      >
        <div className="min-w-0 flex-1">
          <Logo size={compact ? "headerCompact" : "header"} />
        </div>
        <HeaderNav />
      </div>
    </header>
  );
}
