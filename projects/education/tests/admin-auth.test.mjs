import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./helpers/load-typescript.mjs";
const original = process.env.WALL_ADMIN_TOKEN;
process.env.WALL_ADMIN_TOKEN = "test-only-operator-key-32-bytes-minimum";
const auth = await loadTypescript(new URL("../app/api/admin-auth.ts", import.meta.url));
const route = await loadTypescript(new URL("../app/api/admin/session/route.ts", import.meta.url));
const origin = "https://education.example";
const request = (method, options = {}) => new Request(`${origin}/api/admin/session`, { method, ...options });

test("admin session uses signed random tokens, expires, rejects tampering and rotated keys", () => {
  const now = Date.now(), value = auth.createAdminSession(now);
  assert.equal(auth.validAdminSession(value, now), true);
  assert.notEqual(auth.createAdminSession(now), value);
  assert.equal(auth.validAdminSession(value, now + auth.adminSessionSeconds * 1000), false);
  assert.equal(auth.validAdminSession(`${value.slice(0, -1)}!`, now), false);
  assert.equal(auth.validAdminSession("spoofed"), false);
  process.env.WALL_ADMIN_TOKEN = "replacement-test-key";
  assert.equal(auth.validAdminSession(value, now), false);
  process.env.WALL_ADMIN_TOKEN = "test-only-operator-key-32-bytes-minimum";
});

test("production cookie is host-only, secure, HttpOnly, strict and bounded", () => {
  const value = auth.createAdminSession();
  const cookie = auth.adminCookie(request("GET"), value);
  for (const bit of ["__Host-relight-admin=", "Path=/", "HttpOnly", "SameSite=Strict", "Secure", "Max-Age=28800"]) assert.ok(cookie.includes(bit));
  assert.ok(!cookie.includes("Domain="));
  assert.ok(!cookie.includes(process.env.WALL_ADMIN_TOKEN));
  assert.ok(auth.adminCookie(request("GET"), "", true).includes("Max-Age=0"));
});

test("cookie authorization rejects cross-origin writes; bearer scripts remain compatible", () => {
  const cookie = auth.adminCookie(request("GET"), auth.createAdminSession()).split(";")[0];
  assert.equal(auth.adminAllowed(request("GET", { headers: { cookie } })), true);
  assert.equal(auth.adminAllowed(request("DELETE", { headers: { cookie } })), false);
  assert.equal(auth.adminAllowed(request("DELETE", { headers: { cookie, origin: "https://attacker.example" } })), false);
  assert.equal(auth.adminAllowed(request("DELETE", { headers: { cookie, origin } })), true);
  assert.equal(auth.adminAllowed(request("DELETE", { headers: { authorization: `Bearer ${process.env.WALL_ADMIN_TOKEN}` } })), true);
  assert.equal(auth.adminAllowed(request("GET", { headers: { cookie, authorization: "Bearer wrong" } })), false);
  assert.equal(auth.adminAllowed(request("GET", { headers: { "oai-authenticated-user-email": "spoof@example.org" } })), false);
});

test("same-origin checks use actual HTTP authority with the Next localhost adapter", () => {
  const request = new Request("http://localhost:3227/api/admin/session", { method: "POST", headers: {host: "127.0.0.1:3227", origin: "http://127.0.0.1:3227"} });
  assert.equal(auth.sameOrigin(request), true);
  assert.equal(auth.sameOrigin(new Request("https://education.example/api/admin/session", {method: "POST", headers: {origin: "http://education.example"}})), false);
});

test("shared session endpoint signs in once, exposes only role/state, and clears cookie on logout", async () => {
  assert.deepEqual(await (await route.GET(request("GET"))).json(), { authenticated: false, role: null });
  assert.equal((await route.POST(request("POST", { body: JSON.stringify({ token: process.env.WALL_ADMIN_TOKEN }) }))).status, 403);
  const response = await route.POST(request("POST", { headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ token: process.env.WALL_ADMIN_TOKEN }) }));
  assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.authenticated, true); assert.ok(!JSON.stringify(body).includes(process.env.WALL_ADMIN_TOKEN));
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.equal((await (await route.GET(request("GET", { headers: { cookie } }))).json()).authenticated, true);
  assert.equal((await route.DELETE(request("DELETE", { headers: { origin: "https://attacker.example", cookie } }))).status, 403);
  const logout = await route.DELETE(request("DELETE", { headers: { origin, cookie } }));
  assert.equal(logout.status, 200); assert.ok(logout.headers.get("set-cookie").includes("Max-Age=0"));
  assert.equal(logout.headers.get("cache-control"), "no-store");
});

test("invalid administrator keys receive a bounded retry response", async () => {
  for (let i = 0; i < 8; i++) assert.equal((await route.POST(request("POST", { headers: { origin }, body: JSON.stringify({ token: "wrong" }) }))).status, 401);
  const limited = await route.POST(request("POST", { headers: { origin }, body: JSON.stringify({ token: "wrong" }) }));
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get("retry-after")) > 0);
});
test.after(() => { if (original === undefined) delete process.env.WALL_ADMIN_TOKEN; else process.env.WALL_ADMIN_TOKEN = original; });
