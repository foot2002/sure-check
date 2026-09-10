export default function WeeklyAdminLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <p className="text-sm font-semibold text-teal-800">주간 리포트 관리를 여는 중…</p>
      <div className="mt-4 h-40 animate-pulse rounded-xl bg-slate-200/70" />
    </div>
  );
}
