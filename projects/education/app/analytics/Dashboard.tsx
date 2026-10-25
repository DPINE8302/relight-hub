"use client";

import PageHeader from "../PageHeader";
import AdminAccess from "../AdminAccess";
import { useEffect, useState } from "react";
import Charts, { RankedBars } from "./Charts";

type Row = Record<string, string | number>;
export type Stats = {
  days: number; source: string; timezone: string; totals: Record<string, number>; previousTotals: Record<string, number>;
  daily: Row[]; pages: Row[]; devices: Row[]; referrers: Row[]; interactions: Row[]; choices: Row[];
  firstEvent: string | null; updatedAt: string; period: {start: string; end: string; previous_start: string; previous_end: string};
  skyfront: { firstEvent: string | null; funnel: Row[]; stages: Row[]; errors: Row[] }; hub: { firstEvent: string | null; referrals: Row[] }; health: {firstEvent: string | null; performanceFirstEvent: string | null; errorFirstEvent: string | null; observations: Row[]}; coverage: Record<string, string>;
};
const number = (value: unknown) => new Intl.NumberFormat("th-TH").format(Number(value) || 0);
const time = (value: unknown) => Number(value) < 60 ? `${number(Math.round(Number(value)))} วินาที` : `${number(Math.round(Number(value) / 60))} นาที`;
const date = (value: string) => new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
const pageNames: Record<string, string> = { "/": "เว็บไซต์หลัก", "/play": "เกมสถานการณ์", "/after": "หลัง immersive", "/wall": "ผนังคำตอบ", "/puff-world": "Puff World: Inside", "/light-trail": "Light Trail", "/skyfront": "Skyfront", "/hub": "RE;light Hub" };
const sectionNames: Record<string, string> = { aerosol: "ละออง", nicotine: "วงจรนิโคติน", body: "ร่างกาย", myths: "เช็กความเชื่อ", marketing: "การตลาด" };
const screenNames: Record<string, string> = { mobile: "จอเล็ก", tablet: "จอกลาง", desktop: "จอใหญ่", unknown: "ไม่ทราบ" };
const modeName = (mode: unknown) => mode === "watch" ? "โหมดชม / อัตโนมัติ" : "ผู้เล่นควบคุม";
const change = (current: number, previous: number) => previous > 0 ? `${current >= previous ? "+" : ""}${number(Math.round((current - previous) / previous * 100))}%` : "ไม่มีฐานเปรียบเทียบ";

export default function Dashboard() {
  return <div className="game-page"><PageHeader admin /><main className="stats-main"><h1>ภาพรวม RE;light</h1><p className="stats-description">ข้อมูลการใช้งานที่เก็บจริง · เวลา Asia/Bangkok · วันนี้ยังไม่สิ้นสุด</p><AdminAccess><AnalyticsControls /></AdminAccess></main></div>;
}

function AnalyticsControls() {
  const [days, setDays] = useState(7);
  const [source, setSource] = useState("all");
  const [data, setData] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    async function read() {
      try {
        const response = await fetch(`/api/analytics?days=${days}&source=${source}`, { cache: "no-store", signal: request.signal });
        const result = await response.json();
        if (response.status === 401) window.dispatchEvent(new Event("relight:admin-expired"));
        if (!response.ok) throw new Error(result.error);
        if (!request.signal.aborted) setData(result);
      } catch (error) {
        if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : "โหลดไม่สำเร็จ ลองอีกครั้ง");
      } finally { if (!request.signal.aborted) setBusy(false); }
    }
    void read();
    return () => request.abort();
  }, [days, source, revision]);
  function refresh() { setBusy(true); setData(null); setMessage(""); setRevision(value => value + 1); }
  function csv() {
    if (!data) return;
    const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [
      ["RE;light statistics", data.source, `${data.days} days`, data.timezone],
      ["current period", data.period.start, data.period.end], ["comparison period", data.period.previous_start, data.period.previous_end],
      ["metric", "current", "comparison"], ...Object.entries(data.totals).map(([key, value]) => [key, value, data.previousTotals[key] ?? "not available"]), [],
      ["date", "page views", "browser identifiers"], ...data.daily.map(r => [r.day, r.views, r.visitors]), [],
      ["page", "views", "browser identifiers", "visible seconds"], ...data.pages.map(r => [r.page, r.views, r.visitors, r.active_seconds]), [],
      ["viewport category", "views"], ...data.devices.map(r => [r.device, r.views]), [],
      ["referrer domain", "visits"], ...data.referrers.map(r => [r.referrer, r.visits]), [],
      ["education section", "interactions"], ...data.interactions.map(r => [r.section, r.interactions]), [],
      ["scene", "last choice", "sessions"], ...data.choices.map(r => [r.scene, r.choice, r.visits]), [],
      ["Skyfront mode", "starts", "resumes", "tutorial completions", "tutorial skips", "campaign completions", "observed exits"], ...data.skyfront.funnel.map(r => [r.mode, r.starts, r.resumes, r.tutorial_completions, r.tutorial_skips, r.campaign_completions, r.observed_exits]), [],
      ["Skyfront stage event", "stage", "mode", "viewport", "sessions"], ...data.skyfront.stages.map(r => [r.type, r.scene, r.mode, r.device, r.sessions]), [],
      ["Skyfront error/recovery", "viewport", "events", "sessions"], ...data.skyfront.errors.map(r => [r.code, r.device, r.events, r.sessions]), [],
      ["Hub action", "destination", "clicks", "sessions"], ...data.hub.referrals.map(r => [r.type, r.destination, r.clicks, r.sessions]), [],
      ["Website observation", "code", "page", "viewport", "events", "sessions"], ...data.health.observations.map(r => [r.type,r.code,r.page,r.device,r.events,r.sessions]), [],
      ["coverage", "state"], ...Object.entries(data.coverage), [],
      ["Definitions", "Anonymous browsers, not verified people. Sessions restart after 30 minutes inactivity. Completion counts are not a learning outcome. Missing instrumentation is not zero activity. Comparison aligns the same elapsed time; both windows may have incomplete coverage."],
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.map(row => row.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `relight-${data.source}-${data.days}days.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const total = data?.totals;
  const awaitingSource = data?.source === "skyfront" && !data.skyfront.firstEvent || data?.source === "hub" && !data.hub.firstEvent;
  const comparison = (key: string) => !data?.firstEvent || Date.parse(data.firstEvent) > Date.parse(data.period.previous_start) ? "ข้อมูลช่วงเทียบไม่ครบ" : change(data.totals[key], data.previousTotals[key]);
  return <>
    <form className="stats-access" onSubmit={event => { event.preventDefault(); refresh(); }}>
      <label>ช่วงเวลา<select aria-label="ช่วงเวลา" value={days} onChange={event => { setDays(Number(event.target.value)); refresh(); }}>{[[1, "วันนี้"], [7, "7 วัน"], [30, "30 วัน"], [90, "90 วัน"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>ประสบการณ์<select aria-label="ประสบการณ์" value={source} onChange={event => { setSource(event.target.value); refresh(); }}><option value="all">ทั้งหมดที่เก็บข้อมูล</option><option value="education">Education</option><option value="skyfront">Skyfront</option><option value="hub">Hub</option></select></label>
      <button className="button button-light" disabled={busy}>{busy ? "กำลังโหลด…" : "รีเฟรชข้อมูล"}</button>
    </form>
    <p role="status">{message || (busy ? "กำลังอ่านข้อมูลจากระบบ…" : "")}</p>
    {data && total && <>
      <div className="stats-updated"><p>อัปเดต {date(data.updatedAt)}{data.firstEvent && <> · ข้อมูลเก่าสุดที่ยังเก็บ {date(data.firstEvent)}</>}</p><button className="button button-outline" onClick={csv}>ดาวน์โหลด CSV</button></div>
      <div className="stats-overview">{[
        ["เบราว์เซอร์โดยประมาณ", awaitingSource ? "—" : number(total.visitors), `${comparison("visitors")} จากช่วงเทียบ · ไม่ใช่จำนวนคน`],
        ["เปิดหน้าเว็บ", awaitingSource ? "—" : number(total.views), `${comparison("views")} จากช่วงเทียบ · รวมรีโหลด`],
        ["เซสชัน", awaitingSource ? "—" : number(total.visits), `${comparison("visits")} จากช่วงเทียบ · หยุด 30 นาทีเริ่มใหม่`],
        ["เวลาใช้งาน / เซสชัน", total.visits ? time(total.active_seconds / total.visits) : "—", "เฉพาะเวลาที่หน้าเว็บแสดงอยู่ · ค่าประมาณ"],
      ].map(([label, value, note]) => <div key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></div>)}</div>
      {data.firstEvent && Date.parse(data.firstEvent) > Date.parse(data.period.start) && <p className="stats-note">ช่วงที่เลือกเริ่มก่อนข้อมูลที่ยังเก็บอยู่ จึงแสดงเฉพาะสิ่งที่เก็บได้ตั้งแต่ {date(data.firstEvent)}</p>}
      <details className="stats-chart-data"><summary>ช่วงเปรียบเทียบและนิยาม</summary><p>ช่วงนี้ {date(data.period.start)} ถึง {date(data.period.end)} · เปรียบเทียบ {date(data.period.previous_start)} ถึง {date(data.period.previous_end)} โดยใช้เวลาที่ผ่านไปเท่ากัน</p><p>ช่วง 7/30/90 วันเริ่มเที่ยงคืนวันแรกตามเวลาไทย วันนี้ยังไม่สิ้นสุด หากระบบเริ่มเก็บข้อมูลภายหลังวันเริ่มช่วง ตัวเลขมีความครอบคลุมไม่ครบ ไม่มีการเติมข้อมูลก่อนเริ่มเก็บ</p><p>รหัสเบราว์เซอร์เป็นแบบไม่ระบุตัวตน แต่ละเว็บไซต์อาจได้รหัสต่างกัน จึงไม่ใช่จำนวนบุคคลไม่ซ้ำข้ามเว็บไซต์</p></details>
      <Charts data={data} />
      <Skyfront data={data} />
      <HubReferrals data={data} />
      <WebsiteHealth data={data} />
      <section className="stats-panel"><h2>หน้าที่ถูกใช้งาน</h2><div className="stats-table-wrap"><table><thead><tr><th>หน้า</th><th>เปิด</th><th>เบราว์เซอร์</th><th>เวลาที่มองเห็น</th></tr></thead><tbody>{data.pages.map(r => <tr key={r.page}><td>{pageNames[r.page] || r.page}</td><td>{number(r.views)}</td><td>{number(r.visitors)}</td><td>{time(r.active_seconds)}</td></tr>)}</tbody></table></div>{!data.pages.length && <p className="stats-empty">ยังไม่มีข้อมูลในช่วงเวลานี้</p>}</section>
      {(data.source === "all" || data.source === "education") && <><div className="stats-pair"><section className="stats-panel"><h2>ใช้กิจกรรมเรียนรู้</h2><RankedBars rows={data.interactions.map(r => ({ label: sectionNames[r.section] || String(r.section), value: Number(r.interactions) }))} /></section><section className="stats-panel"><h2>ตัวเลือกในเกมสถานการณ์</h2><p>ตัวเลือกสุดท้ายต่อสถานการณ์ในแต่ละเซสชัน ไม่ใช่คะแนนหรือผลวัดการเรียนรู้</p><RankedBars rows={data.choices.map(r => ({ label: `สถานการณ์ ${r.scene} · ตัวเลือก ${Number(r.choice) + 1}`, value: Number(r.visits) }))} /></section></div>
      <details className="stats-detail"><summary>ตัวเลขกิจกรรมทั้งหมด</summary><div className="stats-cards">{[
        ["เริ่ม Puff World: Inside", number(total.inside_starts), "เฉพาะเหตุการณ์ inside_start ใน /puff-world"], ["จบ Puff World: Inside", number(total.inside_completions), "ถึงหน้าจบของการเดินทาง"],
        ["การเข้าชมซ้ำ", number(total.returning_visits), "เคยมีข้อมูลก่อนเซสชันนี้ ภายในข้อมูลที่ยังเก็บอยู่"], ["ใน 5 นาทีล่าสุด", number(total.active), "เบราว์เซอร์ที่ส่งกิจกรรมล่าสุดของแหล่งที่เลือก"],
        ["เริ่ม Light Trail", number(total.puff_starts), "เฉพาะ /light-trail · หนึ่งครั้งต่อเซสชัน"], ["จบ Light Trail", number(total.puff_completions), "เฉพาะ /light-trail"],
        ["เริ่มเกมสถานการณ์", number(total.starts), "หนึ่งครั้งต่อเซสชัน"], ["จบเกมสถานการณ์", number(total.completions), "หนึ่งครั้งต่อเซสชัน"],
        ["อัตราจบเกมสถานการณ์", total.starts ? `${number(Math.round(total.finished_starts / total.starts * 100))}%` : "—", "เซสชันที่มีเริ่มก่อนจบ และทั้งคู่ในช่วงนี้"],
        ["ส่งคำตอบสำเร็จ", number(total.wall_submissions), "การส่งที่รายงานผ่านสถิติ รวมอัปเดตคำตอบเดิม"], ["เหตุการณ์ Puff รุ่นเดิม", number(total.legacy_puff_starts), "เก็บแยกจาก Light Trail ไม่เปลี่ยนความหมายข้อมูลเก่า"],
      ].map(([title, value, note]) => <article key={title}><h2>{title}</h2><strong>{value}</strong><p>{note}</p></article>)}</div></details></>}
      <section className="stats-panel"><h2>ความครอบคลุมของข้อมูล</h2><div className="stats-table-wrap"><table><thead><tr><th>ระบบ</th><th>สถานะการวัด</th></tr></thead><tbody>
        <tr><td>Education / กำแพง / เกม</td><td>เก็บเหตุการณ์ตามที่ผู้ใช้อนุญาต · ไม่ใช่ทุกกิจกรรมบนเซิร์ฟเวอร์</td></tr>
        <tr><td>Skyfront</td><td>{data.skyfront.firstEvent ? `เริ่มพบข้อมูล ${date(data.skyfront.firstEvent)}` : "รอเหตุการณ์จากเกมที่ติดตั้งระบบวัดแล้ว · ยังไม่มีข้อมูลย้อนหลัง"}</td></tr>
        <tr><td>บัญชีผู้ใช้ / การสมัคร</td><td>การเรียนรู้และกำแพงไม่ต้องสมัคร · ไม่มีตัวเลขการสมัคร</td></tr>
        <tr><td>AI QuitBot</td><td>บริการภายนอก · ไม่มีข้อมูลแชทหรือบัญชีจากผู้ให้บริการ</td></tr>
        <tr><td>Hub / ลิงก์และดาวน์โหลด</td><td>{data.hub.firstEvent ? `เริ่มพบข้อมูล ${date(data.hub.firstEvent)}` : "รอเหตุการณ์จาก Hub รุ่นที่รองรับ · ยังไม่มีข้อมูลย้อนหลัง"} · คลิกดาวน์โหลดไม่ยืนยันการติดตั้ง</td></tr>
        <tr><td>Windows / ประสิทธิภาพระบบ</td><td>ยังไม่มีระบบส่งสถิติเหล่านี้ · ไม่ใช่ศูนย์การใช้งาน</td></tr>
      </tbody></table></div></section>
      <p className="stats-note">เก็บข้อมูลย้อนหลังไม่เกิน 90 วัน นับเบราว์เซอร์และเซสชัน ไม่ยืนยันจำนวนคน การปิดสถิติ ล้างข้อมูล เปลี่ยนอุปกรณ์ และบอตที่ตรวจไม่พบทำให้ตัวเลขคลาดเคลื่อนได้ ขนาดจอไม่ใช่รุ่นอุปกรณ์ ไม่มีการบันทึกชื่อ อีเมล ข้อความแชท คำตอบบนผนัง หรือ IP ดิบในสถิติ</p>
    </>}
  </>;
}

function Skyfront({ data }: { data: Stats }) {
  if (!["all", "skyfront"].includes(data.source)) return null;
  return <section className="stats-panel"><h2>Skyfront · เส้นทางการเล่นและความเสถียร</h2>
    <p>นับเซสชันที่รายงานเหตุการณ์แคมเปญหลักในช่วงที่เลือก แยกผู้เล่นควบคุมกับการเล่นที่ใช้โหมดชม การเล่นซ้ำในเซสชันเดียวไม่นับเป็นคนใหม่ เริ่ม/เล่นต่อ/จบอาจเป็นคนละกลุ่ม และเซสชันเดียวอาจมีทั้งสองโหมด จึงไม่บวกเป็นผู้เล่นไม่ซ้ำ</p>
    {!data.skyfront.funnel.length ? <p className="stats-empty">ยังไม่มีข้อมูล Skyfront ในช่วงนี้ ต้องติดตั้งเกมและ API รุ่นที่รองรับก่อนจึงเริ่มวัดได้ ไม่มีการประมาณข้อมูลย้อนหลัง</p> : <div className="stats-table-wrap"><table><thead><tr><th>โหมด</th><th>เริ่มใหม่</th><th>เล่นต่อจุดตรวจ</th><th>จบบทฝึก</th><th>ข้ามบทฝึก</th><th>จบแคมเปญ</th><th>ออกที่รายงานได้</th></tr></thead><tbody>{data.skyfront.funnel.map(row => <tr key={row.mode}><td>{modeName(row.mode)}</td><td>{number(row.starts)}</td><td>{number(row.resumes)}</td><td>{number(row.tutorial_completions)}</td><td>{number(row.tutorial_skips)}</td><td>{number(row.campaign_completions)}</td><td>{number(row.observed_exits)}</td></tr>)}</tbody></table></div>}
    <p className="stats-chart-footnote">การออกหรือเบราว์เซอร์ปิดตัวอาจส่งเหตุการณ์ไม่ทัน จึงไม่เท่ากับการเลิกเล่นทั้งหมด และไม่ใช้ลบจากจำนวนเริ่มเพื่ออ้างจำนวนผู้เล่นที่หายไป</p>
    <details className="stats-chart-data"><summary>บทฝึกและภารกิจ แยกตามขนาดจอ</summary>{!data.skyfront.stages.length ? <p>ยังไม่มีเหตุการณ์ขั้นตอน</p> : <div className="stats-table-wrap"><table><thead><tr><th>เหตุการณ์</th><th>ขั้น</th><th>โหมด</th><th>ขนาดจอ</th><th>เซสชัน</th></tr></thead><tbody>{data.skyfront.stages.map(row => <tr key={`${row.type}-${row.scene}-${row.mode}-${row.device}`}><td>{row.type === "skyfront_tutorial_step" ? "ถึงขั้นบทฝึก" : row.type === "skyfront_mission_start" ? "เริ่มภารกิจ" : "จบภารกิจ"}</td><td>{Number(row.scene) + 1}</td><td>{modeName(row.mode)}</td><td>{screenNames[row.device] || row.device}</td><td>{number(row.sessions)}</td></tr>)}</tbody></table></div>}</details>
    <details className="stats-chart-data"><summary>ข้อผิดพลาดและการกู้คืนที่เกมรายงาน</summary>{!data.skyfront.errors.length ? <p>ไม่มีรายงานในช่วงนี้ · ไม่ยืนยันว่าไม่มีข้อผิดพลาดบนอุปกรณ์ที่ส่งสถิติไม่ได้</p> : <div className="stats-table-wrap"><table><thead><tr><th>รหัส</th><th>ขนาดจอ</th><th>เหตุการณ์</th><th>เซสชัน</th></tr></thead><tbody>{data.skyfront.errors.map(row => <tr key={`${row.code}-${row.device}`}><td>{row.code}</td><td>{screenNames[row.device] || row.device}</td><td>{number(row.events)}</td><td>{number(row.sessions)}</td></tr>)}</tbody></table></div>}</details>
  </section>;
}


function HubReferrals({ data }: { data: Stats }) {
  if (!["all", "hub"].includes(data.source)) return null;
  const destinations: Record<string, string> = { education: "Education", skyfront: "Skyfront", puff: "Puff World: Inside", scenario: "เกมสถานการณ์", "light-trail": "Light Trail", wall: "ผนังคำตอบ", help: "ความช่วยเหลือ", mac: "แอป Mac", "win-x64": "แอป Windows x64", "win-arm64": "แอป Windows ARM64" };
  return <section className="stats-panel"><h2>Hub · ทางเข้าประสบการณ์และดาวน์โหลด</h2><p>นับคลิกที่ Hub รายงาน แสดงทั้งจำนวนคลิกและเซสชันที่มีคลิก การเปิดลิงก์ไม่ยืนยันว่าปลายทางโหลดสำเร็จ และคลิกดาวน์โหลดไม่ใช่จำนวนติดตั้งหรือการใช้งานแอป</p>
    {!data.hub.referrals.length ? <p className="stats-empty">{data.hub.firstEvent ? "ยังไม่มีคลิกลิงก์หรือดาวน์โหลดที่รายงานในช่วงนี้" : "รอข้อมูลจาก Hub รุ่นที่ติดตั้งระบบวัด ไม่มีการสร้างสถิติย้อนหลัง"}</p> : <div className="stats-table-wrap"><table><thead><tr><th>ปลายทาง</th><th>การกระทำ</th><th>คลิก</th><th>เซสชัน</th></tr></thead><tbody>{data.hub.referrals.map(row => <tr key={`${row.type}-${row.destination}`}><td>{destinations[row.destination] || row.destination}</td><td>{row.type === "hub_download" ? "คลิกดาวน์โหลด" : "เปิดลิงก์"}</td><td>{number(row.clicks)}</td><td>{number(row.sessions)}</td></tr>)}</tbody></table></div>}
  </section>;
}


function WebsiteHealth({data}: {data: Stats}) {
  const [viewport,setViewport]=useState("all");
  if(data.source==="skyfront")return null;
  const rows=data.health.observations.filter(row=>viewport==="all"||row.device===viewport);
  const loads=rows.filter(row=>row.type==="site_performance");
  const errors=rows.filter(row=>row.type==="site_error");
  const samples=loads.reduce((sum,row)=>sum+Number(row.events),0);
  const labels: Record<string,string>={"load-under-1s":"น้อยกว่า 1 วินาที","load-1-3s":"1 ถึงน้อยกว่า 3 วินาที","load-3-6s":"3 ถึงน้อยกว่า 6 วินาที","load-over-6s":"6 วินาทีขึ้นไป","runtime-error":"สคริปต์ทำงานผิดพลาด","unhandled-rejection":"งานเบื้องหลังผิดพลาด","resource-error":"ทรัพยากรโหลดไม่สำเร็จ","wall-read-failed":"โหลดผนังไม่สำเร็จ / หมดเวลา","wall-write-failed":"ส่งคำตอบไม่สำเร็จ"};
  return <section className="stats-panel"><h2>สุขภาพเว็บไซต์ · Education และ Hub</h2>
    <p>เหตุการณ์จากเบราว์เซอร์ที่เปิดสถิติ รหัสข้อผิดพลาดจำกัด 5 ครั้งต่อรหัสต่อการเปิดหน้า ไม่เก็บข้อความข้อผิดพลาดหรือ URL ส่วนตัว การปิดหน้าเร็วและสคริปต์เริ่มไม่ได้อาจไม่มีรายงาน</p>
    <label className="stats-health-filter">ขนาดจอ <select aria-label="ขนาดจอสำหรับสุขภาพเว็บไซต์" value={viewport} onChange={event=>setViewport(event.target.value)}><option value="all">ทุกขนาด</option>{Object.entries(screenNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {!data.health.firstEvent ? <p className="stats-empty">รอข้อมูลจากเว็บไซต์รุ่นที่ติดตั้งระบบวัด ไม่มีข้อมูลย้อนหลังและไม่มีการแทนค่าที่ขาดด้วยศูนย์</p> : <>
      <p>เริ่มพบข้อมูล {date(data.health.firstEvent)} · ช่วงเวลาโหลด {number(samples)} ตัวอย่างในตัวกรองนี้</p>
      {samples > 0 ? <RankedBars rows={["load-under-1s","load-1-3s","load-3-6s","load-over-6s"].map(code=>({label:labels[code],value:loads.filter(row=>row.code===code).reduce((sum,row)=>sum+Number(row.events),0)}))} /> : <p className="stats-empty">ไม่มีตัวอย่างเวลาโหลดในช่วงและขนาดจอที่เลือก จึงยังไม่มีการกระจายเวลาให้แสดง</p>}
      <p>เวลาจาก Navigation Timing ตั้งแต่เริ่มนำทางจนเอกสารโหลดเสร็จ หน่วยเป็นช่วงวินาที วัดครั้งเดียวต่อเอกสาร ไม่รวมการเปลี่ยนหน้าแบบ client และไม่ใช่ Core Web Vitals หรือเวลาเริ่มเกม</p>
      {!errors.length ? <p className="stats-empty">ไม่มีรายงานข้อผิดพลาดในช่วงและขนาดจอที่เลือก ไม่ยืนยันว่าไม่มีข้อผิดพลาดเกิดขึ้น</p> : <div className="stats-table-wrap"><table><thead><tr><th>หน้า</th><th>รหัส</th><th>ขนาดจอ</th><th>เหตุการณ์</th><th>เซสชัน</th></tr></thead><tbody>{errors.map(row=><tr key={`${row.page}-${row.device}-${row.code}`}><td>{pageNames[row.page]||row.page}</td><td>{labels[row.code]||row.code}</td><td>{screenNames[row.device]||row.device}</td><td>{number(row.events)}</td><td>{number(row.sessions)}</td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}
