"use client";
import PageHeader from "../PageHeader";
import { useEffect, useRef, useState } from "react";
import Charts, { RankedBars } from "./Charts";
type Row=Record<string,string|number>;
export type Stats={days:number;timezone:string;totals:Record<string,number>;daily:Row[];pages:Row[];devices:Row[];referrers:Row[];interactions:Row[];choices:Row[];firstEvent:string|null;updatedAt:string};
const number=(value:unknown)=>new Intl.NumberFormat("th-TH").format(Number(value)||0);
const time=(value:unknown)=>Number(value)<60?`${number(Math.round(Number(value)))} วินาที`:`${number(Math.round(Number(value)/60))} นาที`;
const pageNames:Record<string,string>={"/":"เว็บไซต์หลัก","/play":"เกม","/after":"หลัง immersive","/wall":"ผนัง","/puff-world":"Puff World: Inside","/light-trail":"Light Trail"};
const sectionNames:Record<string,string>={aerosol:"ละออง",nicotine:"วงจรนิโคติน",body:"ร่างกาย",myths:"เช็กความเชื่อ",marketing:"การตลาด"};
export default function Dashboard(){
  const [token,setToken]=useState("");const [days,setDays]=useState(7);const [data,setData]=useState<Stats|null>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  function clearData() { pending.current?.abort(); setData(null); setMessage(""); setBusy(false); }
  async function load(event?:React.FormEvent){
    event?.preventDefault(); pending.current?.abort();
    const request = new AbortController(); pending.current = request;
    setBusy(true);setMessage("");
    try {
      const response=await fetch(`/api/analytics?days=${days}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:request.signal});
      const result=await response.json(); if(!response.ok)throw new Error(result.error);
      if(!request.signal.aborted)setData(result);
    } catch(error) {
      if(!request.signal.aborted){setData(null);setMessage(error instanceof Error?error.message:"โหลดไม่สำเร็จ ลองอีกครั้ง");}
    } finally { if(!request.signal.aborted)setBusy(false); }
  }
  function csv(){
    if(!data)return;
    const cell=(v:unknown)=>`"${String(v).replaceAll('"','""')}"`;
    const lines=[["RE;light statistics",`${data.days} days`,data.timezone],["metric","value"],...Object.entries(data.totals),[],["date","page views","browser identifiers"],...data.daily.map(r=>[r.day,r.views,r.visitors]),[],["page","views","browser identifiers","visible seconds"],...data.pages.map(r=>[r.page,r.views,r.visitors,r.active_seconds]),[],["device","views"],...data.devices.map(r=>[r.device,r.views]),[],["referrer domain","visits"],...data.referrers.map(r=>[r.referrer,r.visits]),[],["education section","interactions"],...data.interactions.map(r=>[r.section,r.interactions]),[],["scene","last choice","visits"],...data.choices.map(r=>[r.scene,r.choice,r.visits])];
    const url=URL.createObjectURL(new Blob(["\uFEFF"+lines.map(row=>row.map(cell).join(",")).join("\n")],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`relight-statistics-${data.days}days-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const total=data?.totals;
  return <div className="game-page"><PageHeader admin /><main className="stats-main"><h1>สถิติสำหรับผู้ดูแล</h1><p className="stats-description">ข้อมูลการใช้งานจริงจากเว็บไซต์ เริ่มนับหลังเปิดระบบสถิติ · เวลาไทย</p><form className="stats-access" onSubmit={load}><label>รหัสผู้ดูแล<input type="password" autoComplete="off" value={token} onChange={e=>{setToken(e.target.value);clearData();}} required/></label><label>ช่วงเวลา<select value={days} onChange={e=>{setDays(Number(e.target.value));clearData();}}>{[[1,"วันนี้"],[7,"7 วัน"],[30,"30 วัน"],[90,"90 วัน"]].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><button className="button button-light" disabled={busy}>{busy?"กำลังโหลด…":"ดูสถิติ / รีเฟรช"}</button>{data&&<button type="button" className="button button-outline" onClick={()=>{setToken("");clearData();}}>ออกจากระบบ</button>}</form><p role="status">{message}</p>
  {data&&total&&<><div className="stats-updated"><p>อัปเดต {new Date(data.updatedAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}{data.firstEvent&&<> · เริ่มมีข้อมูล {new Date(data.firstEvent).toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok"})}</>}</p><button className="button button-outline" onClick={csv}>ดาวน์โหลด CSV</button></div><div className="stats-overview">{[["เบราว์เซอร์โดยประมาณ",number(total.visitors),"ไม่ใช่จำนวนคนที่ยืนยันแล้ว"],["เปิดหน้าเว็บ",number(total.views),"รวมการกลับมาและรีโหลด"],["เซสชัน",number(total.visits),"เริ่มใหม่หลังไม่มีกิจกรรม 30 นาที"],["เวลาใช้งาน / เซสชัน",time(total.visits?total.active_seconds/total.visits:0),"เฉพาะเวลาที่หน้าเว็บแสดงอยู่"]].map(([label,value,note])=><div key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></div>)}</div><Charts data={data}/><details className="stats-detail"><summary>ดูตัวเลขทั้งหมด</summary><div className="stats-cards">{[["เริ่ม Puff World: Inside",number(total.inside_starts),"เกมสามมิติ · นับหนึ่งครั้งต่อเซสชัน"],["จบ Puff World: Inside",number(total.inside_completions),"ถึงหน้าจบของการเดินทาง"],["ผู้เข้าชมโดยประมาณ",number(total.visitors),"รหัสเบราว์เซอร์ที่เปิดหน้าเว็บ"],["การเข้าชม",number(total.visits),"เซสชันใหม่เมื่อไม่มีกิจกรรม 30 นาที"],["เปิดหน้าเว็บ",number(total.views),"รวมการกลับมาเปิดและรีโหลด"],["การเข้าชมซ้ำ",number(total.returning_visits),"เบราว์เซอร์ที่เคยมีข้อมูลก่อนเซสชันนี้"],["ใน 5 นาทีล่าสุด",number(total.active),"เบราว์เซอร์ที่ส่งกิจกรรมล่าสุด"],["เวลาเปิดหน้าที่มองเห็น / ครั้ง",time(total.visits?total.active_seconds/total.visits:0),"ประมาณจากหน้าที่แสดงอยู่"],["เริ่ม Light Trail",number(total.puff_starts),"นับหนึ่งครั้งต่อเซสชัน"],["จบ Light Trail",number(total.puff_completions),"สำรวจครบทั้งสามเมือง"],["เริ่มเกม",number(total.starts),"นับหนึ่งครั้งต่อเซสชัน"],["จบเกม",number(total.completions),"นับหนึ่งครั้งต่อเซสชัน"],["อัตราจบเกม",`${number(total.starts?Math.round(total.finished_starts/total.starts*100):0)}%`,"เฉพาะเซสชันที่เริ่มและจบในช่วงนี้"],["ส่งคำตอบสำเร็จ",number(total.wall_submissions),"รวมการอัปเดตคำตอบเดิม"]].map(([title,value,note])=><article key={title}><h2>{title}</h2><strong>{value}</strong><p>{note}</p></article>)}</div></details>
  <section className="stats-panel"><h2>หน้าที่ถูกใช้งาน</h2><div className="stats-table-wrap"><table><thead><tr><th>หน้า</th><th>เปิด</th><th>เบราว์เซอร์</th><th>เวลาที่มองเห็น</th></tr></thead><tbody>{data.pages.map(r=><tr key={r.page}><td>{pageNames[r.page]||r.page}</td><td>{number(r.views)}</td><td>{number(r.visitors)}</td><td>{time(r.active_seconds)}</td></tr>)}</tbody></table></div></section>
  <div className="stats-pair"><section className="stats-panel"><h2>ใช้กิจกรรมเรียนรู้</h2><RankedBars rows={data.interactions.map(r=>({label:sectionNames[r.section]||String(r.section),value:Number(r.interactions)}))}/></section><section className="stats-panel"><h2>ตัวเลือกในเกม</h2><p>ตัวเลือกสุดท้ายต่อสถานการณ์ในแต่ละเซสชัน ไม่ใช่คะแนนหรือผลวัดการเรียนรู้</p><RankedBars rows={data.choices.map(r=>({label:`สถานการณ์ ${r.scene} · ตัวเลือก ${Number(r.choice)+1}`,value:Number(r.visits)}))}/></section></div>
  <p className="stats-note">เก็บข้อมูลย้อนหลังไม่เกิน 90 วัน นับเบราว์เซอร์และเซสชัน ไม่สามารถยืนยันจำนวนคนจริงได้ การปิดสถิติ ล้างข้อมูล เปลี่ยนอุปกรณ์ หรือบอตที่ตรวจไม่พบอาจทำให้ตัวเลขต่างจากจำนวนผู้เข้าชมจริง ไม่มีข้อมูลก่อนติดตั้งระบบ และข้อมูลออฟไลน์อาจมาถึงภายหลัง</p></>}
  </main></div>;
}
