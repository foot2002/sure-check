import { redirect } from "next/navigation";
import {
  getAdminSessionFromCookies,
  isAdminAuthConfigured,
} from "@/lib/report/adminAuth";
import { listAdminCases, AdminRangeError } from "@/lib/report/adminCases";
import { AdminConsoleView } from "@/components/report/admin/AdminConsoleView";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function AdminReportPage({
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

  let data = null;
  let error: string | null = null;
  try {
    data = await listAdminCases({
      range: pick("range"),
      risk: pick("risk"),
      reviewStatus: pick("reviewStatus"),
      publicationStatus: pick("publicationStatus"),
      platform: pick("platform"),
      publicPrivate: pick("publicPrivate"),
      hasPersonalInfo: pick("hasPersonalInfo"),
      hasSensitiveInfo: pick("hasSensitiveInfo"),
      hasHighRiskInfo: pick("hasHighRiskInfo"),
      hasEvidence: pick("hasEvidence"),
      limitedOnly: pick("limitedOnly"),
      outreachOnly: pick("outreachOnly"),
      priority: pick("priority"),
      noticeGap: pick("noticeGap"),
      reportReview: pick("reportReview"),
      outreachStatus: pick("outreachStatus"),
      publicCaseStatus: pick("publicCaseStatus"),
      view: pick("view"),
      subjectType: pick("subjectType"),
      from: pick("from"),
      to: pick("to"),
      q: pick("q"),
    });
  } catch (err) {
    console.error("[admin-page]", err);
    error =
      err instanceof AdminRangeError
        ? err.message
        : "검토 목록을 불러오지 못했습니다.";
  }

  return (
    <AdminConsoleView
      data={data}
      error={error}
      filters={{
        range: pick("from") && pick("to") ? "custom" : pick("range") || "7d",
        risk: pick("risk") || "all",
        reviewStatus: pick("reviewStatus") || "all",
        publicationStatus: pick("publicationStatus") || "all",
        platform: pick("platform") || "all",
        publicPrivate: pick("publicPrivate") || "all",
        hasPersonalInfo: pick("hasPersonalInfo") || "all",
        hasSensitiveInfo: pick("hasSensitiveInfo") || "all",
        hasHighRiskInfo: pick("hasHighRiskInfo") || "all",
        hasEvidence: pick("hasEvidence") || "all",
        limitedOnly: pick("limitedOnly") || "all",
        outreachOnly: pick("outreachOnly") || "all",
        priority: pick("priority") || "all",
        noticeGap: pick("noticeGap") || "all",
        reportReview: pick("reportReview") || "all",
        outreachStatus: pick("outreachStatus") || "all",
        publicCaseStatus: pick("publicCaseStatus") || "all",
        view: pick("view") || "all",
        subjectType: pick("subjectType") || "all",
        q: pick("q") || "",
        from: pick("from") || "",
        to: pick("to") || "",
      }}
    />
  );
}
