import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WeeklyDetailView } from "@/components/weekly/WeeklyDetailView";
import { getPublishedWeeklyReport } from "@/lib/weekly/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ weekId: string }>;
}): Promise<Metadata> {
  const { weekId } = await params;
  const row = await getPublishedWeeklyReport(weekId).catch(() => null);
  if (!row) return { title: "주간 리포트 — SURE Check" };
  return {
    title: `${row.weekLabel} — SURE Check 주간 리포트`,
    description: row.snapshot.summary.headline,
  };
}

export default async function WeeklyDetailPage({
  params,
}: {
  params: Promise<{ weekId: string }>;
}) {
  const { weekId } = await params;
  let row = null;
  try {
    row = await getPublishedWeeklyReport(weekId);
  } catch (error) {
    console.error("[weekly-detail]", error);
    notFound();
  }
  if (!row) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[72rem] flex-1 px-5 py-8 md:px-8 md:py-10">
        <WeeklyDetailView snapshot={row.snapshot} />
      </main>
      <SiteFooter />
    </div>
  );
}
