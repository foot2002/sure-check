import Link from "next/link";
import { Info } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  listPublishedPublicCases,
  parsePublicCaseFilter,
  parsePublicCaseSort,
  type PublicCaseFilter,
  type PublicCaseSort,
} from "@/lib/report/publicCases";
import { PUBLIC_CASE_DISCLAIMER } from "@/lib/report/publicCasePolicy";
import { riskLabelKo } from "@/lib/report/adminOutreach";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FILTERS: Array<{ id: PublicCaseFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "public", label: "공공기관" },
  { id: "private", label: "민간기업" },
  { id: "high-risk", label: "고위험" },
  { id: "notice-gap", label: "고지 미흡" },
  { id: "external-tool", label: "외부도구 확인 필요" },
];

const SORTS: Array<{ id: PublicCaseSort; label: string }> = [
  { id: "recent", label: "최신 공개순" },
  { id: "risk", label: "위험도 높은순" },
];

function hrefFor(filter: PublicCaseFilter, sort: PublicCaseSort): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (sort !== "recent") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/cases?${qs}` : "/cases";
}

function riskClass(level: string): string {
  if (level === "critical") return "bg-rose-100 text-rose-800 border-rose-200";
  if (level === "high") return "bg-orange-100 text-orange-800 border-orange-200";
  if (level === "medium") return "bg-amber-100 text-amber-800 border-amber-200";
  if (level === "low") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default async function PublicCasesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const filter = parsePublicCaseFilter(pick("filter"));
  const sort = parsePublicCaseSort(pick("sort"));

  let cases: Awaited<ReturnType<typeof listPublishedPublicCases>> = [];
  let error: string | null = null;
  try {
    cases = await listPublishedPublicCases({ filter, sort });
  } catch (err) {
    console.error("[public-cases page]", err);
    const message = err instanceof Error ? err.message : String(err);
    if (/public_case_status|public_id|schema cache|does not exist/i.test(message)) {
      cases = [];
    } else {
      error = "공개 진단 사례를 불러오지 못했습니다.";
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-slate-200 bg-gradient-to-b from-teal-50/80 via-white to-[#f8fafc]">
          <div className="mx-auto max-w-[72rem] px-5 py-5 md:px-8 md:py-7">
            <p className="text-xs font-semibold tracking-wide text-teal-800">
              SURE Check 공개 진단 사례
            </p>
            <h1 className="mt-1.5 max-w-3xl text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              공개 진단 사례
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
              공개 설문 화면을 기준으로 개인정보 수집·고지 미흡 여부를 자동진단한
              공개 검토 사례입니다.
            </p>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
              <div className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>{PUBLIC_CASE_DISCLAIMER}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[72rem] space-y-5 px-5 py-6 md:px-8 md:py-8">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="사례 필터">
            {FILTERS.map((tab) => {
              const active = filter === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={hrefFor(tab.id, sort)}
                  role="tab"
                  aria-selected={active}
                  className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                    active
                      ? "border-teal-700 bg-teal-800 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {SORTS.map((tab) => {
              const active = sort === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={hrefFor(filter, tab.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                    active
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
              {error}
            </div>
          ) : null}

          {!error && cases.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              현재 공개된 진단 사례가 없습니다.
            </div>
          ) : null}

          <div className="grid gap-4">
            {cases.map((item) => (
              <article
                key={item.publicId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-teal-800">
                      {item.displayName} · {item.platform}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">
                      {item.surveyTitle}
                    </h2>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-semibold ${riskClass(item.riskLevel)}`}
                  >
                    {riskLabelKo(item.riskLevel)}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">진단일</dt>
                    <dd>{item.diagnosedAt || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">수집 정보 요약</dt>
                    <dd className="whitespace-pre-line">{item.dataSummary}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">주요 문제</dt>
                    <dd>{item.problemSummary}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">개선 권고 요약</dt>
                    <dd>{item.improvementSummary}</dd>
                  </div>
                </dl>
                <div className="mt-4">
                  <Link
                    href={`/cases/${item.publicId}`}
                    className="inline-flex rounded-lg bg-teal-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-900"
                  >
                    상세보기
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
