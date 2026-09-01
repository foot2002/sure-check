import { KcfLogo } from "@/components/KcfLogo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border-subtle bg-surface">
      <div className="mx-auto max-w-3xl px-5 py-8 text-center md:px-6">
        <div className="flex justify-center">
          <KcfLogo size="footer" />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-800">
          한국컨설팅산업재단, 개인정보보호진흥원
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          T.{" "}
          <a
            href="tel:02-562-0291"
            className="hover:text-slate-800 hover:underline"
          >
            02-562-0291
          </a>
          <span className="mx-1.5 text-border">·</span>
          E.{" "}
          <a
            href="mailto:cs@kcf-korea.org"
            className="hover:text-slate-800 hover:underline"
          >
            cs@kcf-korea.org
          </a>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          서울시 강남구 봉은사로 57길 13
        </p>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          © 2026 SURE Check
          <span className="mx-1.5 text-border">·</span>
          설문 링크 개인정보 위험 진단 서비스
        </p>
        <p className="mt-1.5 text-[11px] text-muted/70">
          본 서비스는 법률 자문이 아닌 자동 위험 진단 도구입니다.
        </p>
        <p className="mt-4 text-[11px] tracking-wide text-muted/70">
          Powered by wonpyo Kim
        </p>
      </div>
    </footer>
  );
}
