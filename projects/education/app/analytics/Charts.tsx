"use client";

import { useEffect, useRef, useState } from "react";
import type { Stats } from "./Dashboard";

const format = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const dateLabel = (day: string) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const thaiDay = (date: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
const pageNames: Record<string, string> = { "/": "เว็บไซต์หลัก", "/play": "เกมสถานการณ์", "/after": "หลัง immersive", "/wall": "ผนังคำตอบ", "/puff-world": "Puff World: Inside", "/light-trail": "Light Trail" };
const deviceNames: Record<string, string> = { mobile: "มือถือ", tablet: "แท็บเล็ต", desktop: "เดสก์ท็อป", unknown: "อื่น ๆ" };
const colors = ["#e7c47b", "#94bdf0", "#d7a3ca", "#b7c898"];

function dailyRows(data: Stats) {
  const end = thaiDay(data.updatedAt);
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - data.days + 1);
  const first = data.firstEvent ? thaiDay(data.firstEvent) : end;
  const source = new Map(data.daily.map(r => [String(r.day), r]));
  const rows: { day: string; views: number; visitors: number }[] = [];
  for (let day = start.toISOString().slice(0, 10); day <= end; start.setUTCDate(start.getUTCDate() + 1), day = start.toISOString().slice(0, 10)) {
    if (day < first) continue;
    const row = source.get(day);
    rows.push({ day, views: Number(row?.views || 0), visitors: Number(row?.visitors || 0) });
  }
  return rows;
}

function Traffic({ data }: { data: Stats }) {
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, []);
  const [metric, setMetric] = useState<"views" | "visitors">("views");
  const [selected, setSelected] = useState<number | null>(null);
  const rows = dailyRows(data);
  const current = Math.max(0, Math.min(selected ?? rows.length - 1, rows.length - 1));
  const inspected = rows[current];
  const max = Math.max(1, ...rows.map(r => r[metric]));
  const step = Math.max(1, Math.ceil(max / 4));
  const ceiling = step * 4;
  const left = rows.length < 4 ? 74 : 54;
  const right = width - (rows.length < 4 ? 44 : 24);
  const plotWidth = right - left;
  const x = (i: number) => rows.length === 1 ? (left + right) / 2 : left + i / (rows.length - 1) * plotWidth;
  const y = (value: number) => 236 - value / ceiling * 208;
  const points = rows.map((r, i) => `${x(i)},${y(r[metric])}`).join(" ");
  const ticks = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  const label = metric === "views" ? "เปิดหน้าเว็บ" : "เบราว์เซอร์รายวัน";
  return <section className="stats-panel stats-traffic" aria-labelledby="traffic-title">
    <div className="stats-chart-heading"><div><h2 id="traffic-title">การเข้าชมรายวัน</h2><p>เริ่มแสดงตั้งแต่วันที่มีข้อมูล · วันนี้ยังไม่สิ้นสุด</p></div>
      <div className="stats-switch" role="group" aria-label="ข้อมูลบนกราฟ">
        <button type="button" aria-pressed={metric === "views"} onClick={() => setMetric("views")}>เปิดหน้าเว็บ</button>
        <button type="button" aria-pressed={metric === "visitors"} onClick={() => setMetric("visitors")}>เบราว์เซอร์</button>
      </div>
    </div>
    {!data.daily.length ? <p className="stats-empty">ยังไม่มีการเข้าชมในช่วงเวลานี้ เมื่อมีข้อมูล กราฟจะแสดงที่นี่</p> : <>
      <div className="stats-inspected" aria-live="polite"><span>{dateLabel(inspected.day)}</span><strong>{format(inspected[metric])}</strong><span>{label}{metric === "views" ? " (ครั้ง)" : " (โดยประมาณ)"}</span></div>
      <svg ref={svg} className="stats-plot" viewBox={`0 0 ${width} 285`} role="img" aria-label={`กราฟ${label} ${dateLabel(rows[0].day)} ถึง ${dateLabel(rows[rows.length - 1].day)} เลื่อนตัวเลือกวันที่ด้านล่างเพื่อดูค่าที่แน่นอน`}>
        {[0, 1, 2, 3, 4].map(t => { const value = ceiling * t / 4; return <g key={t}><line x1="54" x2={width-24} y1={y(value)} y2={y(value)} className="stats-gridline" /><text x="43" y={y(value) + 4} textAnchor="end" className="stats-axis">{format(Math.round(value))}</text></g>; })}
        {rows.length >= 4 && <polygon points={`54,236 ${points} ${right},236`} fill={metric === "views" ? "#e7c47b" : "#94bdf0"} fillOpacity=".08" />}
        {rows.length >= 4 ? <polyline points={points} fill="none" stroke={metric === "views" ? "#e7c47b" : "#94bdf0"} strokeWidth="3" strokeLinejoin="round" /> : rows.map((r,i)=><rect key={r.day} x={x(i)-18} y={y(r[metric])} width="36" height={236-y(r[metric])} rx="3" fill={metric === "views" ? "#e7c47b" : "#94bdf0"} />)}
        <line x1={x(current)} x2={x(current)} y1="28" y2="236" className="stats-crosshair" />
        {rows.map((r, i) => <circle key={r.day} cx={x(i)} cy={y(r[metric])} r={i === current ? 6 : rows.length <= 14 ? 4 : 2} fill={metric === "views" ? "#e7c47b" : "#94bdf0"} stroke="#111827" strokeWidth="2" />)}
        {rows.map((r, i) => <rect key={r.day} x={x(i) - (rows.length === 1 ? plotWidth / 2 : plotWidth / 2 / (rows.length - 1))} y="20" width={rows.length === 1 ? plotWidth : plotWidth / (rows.length - 1)} height="220" fill="transparent" onMouseEnter={() => setSelected(i)} onClick={() => setSelected(i)} />)}
        {ticks.map(i => <text key={i} x={x(i)} y="269" textAnchor={rows.length === 1 ? "middle" : i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"} className="stats-axis">{dateLabel(rows[i].day)}</text>)}
      </svg>
      {rows.length > 1 && <label className="stats-date-slider"><span>เลือกวันที่บนกราฟ</span><input type="range" min="0" max={rows.length - 1} value={current} onChange={e => setSelected(Number(e.target.value))} aria-valuetext={`${dateLabel(inspected.day)}: ${format(inspected[metric])} ${label}`} /></label>}
      {metric === "visitors" && <p className="stats-chart-footnote">เบราว์เซอร์เดียวอาจปรากฏหลายวัน จึงไม่บวกจำนวนรายวันเป็นยอดรวมของช่วงเวลา</p>}
      <details className="stats-chart-data"><summary>ดูข้อมูลรายวันเป็นตาราง</summary><div className="stats-table-wrap"><table><caption className="sr-only">จำนวนการเปิดหน้าเว็บและเบราว์เซอร์รายวัน</caption><thead><tr><th>วันที่</th><th>เปิดหน้าเว็บ</th><th>เบราว์เซอร์โดยประมาณ</th></tr></thead><tbody>{rows.map(r => <tr key={r.day}><td>{dateLabel(r.day)}</td><td>{format(r.views)}</td><td>{format(r.visitors)}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}

type BarRow = { label: string; value: number; note?: string };
export function RankedBars({ rows, unit = "ครั้ง" }: { rows: BarRow[]; unit?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length || !rows.some(r => r.value > 0)) return <p className="stats-empty">ยังไม่มีข้อมูลในช่วงเวลานี้</p>;
  return <ol className="stats-bars">{rows.map(r => <li key={r.label}><div className="stats-bar-label"><span>{r.label}</span><strong>{format(r.value)} <small>{unit}</small></strong></div><div className="stats-bar-track" aria-hidden="true"><span style={{ width: `${r.value / max * 100}%` }} /></div>{r.note && <p>{r.note}</p>}</li>)}</ol>;
}

function Games({ data }: { data: Stats }) {
  const games = [
    { label: "Puff World: Inside", starts: data.totals.inside_starts, ends: data.totals.inside_completions },
    { label: "Light Trail", starts: data.totals.puff_starts, ends: data.totals.puff_completions },
    { label: "เกมสถานการณ์", starts: data.totals.starts, ends: data.totals.completions },
  ];
  const max = Math.max(1, ...games.flatMap(r => [r.starts, r.ends]));
  return <section className="stats-panel"><h2>เริ่มเล่นและเล่นถึงตอนจบ</h2><p>นับเซสชันแยกตามกิจกรรม ในช่วงเวลาที่เลือก</p><div className="stats-legend"><span><i style={{ background: colors[0] }} />เริ่มเล่น</span><span><i style={{ background: colors[1] }} />ถึงตอนจบ</span></div>
    <div className="stats-game-bars">{games.map(g => <div key={g.label}><h3>{g.label}</h3>{[["เริ่มเล่น", g.starts], ["ถึงตอนจบ", g.ends]].map(([label, value], i) => <div className="stats-game-row" key={label}><span>{label}</span><div className="stats-bar-track" aria-hidden="true"><span style={{ width: `${Number(value) / max * 100}%`, background: colors[i] }} /></div><strong>{format(Number(value))}</strong></div>)}</div>)}</div>
    <p className="stats-chart-footnote">จำนวนเริ่มและจบอาจมาจากคนละเซสชัน จึงไม่ใช้หารเป็นอัตราจบ</p>
  </section>;
}

function Devices({ data }: { data: Stats }) {
  const rows = data.devices.map(r => ({ label: deviceNames[String(r.device)] || String(r.device), value: Number(r.views) })).sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return <section className="stats-panel"><h2>สัดส่วนประเภทหน้าจอ</h2><p>จากการเปิดหน้าเว็บทั้งหมด {format(total)} ครั้ง · วัดจากขนาดหน้าจอ</p>{!total ? <p className="stats-empty">ยังไม่มีข้อมูลในช่วงเวลานี้</p> : <>
    <div className="stats-composition" aria-hidden="true">{rows.map((r, i) => <span key={r.label} style={{ width: `${r.value / total * 100}%`, background: colors[i % colors.length] }} />)}</div>
    <ul className="stats-device-list">{rows.map((r, i) => <li key={r.label}><span><i style={{ background: colors[i % colors.length] }} />{r.label}</span><strong>{format(r.value)} ครั้ง <small>{Math.round(r.value / total * 100)}%</small></strong></li>)}</ul>
  </>}</section>;
}

export default function Charts({ data }: { data: Stats }) {
  return <div className="stats-visuals">
    <Traffic key={`${data.days}-${data.updatedAt}`} data={data} />
    <div className="stats-pair"><section className="stats-panel"><h2>หน้าที่มีคนเปิดมากที่สุด</h2><p>เปรียบเทียบจำนวนเปิดหน้าเว็บ รวมการกลับมาและรีโหลด</p><RankedBars rows={data.pages.map(r => ({ label: pageNames[String(r.page)] || String(r.page), value: Number(r.views) })).sort((a, b) => b.value - a.value)} /></section><Games data={data} /></div>
    <div className="stats-pair"><Devices data={data} /><section className="stats-panel"><h2>ที่มาของการเข้าชม</h2><p>โดเมนต้นทางของแต่ละเซสชัน</p><RankedBars rows={data.referrers.map(r => ({ label: r.referrer === "direct" ? "เปิดตรง / ไม่มีข้อมูล" : r.referrer === "internal" ? "ลิงก์ภายในเว็บ" : String(r.referrer), value: Number(r.visits) }))} /></section></div>
  </div>;
}
