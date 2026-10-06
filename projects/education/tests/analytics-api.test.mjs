import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHmac } from "node:crypto";
import { Pool } from "pg";

const origin=process.env.ANALYTICS_TEST_URL||"http://127.0.0.1:3214";
const token=process.env.WALL_ADMIN_TOKEN;
assert.ok(token && process.env.DATABASE_URL,"Analytics integration tests need the server-only environment.");
const url=new URL(process.env.DATABASE_URL);url.searchParams.set("sslmode","verify-full");
const pool=new Pool({connectionString:url.toString()});
const visitor=randomUUID(),session=randomUUID(),otherVisitor=randomUUID(),otherSession=randomUUID();
const hash=value=>createHmac("sha256",token).update(`analytics:${value}`).digest("hex");
const events=[];
function metric(type,extras={}){const value={id:randomUUID(),visitor,session,page:"/play",type,at:new Date(Date.now()-60000).toISOString(),device:"mobile",referrer:"example.org",...extras};events.push(value);return value;}
const send=values=>fetch(`${origin}/api/analytics`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","User-Agent":"RELightIntegrationTest"},body:JSON.stringify({events:values})});
const stats=async days=>{const r=await fetch(`${origin}/api/analytics?days=${days}`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(r.status,200);return r.json();};

test("analytics summary is private and range validation is enforced",async()=>{
 assert.equal((await fetch(`${origin}/api/analytics`)).status,401);
 assert.equal((await fetch(`${origin}/api/analytics`,{headers:{Authorization:"Bearer invalid"}})).status,401);
 assert.equal((await fetch(`${origin}/api/analytics?days=999`,{headers:{Authorization:`Bearer ${token}`}})).status,400);
 const result=await stats(7);assert.equal(result.timezone,"Asia/Bangkok");assert.ok(Number.isFinite(result.totals.visitors));
});
test("analytics records complete flows, hashes identifiers, accepts offline timestamps, and deduplicates retries",async()=>{
 const before=await stats(7);
 const batch=[metric("page_view",{text:"must never be stored",ip:"198.51.100.77",email:"private@example.org"}),metric("game_start"),metric("game_choice",{scene:1,choice:2}),metric("game_complete"),metric("engagement",{seconds:30}),metric("education_interaction",{section:"body"}),metric("wall_submit"),metric("page_view",{visitor:otherVisitor,session:otherSession,at:new Date(Date.now()-86400000).toISOString()}),metric("page_view",{session:randomUUID(),at:new Date(Date.now()-3600000).toISOString()}),metric("page_view",{page:"/"})];
 assert.equal((await send(batch)).status,204);assert.equal((await send(batch)).status,204);
 const r=await pool.query("SELECT * FROM analytics_events WHERE id=ANY($1::uuid[])",[batch.map(e=>e.id)]);assert.equal(r.rowCount,10);assert.equal(new Set(r.rows.map(row=>row.visitor)).size,2);
 assert.equal(r.rows.find(row=>row.id===batch[0].id).visitor,hash(visitor));
 assert.ok(!JSON.stringify(r.rows).includes(visitor));assert.ok(!JSON.stringify(r.rows).includes("private@example.org"));assert.ok(!JSON.stringify(r.rows).includes("198.51.100.77"));assert.ok(!JSON.stringify(r.rows).includes("must never be stored"));
 const result=await stats(7);assert.ok(result.totals.visitors>=before.totals.visitors+2);assert.ok(result.totals.views>=before.totals.views+4);assert.ok(result.totals.returning_visits>=before.totals.returning_visits+1);assert.ok(result.totals.starts>=1);assert.ok(result.totals.completions>=1);assert.ok(result.totals.finished_starts<=result.totals.starts);assert.ok(result.daily.some(day=>Number(day.views)>=1));assert.ok(result.choices.some(row=>row.scene===1&&row.choice===2));
});
test("Inside and Light Trail have separate game statistics",async()=>{
 const before=await stats(7);
 const batch=[metric("inside_start",{page:"/puff-world"}),metric("inside_complete",{page:"/puff-world"}),metric("puff_start",{page:"/light-trail"}),metric("puff_complete",{page:"/light-trail"})];
 assert.equal((await send(batch)).status,204);
 const result=await stats(7);
 for(const key of ["inside_starts","inside_completions","puff_starts","puff_completions"]) assert.equal(result.totals[key],before.totals[key]+1);
});
test("analytics rejects invalid paths, identity, future time, inflated durations and foreign-origin writes",async()=>{
 const item=metric("page_view");
 for(const patch of [{page:"/analytics"},{visitor:"invalid"},{at:new Date(Date.now()+86400000).toISOString()},{type:"engagement",seconds:1000},{type:"game_choice",scene:9,choice:0}])assert.equal((await send([{...item,...patch}])).status,400);
 assert.equal((await fetch(`${origin}/api/analytics`,{method:"POST",headers:{Origin:"https://other.example","Content-Type":"application/json"},body:JSON.stringify({events:[item]})})).status,403);
 const bot=metric("page_view");assert.equal((await fetch(`${origin}/api/analytics`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","User-Agent":"KnownCrawlerBot"},body:JSON.stringify({events:[bot]})})).status,204);
 assert.equal((await pool.query("SELECT id FROM analytics_events WHERE id=$1",[bot.id])).rowCount,0);
 for(const header of ["DNT","Sec-GPC"]){const optedOut=metric("page_view");assert.equal((await fetch(`${origin}/api/analytics`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","User-Agent":"RELightIntegrationTest",[header]:"1"},body:JSON.stringify({events:[optedOut]})})).status,204);assert.equal((await pool.query("SELECT id FROM analytics_events WHERE id=$1",[optedOut.id])).rowCount,0);}
});
test.after(async()=>{
 await pool.query("DELETE FROM analytics_events WHERE id=ANY($1::uuid[])",[events.map(e=>e.id)]);
 await pool.query("DELETE FROM analytics_visitors WHERE id=ANY($1::text[])",[[hash(visitor),hash(otherVisitor)]]);
 await pool.end();console.log("Removed test-only analytics fixtures.");
});
