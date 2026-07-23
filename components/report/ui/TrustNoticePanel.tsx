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
    <section className="rounded-[var(--report-radius)] border border-slate-200 bg-white p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-slate-900 md:text-xl">서비스 안내</h2>
        <span className="report-badge-neutral">{platformLabel}</span>
        <span className="report-badge-neutral">{scopeLabel}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {notices.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
          >
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                <Icon size={16} strokeWidth={2} aria-hidden />
              </span>
              <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{body}</p>
          </article>
        ))}
      </div>

      {report.sections.disclaimer && (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm leading-relaxed text-slate-600">
          {report.sections.disclaimer}
        </p>
      )}
    </section>
  );
}
