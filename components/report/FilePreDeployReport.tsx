"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  FileWarning,
  Gavel,
  Scale,
  Shield,
  Wrench,
} from "lucide-react";
import { ReportAudienceZone } from "@/components/report/ReportAudienceZone";
import { InfoCallout } from "@/components/report/ui/InfoCallout";
import {
  buildFilePreDeployReport,
  type FilePreDeployVerdict,
  type FileQuestionRevision,
} from "@/lib/reporting/buildFilePreDeployReport";
import type { ScanReport } from "@/lib/types/scan";

interface FilePreDeployReportProps {
  report: ScanReport;
}

function verdictTone(verdict: FilePreDeployVerdict): {
  variant: "warning" | "operator";
  badge: string;
} {
  if (verdict === "deploy_blocked") {
    return {
      variant: "warning",
      badge: "border-rose-200 bg-rose-50 text-rose-900",
    };
  }
  if (verdict === "revise_required") {
    return {
      variant: "warning",
      badge: "border-amber-200 bg-amber-50 text-amber-950",
    };
  }
  if (verdict === "improve_then_deploy") {
    return {
      variant: "operator",
      badge: "border-sky-200 bg-sky-50 text-sky-950",
    };
  }
  return {
    variant: "operator",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
}

function riskBadge(risk: FileQuestionRevision["riskLevel"]): string {
  switch (risk) {
    case "high_risk":
      return "bg-rose-100 text-rose-900";
    case "sensitive":
      return "bg-orange-100 text-orange-950";
    case "personal":
      return "bg-amber-100 text-amber-950";
    case "quasi":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-50 text-slate-600";
  }
}

function riskLabel(risk: FileQuestionRevision["riskLevel"]): string {
  switch (risk) {
    case "high_risk":
      return "고위험";
    case "sensitive":
      return "민감";
    case "personal":
      return "개인정보";
    case "quasi":
      return "준식별";
    default:
      return "낮음";
  }
}

function tierBadge(tier: "avoid" | "conditional" | "recommended"): string {
  if (tier === "avoid") return "bg-rose-100 text-rose-900";
  if (tier === "conditional") return "bg-amber-100 text-amber-950";
  return "bg-emerald-100 text-emerald-900";
}

function tierLabel(tier: "avoid" | "conditional" | "recommended"): string {
  if (tier === "avoid") return "지양";
  if (tier === "conditional") return "조건부";
  return "권장";
}

function CopyBlock({ title, body }: { title: string; body: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-800">
        {body}
      </pre>
    </article>
  );
}

export function FilePreDeployReport({ report }: FilePreDeployReportProps) {
  const model = buildFilePreDeployReport(report);
  const tone = verdictTone(model.verdict);

  return (
    <div className="space-y-6">
      <ReportAudienceZone
        variant={tone.variant}
        label="설문파일 진단"
        title="배포 전 개인정보 점검 리포트"
        description={`${model.fileName} · 설문을 공개·배포하기 전에 확인하는 담당자용 결과입니다.`}
      >
        <div className={`rounded-xl border px-4 py-4 ${tone.badge}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            종합 판단
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">
            {model.verdictTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed">{model.verdictSummary}</p>
          <p className="mt-3 text-xs font-medium opacity-90">
            데이터 유형: {model.privacyTypeLabel}
          </p>
        </div>

        <ul className="mt-4 space-y-2">
          {model.overallChecklist.map((item) => (
            <li
              key={item}
              className="flex gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2.5 text-sm text-slate-700"
            >
              <ClipboardList
                className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
                aria-hidden
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </ReportAudienceZone>

      <ReportAudienceZone
        variant="warning"
        label="1. 개인정보 이슈"
        title="법·기준 저촉 가능성"
        description="개인정보보호법, 클라우드컴퓨팅법/CSAP, 국정원 보안 고지 등 자동 매핑 결과입니다. 법률 자문이 아닙니다."
      >
        {model.legalIssues.length === 0 ? (
          <InfoCallout title="확인된 고위험 이슈 없음" variant="trust">
            현재 추출 범위에서는 위반 소지가 큰 핵심 문제가 적습니다. 다만
            고지·동의·도구 기준은 아래 섹션에서 함께 확인하세요.
          </InfoCallout>
        ) : (
          <div className="space-y-3">
            {model.legalIssues.map((issue) => (
              <article
                key={issue.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-900">
                    <AlertTriangle size={12} />
                    {issue.severityLabel}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    {issue.title}
                  </h3>
                </div>
                <p className="mt-2 text-sm text-slate-700">{issue.why}</p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  조치: {issue.action}
                </p>
                {issue.basis.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {issue.basis.map((b) => (
                      <span
                        key={b.id}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700"
                        title={b.description}
                      >
                        {b.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {model.appliedLaws.length > 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Scale className="h-4 w-4 text-slate-600" aria-hidden />
              적용·참고 기준
            </div>
            <ul className="space-y-2">
              {model.appliedLaws.map((law) => (
                <li key={law.id} className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">
                    {law.label}
                  </span>
                  <span className="text-slate-500"> · {law.shortTitle}</span>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">
                    {law.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ReportAudienceZone>

      <ReportAudienceZone
        variant="operator"
        label="2. 고지문 / 동의문"
        title="부족한 부분과 권장 문구"
        description="누락된 고지·동의 요소를 확인하고, 배포에 쓸 초안을 복사하세요."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
              <FileWarning className="h-4 w-4" aria-hidden />
              고지문 부족분
            </div>
            {model.noticeGaps.length === 0 ? (
              <p className="text-sm text-slate-600">
                핵심 고지 항목이 대체로 확인되었습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {model.noticeGaps.map((g) => (
                  <li key={g.id} className="text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">{g.title}</p>
                    <p className="text-[12.5px] text-slate-600">{g.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Gavel className="h-4 w-4" aria-hidden />
              동의문 부족분
            </div>
            {model.consentGaps.length === 0 ? (
              <p className="text-sm text-slate-600">
                동의 절차 관련 큰 누락이 확인되지 않았습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {model.consentGaps.map((g) => (
                  <li key={g.id} className="text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">{g.title}</p>
                    <p className="text-[12.5px] text-slate-600">{g.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <CopyBlock title="권장 고지문 초안" body={model.noticeDraft} />
          <CopyBlock title="권장 동의문 초안" body={model.consentDraft} />
        </div>
      </ReportAudienceZone>

      <ReportAudienceZone
        variant="operator"
        label="3. 설문문항 판단"
        title="개인정보·민감정보 문항과 수정안"
        description={model.questionSummary}
      >
        {model.questionRevisions.length === 0 ? (
          <InfoCallout title="위험 문항이 거의 없음" variant="trust">
            직접식별·민감·고위험으로 분류된 문항이 없거나 위험이 낮습니다.
          </InfoCallout>
        ) : (
          <div className="space-y-3">
            {model.questionRevisions.map((q) => (
              <article
                key={q.questionId}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${riskBadge(q.riskLevel)}`}
                  >
                    {riskLabel(q.riskLevel)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {q.page}페이지
                  </span>
                  {q.categories.slice(0, 4).map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {q.originalLabel}
                </p>
                <p className="mt-1.5 text-[13px] text-slate-700">{q.issue}</p>
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-800">
                  <span className="font-semibold">수정안 · </span>
                  {q.suggestion}
                </p>
              </article>
            ))}
          </div>
        )}
      </ReportAudienceZone>

      <ReportAudienceZone
        variant="operator"
        label="4. 수집도구 판단"
        title="개인·민감정보 유무에 따른 도구 추천"
        description={model.toolGovernance.body}
      >
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-teal-800" aria-hidden />
          <div>
            <p className="text-sm font-bold text-slate-900">
              {model.toolGovernance.title}
            </p>
            {model.toolGovernance.certificationRecommendation ? (
              <p className="mt-1 text-sm text-slate-700">
                {model.toolGovernance.certificationRecommendation}
              </p>
            ) : null}
            {model.toolGovernance.certificationReason ? (
              <p className="mt-1 text-[12.5px] text-slate-500">
                {model.toolGovernance.certificationReason}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          {model.toolOptions.map((opt) => (
            <article
              key={opt.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tierBadge(opt.tier)}`}
                >
                  {tierLabel(opt.tier)}
                </span>
                <h3 className="text-sm font-bold text-slate-900">{opt.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {opt.detail}
              </p>
            </article>
          ))}
        </div>
      </ReportAudienceZone>

      <ReportAudienceZone
        variant="appendix"
        label="5. 종합 판단"
        title="배포 전 체크리스트"
        description="위 1~4 결과를 한 번에 실행 항목으로 정리했습니다."
      >
        <ol className="space-y-2">
          {model.overallChecklist.map((item, index) => (
            <li
              key={`${index}-${item.slice(0, 24)}`}
              className="flex gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                {index + 1}
              </span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          자동 진단 결과이며 법률·보안 자문을 대체하지 않습니다. 기관
          개인정보보호책임자(또는 담당자) 검토 후 배포하세요.
        </p>
      </ReportAudienceZone>
    </div>
  );
}
