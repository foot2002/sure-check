import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getAdminSessionFromCookies,
  isAdminAuthConfigured,
} from "@/lib/report/adminAuth";
import { WeeklyDetailView } from "@/components/weekly/WeeklyDetailView";
import { getWeeklyReport } from "@/lib/weekly/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminWeeklyPreviewPage({
  params,
}: {
  params: Promise<{ weekId: string }>;
}) {
  if (!isAdminAuthConfigured()) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="text-xl font-bold">관리자 인증 미설정</h1>
      </div>
    );
  }
  if (!(await getAdminSessionFromCookies())) {
    redirect("/report/admin/login");
  }

  const { weekId } = await params;
  const row = await getWeeklyReport(weekId);
  if (!row) notFound();

  return (
    <div className="mx-auto max-w-[72rem] px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            관리자 미리보기 · {row.status}
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{row.weekLabel}</h1>
          <p className="mt-1 text-sm text-slate-600">
            published 상태가 아니면 /weekly에 노출되지 않습니다.
          </p>
        </div>
        <Link
          href="/report/admin/weekly"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          주간 리포트 관리
        </Link>
      </div>
      <WeeklyDetailView snapshot={row.snapshot} />
    </div>
  );
}
