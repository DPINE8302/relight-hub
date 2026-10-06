import assert from "node:assert/strict";
import test from "node:test";

import next from "next";
import { createServer } from "node:http";

async function render() {
  const app = next({ dev: false, dir: process.cwd(), hostname: "127.0.0.1" });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    const html = await response.text();
    return new Response(html, { status: response.status, headers: response.headers });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  }
}

test("server-renders the RE;light education experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /RE;light/);
  assert.match(html, /พรุ่งนี้/);
  assert.match(html, /ยังเป็นของคุณ/);
  assert.match(html, /สำรวจสิ่งที่สูดเข้าไป/);
  assert.match(html, /บุหรี่ไฟฟ้า/);
  assert.match(html, /1600/);
  assert.doesNotMatch(html, /Your site is taking shape/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});
