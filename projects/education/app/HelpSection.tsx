"use client";

import { useState } from "react";

const service = "https://www.thailandquitline.or.th/site/about/service";
const chat = "https://quitbot.thailandquitline.or.th/";

export default function HelpSection() {
  const [channel, setChannel] = useState<"phone" | "chat">("phone");
  function navigate(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "phone" : event.key === "End" ? "chat" : channel === "phone" ? "chat" : "phone";
    setChannel(next);
    document.getElementById(`help-tab-${next}`)?.focus();
  }
  return <section id="help" className="support-section" aria-labelledby="help-title">
    <div className="support-inner">
      <div className="support-intro"><h2 id="help-title">ก้าวต่อไป<br /><span>ในจังหวะของคุณ</span></h2><p>ไม่ต้องเริ่มคนเดียว เลือกวิธีคุยที่สะดวก หรือเริ่มจากคนที่คุณไว้ใจ</p><a className="support-source" href={service} target="_blank" rel="noreferrer">ศูนย์บริการเลิกบุหรี่ทางโทรศัพท์แห่งชาติ ↗<span className="sr-only"> เปิดในแท็บใหม่</span></a></div>
      <div className="support-options">
        <div className="support-tabs" role="tablist" aria-label="เลือกช่องทางช่วยเลิกบุหรี่">
          <button type="button" role="tab" id="help-tab-phone" aria-selected={channel === "phone"} aria-controls="help-panel-phone" tabIndex={channel === "phone" ? 0 : -1} onKeyDown={navigate} onClick={() => setChannel("phone")}>โทรคุย</button>
          <button type="button" role="tab" id="help-tab-chat" aria-selected={channel === "chat"} aria-controls="help-panel-chat" tabIndex={channel === "chat" ? 0 : -1} onKeyDown={navigate} onClick={() => setChannel("chat")}>แชทกับ AI</button>
        </div>
        <div className="support-panel" id="help-panel-phone" role="tabpanel" aria-labelledby="help-tab-phone" tabIndex={0} hidden={channel !== "phone"}>
          <h3>คุยกับผู้ให้คำปรึกษา</h3><p>สายด่วนเลิกบุหรี่ 1600 ฟรีทุกเครือข่าย</p><p className="support-hours">ทุกวัน 09:00 ถึง 23:00 น.</p><a className="support-action" href="tel:1600">โทร 1600 <span aria-hidden="true">↗</span></a>
          <details className="support-details"><summary>นอกเวลา หรืออยากปรึกษาใกล้บ้าน</summary><p>นอกเวลา ฝากชื่อและเบอร์โทรกลับที่ 1600 ได้ หรือขอคำปรึกษาที่สถานพยาบาลกระทรวงสาธารณสุขใกล้บ้าน</p></details>
        </div>
        <div className="support-panel" id="help-panel-chat" role="tabpanel" aria-labelledby="help-tab-chat" tabIndex={0} hidden={channel !== "chat"}>
          <h3>พิมพ์คุยกับน้องวันใหม่</h3><p>AI QuitBot ของ Quitline 1600</p><p className="support-hours">ฟรี ตลอด 24 ชั่วโมง</p><a className="support-action" href={chat} target="_blank" rel="noreferrer">เปิด AI QuitBot <span aria-hidden="true">↗</span><span className="sr-only"> เปิดในแท็บใหม่</span></a>
          <p className="support-privacy">บริการภายนอกอาจเก็บข้อมูลบางส่วน อ่าน <a href={`${chat}privacy-policy`} target="_blank" rel="noreferrer">นโยบายความเป็นส่วนตัว<span className="sr-only"> เปิดในแท็บใหม่</span></a> ก่อนเริ่มแชท</p>
        </div>
      </div>
    </div>
  </section>;
}
