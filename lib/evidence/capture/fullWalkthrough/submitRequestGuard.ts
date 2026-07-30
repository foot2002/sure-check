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
 * Observe submit-like traffic without request interception.
 *
 * IMPORTANT: `page.setRequestInterception(true)` breaks Google Forms hydration
 * on @sparticuz/chromium (empty freebird shell, no Next, detached frames).
 * Primary defense remains: never click the final Submit control.
 */
export async function installSubmitRequestGuard(
  page: Page,
  hooks: SubmitGuardHooks,
): Promise<void> {
  page.on("request", (request: HTTPRequest) => {
    try {
      const url = request.url();
      const method = request.method().toUpperCase();
      const lastClickLabel = hooks.getLastClickLabel?.() ?? null;

      if (/docs\.google\.com\/forms/i.test(url) && /formResponse/i.test(url)) {
        hooks.onFormResponseSeen?.({ url, method, lastClickLabel });
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
        // Cannot abort without interception; record only.
        hooks.onBlocked(url);
      }
    } catch {
      // ignore observer errors
    }
  });
}
