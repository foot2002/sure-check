import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SURE Check 관리자 리포트",
  robots: { index: false, follow: false },
};

export default function AdminReportLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100">{children}</div>
  );
}
