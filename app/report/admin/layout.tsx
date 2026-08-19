import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SURE Check 관리자 리포트",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminReportLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7FAFB] text-slate-900">{children}</div>
  );
}
