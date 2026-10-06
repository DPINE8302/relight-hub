"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { metricTypes, type MetricType } from "./events";

const queueKey="relight-metrics-queue", visitorKey="relight-metrics-visitor", sessionKey="relight-metrics-session";
export function analyticsDisabled() {
  try { return localStorage.getItem("relight-statistics-disabled")==="1" || navigator.doNotTrack==="1" || Boolean((navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl); } catch { return true; }
}
type EventData={id:string;visitor:string;session:string;page:string;type:MetricType;at:string;device:string;referrer:string;seconds?:number;scene?:number;choice?:number;section?:string};
export default function Collector() {
  const page=usePathname();
  useEffect(() => {
    if (!["/","/play","/after","/wall","/puff-world", "/light-trail"].includes(page)) return;
    let stop: (()=>void)|undefined;
    function begin() {
      stop?.(); stop=undefined;
      if(analyticsDisabled()) {
        try { localStorage.removeItem(queueKey); localStorage.removeItem(visitorKey); sessionStorage.removeItem(sessionKey); } catch {}
        return;
      }
      let queue:EventData[]=[], visitor:string;
      try {
        const saved=JSON.parse(localStorage.getItem(visitorKey)||"null");
        visitor=saved?.expires>Date.now() && typeof saved?.id==="string" ? saved.id : crypto.randomUUID();
        localStorage.setItem(visitorKey,JSON.stringify({id:visitor,expires:Date.now()+90*86400000}));
        const old=JSON.parse(localStorage.getItem(queueKey)||"[]");
        queue=Array.isArray(old)?old.filter(e=>Date.parse(e.at)>Date.now()-7*86400000).slice(-200):[];
      } catch { return; }
      const referrer=(()=>{try{const host=new URL(document.referrer).hostname;return host===location.hostname?"internal":host;}catch{return "direct";}})();
      const device=matchMedia("(max-width: 600px)").matches?"mobile":matchMedia("(max-width: 1024px)").matches?"tablet":"desktop";
      let flushing=false, ended=false;
      const persist=()=>{try{localStorage.setItem(queueKey,JSON.stringify(queue.slice(-200)));}catch{}};
      async function flush() {
        if(flushing||ended||analyticsDisabled()||!navigator.onLine||!queue.length) return;
        flushing=true;
        const batch=queue.slice(0,25);
        try {
          const response=await fetch("/api/analytics",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events:batch}),keepalive:true});
          if(response.ok || [400,413].includes(response.status)) {const ids=new Set(batch.map(e=>e.id));queue=queue.filter(e=>!ids.has(e.id));if(!ended&&!analyticsDisabled())persist();}
        } catch {} finally {flushing=false;}
      }
      const session=()=>{
        let value;
        try{value=JSON.parse(sessionStorage.getItem(sessionKey)||"null");}catch{}
        const fresh=!value||Date.now()-value.at>=30*60000;
        if(fresh)value={id:crypto.randomUUID()};
        value.at=Date.now(); try{sessionStorage.setItem(sessionKey,JSON.stringify(value));}catch{}
        return {id:value.id as string,fresh};
      };
      const record=(type:MetricType,detail:Partial<EventData>={})=>{
        if(ended||analyticsDisabled())return;
        const visit=session();
        const base={visitor,session:visit.id,page,at:new Date().toISOString(),device,referrer};
        if(visit.fresh&&type!=="page_view")queue.push({...base,id:crypto.randomUUID(),type:"page_view"});
        queue.push({...base,...detail,id:crypto.randomUUID(),type});
        queue=queue.slice(-200);persist();
      };
      let activeSince=document.visibilityState==="visible"?performance.now():null;
      const engagement=()=>{
        if(activeSince===null)return;
        const seconds=Math.min(30,Math.floor((performance.now()-activeSince)/1000));
        activeSince=document.visibilityState==="visible"?performance.now():null;
        if(seconds>0)record("engagement",{seconds});
      };
      const metric=(event:Event)=>{
        const detail=(event as CustomEvent).detail;
        if(!detail||!metricTypes.includes(detail.type)||["page_view","engagement"].includes(detail.type))return;
        record(detail.type,{scene:detail.scene,choice:detail.choice,section:detail.section});
      };
      const visibility=()=>{engagement();if(document.visibilityState==="visible"&&activeSince===null)activeSince=performance.now();void flush();};
      const leave=()=>{engagement();void flush();};
      record("page_view");void flush();
      const heartbeat=setInterval(()=>{engagement();void flush();},30000);
      const retry=setInterval(()=>void flush(),10000);
      window.addEventListener("relight:metric",metric);window.addEventListener("online",flush);window.addEventListener("pagehide",leave);document.addEventListener("visibilitychange",visibility);
      stop=()=>{engagement();void flush();ended=true;clearInterval(heartbeat);clearInterval(retry);window.removeEventListener("relight:metric",metric);window.removeEventListener("online",flush);window.removeEventListener("pagehide",leave);document.removeEventListener("visibilitychange",visibility);};
    }
    begin();window.addEventListener("relight:privacy",begin);
    return()=>{stop?.();window.removeEventListener("relight:privacy",begin);};
  },[page]);
  return null;
}
