import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보보호진흥원 소개 — SURE Check",
  description:
    "SURE-CHECK는 공개 온라인 설문의 개인정보 수집·고지 실태를 점검하여 응답자의 안전한 판단과 기관·기업의 자율 개선을 지원하는 공익형 모니터링 서비스입니다.",
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
