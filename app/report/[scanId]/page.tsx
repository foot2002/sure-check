"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { ScanProgress } from "@/components/ScanProgress";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import type { ScanReport } from "@/lib/types/scan";

export default function ReportPage() {
  const params = useParams();
  const scanId = params.scanId as string;
  const [report, setReport] = useState<ScanReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchReport() {
      try {
        const res = await fetch(`/api/scan/report/${scanId}`);
        if (res.status === 202) {
          if (!cancelled) {
            setWaiting(true);
            setLoading(false);
          }
          return;
        }
        if (!res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setError(data.error ?? "리포트를 불러올 수 없습니다.");
            setLoading(false);
          }
          return;
        }
        const data: ScanReport = await res.json();
        if (!cancelled) {
          setReport(data);
          setLoading(false);
          setWaiting(false);
        }
      } catch {
        if (!cancelled) {
          setError("네트워크 오류가 발생했습니다.");
          setLoading(false);
        }
      }
    }

    fetchReport();
    const interval = setInterval(fetchReport, 800);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [scanId]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[72rem] flex-1 px-5 py-6 md:px-8 md:py-8">
        {loading && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-light border-t-brand" />
          </div>
        )}

        {waiting && !report && !loading && (
          <ScanProgress
            scanId={scanId}
            onComplete={() => {
              setWaiting(false);
              setLoading(true);
              fetch(`/api/scan/report/${scanId}`)
                .then((r) => r.json())
                .then((data) => {
                  setReport(data);
                  setLoading(false);
                });
            }}
            onError={(msg) => setError(msg)}
          />
        )}

        {(error || (!report && !loading && !waiting)) && (
          <div className="rounded-2xl border border-[#f5c2cc] bg-[#fdf0f2] p-8 text-center">
            <p className="mb-4 text-sm text-[#9e2a3e]">
              {error ?? "리포트를 찾을 수 없습니다."}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
            >
              <ArrowLeft size={14} />
              다시 진단하기
            </Link>
          </div>
        )}

        {report && (
          <>
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:text-brand-hover"
            >
              <ArrowLeft size={14} />
              새 진단하기
            </Link>
            <ReportView report={report} />
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
