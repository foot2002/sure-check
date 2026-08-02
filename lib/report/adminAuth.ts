import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "sure_report_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getPassword(): string {
  return process.env.REPORT_ADMIN_PASSWORD?.trim() || "";
}

function getSessionSecret(): string {
  const secret = process.env.REPORT_ADMIN_SESSION_SECRET?.trim();
  if (secret) return secret;
  // Fallback only for local misconfig — still requires password to mint cookies.
  return getPassword() ? `fallback:${getPassword()}` : "";
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(getPassword() && getSessionSecret());
}

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyAdminPassword(password: string): boolean {
  const expected = getPassword();
  if (!expected || !password) return false;
  return safeEqual(password, expected);
}

export function mintAdminSessionToken(nowMs = Date.now()): string {
  if (!getSessionSecret()) {
    throw new Error("REPORT_ADMIN_SESSION_SECRET is not configured");
  }
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${exp}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(
  token: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!token || !getSessionSecret()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expRaw, nonce, signature] = parts;
  if (!expRaw || !nonce || !signature) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;
  const payload = `${expRaw}.${nonce}`;
  const expected = sign(payload);
  return safeEqual(signature, expected);
}

export function adminSessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function getAdminSessionFromCookies(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminSessionToken(jar.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function requireAdminSession(): Promise<void> {
  const ok = await getAdminSessionFromCookies();
  if (!ok) {
    const error = new Error("UNAUTHORIZED");
    (error as Error & { status: number }).status = 401;
    throw error;
  }
}

export function unauthorizedJson() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
