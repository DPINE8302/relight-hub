import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

// Bulk moderation tests must only run against a disposable local wall.
const origin = process.env.WALL_CLEAR_TEST_URL;
const enabled = !!origin && new URL(origin).hostname === "127.0.0.1" && !process.env.DATABASE_URL;
test("clear and restore preserve moderation and accept fresh submissions", { skip: !enabled }, async () => {
  const token = process.env.WALL_ADMIN_TOKEN;
  assert.ok(token);
  const participant = randomUUID();
  const write = async (text, id = participant) => {
    const r = await fetch(`${origin}/api/wall`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "response", text, participant: id }) });
    assert.equal(r.status, 200);
    return r.json();
  };
  const moderate = async (body, key = token) => fetch(`${origin}/api/wall`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ prompt: "response", ...body }) });
  await write("visible");
  await write("blocked", randomUUID());
  assert.equal((await moderate({ text: "blocked" })).status, 200);
  assert.equal((await moderate({ action: "clear" }, "wrong")).status, 401);
  assert.equal((await moderate({ action: "unknown" })).status, 400);
  const cleared = await moderate({ action: "clear" });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).total, 0);
  const restored = await moderate({ action: "restore" });
  assert.equal(restored.status, 200);
  assert.deepEqual((await restored.json()).groups, [{ text: "visible", count: 1 }]);
  assert.equal((await moderate({ action: "clear" })).status, 200);
  assert.deepEqual((await write("fresh")).groups, [{ text: "fresh", count: 1 }]);
  await write("blocked", randomUUID());
  const r = await moderate({ action: "restore" });
  assert.ok(!(await r.json()).groups.some(group => group.text === "blocked"));
});
