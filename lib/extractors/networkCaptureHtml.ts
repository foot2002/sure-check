/** HTML injection helpers for browser XHR/fetch JSON capture (extract path). */

export const SURE_CHECK_NETWORK_CAPTURE_ID = "sure-check-network-capture";

export type CapturedNetworkJson = {
  url: string;
  json: unknown;
};

/** Read JSON bodies injected by fetchHtmlWithExtractBrowser. */
export function readCapturedNetworkJsonFromHtml(
  html: string,
): CapturedNetworkJson[] {
  if (!html) return [];
  const re = new RegExp(
    `<script[^>]*id=["']${SURE_CHECK_NETWORK_CAPTURE_ID}["'][^>]*>([\\s\\S]*?)</script>`,
    "i",
  );
  const match = html.match(re);
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is CapturedNetworkJson =>
        Boolean(
          row &&
            typeof row === "object" &&
            typeof (row as CapturedNetworkJson).url === "string" &&
            "json" in (row as object),
        ),
    );
  } catch {
    return [];
  }
}

export function injectCapturedNetworkJsonIntoHtml(
  html: string,
  capturedJson: CapturedNetworkJson[],
): string {
  if (!html || capturedJson.length === 0) return html;
  const payload = JSON.stringify(capturedJson).replace(/</g, "\\u003c");
  const inject = `<script type="application/json" id="${SURE_CHECK_NETWORK_CAPTURE_ID}">${payload}</script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${inject}`);
  }
  return inject + html;
}
