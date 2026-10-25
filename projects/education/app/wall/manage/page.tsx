"use client";

import PageHeader from "../../PageHeader";
import AdminAccess from "../../AdminAccess";
import { useEffect, useState } from "react";
import { wallPrompts, type WallData } from "../prompts";

export default function ManageWall() {
  return <div className="game-page"><PageHeader admin /><main className="game-main"><h1>จัดการผนังคำตอบ</h1><p className="game-lede">ซ่อนข้อความที่ไม่เหมาะสม หรือล้างผนังเพื่อเริ่มรับคำตอบใหม่</p><AdminAccess><WallControls /></AdminAccess></main></div>;
}

function WallControls() {
  const prompt = "response";
  const [data, setData] = useState<WallData | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const response = await fetch(`/api/wall?prompt=${prompt}`, { cache: "no-store" });
      if (!response.ok) throw new Error("เชื่อมต่อไม่ได้");
      setData(await response.json()); setStatus("");
    } catch { setStatus("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง"); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/wall?prompt=${prompt}`, { cache: "no-store", signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(setData).catch(() => { if (!controller.signal.aborted) setStatus("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง"); });
    return () => controller.abort();
  }, []);
  async function hide(text: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/wall", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, text }) });
      const result = await response.json();
      if (response.status === 401) window.dispatchEvent(new Event("relight:admin-expired"));
      if (!response.ok) throw new Error(result.error);
      setData(result); setStatus("ซ่อนข้อความแล้ว");
    } catch (error) { setStatus(error instanceof Error ? error.message : "ซ่อนไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function clean(action: "clear" | "restore") {
    setBusy(true);
    try {
      const response = await fetch("/api/wall", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, action }) });
      const result = await response.json();
      if (response.status === 401) window.dispatchEvent(new Event("relight:admin-expired"));
      if (!response.ok) throw new Error(result.error);
      setData(result); setConfirmClear(false);
      setStatus(action === "clear" ? "ล้างผนังแล้ว พร้อมรับคำตอบใหม่" : "คืนคำตอบที่ล้างแล้ว ข้อความที่ซ่อนยังไม่แสดง");
    } catch (error) { setStatus(error instanceof Error ? error.message : "จัดการไม่สำเร็จ ลองอีกครั้ง"); }
    finally { setBusy(false); }
  }
  return <div className="wall-manage"><button type="button" disabled={busy} onClick={() => void load()}>{busy ? "กำลังโหลด…" : "รีเฟรชคำตอบ"}</button><p className="wall-admin-question">{wallPrompts[0].question}</p><p role="status">{status}</p>{data && <><p className="wall-admin-count">{data.total} คำตอบ · {data.groups.length} ข้อความที่แตกต่าง</p><div className="wall-clean-actions"><button disabled={busy || !data.total} onClick={() => setConfirmClear(true)}>ล้างผนังทั้งหมด</button><button disabled={busy} onClick={() => void clean("restore")}>คืนคำตอบที่ล้าง</button></div>{confirmClear && <div className="wall-clear-confirm" role="group" aria-label="ยืนยันการล้างผนัง"><p>ล้างทั้ง {data.total} คำตอบออกจากผนัง?</p><p>ผู้ชมส่งคำตอบใหม่ได้ และคุณคืนคำตอบที่ล้างได้ภายหลัง ข้อความที่ซ่อนจะยังไม่แสดง</p><div className="wall-clean-actions"><button disabled={busy} onClick={() => void clean("clear")}>ยืนยันล้างผนัง</button><button disabled={busy} onClick={() => setConfirmClear(false)}>ยกเลิก</button></div></div>}<ul>{data.groups.map(group => <li key={group.text}><span>{group.text}<small>{group.count} คำตอบ</small></span><button disabled={busy} onClick={() => hide(group.text)} aria-label={`ซ่อนข้อความ ${group.text}`}>ซ่อนข้อความ</button></li>)}</ul>{!data.groups.length && <p className="wall-empty">ยังไม่มีข้อความบนผนัง</p>}</>}</div>;
}
