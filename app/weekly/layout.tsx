import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SURE Check 주간 리포트",
  description:
    "공개 온라인 설문에서 확인된 개인정보 수집·고지 미흡 신호를 주간 단위로 분석합니다.",
};

export default function WeeklyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
