import type { MockReportKey, ScanReport } from "@/lib/types/scan";
import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import {
  getFixtureByKey,
  resolveFixtureKey,
} from "@/lib/fixtures/normalizedForms";

/**
 * @deprecated 1차 고정 Mock 템플릿 — 2차부터 analyzeForm 기반으로 대체됨.
 * 하위 호환을 위해 resolve/build 함수만 유지합니다.
 */
export function resolveMockKey(formUrl: string): MockReportKey {
  return resolveFixtureKey(formUrl);
}

export function buildReportFromTemplate(
  scanId: string,
  formUrl: string,
  mockKey: MockReportKey,
): ScanReport {
  const form = getFixtureByKey(mockKey);
  return analyzeForm({ ...form, url: formUrl }, scanId, formUrl, mockKey);
}
