export default function WeeklyLoading() {
  return (
    <div className="mx-auto max-w-[72rem] px-5 py-8 md:px-8">
      <p className="text-xs font-semibold tracking-wide text-teal-800">
        SURE Check 주간 리포트
      </p>
      <p className="mt-3 text-sm text-slate-600">주간 리포트를 여는 중…</p>
      <div className="mt-6 h-28 animate-pulse rounded-xl bg-slate-200/70" />
    </div>
  );
}
