import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function PublicCaseNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <SiteHeader />
      <main className="mx-auto flex max-w-[40rem] flex-1 flex-col items-center justify-center px-5 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">공개된 사례가 아닙니다.</h1>
        <p className="mt-2 text-sm text-slate-600">
          이 주소는 공개 승인된 진단 사례가 아니거나 공개가 중지되었습니다.
        </p>
        <Link
          href="/cases"
          className="mt-6 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900"
        >
          공개 진단 사례 목록
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
