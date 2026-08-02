import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "대한민국 온라인 수집 개인정보 모니터링 — SURE Check",
  description:
    "공개 설문·온라인 조사에서 개인정보가 어떻게 수집되고 있는지 자동진단 기반 집계 통계로 보여줍니다.",
};

export default function PublicReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
