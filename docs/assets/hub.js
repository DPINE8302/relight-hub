import {observeWebHealth} from './web-health.js';
import {createEcosystemCollector} from './telemetry.js';
'use strict';
fetch('assets/release.json').then(response=>response.ok?response.json():null).then(release=>{
  if(!release) return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el&&value!=null)el.textContent=value;};
  set('app-size',release.megabytes+' MB');
  if(!release.windows) return;
  const windows=release.windows;
  set('windows-version',windows.version);
  Object.entries(windows.assets||{}).forEach(([key,asset])=>{
    set('windows-'+key+'-size',asset.megabytes+' MB');
    document.querySelectorAll('[data-windows-asset="'+key+'"]').forEach(link=>{
      link.href='https://github.com/DPINE8302/relight-hub/releases/download/'+windows.tag+'/'+asset.file;
    });
  });
}).catch(()=>{});

// One anonymous session across this Hub and its Skyfront game on GitHub Pages.
let metrics;
try { metrics=createEcosystemCollector(globalThis,{page:'/hub',queueKey:'relight-hub-queue'}); } catch {}
if(metrics){
 const privacy=document.getElementById('hub-statistics');
 const updatePrivacy=()=>{privacy.hidden=false;const enabled=!metrics.disabled();privacy.setAttribute('aria-pressed',String(enabled));privacy.textContent='สถิติการใช้งาน: '+(enabled?'เปิด':'ปิด');};
 metrics.record('page_view');
 let stopHealth;
 let since=null;
 const health=()=>{stopHealth?.();stopHealth=undefined;if(!metrics.disabled())stopHealth=observeWebHealth((type,detail)=>metrics.record(type,detail));};
 const resetPrivacy=()=>{since=document.hidden||metrics.disabled()?null:performance.now();updatePrivacy();health();if(metrics.disabled())void metrics.flush();};
 resetPrivacy();
 privacy.addEventListener('click',()=>{metrics.setEnabled(metrics.disabled());resetPrivacy();});
 window.addEventListener('storage',event=>{if(event.key==='relight-statistics-disabled'||event.key===null)resetPrivacy();});
 const engagement=()=>{if(since!==null&&!metrics.disabled())metrics.record('engagement',{seconds:(performance.now()-since)/1000});since=document.hidden||metrics.disabled()?null:performance.now();};
 document.addEventListener('visibilitychange',()=>{engagement();void metrics.flush();});
 window.addEventListener('pagehide',()=>{engagement();void metrics.flush();});
 window.addEventListener('online',()=>void metrics.flush());
 setInterval(()=>{engagement();void metrics.flush();},15000);
 document.addEventListener('click',event=>{
  const link=event.target.closest('a');if(!link)return;
  const url=new URL(link.href,location.href);let section;
  if(link.dataset.windowsAsset)section='win-'+link.dataset.windowsAsset;
  else if(link.id==='app-download')section='mac';
  else if(url.pathname.includes('/games/skyfront/'))section='skyfront';
  else if(url.origin==='https://relight-web-two.vercel.app')section=({'/puff-world':'puff','/play':'scenario','/wall':'wall','/light-trail':'light-trail'})[url.pathname]||(url.hash==='#help'?'help':'education');
  if(!section)return;
  metrics.record(section==='mac'||section.startsWith('win-')?'hub_download':'hub_launch',{section});void metrics.flush();
 });
 void metrics.flush();
}

// The same compact contents-menu behavior as the Education signature header.
const mobileIndex=document.querySelector('.mobile-index');
if(mobileIndex){
 const close=()=>{mobileIndex.open=false;};
 mobileIndex.addEventListener('click',event=>{if(event.target.closest('a'))close();});
 document.addEventListener('pointerdown',event=>{if(!mobileIndex.contains(event.target))close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&mobileIndex.open){close();mobileIndex.querySelector('summary').focus();}});
 window.matchMedia('(min-width:651px)').addEventListener('change',close);
}
