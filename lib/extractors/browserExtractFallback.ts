import { getJobWorkerConfig } from "@/lib/jobs/config";
import { launchCaptureBrowser } from "@/lib/evidence/capture/browserLauncher";
import {
  injectCapturedNetworkJsonIntoHtml,
  type CapturedNetworkJson,
} from "@/lib/extractors/networkCaptureHtml";
import { withTimeout } from "@/lib/jobs/withTimeout";

export type { CapturedNetworkJson };
export {
  readCapturedNetworkJsonFromHtml,
  SURE_CHECK_NETWORK_CAPTURE_ID,
} from "@/lib/extractors/networkCaptureHtml";

const BLOCKED_RESOURCE_TYPES = new Set([
  "image",
  "media",
  "font",
  "stylesheet",
]);

const BLOCKED_URL_RE =
  /google-analytics|googletagmanager|doubleclick|facebook\.net|hotjar|segment\.|mixpanel|amplitude|clarity\.ms|adservice|adsystem|scorecardresearch/i;

/** Capture survey JSON from browser XHR/fetch (Naver/Moaform). */
const CAPTURE_URL_RE =
  /survey-api\.naver\.com|form\.naver\.com\/.*\/access|answer\.moaform\.com|\/form2|\/next2|moaform\.com\/.*\.json/i;

/**
 * Extract-only browser fallback.
 * Blocks images/fonts/media/analytics to speed extraction.
 * Captures Naver/Moaform JSON API responses for parsers (injected into HTML).
 * NEVER use this for evidence/screenshot capture paths.
 */
export async function fetchHtmlWithExtractBrowser(
  url: string,
): Promise<
  | { ok: true; html: string; finalUrl: string; capturedJson: CapturedNetworkJson[] }
  | { ok: false; reason: string }
> {
  const timeoutMs =
    (getJobWorkerConfig().browserExtractTimeoutSeconds || 30) * 1000;
  const isNaverForm = /form\.naver\.com/i.test(url);
  const isMoaform = /moaform\.com|surveyl\.ink|answer\.moaform/i.test(url);
  const isSpaForm = isNaverForm || isMoaform;

  try {
    return await withTimeout(
      (async () => {
        const browser = await launchCaptureBrowser();
        try {
          const page = await browser.newPage();
          const capturedJson: CapturedNetworkJson[] = [];

          page.on("response", (res) => {
            void (async () => {
              try {
                const resUrl = res.url();
                if (!CAPTURE_URL_RE.test(resUrl)) return;
                if (res.status() < 200 || res.status() >= 300) return;
                const ct = String(res.headers()["content-type"] || "");
                if (
                  !/json|javascript|text\/plain/i.test(ct) &&
                  !/\.json(\?|$)/i.test(resUrl) &&
                  !/\/access(\?|$)/i.test(resUrl) &&
                  !/\/form2|\/next2/i.test(resUrl)
                ) {
                  return;
                }
                const text = await res.text();
                if (!text || text.length < 2 || text.length > 2_000_000) return;
                const trimmed = text.trim();
                if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
                const json = JSON.parse(trimmed) as unknown;
                capturedJson.push({ url: resUrl, json });
              } catch {
                /* ignore non-JSON / disposed responses */
              }
            })();
          });

          await page.setRequestInterception(true);
          page.on("request", (req) => {
            const type = req.resourceType();
            const reqUrl = req.url();
            const blockType =
              BLOCKED_RESOURCE_TYPES.has(type) &&
              !(isSpaForm && type === "stylesheet");
            if (blockType || BLOCKED_URL_RE.test(reqUrl)) {
              void req.abort();
              return;
            }
            void req.continue();
          });

          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: Math.min(timeoutMs, 25_000),
          });
          await page
            .waitForNetworkIdle({ idleTime: 700, timeout: 8_000 })
            .catch(() => undefined);

          if (isNaverForm) {
            await page
              .waitForSelector(
                ".question_area, .questionnaire_item, .question_title, #content.questionnaire, [qid], button, [role='button']",
                { timeout: 10_000 },
              )
              .catch(() => undefined);
            await new Promise((r) => setTimeout(r, 800));
          } else if (isMoaform) {
            await page
              .waitForSelector(
                "button.AnswerButton, [class*='Question'], [class*='BlockContent'], .js-question, textarea, input",
                { timeout: 8_000 },
              )
              .catch(() => undefined);
            await new Promise((r) => setTimeout(r, 700));
          } else {
            await new Promise((r) => setTimeout(r, 1500));
          }

          // Allow in-flight response handlers to finish.
          await new Promise((r) => setTimeout(r, 300));

          let html = await page.content();
          const finalUrl = page.url();
          html = injectCapturedNetworkJsonIntoHtml(html, capturedJson);
          await page.close().catch(() => undefined);
          if (!html || html.length < 200) {
            return {
              ok: false as const,
              reason: "browser extract returned empty HTML",
            };
          }
          return {
            ok: true as const,
            html,
            finalUrl,
            capturedJson,
          };
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