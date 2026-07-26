import type { HTTPRequest, Page } from "puppeteer-core";

export type SubmitGuardHooks = {
  onBlocked: (url: string) => void;
  /** Log formResponse (allowed) with optional last-click context. */
  onFormResponseSeen?: (info: {
    url: string;
    method: string;
    lastClickLabel: string | null;
  }) => void;
  getLastClickLabel?: () => string | null;
};

/**
 * Secondary defense only.
 * Primary defense is never clicking submit.
 *
 * Google Forms /formResponse is used for section navigation — never abort it.
 * Log it with last-click context instead.
 */
export async function installSubmitRequestGuard(
  page: Page,
  hooks: SubmitGuardHooks,
): Promise<void> {
  await page.setRequestInterception(true).catch(() => undefined);

  page.on("request", (request: HTTPRequest) => {
    try {
      const url = request.url();
      const method = request.method().toUpperCase();
      const lastClickLabel = hooks.getLastClickLabel?.() ?? null;

      // Google Forms section "Next" also hits formResponse — never abort.
      if (/docs\.google\.com\/forms/i.test(url) && /formResponse/i.test(url)) {
        hooks.onFormResponseSeen?.({ url, method, lastClickLabel });
        void request.continue().catch(() => undefined);
        return;
      }

      const isTerminalSubmitPost =
        method === "POST" &&
        /(?:\/finish(?:\/|$|\?)|\/complete(?:\/|$|\?)|\/submitResponse(?:\/|$|\?))/i.test(
          url,
        ) &&
        !/(next|page|step|progress|answers|start|continue|formResponse)/i.test(
          url,
        );

      if (isTerminalSubmitPost) {
        hooks.onBlocked(url);
        void request.abort("blockedbyclient").catch(() => undefined);
        return;
      }

      void request.continue().catch(() => undefined);
    } catch {
      void request.continue().catch(() => undefined);
    }
  });
}
