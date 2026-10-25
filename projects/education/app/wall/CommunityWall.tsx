"use client";
import { trackMetric } from "../analytics/events";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { wallPrompts, type PromptId, type WallData } from "./prompts";

export default function CommunityWall({ initialPrompt = "response", showQuestion = true }: { initialPrompt?: PromptId; showQuestion?: boolean }) {
  const prompt = initialPrompt;
  const [text, setText] = useState("");
  const [data, setData] = useState<WallData | null>(null);
  const [connection, setConnection] = useState<"loading" | "live" | "offline" | "error">("loading");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const participant = useRef("");
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const submission = useRef<AbortController | null>(null);
  const mutating = useRef(false);
  const id = useId();
  const invalidateRead = useCallback(() => {
    revision.current++;
    controller.current?.abort();
    controller.current = null;
  }, []);
  const active = wallPrompts.find((item) => item.id === prompt)!;

  const refresh = useCallback(async () => {
    // Keep a slow request alive across automatic refresh ticks.
    if (controller.current || mutating.current) return;
    const request = new AbortController();
    const startedAtRevision = revision.current;
    controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 30000);
    try {
      const response = await fetch(`/api/wall?prompt=${prompt}`, { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error("unavailable");
      const next = await response.json() as WallData;
      if (request.signal.aborted || startedAtRevision !== revision.current) return;
      setData(next);
      setConnection("live");
      try { localStorage.setItem(`relight-wall-snapshot-${prompt}`, JSON.stringify(next)); } catch { /* Readable without storage. */ }
    } catch {
      if (controller.current === request && startedAtRevision === revision.current) {
        setConnection(navigator.onLine ? "error" : "offline");
        if (navigator.onLine) trackMetric("site_error", {section:"wall-read-failed"});
      }
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === request) controller.current = null;
    }
  }, [prompt]);

  useEffect(() => {
    const storageKey = `relight-wall-draft-${prompt}`;
    try {
      let token = localStorage.getItem("relight-wall-participant");
      if (!token) { token = crypto.randomUUID(); localStorage.setItem("relight-wall-participant", token); }
      participant.current = token;
      // Restore the device draft after hydration; storage is an external system.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(localStorage.getItem(storageKey) || "");
      const snapshot = localStorage.getItem(`relight-wall-snapshot-${prompt}`);
      if (snapshot) setData(JSON.parse(snapshot));
    } catch { participant.current ||= crypto.randomUUID(); }
    const tick = () => { if (!document.hidden) void refresh(); };
    const offline = () => setConnection("offline");
    void refresh();
    const timer = window.setInterval(tick, 15000);
    window.addEventListener("online", tick);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      invalidateRead();
      submission.current?.abort();
      submission.current = null;
      mutating.current = false;
      setSending(false);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [prompt, refresh, invalidateRead]);

  function updateDraft(value: string) {
    setText(value);
    setMessage("");
    try { localStorage.setItem(`relight-wall-draft-${prompt}`, value); } catch { /* Keep current field. */ }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!navigator.onLine) { setMessage("ยังไม่ได้เผยแพร่ เก็บข้อความไว้แล้ว กดส่งอีกครั้งเมื่อออนไลน์"); return; }
    if (mutating.current) return;
    mutating.current = true;
    invalidateRead();
    setSending(true);
    setMessage("");
    const request = new AbortController();
    submission.current = request;
    const timeout = window.setTimeout(() => request.abort(), 30000);
    try {
      const response = await fetch("/api/wall", {
        signal: request.signal, method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, text, participant: participant.current }),
      });
      const result = await response.json();
      if (submission.current !== request || request.signal.aborted) return;
      if (!response.ok) throw new Error(result.error || "ส่งไม่ได้ ลองใหม่อีกครั้ง");
      trackMetric("wall_submit");
      setData(result);
      setConnection("live");
      setMessage("แปะบนผนังออนไลน์แล้ว ขอบคุณสำหรับคำตอบของคุณ");
      try { localStorage.setItem(`relight-wall-snapshot-${prompt}`, JSON.stringify(result)); localStorage.removeItem(`relight-wall-draft-${prompt}`); } catch { /* Publication still succeeded. */ }
      setText("");
    } catch (error) {
      if (submission.current !== request) return;
      setConnection(navigator.onLine ? "error" : "offline");
      if (navigator.onLine) trackMetric("site_error", {section:"wall-write-failed"});
      setMessage(request.signal.aborted ? "ยังยืนยันการส่งไม่ได้ ข้อความยังอยู่ กดส่งอีกครั้งเมื่อเชื่อมต่อได้" : error instanceof Error ? error.message : "ยังส่งไม่ได้ ข้อความยังอยู่ ลองอีกครั้ง");
    } finally {
      window.clearTimeout(timeout);
      if (submission.current === request) { submission.current = null; mutating.current = false; setSending(false); }
    }
  }

  return (
    <div className="community-wall">
      {showQuestion && <h3 className="wall-question">{active.question}</h3>}
      <form className="wall-form" onSubmit={submit}>
        <label htmlFor={`${id}-answer`}>คำตอบของคุณ</label>
        <textarea id={`${id}-answer`} value={text} disabled={sending} onChange={(event) => updateDraft(event.target.value)} maxLength={120} rows={2} placeholder="เขียนด้วยคำของคุณเอง…" aria-describedby={`${id}-notice`} required />
        <div className="wall-form-bottom"><small>{text.length}/120</small><button type="submit" disabled={sending || !text.trim()}>{sending ? "กำลังส่ง…" : "ส่งคำตอบ →"}</button></div>
        <p className="wall-notice" id={`${id}-notice`}>ข้อความเป็นสาธารณะ ไม่ใส่ข้อมูลส่วนตัว ใช้ข้อความที่เคารพกัน ส่งซ้ำจากอุปกรณ์เดิมจะอัปเดตคำตอบเดิม</p>
        <p className="wall-message" role="status">{message}</p>
      </form>
      <div className="wall-cloud-header"><p>{data ? `${data.total} คำตอบจากทุกคน` : "คำตอบจากทุกคน"}</p><button onClick={() => void refresh()} type="button" disabled={sending}>รีเฟรช</button></div>
      <p className="wall-connection" role="status">{connection === "live" ? "ออนไลน์ · อัปเดตอัตโนมัติ" : connection === "loading" ? "กำลังเชื่อมต่อผนัง…" : data ? "แสดงข้อมูลที่บันทึกไว้ล่าสุด · ยังเชื่อมต่อผนังไม่ได้" : "ยังเชื่อมต่อผนังไม่ได้ · เขียนเก็บไว้แล้วส่งเมื่อออนไลน์ได้"}</p>
      <div className={`wall-cloud wall-cloud-${prompt}`} aria-label="ข้อความจากผู้ร่วมตอบ">
        {data?.groups.map((group) => <span key={group.text} className="wall-word" aria-label={`${group.text} · ${group.count} คำตอบ`} title={`${group.count} คำตอบ`} style={{ fontSize: `${Math.min(64, 20 + Math.log2(Math.max(1, group.count)) * 10)}px`, fontWeight: group.count > 1 ? 700 : 400 }}><span>{group.text}</span></span>)}
        {data?.total === 0 && <p className="wall-empty">ผนังยังว่างอยู่ เริ่มด้วยคำตอบของคุณ</p>}
        {!data && <p className="wall-empty">{connection === "loading" ? "กำลังโหลดคำตอบ…" : "คำตอบจะแสดงที่นี่เมื่อเชื่อมต่อได้"}</p>}
      </div>
      <p className="wall-notice">คำตอบซ้ำจะรวมกันและใหญ่ขึ้น ข้อความเป็นความคิดเห็นของผู้ร่วมตอบ ไม่ใช่ข้อเท็จจริงที่ผ่านการตรวจสอบ</p>
    </div>
  );
}
