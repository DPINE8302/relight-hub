import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

const origin = process.env.WALL_TEST_URL || "http://127.0.0.1:3214";
const marker = `QA ${randomUUID()}`;
async function send(text, participant, extra = {}) {
  return fetch(`${origin}/api/wall`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...extra }, body: JSON.stringify({ prompt: "response", text, participant }) });
}
async function read() {
  const response = await fetch(`${origin}/api/wall?prompt=response`);
  assert.equal(response.status, 200);
  return response.json();
}

test("shared wall merges duplicates, handles retries, updates answers, and survives concurrent writes", async () => {
  const a = randomUUID(), b = randomUUID();
  assert.equal((await send(marker, a)).status, 200);
  assert.equal((await send(marker, a)).status, 200);
  assert.equal((await send(`  ${marker}  `, b)).status, 200);
  assert.equal((await read()).groups.find((group) => group.text === marker).count, 2);
  assert.equal((await send(`${marker} changed`, a)).status, 200);
  assert.equal((await read()).groups.find((group) => group.text === marker).count, 1);
  const statuses = await Promise.all(Array.from({ length: 5 }, async () => (await send(`${marker} concurrent`, randomUUID())).status));
  assert.ok(statuses.every((status) => status === 200));
  assert.equal((await read()).groups.find((group) => group.text === `${marker} concurrent`).count, 5);
});

test("wall rejects invalid input and foreign-origin writes", async () => {
  assert.equal((await send("", randomUUID())).status, 400);
  assert.equal((await send("x".repeat(121), randomUUID())).status, 400);
  assert.equal((await send("test", "invalid-participant")).status, 400);
  assert.equal((await send("test", randomUUID(), { Origin: "https://other.example" })).status, 403);
  assert.equal((await fetch(`${origin}/api/wall?prompt=unknown`)).status, 400);
});

test("moderation requires a secret and hidden text cannot return on a new submission", async () => {
  const phrase = `${marker} moderation`;
  assert.equal((await send(phrase, randomUUID())).status, 200);
  const request = (key) => fetch(`${origin}/api/wall`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ prompt: "response", text: phrase }) });
  assert.equal((await request("invalid")).status, 401);
  if (process.env.WALL_ADMIN_TOKEN) {
    assert.equal((await request(process.env.WALL_ADMIN_TOKEN)).status, 200);
    assert.ok(!(await read()).groups.some((group) => group.text === phrase));
    assert.equal((await send(phrase, randomUUID())).status, 200);
    assert.ok(!(await read()).groups.some((group) => group.text === phrase));
  }
});

test.after(() => console.log(`Test-only marker for cleanup: ${marker}`));
