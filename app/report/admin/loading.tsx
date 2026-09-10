export default function AdminLoading() {
  return (
    <div className="mx-auto w-full max-w-[100rem] px-3 py-6 md:px-4">
      <p className="text-sm font-semibold text-teal-800">관리자 화면을 여는 중…</p>
      <div className="mt-4 h-24 animate-pulse rounded-xl bg-slate-200/70" />
      <div className="mt-3 h-48 animate-pulse rounded-xl bg-slate-200/60" />
    </div>
  );
}
