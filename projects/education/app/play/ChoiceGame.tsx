/* eslint-disable @next/next/no-html-link-for-pages -- Full-page navigation keeps cached pages usable offline. */
"use client";

import PageHeader from "../PageHeader";
import { useEffect, useRef, useState } from "react";
import CommunityWall from "../wall/CommunityWall";
import { trackMetric } from "../analytics/events";

const who = "https://www.who.int/news-room/questions-and-answers/item/tobacco-e-cigarettes";
const quitline = "https://www.thailandquitline.or.th/site/about/service";
const scenes = [
  {
    tag: "สถานการณ์ 1 จาก 3",
    title: "ก่อนเชื่อ คุณจะเช็กอะไร?",
    message: "เป็นแค่ไอน้ำเอง ไม่น่ามีอะไรนะ",
    context: "ข้อความหนึ่งผ่านเข้ามาในฟีดของคุณ",
    choices: ["เห็นเป็นไอ ก็น่าจะเป็นน้ำ", "เช็กว่าละอองมีอะไรอยู่ข้างใน", "คนแชร์เยอะ ก็น่าจะเชื่อได้"],
    feedback: [
      "สิ่งที่มองเห็นคล้ายไอไม่ได้บอกส่วนประกอบ ละอองบุหรี่ไฟฟ้าอาจมีนิโคตินและสารที่เป็นอันตราย ลองเช็กข้อมูลจากแหล่งสุขภาพก่อนเชื่อ",
      "คุณเลือกตรวจสอบส่วนประกอบ ละอองบุหรี่ไฟฟ้าไม่ใช่แค่ไอน้ำ และอาจมีนิโคตินกับสารที่เป็นอันตราย",
      "จำนวนคนแชร์ไม่ได้ยืนยันความถูกต้อง ละอองบุหรี่ไฟฟ้าไม่ใช่แค่ไอน้ำ ลองเปิดข้อมูลจากแหล่งสุขภาพเพื่อเช็กคำกล่าวนี้",
    ],
    lesson: "รูปลักษณ์ของละอองไม่ได้ยืนยันความปลอดภัย",
    source: who,
    sourceName: "อ่านข้อเท็จจริงจาก WHO",
  },
  {
    tag: "สถานการณ์ 2 จาก 3",
    title: "ถ้าเพื่อนชวน คุณจะตอบว่าอะไร?",
    message: "ลองหน่อยไหม? เพื่อนกันทั้งนั้น",
    context: "คุณไม่อยากสูบ เลือกคำตอบที่เป็นตัวคุณ",
    choices: ["ไม่เอา เราไม่สูบ", "ขอผ่านนะ ไปหาอะไรทำกันดีกว่า", "เราขอออกไปก่อนนะ"],
    feedback: [
      "คำตอบสั้นและชัดเจนช่วยบอกขอบเขตของคุณ คุณไม่จำเป็นต้องอธิบายยาว ถ้ายังถูกกดดัน คุณออกจากสถานการณ์หรือขอความช่วยเหลือได้",
      "คุณบอกการตัดสินใจพร้อมชวนทำอย่างอื่น ถ้าเพื่อนยังชวนซ้ำ คุณย้ำขอบเขตหรือออกจากสถานการณ์ได้",
      "คุณเลือกออกจากสถานการณ์ที่ไม่สบายใจ เป็นทางเลือกที่ใช้ได้ ถ้าต้องการความช่วยเหลือ ลองไปหาคนที่ไว้ใจ",
    ],
    lesson: "การปฏิเสธมีหลายแบบ เลือกแบบที่ใช้ได้สำหรับคุณ",
    source: "../#choose-title",
    sourceName: "ดูคำตอบแบบอื่นใน RE;light",
  },
  {
    tag: "สถานการณ์ 3 จาก 3",
    title: "ถ้าเพื่อนอยากเลิก คุณจะช่วยอย่างไร?",
    message: "อยากเลิกแล้ว แต่ไม่รู้จะเริ่มยังไง",
    context: "เพื่อนส่งข้อความมาขอคุยกับคุณ",
    choices: ["ฟัง แล้วช่วยหาคนให้คำปรึกษา", "บอกว่าต้องเลิกคนเดียวให้ได้", "รอให้พร้อมค่อยคุย ไม่ต้องหาข้อมูล"],
    feedback: [
      "การรับฟังโดยไม่ตัดสินและช่วยหาผู้ให้คำปรึกษาเป็นจุดเริ่มต้นที่ใช้ได้ เพื่อนไม่จำเป็นต้องเผชิญเรื่องนี้คนเดียว",
      "การเลิกไม่จำเป็นต้องทำคนเดียว ลองเปลี่ยนเป็นการรับฟังและเสนอช่วยหาผู้ให้คำปรึกษา แทนการทำให้เพื่อนรู้สึกว่าขอความช่วยเหลือไม่ได้",
      "เคารพจังหวะของเพื่อนได้ พร้อมบอกว่าคุณอยู่ข้างเขาและมีช่องทางปรึกษาให้เลือกเมื่อพร้อม",
    ],
    lesson: "มีความช่วยเหลือให้เลือก เริ่มจากคนที่ไว้ใจหรือ Quitline 1600",
    source: quitline,
    sourceName: "ดูบริการของ Quitline 1600",
  },
];

export default function ChoiceGame({ after = false }: { after?: boolean }) {
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<number[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const interacted = useRef(false);
  const complete = step === scenes.length;
  const scene = scenes[step];
  const answer = answers[step];

  useEffect(() => {
    if (interacted.current) heading.current?.focus();
  }, [step]);

  function go(next: number) {
    if (next === 0 && step === -1) trackMetric("game_start");
    if (next === scenes.length) trackMetric("game_complete");
    interacted.current = true;
    setStep(next);
  }

  function choose(index: number) {
    trackMetric("game_choice", { scene: step + 1, choice: index });
    setAnswers((previous) => [...previous.slice(0, step), index]);
  }

  function restart() {
    setAnswers([]);
    go(-1);
  }

  return (
    <div className="game-page">
      <PageHeader />
      <main className="game-main">
        
        {step === -1 ? (
          <section className="game-intro">
            
            <h1 ref={heading} tabIndex={-1}>{after ? <>เรื่องราวจบแล้ว<br /><span>คุณจะเลือกอย่างไร?</span></> : <>ถ้าเป็นคุณ<br /><span>คุณจะตอบว่าอะไร?</span></>}</h1>
            <p className="game-lede">สามสถานการณ์ใกล้ตัว ลองเช็กความเชื่อ เตรียมคำตอบให้เพื่อน และหาทางช่วยคนที่อยากเลิก</p>
            <div className="game-meta"><span>ประมาณ 2–3 นาที</span><span>ไม่จับเวลา</span><span>ไม่ต้องลงชื่อ</span></div>
            <button className="button button-light" onClick={() => go(0)}>ลองเลือกคำตอบ →</button>
            <a href="/#truth" className="game-text-link">อยากอ่านข้อมูลก่อน ↗</a>
            
          </section>
        ) : complete ? (
          <section className="game-result">
            
            <h1 ref={heading} tabIndex={-1}>รู้ทันแล้ว<br /><span>ลองตอบในแบบคุณ</span></h1>
            <div className="game-takeaways">
              <article><small>เรื่องที่รู้ทัน</small><h2>ละอองไม่ใช่แค่ไอน้ำ</h2><p>เช็กส่วนประกอบและแหล่งข้อมูลก่อนเชื่อ</p></article>
              <article><small>คำตอบที่คุณฝึก</small><h2>“{scenes[1].choices[answers[1]]}”</h2><p>ลองเขียนคำตอบในแบบของคุณบนผนังด้านล่าง</p></article>
              <article><small>ทางช่วยเหลือ</small><h2>ไม่จำเป็นต้องเลิกคนเดียว</h2><a href={quitline} target="_blank" rel="noreferrer" className="game-text-link">รู้จัก Quitline 1600 ↗</a></article>
            </div>
            <div className="game-wall">
              
              <h2>ลองเขียนคำตอบ<br />ที่คุณจะใช้จริง</h2>
              <CommunityWall />
            </div>
            <div className="game-bottom-actions"><button className="button button-light" onClick={restart}>ลองเล่นอีกครั้ง</button><a className="button button-outline" href="/#truth">สำรวจข้อมูลต่อ</a><a className="game-text-link" href="/#help">อยากได้ความช่วยเหลือ ↗</a></div><p className="game-small"><a className="game-text-link" href="/light-trail">อยากเล่นต่ออีกนิด? Light Trail · มินิเกมเสริม ↗</a></p>
          </section>
        ) : (
          <section className="game-scene">
            <div className="game-progress" aria-label={`สถานการณ์ ${step + 1} จาก 3`}>{scenes.map((item, index) => <span key={item.tag} className={index <= step ? "active" : ""} />)}</div>
            <p className="game-kicker">{scene.tag}</p>
            <h1 ref={heading} tabIndex={-1}>{scene.title}</h1>
            <p className="game-context">{scene.context}</p>
            <div className="game-chat"><span>{step === 0 ? "ข้อความในฟีด · สถานการณ์สมมติ" : "เพื่อน · สถานการณ์สมมติ"}</span><p>“{scene.message}”</p></div>
            <div className="game-choices" aria-label="เลือกคำตอบ">{scene.choices.map((choice, index) => <button key={choice} aria-pressed={answer === index} onClick={() => choose(index)}><span>{String(index + 1).padStart(2, "0")}</span>{choice}</button>)}</div>
            {answer !== undefined && <div className="game-feedback" role="status"><p className="game-your-reply">คุณเลือก: “{scene.choices[answer]}”</p><h2>{scene.lesson}</h2><p>{scene.feedback[answer]}</p><a href={scene.source} target={scene.source.startsWith("https") ? "_blank" : undefined} rel="noreferrer" className="game-text-link">{scene.sourceName} ↗</a></div>}
            <div className="game-next"><button className="game-text-link" onClick={() => go(step - 1)}>← ย้อนกลับ</button><button className="button button-light" disabled={answer === undefined} onClick={() => go(step + 1)}>{step === 2 ? "เก็บคำตอบของคุณ" : "สถานการณ์ถัดไป"} →</button></div>
            <p className="game-small">{step === 1 ? "ไม่มีคำตอบเดียวที่เหมาะกับทุกคน ลองเลือกสไตล์ที่คุณใช้ได้" : "อ่านคำอธิบายหลังเลือก แล้วลองคำตอบอื่นได้"}</p>
          </section>
        )}
      </main>
      <footer className="game-footer">พรุ่งนี้ดีได้ เพราะฉันเลือกเอง · RE;light<a href="/#sources-title">แหล่งข้อมูล ↗</a></footer>
    </div>
  );
}
