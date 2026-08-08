import { redirect } from "next/navigation";
import {
  getAdminSessionFromCookies,
  isAdminAuthConfigured,
} from "@/lib/report/adminAuth";
import {
  getCollectorConfigError,
  isCollectorStorageConfigured,
} from "@/lib/collector/config";
import {
  getCollectorSummary,
  listSurveyLinks,
} from "@/lib/collector/queries";
import { CollectorConsoleView } from "@/components/report/admin/CollectorConsoleView";
import type {
  CollectorPlatform,
  CollectorSourceType,
  CollectorSurveyStatus,
} from "@/lib/collector/types";

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
        <h1 className="text-xl font-bold text-white">관리자 인증 미설정</h1>
        <p className="mt-3 text-sm text-slate-400">
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
    triageQueue: pick("triageQueue") || "all",
    q: pick("q") || "",
  };

  let summary = null;
  let items: Awaited<ReturnType<typeof listSurveyLinks>> = [];
  let error: string | null = null;
  const configError = getCollectorConfigError();

  if (!isCollectorStorageConfigured()) {
    error =
      "Supabase가 설정되지 않아 수집 목록을 불러올 수 없습니다. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 확인하세요.";
  } else {
    try {
      const fromIso = filters.firstDiscoveredFrom
        ? `${filters.firstDiscoveredFrom}T00:00:00.000Z`
        : undefined;
      const toIso = filters.firstDiscoveredTo
        ? `${filters.firstDiscoveredTo}T23:59:59.999Z`
        : undefined;

      [summary, items] = await Promise.all([
        getCollectorSummary(),
        listSurveyLinks({
          platform: filters.platform as CollectorPlatform | "all",
          status: filters.status as
            | CollectorSurveyStatus
            | "all"
            | "default"
            | "non_invalid",
          firstDiscoveredFrom: fromIso,
          firstDiscoveredTo: toIso,
          searchQuery: filters.searchQuery || undefined,
          novelty: filters.novelty as "all" | "new" | "existing",
          sourceType: filters.sourceType as CollectorSourceType | "all",
          triageQueue: filters.triageQueue as
            | "A_PRIORITY"
            | "B_PRIORITY"
            | "C_ARCHIVE"
            | "all",
          q: filters.q || undefined,
        }),
      ]);
    } catch (err) {
      console.error("[admin-collector-page]", err);
      error =
        "수집 목록을 불러오지 못했습니다. migration 004–006이 적용됐는지 확인하세요.";
    }
  }

  return (
    <CollectorConsoleView
      summary={summary}
      items={items}
      error={error}
      filters={filters}
      configError={configError}
    />
  );
}
