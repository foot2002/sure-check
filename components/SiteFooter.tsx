export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border-subtle bg-surface">
      <div className="mx-auto max-w-3xl px-5 py-8 text-center md:px-6">
        <p className="text-xs leading-relaxed text-muted">
          © 2026 SURE Check
          <span className="mx-1.5 text-border">·</span>
          설문 링크 개인정보 위험 진단 서비스
        </p>
        <p className="mt-1.5 text-[11px] text-muted/70">
          본 서비스는 법률 자문이 아닌 자동 위험 진단 도구입니다.
        </p>
      </div>
    </footer>
  );
}
