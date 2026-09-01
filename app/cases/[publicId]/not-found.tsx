import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function PublicCaseNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <SiteHeader />
      <main className="mx-auto flex max-w-[40rem] flex-1 flex-col items-center justify-center px-5 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">
          해당 공개 사례 페이지는 주간 리포트로 개편되었습니다
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          개별 기관·설문 공개 페이지는 운영하지 않습니다. 익명 통계와 대표 위험
          유형은 주간 리포트에서 확인할 수 있습니다.
        </p>
        <Link
          href="/weekly"
          className="mt-6 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900"
        >
          주간 리포트 보기
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
