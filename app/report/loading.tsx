export default function ReportLoading() {
  return (
    <div className="mx-auto max-w-[72rem] px-5 py-8 md:px-8">
      <p className="text-sm text-slate-600">화면을 여는 중…</p>
      <div className="mt-6 h-28 animate-pulse rounded-xl bg-slate-200/70" />
    </div>
  );
}
