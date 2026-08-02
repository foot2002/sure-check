import Link from "next/link";
import { ArrowLeft, CalendarRange, Info } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PublicDashboardView } from "@/components/report/PublicDashboardView";
import { buildPublicDashboard } from "@/lib/report/buildPublicDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RANGE_TABS = [
  { id: "today", label: "오늘" },
  { id: "7d", label: "최근 7일" },
  { id: "30d", label: "최근 30일" },
] as const;

type RangeId = (typeof RANGE_TABS)[number]["id"];

function resolveRange(raw: string | string[] | undefined): RangeId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "today" || value === "30d") return value;
  return "7d";
}

export default async function PublicReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const range = resolveRange(params.range);

  let data = null;
  let error: string | null = null;
  try {
    data = await buildPublicDashboard({ range });
  } catch (err) {
    console.error("[public-report page]", err);
    error = "공개 통계를 불러오지 못했습니다.";
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-slate-200 bg-gradient-to-b from-teal-50/80 via-white to-[#f8fafc]">
          <div className="mx-auto max-w-[72rem] px-5 py-8 md:px-8 md:py-12">
            <Link
              href="/"
              className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-teal-800"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              진단으로 돌아가기
            </Link>

            <p className="text-xs font-semibold tracking-wide text-teal-800">
              SURE Check 공개 모니터링
            </p>
            <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              대한민국 온라인 수집 개인정보 모니터링
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
              공개 설문·온라인 조사에서 개인정보가 어떻게 수집되고 있는지 자동진단
              데이터를 바탕으로 보여줍니다.
            </p>

            <div
              className="mt-6 flex flex-wrap gap-2"
              role="tablist"
              aria-label="기간 필터"
            >
              {RANGE_TABS.map((tab) => {
                const active = range === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={`/report?range=${tab.id}`}
                    role="tab"
                    aria-selected={active}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-teal-700 bg-teal-800 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"
                    }`}
                  >
                    <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
              <div className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  본 페이지는 자동진단 기반 사회적 모니터링 통계입니다. 개별 진단
                  결과는 위반 확정이 아니며, 검토 전 데이터는 ‘위반 소지’, ‘미흡’,
                  ‘확인 필요’로 해석해야 합니다. 기관·기업명, 개별 설문 URL, 캡처
                  이미지, 신고용 증빙자료는 공개하지 않습니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[72rem] space-y-8 px-5 py-8 md:px-8 md:py-10">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
              {error}
            </div>
          ) : null}

          {!error && data ? <PublicDashboardView data={data} /> : null}

          {!error && data && !data.hasData ? (
            <div className="text-center">
              <Link
                href="/"
                className="inline-flex rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"
              >
                설문 진단하러 가기
              </Link>
            </div>
          ) : null}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
