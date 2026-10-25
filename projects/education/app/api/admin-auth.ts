import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const adminSessionSeconds = 8 * 60 * 60;
const localCookie = "relight-admin-local";
const secureCookie = "__Host-relight-admin";

function equal(a: string, b: string) {
  return Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function adminTokenAllowed(value: unknown) {
  const expected = process.env.WALL_ADMIN_TOKEN;
  return Boolean(expected && typeof value === "string" && value.length <= 4096 && equal(expected, value));
}

export function requestOrigin(request: Request) {
  // Next's development adapter may reconstruct request.url with localhost even
  // when the browser uses 127.0.0.1. Host is the actual HTTP authority; browsers
  // cannot forge it independently of their destination.
  const url = new URL(request.url);
  return `${url.protocol}//${request.headers.get("host") || url.host}`;
}

export function sameOrigin(request: Request) {
  try {
    return request.headers.get("origin") === requestOrigin(request) && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}

function sign(value: string) {
  const secret = process.env.WALL_ADMIN_TOKEN;
  if (!secret) throw new Error("ADMIN_CONFIGURATION_REQUIRED");
  return createHmac("sha256", secret).update(`relight-admin-session:v1:${value}`).digest("base64url");
}

export function createAdminSession(now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + adminSessionSeconds}.${randomBytes(32).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export function validAdminSession(value: string | undefined, now = Date.now()) {
  if (!value || !process.env.WALL_ADMIN_TOKEN || value.length > 160) return false;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return false;
  const expires = Number(match[1]), seconds = Math.floor(now / 1000);
  return expires > seconds && expires <= seconds + adminSessionSeconds && equal(sign(`${match[1]}.${match[2]}`), match[3]);
}

export function adminCookie(request: Request, value: string, clear = false) {
  const secure = new URL(request.url).protocol === "https:";
  return `${secure ? secureCookie : localCookie}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : adminSessionSeconds}${secure ? "; Secure" : ""}`;
}

export function adminAllowed(request: Request) {
  // Explicit bearer credentials remain supported for operational scripts.
  const authorization = request.headers.get("authorization");
  if (authorization !== null) return /^Bearer /i.test(authorization) && adminTokenAllowed(authorization.slice(7));
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request)) return false;
  const name = new URL(request.url).protocol === "https:" ? secureCookie : localCookie;
  const cookie = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return validAdminSession(cookie);
}
