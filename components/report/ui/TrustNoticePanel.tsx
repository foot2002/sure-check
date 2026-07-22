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
    title: "자동 진단 결과입니다",
    body: "입력한 URL은 진단 목적에만 사용되며, 베타 단계에서는 영구 저장하지 않습니다.",
  },
  {
    icon: Database,
    title: "화면에서 확인 가능한 범위",
    body: "설문 화면의 문항과 안내문을 기준으로 분석합니다. 로그인 후 문항은 누락될 수 있습니다.",
  },
  {
    icon: Scale,
    title: "법률 위반 확정이 아닙니다",
    body: "본 결과는 자동 위험 진단 참고 자료이며, 법률 위반 여부를 확정하지 않습니다.",
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
    <section className="rounded-[1.75rem] border border-teal-100 bg-gradient-to-br from-white via-[#f0fdfa] to-[#ecfeff] p-6 shadow-[var(--report-shadow-soft)] md:p-7">
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <h2 className="text-xl font-bold text-foreground md:text-2xl">
          서비스 안내
        </h2>
        <span className="rounded-full border border-teal-200 bg-white px-3 py-1 text-sm font-semibold text-teal-800">
          {platformLabel}
        </span>
        <span className="rounded-full border border-border-subtle bg-white/80 px-3 py-1 text-sm font-medium text-muted">
          {scopeLabel}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {notices.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm md:p-5"
          >
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Icon size={18} strokeWidth={2.25} />
              </span>
              <h3 className="text-base font-bold text-foreground">{title}</h3>
            </div>
            <p className="text-base leading-relaxed text-muted">{body}</p>
          </article>
        ))}
      </div>

      {report.sections.disclaimer && (
        <p className="mt-5 rounded-2xl border border-teal-100 bg-white/80 px-4 py-3 text-center text-base leading-relaxed text-muted">
          {report.sections.disclaimer}
        </p>
      )}
    </section>
  );
}
