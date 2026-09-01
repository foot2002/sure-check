"use client";

import Link from "next/link";
import { useState } from "react";
import type { WeeklyReportRow, WeeklyReportStatus } from "@/lib/weekly/types";

export function AdminWeeklyView({
  rows,
  error,
}: {
  rows: Array<Pick<WeeklyReportRow, "weekId" | "weekLabel" | "generatedAt" | "status"> & {
    analyzableCount: number;
    avgScore: number | null;
    attentionNeededRate: number;
    caseCount: number;
  }>;
  error?: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setToast(null);
    try {
      await fn();
      window.location.reload();
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            주간 리포트 관리
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">최근 주차 스냅샷</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            공개 상태가 published인 리포트만 /weekly에 노출됩니다. 개별 기관명과
            설문 URL은 저장하지 않습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/report/admin"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            관리자 홈
          </Link>
          <button
            type="button"
            disabled={busy !== null}
            className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() =>
              void run("gen6", async () => {
                const res = await fetch("/api/report/admin/weekly/generate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ weeks: 6, publish: false }),
                });
                const data = (await res.json()) as { error?: string; count?: number };
                if (!res.ok) throw new Error(data.error || "생성 실패");
                setToast(`최근 ${data.count ?? 0}주 생성 완료`);
              })
            }
          >
            {busy === "gen6" ? "생성 중…" : "최근 6주 생성"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {toast}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">주차</th>
              <th className="px-4 py-3">분석</th>
              <th className="px-4 py-3">지수</th>
              <th className="px-4 py-3">주의%</th>
              <th className="px-4 py-3">사례</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.weekId} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-medium">{row.weekLabel}</p>
                  <p className="text-xs text-slate-400">{row.weekId}</p>
                </td>
                <td className="px-4 py-3">{row.analyzableCount}</td>
                <td className="px-4 py-3">{row.avgScore ?? "-"}</td>
                <td className="px-4 py-3">{row.attentionNeededRate}</td>
                <td className="px-4 py-3">{row.caseCount}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Link
                      href={`/report/admin/weekly/${row.weekId}`}
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                    >
                      미리보기
                    </Link>
                    {(["draft", "published", "archived"] as WeeklyReportStatus[]).map(
                      (status) => (
                        <button
                          key={status}
                          type="button"
                          className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-40"
                          disabled={busy !== null || row.status === status}
                          onClick={() =>
                            void run(`${row.weekId}-${status}`, async () => {
                              const res = await fetch(
                                `/api/report/admin/weekly/${row.weekId}`,
                                {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status }),
                                },
                              );
                              const data = (await res.json()) as { error?: string };
                              if (!res.ok) throw new Error(data.error || "변경 실패");
                            })
                          }
                        >
                          {status}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(`regen-${row.weekId}`, async () => {
                          const res = await fetch("/api/report/admin/weekly/generate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              weekId: row.weekId,
                              publish: row.status === "published",
                            }),
                          });
                          const data = (await res.json()) as { error?: string };
                          if (!res.ok) throw new Error(data.error || "재생성 실패");
                        })
                      }
                    >
                      재생성
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
