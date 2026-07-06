import { Database, Globe, Scale, Shield } from "lucide-react";
import type { ScanReport } from "@/lib/types/scan";

interface TrustNoticePanelProps {
  report: ScanReport;
}

const PLATFORM_LABELS: Record<string, string> = {
  google_forms: "Google Forms",
  naver_forms: "네이버폼",
  moaform: "모아폼",
  generic: "기타 설문 (베타)",
  wiseon_csap: "WiseON CSAP",
};

const notices = [
  {
    icon: Shield,
    title: "URL은 진단 목적에만 사용",
    body: "입력한 URL은 자동 분석에만 사용되며, 현재 단계에서는 서버에 영구 저장하지 않습니다.",
  },
  {
    icon: Database,
    title: "화면 기준 자동 진단",
    body: "설문 응답 화면에서 확인 가능한 문항·고지·동의 문구를 기준으로 분석합니다.",
  },
  {
    icon: Scale,
    title: "법률 자문이 아님",
    body: "본 결과는 개인정보 위험을 자동으로 점검한 참고 자료이며, 법률 위반 여부를 확정하지 않습니다.",
  },
  {
    icon: Globe,
    title: "지원 플랫폼",
    body: "Google Forms, 네이버폼, 모아폼 및 일부 일반 HTML 설문을 지원합니다.",
  },
];

export function TrustNoticePanel({ report }: TrustNoticePanelProps) {
  const platformLabel = PLATFORM_LABELS[report.platform] ?? report.platform;
  const scopeLabel =
    report.isLimited || report.diagnosisStatus === "limited"
      ? "진단 제한"
      : report.form.partialScan
        ? "부분 진단"
        : report.form.extractedFromHtml && report.platform === "generic"
          ? "베타 진단"
          : "정밀 진단";

  return (
    <section className="report-secondary rounded-2xl border border-border-subtle bg-surface p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-foreground md:text-lg">
          진단 안내 및 신뢰 정보
        </h2>
        <span className="rounded-full border border-brand-muted bg-brand-light px-3 py-1 text-xs font-semibold text-brand">
          {platformLabel}
        </span>
        <span className="rounded-full border border-border-subtle bg-background px-3 py-1 text-xs font-medium text-muted">
          {scopeLabel}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {notices.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="rounded-xl border border-border-subtle bg-background p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light text-brand">
                <Icon size={16} strokeWidth={2.25} />
              </span>
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted">{body}</p>
          </article>
        ))}
      </div>

      {report.sections.disclaimer && (
        <p className="mt-4 rounded-xl border border-border-subtle bg-background px-4 py-3 text-center text-sm leading-relaxed text-muted">
          {report.sections.disclaimer}
        </p>
      )}
    </section>
  );
}
