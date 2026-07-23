"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { getDetectedCategoryDisplayLabel } from "@/lib/extractors/htmlTextUtils";
import { getToolCsapProfile } from "@/lib/reporting/toolRegistry";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { NormalizedQuestion, ScanReport } from "@/lib/types/scan";

interface SurveySourceAppendixProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

function formatDate(value?: string): string {
  if (!value) return "확인 불가";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function platformName(report: ScanReport): string {
  if (report.form.metadata?.source?.kind === "file") {
    if (report.platform === "google_forms") return "Google Forms";
    if (report.platform === "naver_forms") return "Naver Form";
    if (report.platform === "moaform") return "Moaform";
    return "파일 기반 설문지";
  }
  return getToolCsapProfile(report.platform, report.form.management).platformLabel;
}

function noticeLines(report: ScanReport): Array<{ label: string; value: string }> {
  const notices = report.form.notices;
  if (!notices) return [];
  const rows: Array<{ label: string; value?: string }> = [
    { label: "설문 설명", value: notices.description },
    { label: "개인정보 고지", value: notices.privacyNotice },
    { label: "수집 목적", value: notices.purpose },
    { label: "수집 항목", value: notices.items },
    { label: "보유기간", value: notices.retention },
    { label: "파기 기준", value: notices.destruction },
    { label: "동의 문구", value: notices.consentText },
    { label: "거부권", value: notices.refusalRight },
    { label: "거부 시 불이익", value: notices.refusalDisadvantage },
    { label: "처리자/담당자", value: notices.processor },
    { label: "담당부서·문의처", value: notices.contactDepartment },
    { label: "수탁자", value: notices.trustee },
    { label: "위탁업무", value: notices.trusteeTask },
    { label: "국외이전", value: notices.overseasTransfer },
    { label: "개인정보처리방침", value: notices.privacyPolicyUrl },
  ];
  return rows
    .filter((row) => Boolean(row.value?.trim()))
    .map((row) => ({ label: row.label, value: row.value!.trim() }));
}

function categoryLabel(question: NormalizedQuestion): string {
  const categories = question.detectedCategories;
  if (!categories || categories.length === 0) {
    if (question.hasPersonalData) return "개인정보 가능";
    return "일반 문항";
  }
  const text = question.questionText ?? question.label;
  return categories
    .map((category) => getDetectedCategoryDisplayLabel(category, text))
    .join(", ");
}

export function SurveySourceAppendix({
  report,
  audienceReport,
}: SurveySourceAppendixProps) {
  const [open, setOpen] = useState(false);
  const notices = noticeLines(report);
  const metaNoticeTexts = (report.form.metadata?.noticeTexts ?? []).filter(Boolean);
  const questions = report.form.questions;
  const operatorName =
    report.form.metadata?.operatorHint ||
    report.form.operatorType ||
    audienceReport.safetyType.subjectLabel;

  const metaRows = [
    { label: "설문 제목", value: report.form.title || "제목 없음" },
    {
      label: "진단 방식",
      value:
        report.form.metadata?.source?.kind === "file"
          ? "파일 업로드"
          : "설문 링크",
    },
    {
      label: "파일명",
      value: report.form.metadata?.source?.fileName || "해당 없음",
    },
    {
      label: "파일 형식",
      value: report.form.metadata?.source?.fileExtension
        ? report.form.metadata.source.fileExtension.toUpperCase()
        : "해당 없음",
    },
    { label: "설문 URL", value: report.form.url || "확인 불가" },
    { label: "사용도구", value: platformName(report) },
    { label: "진단일시", value: formatDate(report.createdAt) },
    { label: "설문주체", value: audienceReport.safetyType.subjectLabel },
    { label: "기관/기업명", value: operatorName },
    {
      label: "부서",
      value: report.form.notices?.contactDepartment || "확인 불가",
    },
    {
      label: "담당자",
      value: report.form.notices?.processor || "확인 불가",
    },
    {
      label: "문의처",
      value: report.form.notices?.contactDepartment || "확인 불가",
    },
    { label: "문항 수", value: String(questions.length) },
    {
      label: "진단 제한 여부",
      value: report.isLimited || audienceReport.isLimited ? "제한 진단" : "정상 진단",
    },
    {
      label: "추출 상태",
      value:
        report.form.metadata?.source?.extractionStatus ||
        report.form.metadata?.extractionMethod ||
        report.form.metadata?.failureReason ||
        (report.form.extractedFromHtml ? "HTML 추출" : "확인됨"),
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left md:px-6"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <FileText className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-lg font-bold text-slate-800">설문/문항 정보 펼쳐보기</p>
            <p className="mt-1 text-sm text-slate-500 md:text-base">
              아래 정보는 진단에 사용된 설문 기본정보와 문항 원문입니다. 판단 결과가
              아니라 참고용 자료입니다.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-6 border-t border-slate-100 px-5 py-5 md:px-6">
          <div>
            <h3 className="mb-3 text-base font-bold text-slate-800">설문 기본정보</h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              {metaRows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <dt className="text-xs font-bold text-slate-500">{row.label}</dt>
                  <dd className="mt-1 break-all text-sm font-medium text-slate-800 md:text-base">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h3 className="mb-3 text-base font-bold text-slate-800">안내문·고지문 원문</h3>
            {notices.length === 0 && metaNoticeTexts.length === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                {report.form.metadata?.source?.kind === "file" ? (
                  <>
                    <p className="font-semibold text-slate-800">
                      파일에서 개인정보 수집·이용 고지문을 확인하지 못했습니다.
                    </p>
                    <p className="mt-1.5">
                      업로드한 파일에 고지문이 포함되어 있지 않으면 보유기간, 파기
                      기준, 담당자 안내 등이 ‘미확인’으로 진단될 수 있습니다.
                    </p>
                  </>
                ) : (
                  <p>확인된 안내문·고지문 원문이 없습니다.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {notices.map((row) => (
                  <article
                    key={row.label}
                    className="rounded-xl border border-slate-100 bg-white px-4 py-3"
                  >
                    <p className="text-xs font-bold text-slate-500">{row.label}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {row.value}
                    </p>
                  </article>
                ))}
                {metaNoticeTexts.map((text, index) => (
                  <article
                    key={`meta-notice-${index}`}
                    className="rounded-xl border border-slate-100 bg-white px-4 py-3"
                  >
                    <p className="text-xs font-bold text-slate-500">
                      안내 텍스트 {index + 1}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {text}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-base font-bold text-slate-800">문항 목록</h3>
            {questions.length === 0 ? (
              <p className="text-sm text-slate-500">
                자동으로 읽은 문항이 없습니다. 진단 제한 상태일 수 있습니다.
              </p>
            ) : (
              <ul className="space-y-3">
                {questions.map((question, index) => (
                  <li
                    key={question.id ?? `q-${index}`}
                    className="rounded-xl border border-slate-100 bg-white px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                        문항 {question.questionIndex ?? index + 1}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {question.required ? "필수" : "선택"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {categoryLabel(question)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800 md:text-base">
                      {question.questionText ?? question.label}
                    </p>
                    {question.options && question.options.length > 0 ? (
                      <p className="mt-2 text-sm text-slate-500">
                        선택지: {question.options.join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
