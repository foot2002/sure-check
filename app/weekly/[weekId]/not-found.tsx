import Link from "next/link";

export default function WeeklyNotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-16 text-center">
      <h1 className="text-xl font-bold text-slate-900">주간 리포트를 찾을 수 없습니다</h1>
      <p className="mt-3 text-sm text-slate-600">
        공개된 주간 리포트가 없거나, 해당 주차는 아직 게시되지 않았습니다.
      </p>
      <Link
        href="/weekly"
        className="mt-6 inline-flex rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white"
      >
        목록보기
      </Link>
    </div>
  );
}
