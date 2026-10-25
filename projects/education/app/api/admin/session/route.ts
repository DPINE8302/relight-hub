import { adminAllowed, adminCookie, adminSessionSeconds, adminTokenAllowed, createAdminSession, sameOrigin } from "../../admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
// A small per-instance brake supplements the high-entropy operator key. It is
// deliberately not an account store or a claim of a distributed rate limiter.
const failures = new Map<string, { count: number; until: number }>();
function bucket(request: Request) {
  const key = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local";
  const value = failures.get(key);
  if (value && value.until <= Date.now()) failures.delete(key);
  return { key, value: failures.get(key) };
}

export async function GET(request: Request) {
  const authenticated = adminAllowed(request);
  return Response.json({ authenticated, role: authenticated ? "administrator" : null }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "ไม่สามารถเข้าสู่ระบบจากแหล่งนี้ได้" }, { status: 403, headers });
  if (!process.env.WALL_ADMIN_TOKEN) return Response.json({ error: "ระบบผู้ดูแลไม่ได้ตั้งค่า" }, { status: 503, headers });
  const { key, value } = bucket(request);
  if (value && value.count >= 8) return Response.json({ error: "ลองหลายครั้งเกินไป โปรดลองใหม่ใน 15 นาที" }, { status: 429, headers: { ...headers, "Retry-After": String(Math.max(1, Math.ceil((value.until - Date.now()) / 1000))) } });
  try {
    const raw = await request.text();
    if (raw.length > 5000) return Response.json({ error: "ข้อมูลยาวเกินไป" }, { status: 413, headers });
    const body = JSON.parse(raw);
    if (!adminTokenAllowed(body?.token)) {
      if (failures.size > 1000) for (const [id, item] of failures) if (item.until <= Date.now()) failures.delete(id);
      if (failures.size < 2000 || failures.has(key)) failures.set(key, { count: (value?.count || 0) + 1, until: value?.until || Date.now() + 15 * 60000 });
      return Response.json({ error: "รหัสผู้ดูแลไม่ถูกต้อง" }, { status: 401, headers });
    }
    failures.delete(key);
    return Response.json({ authenticated: true, role: "administrator", expiresIn: adminSessionSeconds }, { headers: { ...headers, "Set-Cookie": adminCookie(request, createAdminSession()) } });
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "ไม่สามารถออกจากระบบจากแหล่งนี้ได้" }, { status: 403, headers });
  return Response.json({ authenticated: false }, { headers: { ...headers, "Set-Cookie": adminCookie(request, "", true) } });
}
