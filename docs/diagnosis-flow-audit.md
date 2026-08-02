# Current Diagnosis Flow Audit

Generated for Speed Optimization With Accuracy & Evidence Preservation.

## [Current Diagnosis Flow Audit]

- scan start API: `app/api/scan/start/route.ts` — enqueue `scan_jobs`, return `scanId` immediately, `after(processScanJob)`
- scan status API: `app/api/scan/status/[scanId]/route.ts` — memory + DB status; terminal hydrate `report_json`
- main scan function: `lib/scan/resolveScanReport.ts` → platform extractors → `analyzeForm`
- browser automation engine: Puppeteer (`puppeteer-core` + `@sparticuz/chromium`) via `lib/evidence/capture/browserLauncher.ts`
- browser used in normal scan: **No** for Google/Naver/Generic HTML parsers. Moaform uses HTTP SPA/JSON client (`lib/extractors/moaformSpaClient.ts`), not Chromium. Optional **extract-only** browser fallback added when confidence gate fails (`lib/extractors/browserExtractFallback.ts`) — resource-blocked; never used for evidence.
- browser used in evidence capture: **Yes** — `captureSurveyScreenshots` / full walkthrough (no extract-style resource blocking)
- evidence capture API: sync `POST /api/evidence/capture`; async `POST /api/evidence/capture/start` + `GET .../status/[captureJobId]`
- storage upload helper: `lib/storage/evidenceStorage.ts` (`uploadEvidenceFile`, `createSignedEvidenceUrl`)
- monitoring repository: `lib/repositories/SupabaseMonitoringRepository.ts` + `persistCaptureEvidence`
- admin evidence query: `lib/report/adminEvidence.ts` → `adminCaseDetail.ts` → signed-url route

### Platform extractors (normal diagnosis)

| Platform | Path | Strategy |
|----------|------|----------|
| Google Forms | `GoogleFormsExtractor` / `googleFormsParser` | Static HTML `FB_PUBLIC_LOAD_DATA_` + DOM |
| Naver Form | `NaverFormsExtractor` / `naverFormsParser` | Embedded JSON + access API + DOM |
| Moaform | `MoaformExtractor` / `moaformParser` + `moaformSpaClient` | Embedded JSON + HTTP SPA/JSON + DOM |
| Generic | `GenericHtmlExtractor` | Cheerio static fields |

### Accuracy principles

1. Fast/platform parsers first; confidence gate decides acceptance.
2. Uncertain → extract-only browser fallback (resource-blocked).
3. Evidence capture quality unchanged; never share extract resource blocking.
4. Public `/report` remains aggregate-only (`assertPublicReportSafe`).
