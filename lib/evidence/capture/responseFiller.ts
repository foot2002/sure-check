import { existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ElementHandle, Frame, Page } from "puppeteer-core";
import { TEMP_ANSWER } from "@/lib/evidence/capture/captureConfig";
import type { CaptureAnswerType } from "@/lib/evidence/capture/captureTypes";
import { getSearchContexts } from "@/lib/evidence/capture/fullWalkthrough/captureTrace";

const DUMMY_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
178
%%EOF`,
  "utf8",
);
const DUMMY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const DUMMY_TXT = Buffer.from("sure-check evidence capture placeholder\n", "utf8");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDummyFiles(): {
  pdfPath: string;
  pngPath: string;
  txtPath: string;
} {
  const dir = join(tmpdir(), "sure-check-evidence-capture");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const pdfPath = join(dir, "evidence-dummy.pdf");
  const pngPath = join(dir, "evidence-dummy.png");
  const txtPath = join(dir, "evidence-dummy.txt");
  if (!existsSync(pdfPath)) writeFileSync(pdfPath, DUMMY_PDF);
  if (!existsSync(pngPath)) writeFileSync(pngPath, DUMMY_PNG);
  if (!existsSync(txtPath)) writeFileSync(txtPath, DUMMY_TXT);
  return { pdfPath, pngPath, txtPath };
}

async function puppeteerClickMarked(ctx: Page | Frame): Promise<number> {
  const handles = await ctx.$$('[data-sure-fill="1"]');
  let clicked = 0;
  for (const handle of handles) {
    try {
      await handle.evaluate((el) => {
        (el as HTMLElement).scrollIntoView({
          block: "center",
          inline: "nearest",
        });
      });
      await handle.click({ delay: 12 });
      clicked += 1;
      await sleep(30);
    } catch {
      /* ignore */
    } finally {
      await handle.dispose().catch(() => undefined);
    }
  }
  await ctx
    .evaluate(() => {
      document
        .querySelectorAll('[data-sure-fill="1"]')
        .forEach((el) => el.removeAttribute("data-sure-fill"));
    })
    .catch(() => undefined);
  return clicked;
}

async function uploadDummyFiles(page: Page): Promise<number> {
  const { pdfPath, pngPath, txtPath } = ensureDummyFiles();
  const contexts = await getSearchContexts(page);
  let uploaded = 0;
  for (const ctx of contexts) {
    const handles = (await ctx.$$(
      "input[type='file']:not(:disabled)",
    )) as ElementHandle<HTMLInputElement>[];
    for (const handle of handles) {
      try {
        const state = await handle.evaluate((el) => {
          const accept = (el.getAttribute("accept") || "").toLowerCase();
          const already = Boolean(el.files && el.files.length > 0);
          const rect = el.getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0;
          return { accept, already, visible };
        });
        if (state.already || !state.visible) continue;
        const path = /\.pdf/i.test(state.accept)
          ? pdfPath
          : /\.(png|jpe?g|gif|webp)/i.test(state.accept)
            ? pngPath
            : /\.txt/i.test(state.accept)
              ? txtPath
              : pdfPath;
        await handle.uploadFile(path);
        await handle.evaluate((el) => {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        });
        uploaded += 1;
        await sleep(60);
      } catch {
        /* ignore */
      } finally {
        await handle.dispose().catch(() => undefined);
      }
    }
  }
  return uploaded;
}

export interface FillResult {
  filled: number;
  types: CaptureAnswerType[];
}

export interface FillOptions {
  preferAlternateChoice?: boolean;
}

/**
 * Evidence full-walkthrough only: synthetic answers to unlock Next.
 * Scans page + iframes. Never used by safe_public_only mode.
 */
export async function fillTemporaryAnswers(
  page: Page,
  options: FillOptions = {},
): Promise<FillResult> {
  const types = new Set<CaptureAnswerType>();
  const temps = TEMP_ANSWER;
  const preferAlt = Boolean(options.preferAlternateChoice);
  let totalFilled = 0;
  let totalClicked = 0;

  const contexts = await getSearchContexts(page);
  for (const ctx of contexts) {
    await ctx
      .evaluate(() => {
        document
          .querySelectorAll("[data-sure-fill]")
          .forEach((el) => el.removeAttribute("data-sure-fill"));
      })
      .catch(() => undefined);

    const marked = await ctx
      .evaluate(
        (temp, preferAlternate) => {
          const used: string[] = [];
          let count = 0;

          const isVisible = (el: HTMLElement) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none"
            );
          };

          const mark = (el: HTMLElement, kind: string) => {
            if (!isVisible(el)) return;
            el.setAttribute("data-sure-fill", "1");
            used.push(kind);
            count += 1;
          };

          const setNativeValue = (
            input: HTMLInputElement | HTMLTextAreaElement,
            value: string,
          ) => {
            const proto =
              input.tagName === "TEXTAREA"
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, "value");
            desc?.set?.call(input, value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          };

          const contextOf = (el: Element): string => {
            const root =
              el.closest(".js-question") ||
              el.closest(".wf-pv-question-choice-wrapper") ||
              el.closest('[role="listitem"]') ||
              el.closest(".question_area") ||
              el.closest(".questionnaire_item") ||
              el.parentElement;
            return (root?.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 200);
          };

          const placeholderFor = (
            el: Element,
          ): { value: string; kind: string } => {
            const ctxText = `${contextOf(el)} ${(el as HTMLInputElement).placeholder || ""} ${(el as HTMLInputElement).type || ""}`;
            if (
              /이메일|e-?mail/i.test(ctxText) ||
              (el as HTMLInputElement).type === "email"
            ) {
              return { value: temp.email, kind: "email" };
            }
            if (
              /연락처|전화|휴대폰|핸드폰|tel/i.test(ctxText) ||
              (el as HTMLInputElement).type === "tel"
            ) {
              return { value: temp.phone, kind: "tel" };
            }
            if (/성명|이름/i.test(ctxText)) {
              return { value: temp.name, kind: "text" };
            }
            if (/주소|거주지|소재지/i.test(ctxText)) {
              return { value: temp.address, kind: "text" };
            }
            if (
              /날짜|date/i.test(ctxText) ||
              (el as HTMLInputElement).type === "date"
            ) {
              return { value: temp.date, kind: "date" };
            }
            if (
              /숫자|인원|연령|나이|매출|근로|number/i.test(ctxText) ||
              (el as HTMLInputElement).type === "number"
            ) {
              return { value: temp.number, kind: "number" };
            }
            return { value: temp.freeText, kind: "text" };
          };

          const moaGroups = new Map<Element, HTMLElement[]>();
          for (const li of Array.from(
            document.querySelectorAll<HTMLElement>(
              "li.select-one-and-many, li.wf-style-mutiplechoice, li[class*='choice'], label.option, .option_item",
            ),
          )) {
            const group =
              li.closest("ul") ||
              li.closest(".js-question") ||
              li.closest(".question_area") ||
              li.parentElement;
            if (!group) continue;
            const list = moaGroups.get(group) ?? [];
            list.push(li);
            moaGroups.set(group, list);
          }
          for (const [, options] of moaGroups) {
            const selected = options.some(
              (o) =>
                o.classList.contains("selected") ||
                o.classList.contains("active") ||
                o.getAttribute("aria-checked") === "true",
            );
            if (selected || options.length === 0) continue;
            const pick =
              preferAlternate && options.length > 1 ? options[1] : options[0];
            mark(pick, "radio");
          }

          for (const group of Array.from(
            document.querySelectorAll<HTMLElement>('[role="radiogroup"]'),
          )) {
            if (group.querySelector('[role="radio"][aria-checked="true"]')) {
              continue;
            }
            const options = Array.from(
              group.querySelectorAll<HTMLElement>('[role="radio"]'),
            ).filter(isVisible);
            if (options.length === 0) continue;
            const pick =
              preferAlternate && options.length > 1
                ? options[1]
                : options.length >= 5
                  ? options[Math.floor(options.length / 2)]
                  : options[0];
            mark(pick, options.length >= 5 ? "scale" : "radio");
          }

          const loneRadios = Array.from(
            document.querySelectorAll<HTMLElement>('[role="radio"]'),
          ).filter(
            (el) => !el.closest('[role="radiogroup"]') && isVisible(el),
          );
          const loneGroups = new Map<Element, HTMLElement[]>();
          for (const radio of loneRadios) {
            const root =
              radio.closest('[role="listitem"]') ||
              radio.closest(".js-question") ||
              radio.parentElement ||
              radio;
            const list = loneGroups.get(root) ?? [];
            list.push(radio);
            loneGroups.set(root, list);
          }
          for (const [, options] of loneGroups) {
            if (options.some((o) => o.getAttribute("aria-checked") === "true")) {
              continue;
            }
            const pick =
              preferAlternate && options.length > 1 ? options[1] : options[0];
            if (pick) mark(pick, "radio");
          }

          const radioMap = new Map<string, HTMLInputElement[]>();
          for (const radio of Array.from(
            document.querySelectorAll<HTMLInputElement>(
              'input[type="radio"]:not(:disabled)',
            ),
          )) {
            if (!isVisible(radio)) continue;
            const key = radio.name || radio.id || "anon";
            const list = radioMap.get(key) ?? [];
            list.push(radio);
            radioMap.set(key, list);
          }
          for (const group of radioMap.values()) {
            if (group.some((r) => r.checked)) continue;
            const pick =
              preferAlternate && group.length > 1 ? group[1] : group[0];
            if (pick) mark(pick, "radio");
          }

          for (const item of Array.from(
            document.querySelectorAll<HTMLElement>(
              '[role="listitem"], .js-question, .question_area, .questionnaire_item',
            ),
          )) {
            if (item.parentElement?.closest('[role="listitem"]')) continue;
            const boxes = Array.from(
              item.querySelectorAll<HTMLElement>(
                '[role="checkbox"], input[type="checkbox"]',
              ),
            ).filter(isVisible);
            if (boxes.length < 1) continue;
            const needMatch = (item.textContent || "").match(/최소\s*(\d+)\s*개/);
            const need = needMatch ? Math.max(1, Number(needMatch[1]) || 1) : 1;
            let have = boxes.filter(
              (b) =>
                b.getAttribute("aria-checked") === "true" ||
                (b as HTMLInputElement).checked,
            ).length;
            for (const box of boxes) {
              if (have >= need) break;
              if (
                box.getAttribute("aria-checked") === "true" ||
                (box as HTMLInputElement).checked
              ) {
                continue;
              }
              mark(box, "checkbox");
              have += 1;
            }
          }

          for (const select of Array.from(
            document.querySelectorAll<HTMLSelectElement>("select:not(:disabled)"),
          )) {
            if (!isVisible(select)) continue;
            if (select.selectedIndex > 0) continue;
            const option = Array.from(select.options).find(
              (o, idx) => idx > 0 && Boolean(o.value),
            );
            if (!option) continue;
            select.value = option.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            used.push("select");
            count += 1;
          }

          for (const box of Array.from(
            document.querySelectorAll<HTMLElement>(
              '[role="listbox"], [role="combobox"]',
            ),
          )) {
            if (!isVisible(box)) continue;
            const text = (box.textContent || "").replace(/\s+/g, " ").trim();
            if (text && !/선택|choose|select|옵션/i.test(text)) continue;
            mark(box, "select");
          }

          for (const input of Array.from(
            document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
              'input[type="text"]:not(:disabled), input[type="email"]:not(:disabled), input[type="tel"]:not(:disabled), input[type="number"]:not(:disabled), input[type="date"]:not(:disabled), input:not([type]):not(:disabled), textarea:not(:disabled)',
            ),
          )) {
            const type = (input.getAttribute("type") || "text").toLowerCase();
            if (
              [
                "hidden",
                "password",
                "file",
                "submit",
                "button",
                "radio",
                "checkbox",
              ].includes(type)
            ) {
              continue;
            }
            if (!isVisible(input)) continue;
            if (input.value?.trim()) continue;
            const { value, kind } = placeholderFor(input);
            input.focus();
            setNativeValue(input, value);
            used.push(kind);
            count += 1;
            if (count >= 80) break;
          }

          for (const el of Array.from(
            document.querySelectorAll<HTMLElement>(
              '[contenteditable="true"], div[role="textbox"]',
            ),
          )) {
            if (!isVisible(el)) continue;
            if ((el.textContent || "").trim()) continue;
            el.focus();
            el.textContent = temp.freeText;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            used.push("contenteditable");
            count += 1;
          }

          return { count, used };
        },
        temps,
        preferAlt,
      )
      .catch(() => ({ count: 0, used: [] as string[] }));

    for (const t of marked.used) {
      types.add(t as CaptureAnswerType);
    }
    totalFilled += marked.count;
    totalClicked += await puppeteerClickMarked(ctx);

    await ctx
      .evaluate(() => {
        const options = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="option"], .exportOption, .MocG8c',
          ),
        );
        for (const opt of options) {
          const text = (opt.textContent || "").replace(/\s+/g, " ").trim();
          if (!text || /선택|choose|select/i.test(text)) continue;
          opt.click();
          break;
        }
      })
      .catch(() => undefined);
  }

  const uploaded = await uploadDummyFiles(page);
  if (uploaded > 0) types.add("file");

  return {
    filled: totalFilled + totalClicked + uploaded,
    types: [...types],
  };
}
