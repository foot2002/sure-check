import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Frame, Page } from "puppeteer-core";
import type { CaptureProvider } from "@/lib/evidence/capture/captureTypes";

export type CaptureStopReason =
  | "submit_detected"
  | "submit_detected_on_first_page"
  | "next_button_not_found"
  | "required_fill_failed"
  | "validation_error_remained"
  | "page_transition_failed"
  | "branch_or_validation_stop"
  | "iframe_not_handled"
  | "dynamic_render_timeout"
  | "max_pages_reached"
  | "timeout"
  | "url_safety_blocked"
  | "capture_error"
  | "unknown_stop_reason";

export interface CaptureTraceEvent {
  step: number;
  provider: CaptureProvider;
  pageNumber: number;
  url: string;
  action:
    | "page_loaded"
    | "page_captured"
    | "questions_extracted"
    | "buttons_detected"
    | "controls_detected"
    | "submit_detected"
    | "next_detected"
    | "fill_attempted"
    | "fill_completed"
    | "next_clicked"
    | "page_transition_detected"
    | "validation_error_detected"
    | "retry_fill_attempted"
    | "stopped"
    | "timeout"
    | "error"
    | "submit_request_blocked"
    | "branch_retry";
  visibleQuestionCount?: number;
  visibleQuestions?: string[];
  buttons?: Array<{
    text: string;
    role?: string;
    visible: boolean;
    enabled: boolean;
    isNextCandidate?: boolean;
    isSubmitCandidate?: boolean;
  }>;
  controls?: Array<{
    type: string;
    label?: string;
    required?: boolean;
    visible: boolean;
    filled?: boolean;
  }>;
  validationErrors?: string[];
  decision?: string;
  reason?: string;
  screenshotPath?: string;
  domPath?: string;
  timestamp: string;
}

export interface CaptureDebugSummary {
  provider: CaptureProvider;
  mode: "evidence_full_walkthrough";
  surveyUrl: string;
  expectedPageCount: number | null;
  capturedPageCount: number;
  captureCompleteness: "complete" | "partial" | "failed";
  stopReason: CaptureStopReason;
  stopPage: number | null;
  validationErrors: string[];
  finalSubmitDetected: boolean;
  finalSubmitClicked: false;
  blockedSubmitRequestCount: number;
  temporaryAnswersUsed: boolean;
  limitations: string[];
  events: CaptureTraceEvent[];
  startedAt: string;
  finishedAt: string;
}

export class CaptureDebugSession {
  readonly outDir: string;
  readonly events: CaptureTraceEvent[] = [];
  step = 0;
  blockedSubmitRequestCount = 0;
  stopReason: CaptureStopReason = "unknown_stop_reason";
  stopPage: number | null = null;
  lastValidationErrors: string[] = [];

  constructor(providerFolder: string) {
    this.outDir = join(process.cwd(), "tmp", "capture-debug", providerFolder);
    mkdirSync(this.outDir, { recursive: true });
  }

  nextStep(): number {
    this.step += 1;
    return this.step;
  }

  push(event: Omit<CaptureTraceEvent, "step" | "timestamp"> & { step?: number }) {
    const full: CaptureTraceEvent = {
      ...event,
      step: event.step ?? this.step,
      timestamp: new Date().toISOString(),
    };
    this.events.push(full);
    return full;
  }

  writeJson(name: string, data: unknown) {
    writeFileSync(
      join(this.outDir, name),
      `${JSON.stringify(data, null, 2)}\n`,
      "utf8",
    );
  }

  writeText(name: string, text: string) {
    writeFileSync(join(this.outDir, name), text, "utf8");
  }

  writeBuffer(name: string, buf: Buffer) {
    writeFileSync(join(this.outDir, name), buf);
  }

  setStop(reason: CaptureStopReason, page: number | null, detail?: string) {
    if (this.stopReason === "unknown_stop_reason" || reason !== "unknown_stop_reason") {
      this.stopReason = reason;
    }
    this.stopPage = page;
    this.push({
      step: this.step || this.nextStep(),
      provider: "generic",
      pageNumber: page ?? 0,
      url: "",
      action: "stopped",
      decision: reason,
      reason: detail || reason,
    });
  }

  writeSummary(summary: Omit<CaptureDebugSummary, "events" | "blockedSubmitRequestCount"> & {
    blockedSubmitRequestCount?: number;
  }) {
    const full: CaptureDebugSummary = {
      ...summary,
      blockedSubmitRequestCount:
        summary.blockedSubmitRequestCount ?? this.blockedSubmitRequestCount,
      events: this.events,
    };
    this.writeJson("capture-debug-summary.json", full);
    return full;
  }
}

export async function getSearchContexts(
  page: Page,
): Promise<Array<Page | Frame>> {
  const frames = page.frames().filter((f) => {
    try {
      return Boolean(f.url());
    } catch {
      return false;
    }
  });
  // Prefer unique frames; page.mainFrame is included in frames()
  const seen = new Set<string>();
  const out: Array<Page | Frame> = [page];
  for (const frame of frames) {
    const key = `${frame.url()}::${frame.name()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (frame === page.mainFrame()) continue;
    out.push(frame);
  }
  return out;
}

const NEXT_RE =
  /^(다음|다음\s*페이지|계속|다음으로|다음\s*단계|시작하기|시작|설문\s*시작|참여하기|응답하기|next|continue|start)$/i;
const NEXT_SOFT =
  /(다음\s*페이지|다음으로|다음\s*단계|시작하기|설문\s*시작|참여하기|응답하기|\bnext\b|\bcontinue\b|\bstart\b|^다음$|^시작$)/i;
const SUBMIT_RE =
  /^(제출|보내기|완료|완료하기|응답\s*제출|확인\s*및\s*제출|submit|send|finish|done)$/i;
const SUBMIT_SOFT =
  /(제출|보내기|완료하기|응답\s*제출|확인\s*및\s*제출|\bsubmit\b|\bsend\b|\bfinish\b|\bdone\b)/i;
const FORBIDDEN =
  /이전|뒤로|back|prev|초기화|로그인|login|sign\s*in/i;

export async function dumpPageDebugArtifacts(
  page: Page,
  session: CaptureDebugSession,
  meta: {
    provider: CaptureProvider;
    pageNumber: number;
    step: number;
  },
): Promise<{
  buttons: CaptureTraceEvent["buttons"];
  controls: CaptureTraceEvent["controls"];
  visibleText: string;
  padded: string;
}> {
  const padded = String(meta.step).padStart(3, "0");
  const contexts = await getSearchContexts(page);

  let buttons: NonNullable<CaptureTraceEvent["buttons"]> = [];
  let controls: NonNullable<CaptureTraceEvent["controls"]> = [];
  let visibleText = "";
  let domHtml = "";

  for (const ctx of contexts) {
    try {
      const part = await ctx.evaluate(
        (nextExact, nextSoft, submitExact, submitSoft, forbidden) => {
          const nextE = new RegExp(nextExact, "i");
          const nextS = new RegExp(nextSoft, "i");
          const subE = new RegExp(submitExact, "i");
          const subS = new RegExp(submitSoft, "i");
          const forb = new RegExp(forbidden, "i");

          const btnNodes = Array.from(
            document.querySelectorAll(
              'button, a, [role="button"], input[type="button"], input[type="submit"], div[role="button"], span[role="button"]',
            ),
          );
          const buttons = btnNodes.slice(0, 80).map((el) => {
            const html = el as HTMLElement;
            const text = (
              html.innerText ||
              html.getAttribute("aria-label") ||
              (html as HTMLInputElement).value ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 80);
            const rect = html.getBoundingClientRect();
            const visible =
              rect.width > 1 &&
              rect.height > 1 &&
              getComputedStyle(html).visibility !== "hidden";
            const enabled =
              !html.hasAttribute("disabled") &&
              html.getAttribute("aria-disabled") !== "true";
            const isSubmit =
              Boolean(text) &&
              !forb.test(text) &&
              (subE.test(text) || subS.test(text));
            const isNext =
              Boolean(text) &&
              !forb.test(text) &&
              !isSubmit &&
              (nextE.test(text) || nextS.test(text));
            return {
              text,
              role: html.getAttribute("role") || html.tagName.toLowerCase(),
              visible,
              enabled,
              isNextCandidate: isNext,
              isSubmitCandidate: isSubmit,
            };
          });

          const controlNodes = Array.from(
            document.querySelectorAll(
              'input:not([type="hidden"]), textarea, select, [role="radio"], [role="checkbox"], [role="listbox"], [role="combobox"], [contenteditable="true"]',
            ),
          );
          const controls = controlNodes.slice(0, 100).map((el) => {
            const html = el as HTMLElement;
            const rect = html.getBoundingClientRect();
            const visible =
              rect.width > 0 &&
              rect.height > 0 &&
              getComputedStyle(html).visibility !== "hidden";
            const type =
              html.getAttribute("role") ||
              (html as HTMLInputElement).type ||
              html.tagName.toLowerCase();
            const label = (
              html.getAttribute("aria-label") ||
              html.getAttribute("placeholder") ||
              ""
            ).slice(0, 80);
            const required =
              html.hasAttribute("required") ||
              html.getAttribute("aria-required") === "true";
            let filled = false;
            if (
              html instanceof HTMLInputElement ||
              html instanceof HTMLTextAreaElement
            ) {
              filled = Boolean(html.value?.trim());
            } else if (html.getAttribute("aria-checked") === "true") {
              filled = true;
            }
            return { type, label, required, visible, filled };
          });

          return {
            buttons,
            controls,
            text: (document.body?.innerText || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 12000),
            html: document.documentElement?.outerHTML?.slice(0, 500_000) || "",
          };
        },
        NEXT_RE.source,
        NEXT_SOFT.source,
        SUBMIT_RE.source,
        SUBMIT_SOFT.source,
        FORBIDDEN.source,
      );

      buttons = [...buttons, ...(part.buttons || [])];
      controls = [...controls, ...(part.controls || [])];
      if ((part.text || "").length > visibleText.length) {
        visibleText = part.text;
      }
      if ((part.html || "").length > domHtml.length) {
        domHtml = part.html;
      }
    } catch {
      /* frame may be detached */
    }
  }

  try {
    const png = await page.screenshot({
      type: "png",
      fullPage: true,
      captureBeyondViewport: true,
    });
    session.writeBuffer(`step_${padded}_before.png`, Buffer.from(png));
  } catch {
    /* ignore screenshot failure */
  }

  session.writeText(`step_${padded}_dom.html`, domHtml || "<!-- empty -->");
  session.writeText(`step_${padded}_visible_text.txt`, visibleText || "");
  session.writeJson(`step_${padded}_buttons.json`, buttons);
  session.writeJson(`step_${padded}_controls.json`, controls);

  session.push({
    step: meta.step,
    provider: meta.provider,
    pageNumber: meta.pageNumber,
    url: page.url(),
    action: "buttons_detected",
    buttons,
  });
  session.push({
    step: meta.step,
    provider: meta.provider,
    pageNumber: meta.pageNumber,
    url: page.url(),
    action: "controls_detected",
    controls,
  });

  return { buttons, controls, visibleText, padded };
}
