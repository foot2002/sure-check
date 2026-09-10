import { redirect } from "next/navigation";
import {
  getAdminSessionFromCookies,
  isAdminAuthConfigured,
} from "@/lib/report/adminAuth";
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

  return (
    <AdminConsoleView
      data={null}
      error={null}
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
