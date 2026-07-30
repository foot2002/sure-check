import type { Browser, Page } from "puppeteer-core";
import {
  CAPTURE_SERVERLESS_VIEWPORT,
  EVIDENCE_FULL_MAX_PAGES,
  isServerlessCaptureRuntime,
} from "@/lib/evidence/capture/captureConfig";
import type { CaptureScreenshot } from "@/lib/evidence/capture/captureTypes";
import { applyKoreanFontsToPage } from "@/lib/evidence/capture/koreanFonts";
import { captureFullPage } from "@/lib/evidence/capture/screenshotCapture";
import type { CapturePageMeta } from "@/lib/evidence/capture/captureTypes";
import { classifyQuestionRisk } from "@/lib/evidence/capture/pageQuestionScan";

export type GoogleLoadDataQuestion = {
  id: string;
  type: number;
  title: string;
  options: string[];
};

export type GoogleLoadDataPage = {
  pageNumber: number;
  questions: GoogleLoadDataQuestion[];
};

export type GoogleLoadDataForm = {
  formTitle: string;
  formUrl: string;
  pages: GoogleLoadDataPage[];
};

const TYPE_LABEL: Record<number, string> = {
  0: "단답형",
  1: "장문형",
  2: "객관식",
  3: "드롭다운",
  4: "체크박스",
  5: "선형 배율",
  6: "제목/설명",
  7: "격자",
  9: "날짜",
  10: "시간",
  11: "파일 업로드",
};

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function collectOptionLabels(node: unknown, out: string[], depth = 0): void {
  if (out.length >= 30 || depth > 6) return;
  if (typeof node === "string") {
    const t = stripHtml(node);
    if (t && t.length < 120) out.push(t);
    return;
  }
  if (!Array.isArray(node)) return;
  // Common MC shape: [optionId, [[label], [label], ...], ...]
  if (
    node.length >= 2 &&
    typeof node[0] === "number" &&
    Array.isArray(node[1]) &&
    node[1].length > 0 &&
    Array.isArray(node[1][0])
  ) {
    for (const opt of node[1]) {
      if (Array.isArray(opt) && opt[0] != null) {
        const t = stripHtml(String(opt[0]));
        if (t) out.push(t);
      }
    }
    return;
  }
  for (const child of node) collectOptionLabels(child, out, depth + 1);
}

export function parseGoogleFormsLoadData(
  data: unknown,
  formUrl: string,
): GoogleLoadDataForm | null {
  if (!Array.isArray(data) || !Array.isArray(data[1])) return null;
  const form = data[1];
  const formTitle = stripHtml(String(form[8] ?? data[3] ?? "Google Forms"));
  const rawQuestions = Array.isArray(form[1]) ? form[1] : [];

  const pages: GoogleLoadDataPage[] = [{ pageNumber: 1, questions: [] }];
  for (const q of rawQuestions) {
    if (!Array.isArray(q)) continue;
    const type = Number(q[3]);
    if (type === 8) {
      pages.push({ pageNumber: pages.length + 1, questions: [] });
      continue;
    }
    const title = stripHtml(String(q[1] ?? ""));
    const options: string[] = [];
    collectOptionLabels(q[4], options);
    pages[pages.length - 1].questions.push({
      id: String(q[0] ?? `${pages.length}-${pages[pages.length - 1].questions.length}`),
      type: Number.isFinite(type) ? type : -1,
      title,
      options: [...new Set(options)].slice(0, 20),
    });
  }

  // Drop trailing empty page created by a final page-break.
  while (
    pages.length > 1 &&
    pages[pages.length - 1].questions.length === 0
  ) {
    pages.pop();
  }

  if (pages.every((p) => p.questions.length === 0) && !formTitle) return null;
  return { formTitle, formUrl, pages };
}

export async function extractGoogleFormsLoadDataFromPage(
  page: Page,
  formUrl: string,
): Promise<GoogleLoadDataForm | null> {
  const fromWindow = await page
    .evaluate(() => {
      const g = globalThis as unknown as { FB_PUBLIC_LOAD_DATA_?: unknown };
      return g.FB_PUBLIC_LOAD_DATA_ ?? null;
    })
    .catch(() => null);
  if (fromWindow) {
    const parsed = parseGoogleFormsLoadData(fromWindow, formUrl);
    if (parsed) return parsed;
  }

  const html = await page.content().catch(() => "");
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/);
  if (!match?.[1]) return null;
  try {
    const data = Function(`"use strict"; return (${match[1]})`)();
    return parseGoogleFormsLoadData(data, formUrl);
  } catch {
    return null;
  }
}

export async function fetchGoogleFormsLoadData(
  formUrl: string,
): Promise<GoogleLoadDataForm | null> {
  const response = await fetch(formUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
    },
    redirect: "follow",
  });
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/);
  if (!match?.[1]) return null;
  try {
    const data = Function(`"use strict"; return (${match[1]})`)();
    return parseGoogleFormsLoadData(data, formUrl);
  } catch {
    return null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildGoogleFormsEvidenceHtml(
  form: GoogleLoadDataForm,
  page: GoogleLoadDataPage,
): string {
  const total = form.pages.length;
  const progressPct = Math.max(
    2,
    Math.round((page.pageNumber / Math.max(total, 1)) * 100),
  );
  const cards = page.questions
    .map((q) => {
      const typeLabel = TYPE_LABEL[q.type] || `유형 ${q.type}`;
      const options =
        q.options.length > 0
          ? `<ul class="opts">${q.options
              .map((o) => `<li><span class="dot"></span>${escapeHtml(o)}</li>`)
              .join("")}</ul>`
          : q.type === 0 || q.type === 1
            ? `<div class="blank">${q.type === 1 ? "장문 응답" : "단답형 응답"}</div>`
            : "";
      return `<section class="card">
  <div class="type">${escapeHtml(typeLabel)}</div>
  <h2>${escapeHtml(q.title || "(제목 없음)")}</h2>
  ${options}
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(form.formTitle)} — ${page.pageNumber}/${total}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#d0e2ff;color:#202124;font-family:'SURECheckKR','Noto Sans KR','Malgun Gothic',sans-serif}
.wrap{max-width:740px;margin:0 auto;padding:24px 16px 48px}
.hero{background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.08);margin-bottom:14px}
.hero .bar{height:10px;background:#673ab7}
.hero .inner{padding:22px 24px 18px}
.hero h1{margin:0 0 8px;font-size:28px;font-weight:700;line-height:1.3}
.hero .meta{font-size:13px;color:#5f6368;line-height:1.5}
.progress{display:flex;align-items:center;gap:12px;margin:14px 0 18px;color:#5f6368;font-size:13px}
.track{flex:1;height:8px;background:#dadce0;border-radius:99px;overflow:hidden}
.fill{height:100%;width:${progressPct}%;background:#ff6d00}
.card{background:#fff;border-radius:8px;padding:18px 22px;margin-bottom:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.card .type{font-size:12px;color:#673ab7;margin-bottom:6px;font-weight:600}
.card h2{margin:0;font-size:16px;font-weight:600;line-height:1.45;white-space:pre-wrap}
.opts{list-style:none;margin:14px 0 0;padding:0}
.opts li{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:14px;border-top:1px solid #f1f3f4}
.opts li:first-child{border-top:0}
.dot{width:18px;height:18px;border:2px solid #5f6368;border-radius:50%;flex:0 0 auto}
.blank{margin-top:12px;border-bottom:1px solid #dadce0;color:#80868b;font-size:13px;padding:8px 0}
.nav{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.btn{background:#673ab7;color:#fff;border:0;border-radius:4px;padding:10px 24px;font-size:14px}
.note{margin-top:16px;font-size:11px;color:#5f6368;line-height:1.4}
</style>
</head>
<body>
<main class="wrap">
  <div class="hero">
    <div class="bar"></div>
    <div class="inner">
      <h1>${escapeHtml(form.formTitle)}</h1>
      <div class="meta">Google Forms · 신고 증빙용 화면 재구성<br/>원본 URL: ${escapeHtml(form.formUrl)}</div>
    </div>
  </div>
  <div class="progress">
    <div class="track"><div class="fill"></div></div>
    <div>${page.pageNumber}/${total}페이지</div>
  </div>
  ${cards || `<section class="card"><h2>(이 페이지에 표시할 문항이 없습니다)</h2></section>`}
  <div class="nav"><button class="btn" type="button">${page.pageNumber >= total ? "제출" : "다음"}</button></div>
  <p class="note">배포 환경(Chromium)에서 Google Forms 라이브 뷰어가 빈 껍데기로만 렌더되어, 폼 구조 데이터(FB_PUBLIC_LOAD_DATA_)로 페이지별 증빙 화면을 재구성했습니다. 문항 텍스트·선택지는 원본 설문과 동일합니다.</p>
</main>
</body>
</html>`;
}

function questionsToMeta(
  pageNumber: number,
  shot: CaptureScreenshot,
  questions: GoogleLoadDataQuestion[],
): CapturePageMeta {
  const texts = questions.map((q) => q.title).filter(Boolean);
  const personalInfoQuestions: string[] = [];
  const sensitiveInfoQuestions: string[] = [];
  const highRiskQuestions: string[] = [];
  for (const text of texts) {
    const risk = classifyQuestionRisk(text);
    if (risk === "직접식별정보" || risk === "준식별정보") {
      personalInfoQuestions.push(text);
    } else if (risk === "민감정보") {
      sensitiveInfoQuestions.push(text);
    } else if (risk === "고위험정보") {
      highRiskQuestions.push(text);
    }
  }
  return {
    pageNumber,
    pageTitle: shot.pageTitle,
    capturedUrl: shot.capturedUrl,
    capturedAt: shot.capturedAt,
    screenshotFileName: shot.fileName,
    provider: "google_forms",
    detectedQuestions: texts,
    visibleQuestions: texts,
    personalInfoQuestions,
    sensitiveInfoQuestions,
    highRiskQuestions,
    temporaryAnswersUsed: false,
    temporaryAnswersUsedAfterCapture: false,
    temporaryAnswerTypes: [],
    finalSubmitDetected: false,
    finalSubmitClicked: false,
  };
}

/**
 * Serverless-safe Google Forms capture: render each section from
 * FB_PUBLIC_LOAD_DATA_ via setContent (avoids empty freebird shells).
 */
export async function captureGoogleFormsViaLoadData(input: {
  browser: Browser;
  formUrl: string;
  existingPage?: Page;
  maxPages?: number;
}): Promise<{
  form: GoogleLoadDataForm;
  screenshots: CaptureScreenshot[];
  pageMetas: CapturePageMeta[];
  limitations: string[];
}> {
  const limitations: string[] = [
    "배포 환경에서는 Google Forms 라이브 뷰어 대신 폼 구조 데이터로 페이지별 증빙 화면을 재구성했습니다.",
    "문항·선택지 텍스트는 원본 Google Forms 데이터와 동일하며, 최종 제출은 수행하지 않았습니다.",
  ];

  // Prefer fetch — avoids depending on a Trusted-Types-locked viewer document.
  const form =
    (await fetchGoogleFormsLoadData(input.formUrl)) ||
    (input.existingPage
      ? await extractGoogleFormsLoadDataFromPage(
          input.existingPage,
          input.formUrl,
        )
      : null);

  if (!form || form.pages.length === 0) {
    throw new Error("Google Forms FB_PUBLIC_LOAD_DATA_를 파싱하지 못했습니다.");
  }

  const maxPages = Math.min(
    input.maxPages ?? EVIDENCE_FULL_MAX_PAGES,
    form.pages.length,
    EVIDENCE_FULL_MAX_PAGES,
  );

  const page = await input.browser.newPage();
  if (isServerlessCaptureRuntime()) {
    await page.setViewport(CAPTURE_SERVERLESS_VIEWPORT).catch(() => undefined);
  }

  const screenshots: CaptureScreenshot[] = [];
  const pageMetas: CapturePageMeta[] = [];

  try {
    for (let i = 0; i < maxPages; i += 1) {
      const section = form.pages[i];
      const html = buildGoogleFormsEvidenceHtml(form, section);
      // Must use a blank page — Google Forms enforces Trusted Types and rejects
      // setContent/document.write on the live viewer document.
      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      // Inject Hangul faces after setContent (not embedded in HTML) to avoid
      // crashing single-process Chromium with repeated ~0.7MB CSS payloads.
      await applyKoreanFontsToPage(page);
      await new Promise((r) => setTimeout(r, 150));
      const shot = await captureFullPage(
        page,
        section.pageNumber,
        "evidence_full_walkthrough",
      );
      // Keep capturedUrl pointing at the real survey for evidence metadata.
      shot.capturedUrl = input.formUrl;
      shot.finalUrl = input.formUrl;
      screenshots.push(shot);
      pageMetas.push(
        questionsToMeta(section.pageNumber, shot, section.questions),
      );
    }
  } finally {
    await page.close().catch(() => undefined);
  }

  limitations.push(
    `폼 구조 기준 ${form.pages.length}개 섹션 중 ${screenshots.length}개 화면을 재구성 캡처했습니다.`,
  );

  return { form, screenshots, pageMetas, limitations };
}

export async function isGoogleFormsEmptyShell(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const hasJsNav = Boolean(
        document.querySelector('[jsname="OCpkoe"], [jsname="M2UYVd"]'),
      );
      const interactive = document.querySelector(
        '[role="radio"], [role="checkbox"], textarea, input:not([type="hidden"])',
      );
      const titles = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".freebirdFormviewerComponentsQuestionBaseTitle, .M7eMe",
        ),
      ).filter((el) => {
        const t = (el.innerText || "").trim();
        const r = el.getBoundingClientRect();
        return t.length > 1 && r.width > 2 && r.height > 2;
      });
      const bodyLen = (document.body?.innerText || "")
        .replace(/\s+/g, " ")
        .trim().length;
      // Empty shell: progress/chrome text only, no interactive controls / titles.
      return !hasJsNav && !interactive && titles.length === 0 && bodyLen < 800;
    })
    .catch(() => true);
}
