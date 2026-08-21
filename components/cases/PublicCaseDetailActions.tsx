"use client";

export function PublicCaseDetailActions({
  surveyUrl,
  urlVisibility,
}: {
  surveyUrl: string | null;
  urlVisibility: string;
}) {
  const canOpen = urlVisibility === "full" && Boolean(surveyUrl);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "SURE Check 공개 진단 사례", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      window.alert("링크를 복사했습니다.");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        window.alert("링크를 복사했습니다.");
      } catch {
        window.alert("공유에 실패했습니다.");
      }
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void share()}
        className="rounded-lg bg-teal-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-900"
      >
        공개 리포트 공유
      </button>
      {canOpen ? (
        <a
          href={surveyUrl || undefined}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          설문 URL 열기
        </a>
      ) : null}
    </div>
  );
}
