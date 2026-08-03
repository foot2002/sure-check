"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-xl font-bold text-slate-900">
        페이지를 표시하지 못했습니다
      </h2>
      <p className="max-w-md text-sm text-slate-600">
        종료된 설문이거나 일시적인 오류일 수 있습니다. 다시 시도하거나 홈에서
        진단을 다시 시작해 주세요.
      </p>
      {error?.digest ? (
        <p className="text-xs text-slate-400">코드: {error.digest}</p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          다시 시도
        </button>
        <a
          href="/"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
        >
          홈으로
        </a>
      </div>
    </div>
  );
}
