import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "주간 리포트로 이동 — SURE Check",
};

export default function CasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
