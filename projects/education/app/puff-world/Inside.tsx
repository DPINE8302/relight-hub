"use client";
import PageHeader from "../PageHeader";
import { useEffect, useRef, useState } from "react";
import { trackMetric } from "../analytics/events";

export default function Inside() {
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ended, setEnded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const launch = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!playing || loaded) return;
    const timeout = window.setTimeout(() => setFailed(true), 25000);
    return () => window.clearTimeout(timeout);
  }, [playing, loaded, attempt]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.source !== "puff-inside") return;
      if (event.data.type === "start") { trackMetric("inside_start"); setEnded(false); }
      if (event.data.type === "complete") { trackMetric("inside_complete"); setEnded(true); }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  function close() {
    setPlaying(false); setLoaded(false); setEnded(false); setFailed(false);
    requestAnimationFrame(() => launch.current?.focus());
  }
  function retry() { setFailed(false); setLoaded(false); setAttempt(value => value + 1); }
  return <div className={`pw-page inside-page${playing ? " is-playing" : ""}`}>
    <PageHeader>{playing ? <div className="inside-player-actions">{ended && <a className="inside-next" href="/after">ลองเลือกคำตอบ ↗</a>}<button className="inside-back" onClick={close}>← กลับ</button></div> : undefined}</PageHeader>
    {playing ? <main className="inside-player">
      {!loaded && <div className="inside-loading" role="status">{failed ? <><p>เปิดเกมไม่สำเร็จ</p><button className="pw-primary" onClick={retry}>ลองอีกครั้ง ↗</button></> : <><span className="inside-loading-dot" aria-hidden="true" /><p>กำลังเปิดโลกของ Airy…</p></>}</div>}
      <iframe key={attempt} ref={frame} title="PUFF WORLD: INSIDE · เกมสามมิติ" src="/games/puff-world-inside/index.html" allow="fullscreen; autoplay" allowFullScreen onError={() => setFailed(true)} onLoad={() => { setLoaded(true); setFailed(false); }} />
    </main> : <>
      <main className="pw-intro inside-intro">
        <div className="pw-intro-copy"><h1>Puff World.<br /><span>Inside.</span></h1><p className="pw-lede">พา Airy ผ่านโลกข้างใน<br />กลับสู่อากาศใส</p><button ref={launch} className="pw-primary" onClick={() => setPlaying(true)}>เข้าสู่โลกของ Airy <span>↗</span></button><p className="pw-small">คอมพิวเตอร์ · คีย์บอร์ดและเมาส์</p><a className="game-text-link inside-mobile-option" href="/light-trail">เล่นบนมือถือ? ลอง Light Trail ↗</a></div>
        <div className="inside-preview"><div className="inside-preview-image" role="img" aria-label="โปสเตอร์ Airy จากเกม Puff World: Inside" /></div>
      </main>
    </>}
  </div>;
}
