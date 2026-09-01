import {
  assertPublicReportSafe,
  checkPublicReportSafe,
} from "@/lib/report/publicReportPolicy";
import type { WeeklyReportSnapshot } from "@/lib/weekly/types";

const FORBIDDEN_WORDING = [
  /불법\s*설문/,
  /위반\s*기관/,
  /위반\s*확정/,
  /신고\s*대상\s*확정/,
  /위법\s*확정/,
];

const FORBIDDEN_VALUE_HINTS = [
  "https://docs.google.com",
  "https://form.naver.com",
  "https://moaform.com",
  "source_page_url",
  "supabase.co/storage",
  "report_json",
];

export function checkWeeklySnapshotSafe(value: unknown): {
  ok: boolean;
  violations: string[];
} {
  const base = checkPublicReportSafe(value);
  const violations = [...base.violations];
  const text = JSON.stringify(value);

  for (const re of FORBIDDEN_WORDING) {
    if (re.test(text)) {
      violations.push(`forbidden wording: ${re.source}`);
    }
  }
  for (const hint of FORBIDDEN_VALUE_HINTS) {
    if (text.toLowerCase().includes(hint.toLowerCase())) {
      violations.push(`forbidden value hint: ${hint}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

export function assertWeeklySnapshotSafe(
  snapshot: WeeklyReportSnapshot,
): void {
  assertPublicReportSafe(snapshot);
  const extra = checkWeeklySnapshotSafe(snapshot);
  if (!extra.ok) {
    throw new Error(
      `Weekly snapshot failed public safety: ${extra.violations.join("; ")}`,
    );
  }
}
