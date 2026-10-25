"use client";

import { useEffect, useState, type ReactNode } from "react";

// One operator sign-in serves both analytics and moderation. The key is cleared
// immediately after use; only the server-issued HttpOnly cookie persists.
export default function AdminAccess({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let controller: AbortController;
    const check = () => {
      controller?.abort();
      const request = new AbortController(); controller = request;
      fetch("/api/admin/session", { cache: "no-store", signal: request.signal }).then(response => {
        if (!response.ok) throw new Error();
        return response.json();
      }).then(value => { if (!request.signal.aborted) setAuthenticated(value.authenticated === true); }).catch(() => { if (!request.signal.aborted) { setAuthenticated(false); setMessage("ตรวจสอบการเข้าสู่ระบบไม่ได้ ลองอีกครั้ง"); } });
    };
    check();
    const expired = () => { setAuthenticated(false); setMessage("สิทธิ์หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("relight-admin-session") : null;
    if (channel) channel.onmessage = check;
    window.addEventListener("relight:admin-expired", expired);
    window.addEventListener("focus", check);
    return () => { controller?.abort(); channel?.close(); window.removeEventListener("focus", check); window.removeEventListener("relight:admin-expired", expired); };
  }, []);
  function announceSession() {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("relight-admin-session"); channel.postMessage("changed"); channel.close();
  }
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setToken(""); setAuthenticated(true); announceSession();
    } catch (error) { setMessage(error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("ออกจากระบบไม่สำเร็จ ลองอีกครั้ง");
      setAuthenticated(false); setToken(""); announceSession();
    } catch (error) { setMessage(error instanceof Error ? error.message : "ออกจากระบบไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  if (authenticated === null) return <p role="status">กำลังตรวจสอบสิทธิ์ผู้ดูแล…</p>;
  return <>
    {authenticated ? <><div className="stats-updated"><p>ผู้ดูแล RE;light · ใช้สิทธิ์ร่วมกับสถิติและจัดการผนัง · หมดอายุภายใน 8 ชั่วโมง</p><button type="button" className="button button-outline" disabled={busy} onClick={() => void logout()}>ออกจากระบบ</button></div>{children}</> : <form className="stats-access" onSubmit={login}><label htmlFor="relight-admin-key">รหัสผู้ดูแล<input id="relight-admin-key" type="password" autoComplete="current-password" value={token} onChange={event => setToken(event.target.value)} required maxLength={4096} /></label><button className="button button-light" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบผู้ดูแล"}</button><p>เข้าสู่ระบบครั้งเดียว เพื่อดูสถิติและจัดการผนังคำตอบ</p></form>}
    {message && <p role="status">{message}</p>}
  </>;
}
