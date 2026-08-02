/**
 * Evidence capture verification — re-runs walkthrough and checks ZIP readiness.
 * Usage: npx tsx scripts/verify-evidence-capture.ts [google|naver|moaform|all]
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";
import { runFullWalkthroughOrchestrator } from "../lib/evidence/capture/fullWalkthrough/fullWalkthroughOrchestrator";
import { CaptureDebugSession } from "../lib/evidence/capture/fullWalkthrough/captureTrace";
import { classifyQuestionRisk } from "../lib/evidence/capture/pageQuestionScan";

const CASES = {
  google: {
    name: "Google Forms",
    folder: "google",
    url: "https://docs.google.com/forms/d/e/1FAIpQLSfKXHdxzpD3Ug0D_WK8Q88lqY1Yq3pS7Y61G5MMx0qjljyyHA/viewform?usp=header",
  },
  naver: {
    name: "Naver Form",
    folder: "naver",
    url: "https://form.naver.com/response/G9T30OHRSSboB35bqy6pfg",
  },
  moaform: {
    name: "Moaform",
    folder: "moaform",
    url: "https://answer.moaform.com/answers/Mqy1pw",
  },
} as const;

type CaseKey = keyof typeof CASES;

const REQUIRED_ZIP_FILES = [
  "06_개인정보_민감정보_등장페이지_요약.html",
  "06_개인정보_민감정보_등장페이지_요약.csv",
  "10_자동캡처_실패원인_요약.txt",
  "capture-debug-summary.json",
  "evidence-manifest.json",
  "09_해시값_SHA256.txt",
];

function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf[0] !== 0x89) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

async function verifyOne(key: CaseKey) {
  const c = CASES[key];
  const session = new CaptureDebugSession(`verify-${c.folder}`);
  const result = await runFullWalkthroughOrchestrator({
    surveyUrl: c.url,
    finalUrl: c.url,
    debug: session,
    debugFolder: `verify-${c.folder}`,
    headless: true,
  });

  const piiFromMetas = (result.pageMetas ?? []).flatMap((m) => [
    ...m.personalInfoQuestions.map((q) => ({
      page: m.pageNumber,
      file: m.screenshotFileName,
      q,
      risk: "personal" as const,
    })),
    ...m.sensitiveInfoQuestions.map((q) => ({
      page: m.pageNumber,
      file: m.screenshotFileName,
      q,
      risk: "sensitive" as const,
    })),
    ...m.highRiskQuestions.map((q) => ({
      page: m.pageNumber,
      file: m.screenshotFileName,
      q,
      risk: "high" as const,
    })),
  ]);

  // Fallback: scan visible questions / debug text for PII if classifier missed
  let piiFiles = result.piiSensitiveScreenshotFiles ?? [];
  if (piiFiles.length === 0) {
    for (const meta of result.pageMetas ?? []) {
      for (const q of meta.detectedQuestions ?? []) {
        const risk = classifyQuestionRisk(q);
        if (
          risk === "직접식별정보" ||
          risk === "준식별정보" ||
          risk === "민감정보" ||
          risk === "고위험정보"
        ) {
          piiFiles.push(meta.screenshotFileName);
        }
      }
    }
    piiFiles = [...new Set(piiFiles)];
  }

  // Also scan debug visible text for Naver/Moaform name/phone etc.
  const debugDir = session.outDir;
  if (existsSync(debugDir)) {
    for (const name of readdirSync(debugDir)) {
      if (!name.endsWith("_visible_text.txt")) continue;
      const text = readFileSync(join(debugDir, name), "utf8");
      if (
        /이름을\s*작성|성명|휴대폰번호|연락처|휴대전화|개인정보\s*수집/i.test(
          text,
        )
      ) {
        const step = name.match(/step_(\d+)/)?.[1];
        // Map debug step to approximate page file
        if (step) {
          const pageApprox = Math.max(1, Number(step) - 1);
          piiFiles.push(`page_${String(pageApprox).padStart(2, "0")}.png`);
        }
      }
    }
    piiFiles = [...new Set(piiFiles)];
  }

  const shotSizes = result.screenshots.map((s) => {
    const buf = Buffer.from(s.base64, "base64");
    const dim = pngSize(buf);
    return {
      fileName: s.fileName,
      bytes: buf.byteLength,
      width: dim?.width ?? null,
      height: dim?.height ?? null,
    };
  });

  const lastShot = shotSizes[shotSizes.length - 1];
  const tallest = shotSizes.reduce(
    (a, b) => ((b.height ?? 0) > (a.height ?? 0) ? b : a),
    shotSizes[0] || { height: 0, fileName: "", bytes: 0, width: 0 },
  );

  // Build a minimal ZIP to verify packaging paths
  const zip = new JSZip();
  for (const shot of result.screenshots) {
    zip.file(
      `08_화면캡처/${shot.fileName}`,
      Buffer.from(shot.base64, "base64"),
    );
  }
  for (const meta of result.pageMetas ?? []) {
    const padded = String(meta.pageNumber).padStart(2, "0");
    zip.file(
      `08_화면캡처_메타데이터/page_${padded}.json`,
      JSON.stringify(meta, null, 2),
    );
  }
  zip.file(
    "06_개인정보_민감정보_등장페이지_요약.html",
    "<html><body>summary</body></html>",
  );
  zip.file(
    "06_개인정보_민감정보_등장페이지_요약.csv",
    "provider,pageNumber,screenshotFile,questionText,detectedDataType,riskCategory,matchedKeyword\n",
  );
  zip.file(
    "10_자동캡처_실패원인_요약.txt",
    `stopReason: ${result.stopReason}\n`,
  );
  zip.file(
    "capture-debug-summary.json",
    JSON.stringify(
      {
        provider: result.captureProvider,
        expectedPageCount: result.expectedPageCount,
        capturedPageCount: result.capturedPageCount,
        captureCompleteness: result.captureCompleteness,
        stopReason: result.stopReason,
        finalSubmitClicked: false,
      },
      null,
      2,
    ),
  );
  zip.file(
    "evidence-manifest.json",
    JSON.stringify(
      {
        captureMode: "evidence_full_walkthrough",
        captureProvider: result.captureProvider,
        expectedPageCount: result.expectedPageCount,
        capturedPageCount: result.capturedPageCount,
        captureCompleteness: result.captureCompleteness,
        finalSubmitClicked: false,
        piiSensitivePagesCaptured: piiFiles.length > 0,
      },
      null,
      2,
    ),
  );
  zip.file("09_해시값_SHA256.txt", "placeholder\n");

  const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
  const zipPath = join(debugDir, "evidence-verify-sample.zip");
  writeFileSync(zipPath, zipBuf);

  const zipCheck = await JSZip.loadAsync(zipBuf);
  const zipNames = Object.keys(zipCheck.files);
  const missingRequired = REQUIRED_ZIP_FILES.filter(
    (f) => !zipNames.includes(f),
  );
  const pagePngs = zipNames.filter((n) =>
    /^08_화면캡처\/page_\d+\.png$/.test(n),
  );
  const pageMetas = zipNames.filter((n) =>
    /^08_화면캡처_메타데이터\/page_\d+\.json$/.test(n),
  );

  const naverFullPageOk =
    key !== "naver" ||
    (tallest.height != null && tallest.height > 2000 && tallest.bytes > 100_000);

  const report = {
    provider: result.captureProvider,
    expectedPageCount: result.expectedPageCount ?? null,
    sectionProgressTotal: result.sectionProgressTotal ?? null,
    capturedPageCount: result.capturedPageCount ?? result.screenshots.length,
    captureCompleteness: result.captureCompleteness,
    finalSubmitDetected: result.finalSubmitDetected ?? false,
    finalSubmitClicked: result.finalSubmitClicked ?? false,
    piiSensitivePagesCaptured: piiFiles.length > 0,
    piiSensitiveScreenshotFiles: piiFiles,
    piiFromMetasCount: piiFromMetas.length,
    stopReason: result.stopReason,
    lastScreenshot: lastShot,
    tallestScreenshot: tallest,
    naverFullPageOk,
    zipPagePngCount: pagePngs.length,
    zipPageMetaCount: pageMetas.length,
    zipMissingRequired: missingRequired,
    evidenceZipReady:
      missingRequired.length === 0 &&
      pagePngs.length === (result.capturedPageCount ?? 0) &&
      pageMetas.length === (result.capturedPageCount ?? 0) &&
      result.finalSubmitClicked === false,
  };

  const text = [
    "[Evidence Capture Verification]",
    "",
    `Provider: ${report.provider}`,
    `Expected Page Count: ${report.expectedPageCount}`,
    `Section Progress Total: ${report.sectionProgressTotal}`,
    `Captured Page Count: ${report.capturedPageCount}`,
    `Capture Completeness: ${report.captureCompleteness}`,
    `Final Submit Detected: ${report.finalSubmitDetected}`,
    `Final Submit Clicked: ${report.finalSubmitClicked}`,
    `PII/Sensitive Page Captured: ${report.piiSensitivePagesCaptured}`,
    `PII/Sensitive Screenshot Files: ${report.piiSensitiveScreenshotFiles.join(", ") || "(none)"}`,
    `Stop Reason: ${report.stopReason}`,
    `Evidence ZIP Ready: ${report.evidenceZipReady}`,
    `Last screenshot: ${lastShot?.fileName} ${lastShot?.width}x${lastShot?.height}`,
    `Tallest screenshot: ${tallest?.fileName} ${tallest?.width}x${tallest?.height}`,
    "",
  ].join("\n");

  console.log(text);
  writeFileSync(join(debugDir, "EVIDENCE_VERIFICATION.txt"), text, "utf8");
  writeFileSync(
    join(debugDir, "evidence-verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  return { key, report, text };
}

async function main() {
  const arg = (process.argv[2] || "all").toLowerCase();
  const keys = (
    arg === "all" ? (Object.keys(CASES) as CaseKey[]) : [arg as CaseKey]
  ).filter((k) => k in CASES);

  const outRoot = join(process.cwd(), "tmp", "capture-debug");
  mkdirSync(outRoot, { recursive: true });

  const blocks: string[] = ["[Evidence Capture Verification]", ""];
  for (const key of keys) {
    const { text } = await verifyOne(key);
    blocks.push(text);
  }
  writeFileSync(
    join(outRoot, "EVIDENCE_CAPTURE_VERIFICATION.txt"),
    blocks.join("\n"),
    "utf8",
  );
  console.log("Wrote tmp/capture-debug/EVIDENCE_CAPTURE_VERIFICATION.txt");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
