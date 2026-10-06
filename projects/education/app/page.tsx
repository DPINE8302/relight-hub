"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CommunityWall from "./wall/CommunityWall";
import HelpSection from "./HelpSection";
import { trackMetric } from "./analytics/events";

const sources = {
  ddcYouth:
    "https://www.ddc.moph.go.th/otpc/news.php?deptcode=otpc&news=58197",
  ddcGuide:
    "https://ddc.moph.go.th/uploads/ckeditor2/files/%E0%B9%81%E0%B8%99%E0%B8%A7%E0%B8%97%E0%B8%B2%E0%B8%87%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%AA%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%AA%E0%B8%B2%E0%B8%A3%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B8%8A%E0%B8%B2%E0%B8%AA%E0%B8%B1%E0%B8%A1%E0%B8%9E%E0%B8%B1%E0%B8%99%E0%B8%98%E0%B9%8C%20%E0%B9%80%E0%B8%99%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87%E0%B9%83%E0%B8%99%E0%B8%A7%E0%B8%B1%E0%B8%99%E0%B8%87%E0%B8%94%E0%B8%AA%E0%B8%B9%E0%B8%9A%E0%B8%9A%E0%B8%B8%E0%B8%AB%E0%B8%A3%E0%B8%B5%E0%B9%88%E0%B9%82%E0%B8%A5%E0%B8%81%20%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B8%88%E0%B8%B3%E0%B8%9B%E0%B8%B5%202568%20.pdf",
  ddcNicotineLoop:
    "https://www.ddc.moph.go.th/brc/news.php?deptcode=brc&news=51537&news_views=1097",
  ddcEvali:
    "https://www.ddc.moph.go.th/brc/news.php?deptcode=brc&news=50870",
  thaiHealth:
    "https://creativehealthcampaign.thaihealth.or.th/cms/storage/articles/%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD%E0%B8%9A%E0%B8%B8%E0%B8%AB%E0%B8%A3%E0%B8%B5%E0%B9%88%E0%B9%84%E0%B8%9F%E0%B8%9F%E0%B9%89%E0%B8%B2%E0%B8%A0%E0%B8%B1%E0%B8%A2%E0%B8%A3%E0%B9%89%E0%B8%B2%E0%B8%A2%E0%B8%8B%E0%B9%88%E0%B8%AD%E0%B8%99%E0%B8%A5%E0%B8%B6%E0%B8%81_20240627_140336.pdf",
  quitline: "https://www.thailandquitline.or.th/site/about/service",
  quitbot: "https://quitbot.thailandquitline.or.th/",
  quitbotPrivacy: "https://quitbot.thailandquitline.or.th/privacy-policy",
  ocpb: "https://www.ocpb.go.th/news_view.php?nid=11970",
  competition: "https://www.artculture4health.com/Contents/view/4556",
};

const particles = [
  {
    id: "nicotine",
    number: "01",
    label: "นิโคติน",
    kicker: "NICOTINE",
    title: "สารที่ทำให้สมองอยากซ้ำ",
    body: "นิโคตินมีฤทธิ์เสพติด โดยเฉพาะในวัยรุ่นที่สมองยังพัฒนาอยู่ การได้รับนิโคตินสัมพันธ์กับผลกระทบต่อความสนใจ การเรียนรู้ และความจำ",
    note: "ปริมาณที่ได้รับแตกต่างตามอุปกรณ์ น้ำยา และวิธีสูบ",
  },
  {
    id: "aldehydes",
    number: "02",
    label: "สารจากความร้อน",
    kicker: "HEATED CHEMICALS",
    title: "ความร้อนสร้างสิ่งที่มองไม่เห็น",
    body: "การให้ความร้อนกับน้ำยาสามารถทำให้เกิดสารกลุ่มอัลดีไฮด์และสารอินทรีย์ระเหยง่าย เช่น ฟอร์มาลดีไฮด์ อะซีตัลดีไฮด์ และอะโครลีน บางชนิดระคายเคืองและทำให้ทางเดินหายใจอักเสบ",
    note: "กลิ่นหอมหรือรสหวานไม่ใช่เครื่องหมายว่าปลอดภัย",
  },
  {
    id: "metals",
    number: "03",
    label: "โลหะหนัก",
    kicker: "HEAVY METALS",
    title: "อนุภาคเล็ก เดินทางลึกถึงปอด",
    body: "ละอองอาจมีโลหะจากขดลวดและชิ้นส่วนของอุปกรณ์ เช่น นิกเกิล ตะกั่ว แคดเมียม และโครเมียม อนุภาคขนาดเล็กสามารถถูกสูดเข้าสู่ทางเดินหายใจ",
    note: "สิ่งที่เห็นเป็นไอ ไม่ได้หมายความว่ามีแต่น้ำ",
  },
  {
    id: "flavors",
    number: "04",
    label: "กลิ่น รส และความเย็น",
    kicker: "FLAVOUR & COOLING",
    title: "ความน่าลองถูกออกแบบมา",
    body: "สารให้ความเย็นและสารปรุงแต่งบางชนิดอาจลดความรู้สึกระคายเคืองและทำให้สูบง่ายขึ้น ขณะที่รสหวาน บรรจุภัณฑ์ และภาพลักษณ์ทันสมัยทำให้ผลิตภัณฑ์ดูน่าลอง โดยเฉพาะในเด็กและเยาวชน",
    note: "ความรู้สึกนุ่มหรือเย็น ไม่ได้ลดความเสี่ยงจากนิโคตินและละออง",
  },
];

const nicotineLoop = [
  { title: "รับนิโคติน", body: "นิโคตินเข้าสู่ร่างกายผ่านละอองที่สูด" },
  { title: "สมองเรียนรู้", body: "สมองเชื่อมการสูบเข้ากับความรู้สึกชั่วคราว" },
  { title: "ระดับลดลง", body: "อาจเกิดความอยาก หงุดหงิด หรือกระสับกระส่าย" },
  { title: "ใช้ซ้ำ", body: "การสูบซ้ำเพื่อบรรเทาความอยากทำให้วงจรแข็งแรงขึ้น" },
];

const bodyFacts = [
  {
    id: "brain",
    number: "01",
    label: "สมอง",
    title: "ช่วงวัยที่กำลังสร้างตัวตน",
    body: "สมองวัยรุ่นยังพัฒนาอยู่ โดยเฉพาะส่วนที่เกี่ยวข้องกับความสนใจ การเรียนรู้ ความจำ การตัดสินใจ และการควบคุมแรงกระตุ้น นิโคตินจึงกระทบช่วงเวลาสำคัญนี้ได้",
  },
  {
    id: "lungs",
    number: "02",
    label: "ปอด",
    title: "ละอองเข้าไปไกลกว่าที่ตาเห็น",
    body: "สารระคายเคืองและอนุภาคในละอองสัมพันธ์กับอาการไอ หายใจลำบาก และการอักเสบของทางเดินหายใจ กรมควบคุมโรคยังเฝ้าระวังภาวะปอดอักเสบจากการสูบบุหรี่ไฟฟ้า หรือ EVALI",
  },
  {
    id: "heart",
    number: "03",
    label: "หัวใจและหลอดเลือด",
    title: "ร่างกายต้องทำงานหนักขึ้น",
    body: "นิโคตินทำให้หลอดเลือดหดตัว เลือดไปเลี้ยงอวัยวะต่าง ๆ น้อยลง และบุหรี่ไฟฟ้ายังเกี่ยวข้องกับความเสี่ยงต่อระบบหัวใจและหลอดเลือด",
  },
  {
    id: "around",
    number: "04",
    label: "คนรอบตัวและโลก",
    title: "ผลกระทบไม่ได้อยู่กับผู้สูบคนเดียว",
    body: "คนรอบข้างอาจสัมผัสละอองที่ปล่อยออกมา อุปกรณ์และแบตเตอรี่ใช้แล้วเป็นขยะอิเล็กทรอนิกส์ ส่วนภาชนะและน้ำยาตกค้างอาจปนเปื้อนดินและน้ำหากกำจัดไม่เหมาะสม",
  },
];

const myths = [
  {
    statement: "บุหรี่ไฟฟ้าเป็นแค่ไอน้ำ",
    answer: "ไม่จริง",
    correct: false,
    explanation:
      "สิ่งที่สูดคือ “ละอองฝอย” ไม่ใช่ไอน้ำธรรมดา อาจมีนิโคติน สารจากความร้อน อนุภาคขนาดเล็ก และโลหะหนัก",
  },
  {
    statement: "กลิ่น รส และความเย็น อาจทำให้สูบง่ายขึ้น",
    answer: "จริง",
    correct: true,
    explanation:
      "สารให้ความเย็นอาจลดความรู้สึกระคายเคือง ขณะที่รสหวานและภาพลักษณ์ทันสมัยทำให้ผลิตภัณฑ์ดูน่าลองขึ้น โดยไม่ได้ตัดความเสี่ยงออกไป",
  },
  {
    statement: "ปริมาณนิโคตินอาจต่างกันตามอุปกรณ์ น้ำยา และวิธีสูบ",
    answer: "จริง",
    correct: true,
    explanation:
      "ผู้ใช้จึงอาจประเมินปริมาณนิโคตินที่ได้รับจริงได้ยาก และการใช้ซ้ำสามารถพัฒนาเป็นภาวะพึ่งพานิโคตินได้",
  },
  {
    statement: "ถ้าติดแล้ว ต้องเลิกด้วยตัวเองเท่านั้น",
    answer: "ไม่จริง",
    correct: false,
    explanation:
      "การขอคำปรึกษาจากผู้เชี่ยวชาญช่วยให้มีแผนรับมือความอยากและสิ่งกระตุ้น โทร Quitline 1600 ได้ฟรี หรือไปสถานพยาบาลใกล้บ้าน",
  },
];

const tactics = [
  {
    number: "01",
    name: "รสชาติ",
    title: "ทำให้ความเสี่ยงดูเหมือนขนม",
    body: "รสผลไม้ ลูกอม และของหวานช่วยให้ผลิตภัณฑ์ดูคุ้นเคยและเป็นมิตรกับผู้เริ่มลอง",
  },
  {
    number: "02",
    name: "ความเย็น",
    title: "ลดความระคายเคือง แต่ไม่ลดอันตราย",
    body: "สารให้ความเย็นทำให้สูบลื่นขึ้น จนอาจรู้สึกว่าละออง “เบา” กว่าความเป็นจริง",
  },
  {
    number: "03",
    name: "ดีไซน์",
    title: "ทำให้ของเสพติดดูเหมือนแกดเจ็ต",
    body: "สี รูปทรง และบรรจุภัณฑ์ช่วยสร้างภาพว่าเป็นของทันสมัย เป็นของสะสม หรือเป็นส่วนหนึ่งของตัวตน",
  },
  {
    number: "04",
    name: "โซเชียล",
    title: "ทำให้การสูบดูเป็นเรื่องปกติ",
    body: "คอนเทนต์ อินฟลูเอนเซอร์ และแรงกดดันจากเพื่อนทำให้การลองดูเหมือนเป็นทางลัดเข้าสู่กลุ่ม",
  },
];


function ArrowDownIcon() {
  return (
    <svg className="ui-icon icon-down" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M10 3.5v12M5.5 11l4.5 4.5 4.5-4.5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="ui-icon icon-right" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M3.5 10h12M11 5.5l4.5 4.5-4.5 4.5" />
    </svg>
  );
}

function ExternalMark() {
  return (
    <>
      <svg className="ui-icon icon-external" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
        <path d="M7 5h8v8M15 5 5 15" />
      </svg>
      <span className="sr-only"> เปิดในแท็บใหม่</span>
    </>
  );
}

function CheckIcon() {
  return (
    <svg className="ui-icon icon-check" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="m4.5 10.5 3.2 3.2 7.8-7.8" />
    </svg>
  );
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="source-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalMark />
    </a>
  );
}

export default function Home() {
  const router = useRouter();
  const adminClicks = useRef({ count: 0, startedAt: 0 });
  function openAdmin() {
    const now = performance.now();
    const clicks = adminClicks.current;
    if (clicks.count === 0 || now - clicks.startedAt > 1200) {
      clicks.count = 0;
      clicks.startedAt = now;
    }
    clicks.count += 1;
    if (clicks.count === 3) {
      clicks.count = 0;
      router.push("/analytics");
    }
  }
  const progressRef = useRef<HTMLSpanElement>(null);
  const [particleIndex, setParticleIndex] = useState(0);
  const [loopIndex, setLoopIndex] = useState(0);
  const [bodyIndex, setBodyIndex] = useState(0);
  const [mythAnswers, setMythAnswers] = useState<Record<number, boolean>>({});
  const [tacticIndex, setTacticIndex] = useState(0);

  useEffect(() => {
    let animationFrame = 0;
    const updateProgress = () => {
      animationFrame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${ratio})`;
      }
    };
    const requestProgressUpdate = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateProgress);
    };
    updateProgress();
    window.addEventListener("scroll", requestProgressUpdate, { passive: true });
    window.addEventListener("resize", requestProgressUpdate);
    return () => {
      window.removeEventListener("scroll", requestProgressUpdate);
      window.removeEventListener("resize", requestProgressUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  const scrollTo = (id: string) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  const closeMobileIndex = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const menu = event.currentTarget.closest("details");
    if (menu) menu.open = false;
  };


  const activeParticle = particles[particleIndex];
  const activeLoop = nicotineLoop[loopIndex];
  const activeBody = bodyFacts[bodyIndex];
  const activeTactic = tactics[tacticIndex];

  return (
    <>
      <a className="skip-link" href="#top">ข้ามไปเนื้อหา</a>
      <div className="reading-progress" aria-hidden="true">
        <span ref={progressRef} />
      </div>

      <header className="site-header">
        <div className="brand-lockup">
          <a className="brand" href="#top" aria-label="RE;light กลับสู่ด้านบน">
            RE<span>;</span>light
          </a>
          <span className="brand-topic">รู้ทันบุหรี่ไฟฟ้า</span>
        </div>
        <nav aria-label="เมนูหลัก">
          <div className="nav-sections">
            <a href="#truth">เรียนรู้</a>
            <a href="#activities">เล่นและลองเลือก</a>
            <a href="#community">ผนังของเรา</a>
          </div>
          <details className="mobile-index">
            <summary>
              สารบัญ <span className="mobile-index-icon" aria-hidden="true">+</span>
            </summary>
            <div className="mobile-index-panel">
              <a href="#activities" onClick={closeMobileIndex}>เล่นและลองเลือก</a>
              <a href="#truth" onClick={closeMobileIndex}>สิ่งที่สูดเข้าไป</a>
              <a href="#body" onClick={closeMobileIndex}>ผลต่อร่างกาย</a>
              <a href="#myths" onClick={closeMobileIndex}>เช็กความเชื่อ</a>
              <a href="#stats" onClick={closeMobileIndex}>ข้อมูลเยาวชนไทย</a>
              <a href="#community" onClick={closeMobileIndex}>ผนังของเรา</a>
            </div>
          </details>
          <a className="nav-help" href="#help">ขอความช่วยเหลือ</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero section-dark" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              พรุ่งนี้
              <br />
              <span>ยังเป็นของคุณ</span>
            </h1>
            <p className="hero-lede">เรียนรู้เรื่อง <strong>บุหรี่ไฟฟ้าและนิโคติน</strong> ผ่านข้อมูล เกม และคำตอบจากทุกคน</p>
            <div className="hero-actions">
              <a className="button button-light" href="#activities">เลือกกิจกรรม <ArrowRightIcon /></a>
              <button className="button button-outline" type="button" onClick={() => scrollTo("truth")}>
                สำรวจสิ่งที่สูดเข้าไป <ArrowDownIcon />
              </button>
            </div>
          </div>
        </section>

        <section id="activities" className="activities-section" aria-labelledby="activities-title">
          <div className="activities-heading"><h2 id="activities-title">เลือกวิธีเรียนรู้ของคุณ</h2></div>
          <div className="activities-layout">
            <a className="activity-feature" href="/puff-world"><div className="activity-preview" role="img" aria-label="โปสเตอร์ Airy จากเกม Puff World: Inside" /><div className="activity-feature-copy"><span className="activity-meta">เกมผจญภัย 3 มิติ · คอมพิวเตอร์</span><h3>Puff World: Inside</h3><p>พา Airy ผ่านโลกข้างใน กลับสู่อากาศใส</p><span className="activity-link">เข้าสู่โลกของ Airy <ArrowRightIcon /></span></div></a>
            <div className="activity-options">
              <a href="/play"><span className="activity-meta">มือถือและคอมพิวเตอร์ · 2–3 นาที</span><h3>ถ้าเป็นคุณ จะเลือกอย่างไร?</h3><p>สามสถานการณ์ใกล้ตัว ลองเช็กความเชื่อ เตรียมคำตอบ และอยู่ข้างคนที่อยากเลิก</p><span className="activity-link">ลองเลือก 3 สถานการณ์ <ArrowRightIcon /></span></a>
              <a href="/light-trail"><span className="activity-meta">มือถือและคอมพิวเตอร์</span><h3>Light Trail</h3><p>สำรวจสามเมือง เก็บแสง แล้วเลือกเส้นทางของคุณ</p><span className="activity-link">เริ่มสำรวจ <ArrowRightIcon /></span></a>
            </div>
          </div>
        </section>

        <section className="highlights-strip" aria-labelledby="highlights-title">
          <div className="highlights-inner">
            <h2 id="highlights-title" className="sr-only">ข้อมูลสำคัญ</h2>
            <div className="highlight-cards">
              <a href="#truth">
                <span>สิ่งที่สูดเข้าไป</span>
                <strong>ไม่ใช่แค่ไอน้ำ</strong>
                <small>เปิดดูละอองและสารที่อาจอยู่ข้างใน <ArrowRightIcon /></small>
              </a>
              <a href="#stats">
                <span>เยาวชนไทย อายุ 13–15 ปี</span>
                <strong>17.6%</strong>
                <small>ดูข้อมูล GYTS ปี 2565 <ArrowRightIcon /></small>
              </a>
              <a href="#help">
                <span>ถ้าอยากเลิก</span>
                <strong>1600 ฟรี</strong>
                <small>ไปยังความช่วยเหลือที่ไม่ตัดสินคุณ <ArrowRightIcon /></small>
              </a>
            </div>
          </div>
        </section>

        <section id="truth" className="section section-light truth-section" aria-labelledby="truth-title">
          <div className="section-heading">
            <h2 id="truth-title" className="paired-heading">
              บุหรี่ไฟฟ้า
              <br />
              <span>ไม่ใช่แค่ไอน้ำ</span>
            </h2>
            <p>
              อุปกรณ์ทำให้น้ำยาร้อนจนเกิด <strong>ละอองฝอย (aerosol)</strong> เพื่อสูดเข้าสู่ปอด
              สิ่งที่มองเห็นคล้ายไออาจมีสารหลายกลุ่มซ่อนอยู่ ลองแตะเพื่อสำรวจ
            </p>
            <SourceLink href={sources.ddcGuide}>กรมควบคุมโรค: ข้อมูลสารในบุหรี่ไฟฟ้า</SourceLink>
          </div>

          <div id="aerosol-explorer" className={`particle-explorer tone-${activeParticle.id}`}>
            <div className="particle-orbit" aria-hidden="true">
              <span className="particle-core">
                <small>AEROSOL / {activeParticle.number}</small>
                {activeParticle.label}
              </span>
              {particles.map((particle, index) => (
                <i
                  key={particle.id}
                  className={`particle particle-${index + 1} ${particleIndex === index ? "active" : ""}`}
                />
              ))}
            </div>
            <div className="particle-controls" role="group" aria-label="เลือกสารในละออง">
              {particles.map((particle, index) => (
                <button
                  key={particle.id}
                  type="button"
                  aria-pressed={particleIndex === index}
                  className={particleIndex === index ? "active" : ""}
                  onClick={() => { setParticleIndex(index); trackMetric("education_interaction", { section: "aerosol" }); }}
                >
                  <span aria-hidden="true">{particleIndex === index ? <CheckIcon /> : particle.number}</span>
                  {particle.label}
                </button>
              ))}
            </div>
            <article className="particle-detail" aria-live="polite">
              
              <h3>{activeParticle.title}</h3>
              <p>{activeParticle.body}</p>
              <small>{activeParticle.note}</small>
            </article>
          </div>
        </section>

        <section id="stats" className="stat-section section-dark" aria-labelledby="stat-title">
          <div className="stat-number" aria-hidden="true">17.6%</div>
          <div className="stat-copy">
            <h2 id="stat-title">ไม่ใช่เรื่องไกลตัว</h2>
            <p>
              การสำรวจ GYTS ปี 2565 พบว่านักเรียนไทยอายุ 13–15 ปีสูบบุหรี่ไฟฟ้า
              <strong> ร้อยละ 17.6</strong> เพิ่มจากร้อยละ 3.3 ในปี 2558 หรือเพิ่มขึ้น 5.3 เท่าใน 7 ปี
            </p>
            <p className="stat-note">ตัวเลขนี้อ้างอิงปีสำรวจ ไม่ได้แปลว่าเยาวชนทุกคนสูบ</p>
            <SourceLink href={sources.ddcGuide}>แนวทางสื่อสารวันงดสูบบุหรี่โลก 2568</SourceLink>
          </div>
        </section>

        <section className="section section-cream loop-section" aria-labelledby="loop-title">
          <div className="section-heading compact">
            <h2 id="loop-title">ทำไม “อยากลอง”<br /><span>จึงอาจกลายเป็น “อยากซ้ำ”</span></h2>
            <p>วงจรแบบย่อของภาวะพึ่งพานิโคติน อาการและความเร็วแตกต่างกันในแต่ละคน</p>
          </div>

          <div className="loop-layout">
            <div className="loop-steps" role="group" aria-label="วงจรนิโคติน">
              {nicotineLoop.map(({ title, body }, index) => (
                <button
                  key={title}
                  type="button"
                  aria-pressed={loopIndex === index}
                  className={loopIndex === index ? "active" : ""}
                  onClick={() => { setLoopIndex(index); trackMetric("education_interaction", { section: "nicotine" }); }}
                >
                  <span aria-hidden="true">{loopIndex === index ? <CheckIcon /> : String(index + 1).padStart(2, "0")}</span>
                  <strong>{title}</strong>
                  <small>{body}</small>
                </button>
              ))}
            </div>
            <div className="loop-visual" aria-live="polite">
              <div className={`loop-ring ring-state-${loopIndex}`}>
                <span className="loop-center">{loopIndex + 1}</span>
                <i /><i /><i /><i />
              </div>
              <div className="loop-active-copy">
                
                <strong>{activeLoop.title}</strong>
                <p>{activeLoop.body}</p>
              </div>
              <p className="loop-note">
                การติดนิโคตินไม่ใช่ “นิสัยเสีย” แต่เป็นภาวะที่ขอความช่วยเหลือได้
              </p>
              <SourceLink href={sources.ddcNicotineLoop}>กรมควบคุมโรค: นิโคติน การถอน และการใช้ซ้ำ</SourceLink>
            </div>
          </div>
        </section>

        <section id="body" className="section section-dark body-section" aria-labelledby="body-title">
          <div className="section-heading">
            <h2 id="body-title">ผลกระทบ<br /><span>ไม่ได้หยุดที่ปอด</span></h2>
            <p>เลือกดูสิ่งที่ละอองและนิโคตินอาจส่งผลต่อคุณและคนรอบตัว</p>
          </div>

          <div className="body-explorer">
            <div className="body-map" role="group" aria-label="ผลกระทบต่อร่างกายและสิ่งแวดล้อม">
              <div className="body-silhouette" aria-hidden="true">
                <span className="head" />
                <span className="torso" />
                <span className={`pulse pulse-${bodyIndex + 1}`} />
              </div>
              {bodyFacts.map((fact, index) => (
                <button
                  type="button"
                  key={fact.id}
                  aria-pressed={bodyIndex === index}
                  className={`body-node node-${index + 1} ${bodyIndex === index ? "active" : ""}`}
                  onClick={() => { setBodyIndex(index); trackMetric("education_interaction", { section: "body" }); }}
                >
                  <span aria-hidden="true">{bodyIndex === index ? <CheckIcon /> : fact.number}</span>{fact.label}
                </button>
              ))}
            </div>
            <article className="body-detail" aria-live="polite">
              
              <h3>{activeBody.title}</h3>
              <p>{activeBody.body}</p>
              <SourceLink href={sources.ddcGuide}>ข้อมูลสุขภาพจากกรมควบคุมโรค</SourceLink>
              {bodyIndex === 1 && (
                <>
                  <div className="health-alert">
                    หากมีไข้ ไอ หายใจลำบาก หอบเหนื่อย หรืออาการรุนแรงหลังสูบ ควรแจ้งแพทย์ถึงประวัติการใช้บุหรี่ไฟฟ้า
                  </div>
                  <SourceLink href={sources.ddcEvali}>กรมควบคุมโรค: อาการและการเฝ้าระวัง EVALI</SourceLink>
                </>
              )}
            </article>
          </div>
        </section>

        <section id="myths" className="section section-light myth-section" aria-labelledby="myth-title">
          <div className="section-heading split-heading">
            <div>
              <h2 id="myth-title">จริง หรือ<br /><span>แค่ถูกทำให้เชื่อ?</span></h2>
            </div>
            <p>เลือกคำตอบก่อนเปิดดูข้อเท็จจริง ไม่มีคะแนน ตอบเพื่อเปิดดูคำอธิบายเท่านั้น</p>
          </div>

          <div className="myth-list">
            {myths.map((myth, index) => {
              const answered = mythAnswers[index] !== undefined;
              const isCorrect = answered && mythAnswers[index] === myth.correct;
              return (
                <article className={`myth-card ${answered ? "answered" : ""}`} key={myth.statement}>
                  <div className="myth-question">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <h3>{myth.statement}</h3>
                  </div>
                  <div className="myth-actions" role="group" aria-label={`ตอบคำถาม: ${myth.statement}`}>
                    <button
                      type="button"
                      aria-pressed={answered && mythAnswers[index] === true}
                      onClick={() => { setMythAnswers((prev) => ({ ...prev, [index]: true })); trackMetric("education_interaction", { section: "myths" }); }}
                    >
                      จริง
                    </button>
                    <button
                      type="button"
                      aria-pressed={answered && mythAnswers[index] === false}
                      onClick={() => { setMythAnswers((prev) => ({ ...prev, [index]: false })); trackMetric("education_interaction", { section: "myths" }); }}
                    >
                      ไม่จริง
                    </button>
                  </div>
                  <div className="myth-result" role="status" aria-live="polite" aria-atomic="true">
                    {answered && (
                      <div className="myth-answer">
                        <strong>
                          {isCorrect ? `ถูกต้อง: ${myth.answer}` : `คำตอบคือ ${myth.answer}`}
                        </strong>
                        <p>{myth.explanation}</p>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="source-cluster">
            <SourceLink href={sources.thaiHealth}>สสส.: คู่มือบุหรี่ไฟฟ้า ภัยร้ายซ่อนลึก</SourceLink>
            <SourceLink href={sources.ddcYouth}>กรมควบคุมโรค: นิโคตินและเยาวชน</SourceLink>
            <SourceLink href={sources.quitline}>Quitline: ความช่วยเหลือในการเลิกสูบ</SourceLink>
          </div>
        </section>

        <section className="section section-coral tactics-section" aria-labelledby="tactics-title">
          <div className="section-heading compact">
            <h2 id="tactics-title" className="paired-heading">ความ “เท่”<br /><span>ไม่ได้เกิดขึ้นเอง</span></h2>
            <p>ผลิตภัณฑ์ถูกออกแบบและสื่อสารให้ดูน่าลอง ลองแตะดูวิธีที่ความเสี่ยงถูกห่อให้ดูธรรมดา</p>
          </div>
          <div className="tactic-stage">
            <article aria-live="polite">
              <span>{activeTactic.number}</span>
              <p className="micro-label">{activeTactic.name}</p>
              <h3>{activeTactic.title}</h3>
              <p>{activeTactic.body}</p>
            </article>
            <div className="tactic-controls" role="group" aria-label="เลือกกลยุทธ์การตลาด">
              {tactics.map((tactic, index) => (
                <button
                  type="button"
                  key={tactic.number}
                  aria-pressed={tacticIndex === index}
                  onClick={() => { setTacticIndex(index); trackMetric("education_interaction", { section: "marketing" }); }}
                >
                  <span aria-hidden="true">{tacticIndex === index ? <CheckIcon /> : tactic.number}</span>
                  <small>{tactic.name}</small>
                </button>
              ))}
            </div>
          </div>
          <SourceLink href={sources.ddcGuide}>กรมควบคุมโรค: กลยุทธ์ดึงดูดเด็กและเยาวชน</SourceLink>
        </section>

        <section id="community" className="section section-cream choose-section" aria-labelledby="choose-title">
          <div className="section-heading split-heading">
            <div>
              <h2 id="choose-title">คำของคุณ<br /><span>บนผนังของเรา</span></h2>
            </div>
            <p>เขียนคำตอบของคุณเอง แล้วอ่านคำตอบจากทุกคน ข้อความที่มีคนตอบเหมือนกันจะค่อย ๆ ใหญ่ขึ้น</p>
          </div>
          <CommunityWall />
        </section>

        <section className="law-section section-dark" aria-labelledby="law-title">
          <div>
            <h2 id="law-title">กฎหมายไทย<br /><span>พูดว่าอย่างไร</span></h2>
          </div>
          <div className="law-copy">
            <p>
              ตามแนวทางกรมควบคุมโรคปี 2568 ประเทศไทยห้ามนำเข้าบุหรี่ไฟฟ้า และห้ามผลิตเพื่อขาย
              ขาย หรือให้บริการสินค้าและน้ำยาที่เกี่ยวข้อง ส่วนความผิดเกี่ยวกับการครอบครองหรือการสูบ
              ขึ้นอยู่กับกฎหมายและข้อเท็จจริงของแต่ละกรณี
            </p>
            <p className="law-note">
              กฎหมายและการบังคับใช้อาจมีรายละเอียดตามข้อเท็จจริงของแต่ละกรณี
              โปรดเปิดอ่านแหล่งข้อมูลของรัฐฉบับล่าสุดโดยตรง
            </p>
            <div className="source-cluster">
              <SourceLink href={sources.ocpb}>ดูคำสั่งและรายละเอียดจาก สคบ.</SourceLink>
              <SourceLink href={sources.ddcGuide}>ดูสรุปกฎหมายจากกรมควบคุมโรค</SourceLink>
            </div>
          </div>
        </section>

        <HelpSection />

        <section className="sources-section section-light" aria-labelledby="sources-title">
          <div className="section-heading compact">
            <h2 id="sources-title">ข้อมูลที่ตรวจสอบย้อนกลับได้</h2>
            <p>เนื้อหาถูกเรียบเรียงเพื่อการเรียนรู้จากหน่วยงานสาธารณสุขไทยและองค์กรที่เกี่ยวข้องกับโครงการ</p>
          </div>
          <div className="source-list">
            <a href={sources.ddcYouth} target="_blank" rel="noreferrer">
              <span>กรมควบคุมโรค</span>
              <strong>นิโคติน ผลต่อเยาวชน และช่องทางช่วยเลิก</strong>
              <small>ข้อมูลวันที่ 26 มิถุนายน 2569 <ExternalMark /></small>
            </a>
            <a href={sources.ddcGuide} target="_blank" rel="noreferrer">
              <span>กรมควบคุมโรค</span>
              <strong>สารพิษ ผลกระทบ สถานการณ์ และกฎหมาย</strong>
              <small>แนวทางวันงดสูบบุหรี่โลก 2568 <ExternalMark /></small>
            </a>
            <a href={sources.thaiHealth} target="_blank" rel="noreferrer">
              <span>สำนักงานกองทุนสนับสนุนการสร้างเสริมสุขภาพ</span>
              <strong>คู่มือบุหรี่ไฟฟ้า ภัยร้ายซ่อนลึก</strong>
              <small>คู่มือเผยแพร่ปี 2567 <ExternalMark /></small>
            </a>
            <a href={sources.quitline} target="_blank" rel="noreferrer">
              <span>Thailand National Quitline</span>
              <strong>บริการปรึกษาเลิกบุหรี่ฟรี 1600</strong>
              <small>ข้อมูลบริการปัจจุบัน <ExternalMark /></small>
            </a>
            <a href={sources.ocpb} target="_blank" rel="noreferrer">
              <span>สำนักงานคณะกรรมการคุ้มครองผู้บริโภค</span>
              <strong>คำสั่งห้ามผลิตเพื่อขาย ขาย หรือให้บริการบุหรี่ไฟฟ้า</strong>
              <small>คำสั่งและข้อมูลกฎหมาย <ExternalMark /></small>
            </a>
            <a href={sources.competition} target="_blank" rel="noreferrer">
              <span>NoNic-Smart Gen 2026</span>
              <strong>โจทย์และที่มาของโครงการ</strong>
              <small>Art & Culture for Health Literacy <ExternalMark /></small>
            </a>
          </div>
          <p className="source-disclaimer">
            เว็บไซต์นี้ให้ข้อมูลเพื่อการเรียนรู้ ไม่ใช้แทนการวินิจฉัยหรือคำแนะนำเฉพาะบุคคลจากบุคลากรทางการแพทย์
          </p>
        </section>
      </main>

      <footer>
        <a className="brand" href="#top">RE<span>;</span>light</a>
        <p><button type="button" className="footer-motto" onClick={openAdmin}>พรุ่งนี้ดีได้ เพราะฉันเลือกเอง</button></p><nav aria-label="เมนูท้ายเว็บไซต์"><a href="#truth">เรียนรู้</a><a href="#activities">กิจกรรม</a><a href="/wall">ผนังคำตอบ</a><a href="/privacy">ความเป็นส่วนตัว</a></nav>
        <p>Team RE;light · NoNic-Smart Gen Media Innovation Hackathon 2026</p>
      </footer>
    </>
  );
}
