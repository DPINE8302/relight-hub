import { timingSafeEqual } from "node:crypto";
import { wallPrompts, normalizeAnswer, type PromptId } from "../../wall/prompts";
import { readWall, writeWall, hideAnswer, clearWall, fingerprint } from "./store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function validPrompt(value: unknown): value is PromptId {
  return wallPrompts.some((prompt) => prompt.id === value);
}

function failure(error: unknown) {
  const limited = error instanceof Error && error.message === "RATE_LIMIT";
  return Response.json({ error: limited ? "ส่งหลายครั้งเกินไป ลองใหม่ในอีกหนึ่งนาที" : "เชื่อมต่อผนังไม่ได้ ข้อความของคุณยังอยู่ในช่องเขียน ลองใหม่อีกครั้ง" }, { status: limited ? 429 : 503, headers });
}

function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return ["https:", "http:"].includes(url.protocol) && url.host === request.headers.get("host");
  } catch { return false; }
}

export async function GET(request: Request) {
  const prompt = new URL(request.url).searchParams.get("prompt");
  if (!validPrompt(prompt)) return Response.json({ error: "เลือกคำถามก่อน" }, { status: 400, headers });
  try { return Response.json(await readWall(prompt), { headers }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!originAllowed(request)) return Response.json({ error: "ไม่สามารถส่งจากแหล่งนี้ได้" }, { status: 403, headers });
  try {
    const raw = await request.text();
    if (raw.length > 2000) return Response.json({ error: "ข้อความยาวเกินไป" }, { status: 413, headers });
    const body = JSON.parse(raw);
    if (!validPrompt(body.prompt) || typeof body.text !== "string" || typeof body.participant !== "string" || !/^[a-f0-9-]{36}$/i.test(body.participant)) {
      return Response.json({ error: "ข้อมูลไม่ครบ ลองส่งอีกครั้ง" }, { status: 400, headers });
    }
    const text = normalizeAnswer(body.text);
    if (!text || text.length > 120 || /[\p{Cc}\p{Cf}]/u.test(text)) return Response.json({ error: "เขียนข้อความ 1–120 ตัวอักษร" }, { status: 400, headers });
    await writeWall(body.prompt, text, body.participant, fingerprint(request, body.participant));
    return Response.json(await readWall(body.prompt), { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const expected = process.env.WALL_ADMIN_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return Response.json({ error: "ไม่มีสิทธิ์จัดการผนัง" }, { status: 401, headers });
  try {
    const body = await request.json();
    if (!validPrompt(body.prompt)) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
    if (body.action === "clear" || body.action === "restore") {
      await clearWall(body.prompt, body.action === "restore");
    } else if (body.action === undefined && typeof body.text === "string") {
      await hideAnswer(body.prompt, body.text);
    } else return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
    return Response.json(await readWall(body.prompt), { headers });
  } catch (error) { return failure(error); }
}
