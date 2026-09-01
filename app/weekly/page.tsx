import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WeeklyListView } from "@/components/weekly/WeeklyListView";
import type { WeeklyAnonymousCase, WeeklyListCard } from "@/lib/weekly/types";
import { listPublishedWeeklyCards, getPublishedWeeklyReport } from "@/lib/weekly/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "SURE Check 주간 리포트",
  description:
    "공개 온라인 설문에서 확인된 개인정보 수집·고지 미흡 신호를 주간 단위로 분석합니다.",
};

export default async function WeeklyIndexPage() {
  let cards: WeeklyListCard[] = [];
  let cases: WeeklyAnonymousCase[] = [];
  try {
    cards = await listPublishedWeeklyCards();
    const latest = cards[0];
    if (latest) {
      const detail = await getPublishedWeeklyReport(latest.weekId);
      cases = detail?.snapshot.anonymousCases || [];
    }
  } catch (err) {
    console.error("[weekly-index]", err);
    cards = [];
    cases = [];
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-slate-200 bg-gradient-to-b from-teal-50/80 via-white to-[#f8fafc]">
          <div className="mx-auto max-w-[72rem] px-5 py-8 md:px-8 md:py-10">
            <p className="text-xs font-semibold tracking-wide text-teal-800">
              SURE Check 주간 리포트
            </p>
            <h1 className="mt-2 max-w-3xl text-2xl font-bold tracking-tight text-slate-900 md:text-4xl">
              공개 온라인 설문에서 확인된 개인정보 수집·고지 미흡 신호를 주간
              단위로 분석합니다.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
              주간 리포트는 개별 기관이나 기업을 지목하지 않고, 공개 설문 화면
              기준 자동진단 데이터를 바탕으로 개인정보 수집 실태와 반복되는 위험
              유형을 보여줍니다.
            </p>
          </div>
        </section>
        <div className="mx-auto max-w-[72rem] px-5 py-8 md:px-8 md:py-10">
          <WeeklyListView cards={cards} cases={cases} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
