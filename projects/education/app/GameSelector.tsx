"use client";
/* eslint-disable @next/next/no-img-element -- Approved artwork is shared unchanged with the offline cache and Hub. */
import { useRef, useState, type KeyboardEvent } from "react";
import catalog from "./ecosystem-catalog.json";
const games = catalog.games;
function Arrow() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

export default function GameSelector() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const game = games[selected];
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % games.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + games.length) % games.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = games.length - 1;
    else return;
    event.preventDefault(); setSelected(next); tabs.current[next]?.focus();
  }
  return (
    <section id="activities" className="game-selection" aria-labelledby="activities-title" data-game={game.id}>
      <div className="game-selection-stage">
        <div className="game-selection-ambient" aria-hidden="true">
          {games.map((item,index) => <img key={item.id} src={item.cover} alt="" width="1536" height="1024" loading="lazy" className={selected === index ? "is-selected" : ""} />)}
        </div>
        <div className="game-selection-inner">
          <h2 id="activities-title">เลือกโลกที่อยากเข้าไป</h2>
          <div className="game-selection-tabs" role="tablist" aria-label="เลือกเกม">
            {games.map((item,index) => <button key={item.id} id={`game-tab-${item.id}`} role="tab" type="button" aria-selected={selected === index} aria-controls={`game-panel-${item.id}`} tabIndex={selected === index ? 0 : -1} ref={node => { tabs.current[index] = node; }} onClick={() => setSelected(index)} onKeyDown={event => navigate(event,index)}>
              <span className="game-selection-cover"><img src={item.cover} alt="" width="1536" height="1024" loading="lazy" /></span>
              <span className="game-selection-name">{item.title}</span>
            </button>)}
          </div>
        </div>
        <div className="game-selection-art">
          {games.map((item,index) => <img key={item.id} src={item.cover} alt={item.id === "skyfront" ? "โปสเตอร์เต็ม SKYFRONT นักบินและฝูงบินเหนือแนวชายฝั่ง" : "โปสเตอร์เต็ม Airy ในโลก Puff World: Inside"} width="1536" height="1024" loading="lazy" aria-hidden={selected !== index} className={selected === index ? "is-selected" : ""} />)}
        </div>
        <div className="game-selection-footer">
          {games.map((item,index) => <div key={item.id} id={`game-panel-${item.id}`} role="tabpanel" aria-labelledby={`game-tab-${item.id}`} hidden={selected !== index} className="game-selection-panel" tabIndex={0}>
            <div className="game-selection-copy"><h3>{item.title}</h3><p>{item.description}</p><small>{item.platform}</small></div>
            <div className="game-selection-actions"><a className="game-selection-play" href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined}>{item.action}<Arrow />{item.external && <span className="sr-only"> เปิดในแท็บใหม่</span>}</a><a className="game-selection-full-art" href={item.cover} target="_blank" rel="noreferrer">ดูโปสเตอร์เต็ม <span aria-hidden="true">↗</span><span className="sr-only"> เปิดในแท็บใหม่</span></a></div>
          </div>)}
        </div>
      </div>
      <details className="game-selection-extras"><summary>กิจกรรมอื่น ๆ <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></summary><nav aria-label="กิจกรรมเพิ่มเติม"><a href="/play">ถ้าเป็นคุณ จะเลือกอย่างไร? <Arrow /></a><a href="/light-trail">Light Trail <Arrow /></a></nav></details>
    </section>
  );
}
