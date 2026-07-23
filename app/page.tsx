"use client";

import { useRef, useState } from "react";
import { ReportView } from "@/components/ReportView";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { FileScanForm } from "@/components/FileScanForm";
import { UrlScanForm } from "@/components/UrlScanForm";
import {
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FileType2,
  FormInput,
  Layers,
  Sheet,
  Shield,
  Sparkles,
} from "lucide-react";
import type { ScanReport } from "@/lib/types/scan";

const PLATFORMS = [
  { name: "Google Forms", desc: "구글 설문", icon: FileSpreadsheet },
  { name: "네이버폼", desc: "Naver Cloud", icon: FormInput },
  { name: "모아폼", desc: "Moaform", icon: Layers },
  { name: "기타 설문", desc: "베타 지원", icon: ClipboardList },
];

const SUPPORTED_FILES = [
  { name: "DOCX", desc: "워드 설문지", icon: FileType2 },
  { name: "XLSX", desc: "엑셀 문항표", icon: Sheet },
  { name: "PDF", desc: "텍스트 PDF", icon: FileText },
  { name: "HWPX", desc: "한글 문서", icon: FileSpreadsheet },
];

type ScanMode = "url" | "file";

export default function HomePage() {
  const [mode, setMode] = useState<ScanMode>("url");
  const [report, setReport] = useState<ScanReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  function showReport(data: ScanReport) {
    setReport(data);
    setReportError(null);
    setLoadingReport(false);
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleScanComplete(scanId: string) {
    setLoadingReport(true);
    setReportError(null);
    setReport(null);

    try {
      const res = await fetch(`/api/scan/report/${scanId}`);
      if (!res.ok) {
        const data = await res.json();
        setReportError(data.error ?? "리포트를 불러올 수 없습니다.");
        return;
      }
      const data: ScanReport = await res.json();
      showReport(data);
    } catch {
      setReportError("리포트를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoadingReport(false);
    }
  }

  function handleFileScanComplete(nextReport: ScanReport) {
    showReport(nextReport);
  }

  function handleScanStart() {
    setReport(null);
    setReportError(null);
  }

  function handleClear() {
    setReport(null);
    setReportError(null);
    setLoadingReport(false);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="relative overflow-hidden border-b border-border-subtle bg-surface">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#dbeafe]/70 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-16 top-32 h-48 w-48 rounded-full bg-[#eff6ff]/90 blur-3xl"
            aria-hidden
          />

          <div className="relative mx-auto max-w-5xl px-5 pb-12 pt-10 md:px-8 md:pb-16 md:pt-14">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-xs text-brand">
              <Sparkles size={12} strokeWidth={2.5} />
              무료 · 회원가입 없이 이용
            </div>

            <h1 className="text-balance text-[1.65rem] leading-snug tracking-tight text-foreground md:text-[2.125rem]">
              내가 받은 설문 링크,
              <br />
              <span className="font-bold text-brand">개인정보 괜찮을까요?</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted md:text-base">
              구글폼·네이버폼·모아폼 링크를 넣거나, 설문지 파일을 업로드하면
              개인정보 수집 위험 신호를 자동으로 점검합니다.
            </p>

            <section className="mt-8 rounded-2xl border border-border bg-surface p-5 shadow-[0_8px_32px_rgba(30,64,175,0.08)] md:p-7">
              <div
                className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-[#f1f5f9] p-1"
                role="tablist"
                aria-label="진단 방식"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "url"}
                  onClick={() => {
                    setMode("url");
                    handleClear();
                  }}
                  className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                    mode === "url"
                      ? "bg-white text-brand shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  설문 링크 진단
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "file"}
                  onClick={() => {
                    setMode("file");
                    handleClear();
                  }}
                  className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                    mode === "file"
                      ? "bg-white text-brand shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  설문 파일 진단
                </button>
              </div>

              {mode === "url" ? (
                <UrlScanForm
                  onScanStart={handleScanStart}
                  onScanComplete={handleScanComplete}
                  onUrlClear={handleClear}
                />
              ) : (
                <FileScanForm
                  onScanStart={handleScanStart}
                  onScanComplete={handleFileScanComplete}
                  onClear={handleClear}
                />
              )}
            </section>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-12">
          {(loadingReport || report || reportError) && (
            <section
              ref={resultsRef}
              className="mb-12 scroll-mt-20 rounded-2xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgba(30,64,175,0.1)] md:p-8"
            >
              {loadingReport && (
                <div className="flex items-center justify-center gap-3 py-14">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-light border-t-brand" />
                  <span className="text-sm text-muted">결과를 불러오는 중</span>
                </div>
              )}

              {reportError && (
                <p className="rounded-xl border border-[#f5c2cc] bg-[#fdf0f2] px-4 py-3 text-sm text-[#9e2a3e]">
                  {reportError}
                </p>
              )}

              {report && <ReportView report={report} />}
            </section>
          )}

          <section className="mb-10">
            <h2 className="mb-4 text-xs uppercase tracking-wider text-muted">
              {mode === "file" ? "지원 파일" : "지원 플랫폼"}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(mode === "file" ? SUPPORTED_FILES : PLATFORMS).map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.name}
                    className="report-summary-card flex flex-col items-center gap-3 px-3 py-5 text-center"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#4f8df7] to-[#1e3a8a] text-white shadow-[0_8px_20px_rgba(30,58,138,0.22)]">
                      <Icon size={24} strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="text-[13px] text-foreground">
                        <span className="font-bold">{item.name}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-5 rounded-2xl border border-border-subtle bg-surface p-5 shadow-sm md:p-6">
            <div className="flex gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3b5bdb] to-[#1e3a8a] text-white shadow-[0_8px_20px_rgba(30,58,138,0.22)]">
                <Shield size={24} strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-sm text-foreground">
                  <span className="font-bold">개인정보 처리 및 저장 안내</span>
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  입력하신 URL과 업로드 파일은 진단 목적으로만 사용되며, 서버에
                  영구 저장하지 않습니다. 회원가입 없이 이용할 수 있습니다.
                </p>
              </div>
            </div>
            <div className="border-t border-border-subtle pt-5">
              <p className="text-[13px] leading-relaxed text-muted">
                <span className="font-bold text-foreground">
                  법률 자문이 아닌 자동 위험진단 —
                </span>{" "}
                본 서비스는 설문 화면 또는 업로드한 설문 양식에서 자동으로 확인
                가능한 문항과 안내문을 기준으로 개인정보보호 위험 신호를
                분석합니다. 실제 법 위반 여부는 수집·이용·보관·위탁·파기 방식에
                따라 달라질 수 있습니다.
              </p>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
