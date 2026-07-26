import {
  BadgeAlert,
  Fingerprint,
  HeartPulse,
  MessageSquareText,
  Users,
} from "lucide-react";
import { PillTag } from "@/components/report/ui/PillTag";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";
import { SectionHeader } from "@/components/report/ui/SectionHeader";
import type { CollectedDataSummary } from "@/lib/reporting/reportMessages";

interface CollectedDataVisualProps {
  summary: CollectedDataSummary;
}

const groups = [
  {
    key: "directIdentifiers" as const,
    title: "직접식별정보",
    Icon: Fingerprint,
    tone: "amber" as const,
    toneTag: "warning" as const,
  },
  {
    key: "quasiIdentifiers" as const,
    title: "준식별정보",
    Icon: Users,
    tone: "blue" as const,
    toneTag: "caution" as const,
  },
  {
    key: "generalOpinions" as const,
    title: "일반 의견/선호도",
    Icon: MessageSquareText,
    tone: "sky" as const,
    toneTag: "info" as const,
  },
  {
    key: "sensitiveItems" as const,
    title: "민감정보/민감 맥락",
    Icon: HeartPulse,
    tone: "rose" as const,
    toneTag: "danger" as const,
  },
  {
    key: "highRiskItems" as const,
    title: "고위험정보",
    Icon: BadgeAlert,
    tone: "rose" as const,
    toneTag: "danger" as const,
  },
];

export function CollectedDataVisual({ summary }: CollectedDataVisualProps) {
  return (
    <section>
      <SectionHeader
        step={4}
        title="이 설문이 요구하는 정보"
        description="수집 항목을 위험 성격별로 분류해 보여줍니다."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(({ key, title, Icon, tone, toneTag }) => {
          const items = summary[key];
          return (
            <div key={key} className="report-summary-card p-5 md:p-6">
              <div className="mb-4 flex items-center gap-4">
                <ReportIconBadge icon={Icon} tone={tone} size="lg" />
                <h3 className="text-base text-foreground md:text-lg">
                  <span className="font-bold">{title}</span>
                </h3>
              </div>
              <div className="report-card-divider mb-4" />
              <div className="flex flex-wrap gap-2">
                {items.length > 0 ? (
                  items.map((item) => (
                    <PillTag key={item} tone={toneTag} size="md">
                      {item}
                    </PillTag>
                  ))
                ) : (
                  <PillTag tone="neutral" size="md">
                    없음
                  </PillTag>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
