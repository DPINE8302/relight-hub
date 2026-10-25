import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/wall/CommunityWall.tsx',import.meta.url),'utf8');
const start=source.indexOf('  async function submit('),end=source.indexOf('\n  return (',start);
const handler=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(fetch){
 let timeout;const state={sending:false,message:'',text:'saved draft',data:null,draftCleared:false},submission={current:null},mutating={current:false},events=[];
 const api=vm.runInNewContext(handler+';({submit})',{AbortController,Error,navigator:{onLine:true},submission,mutating,participant:{current:'fixture'},prompt:'response',text:state.text,invalidateRead(){},fetch,window:{setTimeout(fn){timeout=fn;return 1;},clearTimeout(){}},setSending:v=>{state.sending=v;},setMessage:v=>{state.message=v;},setData:v=>{state.data=v;},setText:v=>{state.text=v;},setConnection(){},trackMetric:(type)=>events.push(type),localStorage:{setItem(){},removeItem(){state.draftCleared=true;}}});
 return {api,state,submission,mutating,events,timeout:()=>timeout()};
}
test('a stalled submission times out, restores controls and preserves the draft',async()=>{
 const f=fixture((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));
 const work=f.api.submit({preventDefault(){}});assert.equal(f.state.sending,true);assert.equal(f.mutating.current,true);f.timeout();await work;
 assert.equal(f.state.sending,false);assert.equal(f.mutating.current,false);assert.equal(f.state.text,'saved draft');assert.equal(f.state.draftCleared,false);assert.match(f.state.message,/ยังยืนยันการส่งไม่ได้/);assert.ok(!f.events.includes('wall_submit'));
});
test('a response from an abandoned component cannot clear a newer draft or publish stale state',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>{resolve=r;}));const work=f.api.submit({preventDefault(){}});f.submission.current.abort();f.submission.current=null;f.mutating.current=false;
 resolve({ok:true,json:async()=>({total:1,groups:[]})});await work;
 assert.equal(f.state.data,null);assert.equal(f.state.draftCleared,false);assert.equal(f.state.text,'saved draft');assert.ok(!f.events.includes('wall_submit'));
});
