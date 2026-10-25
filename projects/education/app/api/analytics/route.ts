import { adminAllowed, requestOrigin } from "../admin-auth";
import { parseMetrics, recordMetrics, statistics } from "./store";
import { externalTelemetryPages } from "./validation";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
function telemetryAccess(request: Request) {
  const origin = request.headers.get("origin");
  const pages = externalTelemetryPages(origin);
  const crossOrigin = pages.length > 0;
  const sameOrigin = origin === requestOrigin(request);
  return { allowed: sameOrigin || crossOrigin, crossOrigin, pages, headers: { ...headers, Vary: "Origin", ...(crossOrigin ? { "Access-Control-Allow-Origin": origin!, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" } : {}) } };
}
export async function OPTIONS(request: Request) {
  const access = telemetryAccess(request);
  return new Response(null, { status: access.allowed ? 204 : 403, headers: access.headers });
}
export async function POST(request:Request) {
  const access = telemetryAccess(request), responseHeaders = access.headers;
  if (!access.allowed) return new Response(null,{status:403,headers:responseHeaders});
  if (request.headers.get("dnt")==="1" || request.headers.get("sec-gpc")==="1" || /bot|crawler|spider|lighthouse|headless/i.test(request.headers.get("user-agent") || "")) return new Response(null,{status:204,headers:responseHeaders});
  try {
    const raw=await request.text(); if(raw.length>30000) return new Response(null,{status:413,headers:responseHeaders});
    const events=parseMetrics(JSON.parse(raw));
    if (access.crossOrigin && events.some(event => !access.pages.includes(event.page))) return new Response(null,{status:403,headers:responseHeaders});
    await recordMetrics(events,request);
    return new Response(null,{status:204,headers:responseHeaders});
  } catch(error) {
    const invalid=error instanceof SyntaxError || error instanceof Error && error.message==="INVALID";
    const limited=error instanceof Error && error.message==="RATE_LIMIT";
    return new Response(null,{status:invalid?400:limited?429:503,headers:responseHeaders});
  }
}
export async function GET(request:Request) {
  if(!adminAllowed(request)) return Response.json({error:"ต้องใช้รหัสผู้ดูแล"},{status:401,headers});
  const days=Number(new URL(request.url).searchParams.get("days") || 7);
  if(![1,7,30,90].includes(days)) return Response.json({error:"ช่วงเวลาไม่ถูกต้อง"},{status:400,headers});
  const source = new URL(request.url).searchParams.get("source") || "all";
  if (!["all", "education", "skyfront", "hub"].includes(source)) return Response.json({error:"แหล่งข้อมูลไม่ถูกต้อง"},{status:400,headers});
  try { return Response.json(await statistics(days, source as "all" | "education" | "skyfront" | "hub"),{headers}); }
  catch { return Response.json({error:"โหลดสถิติไม่สำเร็จ ลองใหม่อีกครั้ง"},{status:503,headers}); }
}
