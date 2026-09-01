import { redirect } from "next/navigation";
import {
  getAdminSessionFromCookies,
  isAdminAuthConfigured,
} from "@/lib/report/adminAuth";
import { AdminWeeklyView } from "@/components/report/admin/AdminWeeklyView";
import { listWeeklyReports } from "@/lib/weekly/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminWeeklyPage() {
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

  let rows: Array<{
    weekId: string;
    weekLabel: string;
    generatedAt: string;
    status: "draft" | "published" | "archived";
    analyzableCount: number;
    avgScore: number | null;
    attentionNeededRate: number;
    caseCount: number;
  }> = [];
  let error: string | null = null;
  try {
    const list = await listWeeklyReports({ status: "all" });
    rows = list.map((row) => ({
      weekId: row.weekId,
      weekLabel: row.weekLabel,
      generatedAt: row.generatedAt,
      status: row.status,
      analyzableCount: row.snapshot.metrics.analyzableCount,
      avgScore: row.snapshot.metrics.avgScore,
      attentionNeededRate: row.snapshot.metrics.attentionNeededRate,
      caseCount: row.snapshot.anonymousCases.length,
    }));
  } catch (err) {
    console.error("[admin-weekly]", err);
    error = "주간 리포트를 불러오지 못했습니다. 마이그레이션 015를 적용했는지 확인하세요.";
  }

  return <AdminWeeklyView rows={rows} error={error} />;
}
