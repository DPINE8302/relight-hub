"use client";
/* eslint-disable @next/next/no-img-element -- Approved local WebP artwork also ships unchanged in the offline cache and static Hub. */

import { useRef, useState, type KeyboardEvent } from "react";
import catalog from "./ecosystem-catalog.json";

// PS5-inspired selection within RE;light: two cover tiles control one expansive
// artwork stage. SKYFRONT opens first; older activities remain in a disclosure.
const games = catalog.games;

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

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
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }
  return (
    <section id="activities" className="game-selection" aria-labelledby="activities-title" data-game={game.id}>
      <div className="game-selection-stage">
        <div className="game-selection-art" aria-hidden="true">
          {games.map((item, index) => <img key={item.id} src={item.backdrop} alt="" width="1536" height="1024" loading="lazy" className={selected === index ? "is-selected" : ""} />)}
        </div>
        <div className="game-selection-shade" aria-hidden="true" />
        <div className="game-selection-inner">
          <h2 id="activities-title">เลือกโลกที่อยากเข้าไป</h2>
          <div className="game-selection-tabs" role="tablist" aria-label="เลือกเกม">
            {games.map((item, index) => (
              <button key={item.id} id={`game-tab-${item.id}`} role="tab" type="button" aria-selected={selected === index} aria-controls={`game-panel-${item.id}`} tabIndex={selected === index ? 0 : -1} ref={node => { tabs.current[index] = node; }} onClick={() => setSelected(index)} onKeyDown={event => navigate(event, index)}>
                <span className="game-selection-cover"><img src={item.cover} alt="" width="1536" height="1024" loading="lazy" /></span>
                <span className="game-selection-name">{item.title}</span>
              </button>
            ))}
          </div>
          {games.map((item, index) => (
            <div key={item.id} id={`game-panel-${item.id}`} role="tabpanel" aria-labelledby={`game-tab-${item.id}`} hidden={selected !== index} className="game-selection-panel">
              <h3>{item.title === "Puff World: Inside" ? <>Puff World<span>Inside</span></> : item.title}</h3>
              <p>{item.description}</p>
              <a className="game-selection-play" href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined}>{item.action}<Arrow />{item.external && <span className="sr-only"> เปิดในแท็บใหม่</span>}</a>
              <small>{item.platform}</small>
            </div>
          ))}
        </div>
      </div>
      <details className="game-selection-extras">
        <summary>กิจกรรมอื่น ๆ <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
        <nav aria-label="กิจกรรมเพิ่มเติม"><a href="/play">ถ้าเป็นคุณ จะเลือกอย่างไร? <Arrow /></a><a href="/light-trail">Light Trail <Arrow /></a></nav>
      </details>
    </section>
  );
}
