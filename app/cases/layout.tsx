import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "공개 진단 사례 — SURE Check",
  description:
    "공개 설문 화면을 기준으로 개인정보 수집·고지 미흡 여부를 자동진단한 공개 검토 사례입니다.",
};

export default function PublicCasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
