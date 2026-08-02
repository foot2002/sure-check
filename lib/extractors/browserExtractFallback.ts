import { getJobWorkerConfig } from "@/lib/jobs/config";
import { launchCaptureBrowser } from "@/lib/evidence/capture/browserLauncher";
import { withTimeout } from "@/lib/jobs/withTimeout";

const BLOCKED_RESOURCE_TYPES = new Set([
  "image",
  "media",
  "font",
  "stylesheet",
]);

const BLOCKED_URL_RE =
  /google-analytics|googletagmanager|doubleclick|facebook\.net|hotjar|segment\.|mixpanel|amplitude|clarity\.ms|adservice|adsystem|scorecardresearch/i;

/**
 * Extract-only browser fallback.
 * Blocks images/fonts/media/analytics to speed extraction.
 * NEVER use this for evidence/screenshot capture paths.
 */
export async function fetchHtmlWithExtractBrowser(
  url: string,
): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; reason: string }> {
  const timeoutMs =
    (getJobWorkerConfig().browserExtractTimeoutSeconds || 30) * 1000;

  try {
    return await withTimeout(
      (async () => {
        const browser = await launchCaptureBrowser();
        try {
          const page = await browser.newPage();
          await page.setRequestInterception(true);
          page.on("request", (req) => {
            const type = req.resourceType();
            const reqUrl = req.url();
            if (BLOCKED_RESOURCE_TYPES.has(type) || BLOCKED_URL_RE.test(reqUrl)) {
              void req.abort();
              return;
            }
            void req.continue();
          });

          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: Math.min(timeoutMs, 25_000),
          });
          // Allow SPA shells a short settle window without full networkidle.
          await new Promise((r) => setTimeout(r, 1500));
          const html = await page.content();
          const finalUrl = page.url();
          await page.close().catch(() => undefined);
          if (!html || html.length < 200) {
            return {
              ok: false as const,
              reason: "browser extract returned empty HTML",
            };
          }
          return { ok: true as const, html, finalUrl };
        } finally {
          await browser.close().catch(() => undefined);
        }
      })(),
      timeoutMs,
      "browser_extract",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message.slice(0, 300) };
  }
}
