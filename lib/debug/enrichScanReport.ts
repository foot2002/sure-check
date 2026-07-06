import { buildAnalyzerTrace, buildLimitedAnalyzerTrace } from "@/lib/debug/buildAnalyzerTrace";
import { buildScanDebug } from "@/lib/debug/buildScanDebug";
import type { AnalysisResult } from "@/lib/types/analyzer";
import type { ReportBuildContext } from "@/lib/types/debug";
import type { ScanReport } from "@/lib/types/scan";
import { normalizeUrl } from "@/lib/utils/normalizeUrl";

export function enrichScanReport(
  report: ScanReport,
  analysis: AnalysisResult | null,
  buildContext?: ReportBuildContext,
): ScanReport {
  const normalizedUrl = buildContext?.normalizedUrl ?? normalizeUrl(report.formUrl);

  return {
    ...report,
    debug: buildScanDebug(report, analysis, {
      inputUrl: report.formUrl,
      normalizedUrl,
      finalUrl: buildContext?.finalUrl ?? report.form.url,
    }),
    analyzerTrace: analysis
      ? buildAnalyzerTrace(analysis)
      : buildLimitedAnalyzerTrace(report),
  };
}
