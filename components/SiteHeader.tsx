import { Logo } from "@/components/Logo";

export function SiteHeader() {
  return (
    <header className="border-b border-border-subtle bg-surface">
      <div className="mx-auto flex max-w-[72rem] items-center px-5 py-3.5 md:px-8 md:py-4">
        <Logo size="header" />
      </div>
    </header>
  );
}
