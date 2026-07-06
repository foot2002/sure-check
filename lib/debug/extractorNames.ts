import type { MockReportKey, Platform } from "@/lib/types/scan";

const EXTRACTOR_BY_PLATFORM: Record<Platform, string> = {
  google_forms: "GoogleFormsExtractor",
  naver_forms: "NaverFormsExtractor",
  moaform: "MoaformExtractor",
  generic: "GenericHtmlExtractor",
  wiseon_csap: "Fixture (wiseon_csap_caution)",
  unknown: "Unknown",
};

export function getExtractorName(
  platform: Platform,
  fixtureKey?: MockReportKey,
): string {
  if (fixtureKey && fixtureKey !== "generic_unknown_warning") {
    return `Fixture (${fixtureKey})`;
  }
  return EXTRACTOR_BY_PLATFORM[platform] ?? "Unknown";
}
