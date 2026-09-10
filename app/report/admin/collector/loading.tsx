export default function CollectorLoading() {
  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 md:px-6">
      <p className="text-xs font-semibold tracking-wide text-teal-800">수집함</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">공개 설문 링크 수집함</h1>
      <p className="mt-2 text-sm text-slate-600">목록을 불러오는 중입니다…</p>
      <div className="mt-6 h-28 animate-pulse rounded-xl bg-slate-200/70" />
      <div className="mt-3 h-64 animate-pulse rounded-xl bg-slate-200/60" />
    </div>
  );
}
