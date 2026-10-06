import { adminAllowed } from "../admin-auth";
import { parseMetrics, recordMetrics, statistics } from "./store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request) {
  const origin=request.headers.get("origin");
  try { if (!origin || new URL(origin).host !== request.headers.get("host")) return new Response(null,{status:403,headers}); } catch { return new Response(null,{status:403,headers}); }
  if (request.headers.get("dnt")==="1" || request.headers.get("sec-gpc")==="1" || /bot|crawler|spider|lighthouse|headless/i.test(request.headers.get("user-agent") || "")) return new Response(null,{status:204,headers});
  try {
    const raw=await request.text(); if(raw.length>30000) return new Response(null,{status:413,headers});
    const events=parseMetrics(JSON.parse(raw)); await recordMetrics(events,request);
    return new Response(null,{status:204,headers});
  } catch(error) {
    const invalid=error instanceof SyntaxError || error instanceof Error && error.message==="INVALID";
    const limited=error instanceof Error && error.message==="RATE_LIMIT";
    return new Response(null,{status:invalid?400:limited?429:503,headers});
  }
}
export async function GET(request:Request) {
  if(!adminAllowed(request)) return Response.json({error:"ต้องใช้รหัสผู้ดูแล"},{status:401,headers});
  const days=Number(new URL(request.url).searchParams.get("days") || 7);
  if(![1,7,30,90].includes(days)) return Response.json({error:"ช่วงเวลาไม่ถูกต้อง"},{status:400,headers});
  try { return Response.json(await statistics(days),{headers}); }
  catch { return Response.json({error:"โหลดสถิติไม่สำเร็จ ลองใหม่อีกครั้ง"},{status:503,headers}); }
}
