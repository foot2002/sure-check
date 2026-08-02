import { redirect } from "next/navigation";
import {
  getAdminSessionFromCookies,
  isAdminAuthConfigured,
} from "@/lib/report/adminAuth";
import { getAdminCaseDetail } from "@/lib/report/adminCaseDetail";
import { AdminCaseDetailView } from "@/components/report/admin/AdminCaseDetailView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isAdminAuthConfigured()) {
    redirect("/report/admin/login");
  }
  if (!(await getAdminSessionFromCookies())) {
    redirect("/report/admin/login");
  }

  const { id } = await params;
  let detail = null;
  let error: string | null = null;
  try {
    detail = await getAdminCaseDetail(id);
  } catch (err) {
    const status =
      err instanceof Error && (err as Error & { status?: number }).status
        ? (err as Error & { status: number }).status
        : 500;
    error =
      status === 404
        ? "케이스를 찾을 수 없습니다."
        : "케이스 상세를 불러오지 못했습니다.";
  }

  return <AdminCaseDetailView detail={detail} error={error} />;
}
