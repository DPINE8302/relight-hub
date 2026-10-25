// Anonymous static-host telemetry shared by Hub and Skyfront.
// Only aggregate operational detail is permitted; the server validates every event.
const ENDPOINT='https://relight-web-two.vercel.app/api/analytics';
const ORIGINS=['https://dpine8302.github.io','https://relight-fighter.vercel.app'];
const VISITOR='relight-metrics-visitor',SESSION='relight-metrics-session',OPT_OUT='relight-statistics-disabled';
const ERRORS=new Set(['webgl-context-lost','runtime-error','frame-error','boot-error','startup-timeout','bundle-load','unhandled-rejection','page-restored']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKY=new Set(['skyfront_start','skyfront_resume','skyfront_tutorial_step','skyfront_tutorial_skip','skyfront_tutorial_complete','skyfront_mission_start','skyfront_mission_complete','skyfront_campaign_complete','skyfront_exit','skyfront_error']);
const LAUNCH=new Set(['education','skyfront','puff','scenario','light-trail','wall','help']),DOWNLOAD=new Set(['mac','win-x64','win-arm64']);
const SITE_ERRORS=new Set(['runtime-error','unhandled-rejection','resource-error']);
const LOAD_BUCKETS=new Set(['load-under-1s','load-1-3s','load-3-6s','load-over-6s']);
const MAX_QUEUE_BYTES=200*1024;
export function normalizeEcosystemEvent(input,page,now=Date.now()){
 if(!['/skyfront','/hub'].includes(page)||!input||typeof input!=='object'||![input.id,input.visitor,input.session].every(v=>typeof v==='string'&&UUID.test(v))||input.page!==page)return null;
 const at=typeof input.at==='string'&&input.at.length<=30?Date.parse(input.at):NaN;
 if(!Number.isFinite(at)||at<now-7*86400000||at>now+300000)return null;
 const type=input.type;
 if(!['page_view','engagement'].includes(type)&&!(page==='/skyfront'&&SKY.has(type))&&!(page==='/hub'&&['hub_launch','hub_download','site_error','site_performance'].includes(type)))return null;
 if(!['mobile','tablet','desktop'].includes(input.device)||typeof input.referrer!=='string'||input.referrer.length>120||!/^[-a-z0-9.]+$/i.test(input.referrer))return null;
 const event={id:input.id,visitor:input.visitor,session:input.session,page,type,at:new Date(at).toISOString(),device:input.device,referrer:input.referrer};
 if(type==='engagement'){if(!Number.isFinite(input.seconds)||input.seconds<0||input.seconds>30)return null;event.seconds=Math.floor(input.seconds);}
 if(type==='site_error'||type==='site_performance'){if(!(type==='site_error'?SITE_ERRORS:LOAD_BUCKETS).has(input.section))return null;event.section=input.section;}
 if(SKY.has(type)){if(!(type==='skyfront_error'?ERRORS:new Set(['watch','player'])).has(input.section))return null;event.section=input.section;}
 if(type==='hub_launch'||type==='hub_download'){if(!(type==='hub_launch'?LAUNCH:DOWNLOAD).has(input.section))return null;event.section=input.section;}
 if(['skyfront_tutorial_step','skyfront_mission_start','skyfront_mission_complete'].includes(type)){if(!Number.isInteger(input.scene)||input.scene<0||input.scene>20)return null;event.scene=input.scene;}
 return event;
}
export function createEcosystemCollector(env=globalThis,{page="/skyfront",queueKey="relight-skyfront-queue"}={}){
 const QUEUE=queueKey;
 const {localStorage:local,sessionStorage:session,navigator:nav,crypto}=env;
 const disabled=()=>{try{return local.getItem(OPT_OUT)==='1'||nav.doNotTrack==='1'||!!nav.globalPrivacyControl;}catch{return true;}};
 let queue=[],visitor,busy=false;
 const persist=()=>{try{local.setItem(QUEUE,JSON.stringify(queue.slice(-200)));}catch{}};
 function clear(){queue=[];visitor=undefined;try{local.removeItem(QUEUE);local.removeItem(VISITOR);session.removeItem(SESSION);}catch{}}
 function begin(){
  if(disabled()){clear();return false;}
  try{const old=JSON.parse(local.getItem(VISITOR)||'null');visitor=old?.expires>Date.now()&&UUID.test(old.id)?old.id:crypto.randomUUID();local.setItem(VISITOR,JSON.stringify({id:visitor,expires:Date.now()+90*86400000}));const raw=local.getItem(QUEUE)||'[]';const pending=raw.length<=MAX_QUEUE_BYTES?JSON.parse(raw):[];queue=Array.isArray(pending)?pending.slice(-200).map(e=>normalizeEcosystemEvent(e,page)).filter(Boolean):[];persist();return true;}catch{return false;}
 }
 function record(type,detail={}){
  try{
   if(disabled()){clear();return;}if(!visitor&&!begin())return;
   let visit;try{visit=JSON.parse(session.getItem(SESSION)||'null');}catch{}
   const fresh=!visit||!UUID.test(visit.id)||!Number.isFinite(visit.at)||visit.at>Date.now()+60000||Date.now()-visit.at>=30*60000;
   if(fresh)visit={id:crypto.randomUUID()};visit.at=Date.now();session.setItem(SESSION,JSON.stringify(visit));
   const width=env.innerWidth,device=width<=600?'mobile':width<=1024?'tablet':'desktop';
   let referrer='direct';try{referrer=new URL(env.document.referrer).hostname;}catch{}
   const event={id:crypto.randomUUID(),visitor,session:visit.id,page,type,at:new Date().toISOString(),device,referrer};
   if(type==='engagement')event.seconds=Math.min(30,Math.max(0,Math.floor(detail.seconds||0)));
   if(type==='site_error'||type==='site_performance')event.section=detail.section;
   if(type.startsWith('skyfront_')){
    if(type==='skyfront_error'){if(!ERRORS.has(detail.section))return;event.section=detail.section;}
    else event.section=detail.watch?'watch':'player';
   }
   if(type==='hub_launch'||type==='hub_download'){if(!new Set(['education','skyfront','puff','scenario','light-trail','wall','help','mac','win-x64','win-arm64']).has(detail.section))return;event.section=detail.section;}
   if(Number.isInteger(detail.scene)&&detail.scene>=0&&detail.scene<=20)event.scene=detail.scene;
   if(fresh&&type!=='page_view')queue.push({...event,id:crypto.randomUUID(),type:'page_view',scene:undefined,section:undefined,seconds:undefined});
   const normalized=normalizeEcosystemEvent(event,page);if(!normalized)return;queue.push(normalized);queue=queue.slice(-200).map(e=>normalizeEcosystemEvent(e,page)).filter(Boolean);persist();
  }catch{/* Telemetry must never interrupt flight. */}
 }
 async function flush(){
  if(disabled()){clear();return;}if(busy||!queue.length||!nav.onLine||!ORIGINS.includes(env.location.origin))return;
  queue=queue.map(e=>normalizeEcosystemEvent(e,page)).filter(Boolean);persist();busy=true;const batch=queue.slice(0,25);if(!batch.length){busy=false;return;}
  try{const response=await env.fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({events:batch}),keepalive:true});if(response.ok||[400,413].includes(response.status)){const ids=new Set(batch.map(e=>e.id));queue=queue.filter(e=>!ids.has(e.id));if(disabled())clear();else persist();}}catch{}finally{busy=false;}
 }
 return {record,flush,disabled,setEnabled(on){try{if(on)local.removeItem(OPT_OUT);else local.setItem(OPT_OUT,'1');}catch{}if(disabled())clear();else{begin();record('page_view');}}};
}

