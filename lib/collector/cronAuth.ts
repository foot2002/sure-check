/**
 * Shared Cron auth for collector internal endpoints.
 * Never log the secret or Authorization header values.
 */

function uniqueSecrets(): string[] {
  const values = [
    process.env.COLLECTOR_CRON_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((v): v is string => Boolean(v));
  return [...new Set(values)];
}

/** Preferred display/config secret (COLLECTOR first, else Vercel CRON_SECRET). */
export function getCollectorCronExpectedSecret(): string | null {
  return uniqueSecrets()[0] ?? null;
}

export function isCollectorCronAuthConfigured(): boolean {
  return uniqueSecrets().length > 0;
}

/**
 * Accept Bearer or x-collector-cron-secret matching either
 * COLLECTOR_CRON_SECRET or CRON_SECRET (Vercel Cron sends the latter).
 */
export function authorizeCollectorCronRequest(request: Request): boolean {
  const secrets = uniqueSecrets();
  if (secrets.length === 0) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token =
    bearer ||
    request.headers.get("x-collector-cron-secret")?.trim() ||
    "";
  return Boolean(token) && secrets.includes(token);
}
