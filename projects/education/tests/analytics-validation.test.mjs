import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadTypescript } from "./helpers/load-typescript.mjs";
const { parseMetrics } = await loadTypescript(new URL("../app/api/analytics/validation.ts", import.meta.url));
const metric = (patch = {}) => ({ id: randomUUID(), visitor: randomUUID(), session: randomUUID(), page: "/skyfront", type: "skyfront_start", at: new Date().toISOString(), device: "mobile", referrer: "example.org", section: "player", ...patch });
const parse = event => parseMetrics({ events: [event] })[0];

test("Skyfront events remain coarse and never persist free-form data", () => {
  const event = parse(metric({ email: "private@example.org", ip: "198.51.100.77", message: "private message", userAgent: "full browser fingerprint" }));
  assert.equal(event.section, "player");
  const output = JSON.stringify(event);
  for (const forbidden of ["private@example.org", "198.51.100.77", "private message", "full browser fingerprint"]) assert.ok(!output.includes(forbidden));
  assert.equal(parse(metric({ section: "watch" })).section, "watch");
  assert.equal(parse(metric({ referrer: "https://example.org/private?token=sensitive" })).referrer, "direct");
});

test("telemetry validates identities, routes, event scope, times, duration, stage and modes", () => {
  for (const patch of [{ visitor: "not-a-uuid" }, { page: "/analytics" }, { page: "/wall" }, { type: "wall_submit" }, { type: "skyfront_tutorial_step", scene: 21 }, { type: "skyfront_mission_start", scene: -1 }, { section: "arbitrary-private-text" }, { at: new Date(Date.now() - 8 * 86400000).toISOString() }, { at: new Date(Date.now() + 3600000).toISOString() }, { type: "engagement", seconds: 31 }]) assert.throws(() => parse(metric(patch)), /INVALID/);
  assert.equal(parse(metric({ type: "skyfront_tutorial_step", scene: 0 })).scene, 0);
  assert.equal(parse(metric({ type: "skyfront_mission_complete", scene: 20 })).scene, 20);
  assert.equal(parse(metric({ type: "engagement", seconds: 30, section: undefined })).seconds, 30);
  assert.equal(parse(metric({ type: "page_view", section: undefined })).type, "page_view");
});

test("only explicit error codes are accepted and old education metrics still parse", () => {
  assert.equal(parse(metric({ type: "skyfront_error", section: "webgl-context-lost" })).section, "webgl-context-lost");
  for (const section of ["frame-error", "boot-error"]) assert.equal(parse(metric({ type: "skyfront_error", section })).section, section);
  assert.throws(() => parse(metric({ type: "skyfront_error", section: "private URL with token" })), /INVALID/);
  assert.equal(parse(metric({ type: "game_choice", page: "/play", scene: 1, choice: 2 })).choice, 2);
  assert.equal(parse(metric({ type: "inside_start", page: "/puff-world" })).type, "inside_start");
  assert.throws(() => parseMetrics({ events: Array.from({ length: 26 }, () => metric()) }), /INVALID/);
});

test("resuming and skipping a tutorial remain distinct from fresh starts and tutorial completion", () => {
  for (const type of ["skyfront_start", "skyfront_resume", "skyfront_tutorial_skip", "skyfront_tutorial_complete"]) {
    const value = parse(metric({ type }));
    assert.equal(value.type, type); assert.equal(value.section, "player");
  }
});

test("Hub events allow only explicit launch/download destinations and their own page", () => {
  for (const section of ["education", "skyfront", "puff", "scenario", "light-trail", "wall", "help"]) assert.equal(parse(metric({ page: "/hub", type: "hub_launch", section })).section, section);
  for (const section of ["mac", "win-x64", "win-arm64"]) assert.equal(parse(metric({ page: "/hub", type: "hub_download", section })).section, section);
  assert.equal(parse(metric({ page: "/hub", type: "page_view", section: undefined })).page, "/hub");
  assert.equal(parse(metric({ page: "/hub", type: "engagement", seconds: 15, section: undefined })).seconds, 15);
  for (const patch of [{page:"/hub",type:"hub_launch",section:"mac"},{page:"/hub",type:"hub_download",section:"skyfront"},{page:"/hub",type:"hub_download",section:"https://private.example?token=secret"},{page:"/",type:"hub_launch",section:"education"},{page:"/skyfront",type:"hub_launch",section:"skyfront"},{page:"/hub",type:"skyfront_start",section:"player"},{page:"/hub",type:"game_complete"}]) assert.throws(() => parse(metric(patch)), /INVALID/);
});

test("cross-origin policy permits Hub only from GitHub Pages and restricts all other sources", async () => {
  const { externalTelemetryPages } = await loadTypescript(new URL("../app/api/analytics/validation.ts", import.meta.url));
  assert.deepEqual(externalTelemetryPages("https://dpine8302.github.io"), ["/skyfront", "/hub"]);
  assert.deepEqual(externalTelemetryPages("https://relight-fighter.vercel.app"), ["/skyfront"]);
  for (const origin of [null, "null", "https://evil.example", "https://dpine8302.github.io.evil.example", "http://dpine8302.github.io"]) assert.deepEqual(externalTelemetryPages(origin), []);
});
