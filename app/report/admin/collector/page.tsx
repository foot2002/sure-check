import { redirect } from "next/navigation";
import {
  getAdminSessionFromCookies,
  isAdminAuthConfigured,
} from "@/lib/report/adminAuth";
import { getCollectorConfigError } from "@/lib/collector/config";
import { COLLECTOR_LIST_PAGE_SIZE } from "@/lib/collector/queries";
import { CollectorConsoleView } from "@/components/report/admin/CollectorConsoleView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCollectorPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isAdminAuthConfigured()) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">관리자 인증 미설정</h1>
        <p className="mt-3 text-sm text-slate-600">
          `.env.local`에 `REPORT_ADMIN_PASSWORD`와
          `REPORT_ADMIN_SESSION_SECRET`을 설정한 뒤 다시 시도하세요.
        </p>
      </div>
    );
  }

  if (!(await getAdminSessionFromCookies())) {
    redirect("/report/admin/login");
  }

  const params = (await searchParams) || {};
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const filters = {
    platform: pick("platform") || "all",
    status: pick("status") || "default",
    firstDiscoveredFrom: pick("firstDiscoveredFrom") || "",
    firstDiscoveredTo: pick("firstDiscoveredTo") || "",
    searchQuery: pick("searchQuery") || "",
    novelty: pick("novelty") || "all",
    sourceType: pick("sourceType") || "all",
    holdReason: pick("holdReason") || "all",
    quickView: pick("quickView") || "all",
    triageQueue: pick("triageQueue") || "all",
    diagnosisStatus: pick("diagnosisStatus") || "all",
    q: pick("q") || "",
    page: pick("page") || "1",
  };

  return (
    <CollectorConsoleView
      summary={null}
      items={[]}
      listTotal={0}
      hasMore={false}
      pageSize={COLLECTOR_LIST_PAGE_SIZE}
      error={null}
      filters={filters}
      configError={getCollectorConfigError()}
    />
  );
}
