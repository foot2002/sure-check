import {
  COVERAGE_STATUS_COLORS,
  COVERAGE_STATUS_LABELS,
  PLATFORM_COVERAGE_MATRIX,
} from "@/lib/validation/platformCoverage";
import type { CoverageStatus } from "@/lib/validation/types";

function StatusBadge({ status }: { status: CoverageStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-medium ${COVERAGE_STATUS_COLORS[status] ?? ""}`}
    >
      {COVERAGE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function PlatformCoverageMatrix() {
  const columns: { key: keyof (typeof PLATFORM_COVERAGE_MATRIX)[0]; label: string }[] = [
    { key: "urlDetection", label: "URL 감지" },
    { key: "htmlFetch", label: "HTML fetch" },
    { key: "questionExtraction", label: "문항 추출" },
    { key: "piiDetection", label: "PII 탐지" },
    { key: "noticeDetection", label: "고지문 탐지" },
    { key: "limitedHandling", label: "제한 처리" },
    { key: "dedicatedExtractor", label: "전용 Extractor" },
    { key: "playwrightNeeded", label: "Playwright" },
    { key: "priority", label: "우선순위" },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle">
      <table className="min-w-full text-left text-[10px]">
        <thead className="bg-surface text-muted">
          <tr>
            <th className="sticky left-0 bg-surface px-2 py-2 font-medium">플랫폼</th>
            {columns.map((col) => (
              <th key={col.key} className="px-2 py-2 font-medium whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle bg-background">
          {PLATFORM_COVERAGE_MATRIX.map((row) => (
            <tr key={row.id}>
              <td className="sticky left-0 bg-background px-2 py-2 font-medium text-foreground">
                {row.label}
              </td>
              {columns.map((col) => (
                <td key={col.key} className="px-2 py-2">
                  {col.key === "priority" ? (
                    <span className="font-mono">{row.priority}</span>
                  ) : (
                    <StatusBadge status={row[col.key] as CoverageStatus} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
