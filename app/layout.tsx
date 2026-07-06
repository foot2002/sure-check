import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SURE Check — 설문 링크 개인정보 위험 진단",
  description:
    "구글폼·네이버폼·모아폼 링크를 넣으면 개인정보 수집 위험 신호를 자동으로 점검합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
