import { ShieldCheck } from "lucide-react";
import type { CertificationNotice } from "@/lib/reporting/reportMessages";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";

interface CertificationNoticeBoxProps {
  notice: CertificationNotice;
}

export function CertificationNoticeBox({ notice }: CertificationNoticeBoxProps) {
  return (
    <div className="report-callout-card mt-5 p-4 md:p-5">
      <div className="flex gap-4">
        <ReportIconBadge icon={ShieldCheck} tone="navy" size="lg" />
        <div className="min-w-0">
          <h3 className="text-base text-[#172554] md:text-lg">
            <span className="font-bold">{notice.title}</span>
          </h3>
          <div className="report-card-divider my-3" />
          <p className="text-sm leading-relaxed text-[#475569] md:text-[15px]">
            {notice.body}
          </p>
          {notice.contextNote && (
            <p className="mt-2 text-sm leading-relaxed text-[#1e40af] md:text-[15px]">
              <span className="font-bold">{notice.contextNote}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
