import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Info } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPublishedPublicCase } from "@/lib/report/publicCases";
import { PUBLIC_CASE_DISCLAIMER } from "@/lib/report/publicCasePolicy";
import { PublicCaseDetailActions } from "@/components/cases/PublicCaseDetailActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  try {
    const detail = await getPublishedPublicCase(publicId);
    if (!detail) return { title: "공개 진단 사례 — SURE Check" };
    return {
      title: `${detail.surveyTitle} — 공개 진단 사례`,
      description: detail.summary || detail.problemSummary,
    };
  } catch {
    return { title: "공개 진단 사례 — SURE Check" };
  }
}

function riskClass(level: string): string {
  if (level === "critical") return "text-rose-700";
  if (level === "high") return "text-orange-600";
  if (level === "medium") return "text-amber-600";
  return "text-slate-700";
}

export default async function PublicCaseDetailPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  let detail = null;
  try {
    detail = await getPublishedPublicCase(publicId);
  } catch (err) {
    console.error("[public-case-detail page]", err);
  }
  if (!detail) notFound();

  const urlLabel =
    detail.urlVisibility === "full" && detail.surveyUrl
      ? detail.surveyUrl
      : detail.urlHost
        ? detail.urlHost
        : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-slate-200 bg-gradient-to-b from-teal-50/80 via-white to-[#f8fafc]">
          <div className="mx-auto max-w-[72rem] px-5 py-5 md:px-8 md:py-7">
            <Link href="/cases" className="text-sm text-teal-800 hover:underline">
              ← 공개 진단 사례
            </Link>
            <p className="mt-3 text-xs font-semibold tracking-wide text-teal-800">
              {detail.displayName} · {detail.platform}
            </p>
            <h1 className="mt-1.5 max-w-3xl text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              {detail.surveyTitle}
            </h1>
            <p className={`mt-2 text-sm font-semibold ${riskClass(detail.riskLevel)}`}>
              {detail.riskLabel}
              {detail.score != null ? ` · 점수 ${detail.score}` : ""}
            </p>
            <div className="mt-4">
              <PublicCaseDetailActions
                surveyUrl={detail.surveyUrl}
                urlVisibility={detail.urlVisibility}
              />
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[72rem] space-y-5 px-5 py-6 md:px-8 md:py-8">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
            <div className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{PUBLIC_CASE_DISCLAIMER}</p>
            </div>
          </div>

          <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
            <Meta label="공개용 기관/기업명" value={detail.displayName} />
            <Meta label="설문 플랫폼" value={detail.platform} />
            <Meta label="진단일" value={detail.diagnosedAt || "—"} />
            <Meta label="설문 URL" value={urlLabel || "비공개"} />
            <Meta label="수집 정보 유형" value={detail.dataSummary} />
            <Meta
              label="고지 미흡 항목"
              value={detail.noticeGaps.join(", ") || "별도 표시 항목 없음"}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">공개용 요약</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {detail.summary || detail.problemSummary}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">주요 문제</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {detail.problemSummary}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">개선 권고</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {detail.improvementSummary}
            </p>
          </section>

          {detail.evidence.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">공개 캡처 이미지</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {detail.evidence.map((file) => (
                  <figure key={file.id} className="overflow-hidden rounded-xl border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.imageUrl}
                      alt={file.label}
                      className="max-h-[28rem] w-full object-contain bg-slate-50"
                    />
                    <figcaption className="px-3 py-2 text-xs text-slate-600">
                      {file.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">유의사항</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{detail.caution}</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-slate-900">{value}</p>
    </div>
  );
}
