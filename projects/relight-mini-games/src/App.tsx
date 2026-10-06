import { useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { objects, pairs, studioReducer, initialStudio, validSlots, claims, tools, testClaim } from './model';
import type { ObjectId } from './model';
import './App.css';

const WHO = 'https://www.who.int/news-room/questions-and-answers/item/tobacco-e-cigarettes';
const games = [
 { path: '/cool', title: 'เท่ตรงไหน?', english: 'What Is Cool?', hint: 'จัดฉากที่เป็นคุณ', color: 'yellow', art: 'studio-tile', tag: 'สร้าง · ลอง · เป็นตัวเอง' },
 { path: '/disguise', title: 'มองออกไหม?', english: 'The Disguise', hint: 'เปิดสิ่งที่หน้าตาไม่ได้บอก', color: 'lavender', art: 'cabinet-tile', tag: 'หมุน · เปิด · มองข้างใน' },
 { path: '/claims', title: 'พิพิธภัณฑ์คำขาย', english: 'The Vape Museum', hint: 'เอาคำขายมาลองทดสอบ', color: 'coral', art: 'lab-tile', tag: 'เลือก · ทดสอบ · ดูหลักฐาน' },
];
function read(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function write(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* play still works */ } }
function navigate(path: string) { history.pushState(null, '', '#' + path); window.dispatchEvent(new HashChangeEvent('hashchange')); window.scrollTo(0, 0); }
function Link({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
 return <a href={'#' + to} className={className} onClick={e => { if (!e.ctrlKey && !e.metaKey && e.button === 0) { e.preventDefault(); navigate(to); } }}>{children}</a>;
}
function Art({ name, alt = '', className = '' }: { name: string; alt?: string; className?: string }) {
 const [failedName, setFailedName] = useState<string | null>(null);
 return failedName === name ? <span className={`art-fallback ${className}`} aria-label={alt}>{objects.find(o => o.id === name)?.symbol || '✦'}</span> : <img draggable={false} className={className} src={`${import.meta.env.BASE_URL}art/${name}.webp`} alt={alt} onError={() => setFailedName(name)} />;
}
function Evidence({ children }: { children?: ReactNode }) {
 return <details className="evidence"><summary>มองให้ลึกขึ้น · แหล่งข้อมูล ↗</summary><div>{children}<p>ภาพและสถานการณ์เป็นตัวอย่างเพื่อเรียนรู้ ไม่ใช่ผลตรวจผลิตภัณฑ์หรือการประเมินสุขภาพของคุณ</p><a href={WHO} target="_blank" rel="noreferrer">WHO — Tobacco: E-cigarettes ↗</a></div></details>;
}
function App() {
 const [path, setPath] = useState((location.hash.slice(1) || '/'));
 const [sound, setSound] = useState(false);
 const audio = useRef<AudioContext | null>(null);
 const [resetPrompt, setResetPrompt] = useState(false);
 const [resetVersion, setResetVersion] = useState(0);
 const resetDialog = useRef<HTMLDialogElement>(null);
 useEffect(() => { if(resetPrompt)resetDialog.current?.showModal();else resetDialog.current?.close(); },[resetPrompt]);
 useEffect(() => { const fn = () => setPath((location.hash.slice(1) || '/')); window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); }, []);
 useEffect(() => { document.title = `${games.find(g => g.path === path)?.title || 'ลองเล่น แล้วมองอีกมุม'} · RE:Light`; const frame = requestAnimationFrame(() => document.getElementById('page-title')?.focus()); return () => cancelAnimationFrame(frame); }, [path]);
 function tone(frequency = 480) {
  if (!sound) return;
  try { audio.current ||= new AudioContext(); const ctx = audio.current; void ctx.resume(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, ctx.currentTime); gain.gain.setValueAtTime(.07, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .15); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .16); } catch { /* visual feedback remains */ }
 }
 const game = games.find(g => g.path === path);
 return <div className={`site ${game?.color || ''} ${game?'game-site':'gallery-site'}`}>
  <a className="skip" href="#main">ข้ามไปเนื้อหา</a>
  {game?<header className="playbar"><Link to="/" className="home-control">⌂<span className="sr-only">← ทุกเกม</span></Link><h1 id="page-title" tabIndex={-1}>{game.title}</h1><button className="icon-button" aria-label={sound?'ปิดเสียง':'เปิดเสียง'} aria-pressed={sound} onClick={()=>setSound(!sound)}>{sound?'♫':'♪'}</button><button className="more-control" aria-label="ล้างข้อมูลเครื่องนี้" onClick={()=>setResetPrompt(true)}>⋮</button></header>:<header className="header"><Link to="/" className="brand">RE<span className="brand-light">✦</span>Light</Link><nav aria-label="เมนูหลัก"><Link to="/">เกม</Link><Link to="/about">เกี่ยวกับ</Link><button className="icon-button" aria-label={sound?'ปิดเสียง':'เปิดเสียง'} aria-pressed={sound} onClick={()=>setSound(!sound)}>{sound?'♫':'♪'}</button></nav></header>}
  <main id="main">
   {path === '/' ? <Home/> : path === '/cool' ? <Studio key={resetVersion} tone={tone}/> : path === '/disguise' ? <Cabinet key={resetVersion} tone={tone}/> : path === '/claims' ? <Museum key={resetVersion} tone={tone}/> : path === '/sources' ? <Sources/> : path === '/about' ? <About/> : <section className="reading"><h1 id="page-title" tabIndex={-1}>ห้องนี้ยังไม่มี</h1><p>กลับไปเลือกเกม แล้วลองสำรวจอีกมุม</p><Link to="/">กลับหน้าเกม ↗</Link></section>}
  </main>
  <footer><p><span>✦</span> เท่ ดูดีได้ โดยไม่สูบบุหรี่ไฟฟ้า</p><div><Link to="/sources">แหล่งข้อมูล</Link><a href="https://www.thailandquitline.or.th/site/about/service" target="_blank" rel="noreferrer">อยากขอความช่วยเหลือ ↗</a><button onClick={() => setResetPrompt(true)}>ล้างข้อมูลเครื่องนี้</button></div><small>เล่นได้โดยไม่สมัครสมาชิก · ฉากของคุณเก็บเฉพาะเครื่องนี้ · ไม่มีการส่งคำตอบหรือภาพขึ้นเซิร์ฟเวอร์</small></footer>
  <dialog ref={resetDialog} className="reset-panel" aria-labelledby="reset-title" onCancel={()=>setResetPrompt(false)}><div><h2 id="reset-title">เริ่มใหม่บนเครื่องนี้?</h2><p>ฉากและความคืบหน้าที่บันทึกในเครื่องจะถูกล้าง</p><button autoFocus onClick={() => setResetPrompt(false)}>เก็บไว้ก่อน</button><button className="primary" onClick={() => { for (const k of ['relight-studio-v1', 'relight-cabinet-v1', 'relight-museum-v1', 'relight-visited-v1']) {try{localStorage.removeItem(k);}catch{/* play is independent of storage */}} setResetVersion(x => x + 1); setResetPrompt(false); setSound(false); }}>ล้างและเริ่มใหม่</button></div></dialog>
 </div>;
}
function Home() {
 return <section className="home"><div className="home-intro"><h1 id="page-title" tabIndex={-1}>ลองเล่น <span>แล้วมองอีกมุม</span><i aria-hidden="true">✦</i></h1><p>สามเกมสั้น ๆ เกี่ยวกับบุหรี่ไฟฟ้า</p></div><div className="game-gallery">{games.map(g => <Link key={g.path} to={g.path} className={`game-tile ${g.color}`}><div className="tile-art"><Art name={g.art}/>{g.path === '/claims' && <div className="tile-words"><span>หอม</span><span>เย็น</span><span>ไม่มีนิโคติน</span></div>}</div><div className="tile-label"><h2>{g.title}</h2><p>{g.english}</p><span className="launch" aria-hidden="true">→</span></div></Link>)}</div><p className="home-note">ไม่มีคำตอบที่ต้องแข่งกับใคร แค่ลองเล่น แล้วสังเกตสิ่งที่คุณค้นพบ</p></section>;
}
function GameHeading({ subtitle, reset }: { title: string; subtitle: string; reset: () => void }) {
 return <div className="game-heading"><p>{subtitle}</p><button className="quiet" onClick={reset}>เริ่มฉากใหม่ ↻</button></div>;
}
function Studio({ tone }: { tone: (frequency?: number) => void }) {
 const saved = read('relight-studio-v1');
 const [state, dispatch] = useReducer(studioReducer, saved, value => validSlots(value) ? { slots: value, history: [] } : initialStudio);
 const [selected, setSelected] = useState<ObjectId | null>(null);
 const [message, setMessage] = useState('เลือกของหนึ่งชิ้น แล้วแตะตำแหน่งในห้อง');
 const [ad, setAd] = useState(false);
 const [compared, setCompared] = useState(false);
 const [compareOpen, setCompareOpen] = useState(true);
 const [reflect, setReflect] = useState(false);
 const [saving, setSaving] = useState(false);
 const [saveMessage, setSaveMessage] = useState('');
 const sceneRef = useRef<HTMLDivElement>(null);
 const activePairs = pairs.filter(p => p.ids.every(id => state.slots.includes(id as ObjectId)));
 const [beat, setBeat] = useState(0);
 const [activeObject,setActiveObject]=useState<ObjectId|null>(null);
 const [evening,setEvening]=useState(false);
 function playObject(id:ObjectId){setActiveObject(id);setBeat(x=>x+1);tone(id==='drums'?150:id==='ball'?260:540);setMessage(objects.find(o=>o.id===id)!.action);}
 const pose=state.slots.includes('drums')?'studio-drums-pose':state.slots.includes('camera')?'studio-camera-pose':'studio-character';
 useEffect(() => { write('relight-studio-v1', state.slots); }, [state.slots]);
 function place(id: ObjectId, slot: number) { dispatch({ type: 'place', id, slot }); setSelected(null); tone(440 + slot * 100); setMessage(`${objects.find(o => o.id === id)!.label}เข้าฉากแล้ว ลองจับคู่กับของอีกชิ้น`); }
 async function saveScene() {
  setSaving(true); setSaveMessage('');
  try {
   await document.fonts.ready;
   const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 1100; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas');
   async function draw(name: string, x: number, y: number, w: number, h: number) { const img = new Image(); img.src = `${import.meta.env.BASE_URL}art/${name}.webp`; await img.decode(); const ratio = Math.min(w / img.width, h / img.height); ctx!.drawImage(img, x + (w-img.width*ratio)/2, y + (h-img.height*ratio)/2, img.width*ratio, img.height*ratio); }
   ctx.fillStyle = '#fff9e9'; ctx.fillRect(0,0,1440,1100); await draw(evening?'studio-room-evening':'studio-room',0,0,1440,900); if(activePairs.length)await draw(`combo-${activePairs[0].className}`,0,0,1440,900); await draw(pose,500,180,500,620);
   for (let i=0; i<3; i++) if (state.slots[i]) await draw(state.slots[i]!,100+i*440,550,340,320);
   ctx.fillStyle='#191813'; ctx.font='bold 54px LINESeed'; ctx.fillText('เท่ในแบบคุณ',65,995); ctx.font='28px LINESeed'; ctx.fillText('RE:Light · เท่ ดูดีได้ โดยไม่สูบบุหรี่ไฟฟ้า',65,1050);
   const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('export')), 'image/png')); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='RELight-my-scene.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url),30000); setSaveMessage('สร้างภาพแล้ว ตรวจดูไฟล์ที่ดาวน์โหลดบนเครื่องของคุณ');
  } catch { setSaveMessage('ยังบันทึกภาพไม่ได้ ฉากยังอยู่ ลองอีกครั้งเมื่อภาพทั้งหมดโหลดแล้ว'); } finally { setSaving(false); }
 }
 return <section className="game studio-game"><GameHeading title="เท่ตรงไหน?" subtitle="ลองจัดฉากที่เป็นคุณ แล้วดูว่าภาพโฆษณาเติมอะไรเข้ามา" reset={() => { dispatch({type:'reset'}); setSelected(null); setCompareOpen(true); setReflect(false); setCompared(false); setEvening(false); setAd(false); setMessage('เริ่มฉากใหม่แล้ว'); }}/>
  <div className="studio-composition"><div className={`studio-stage ${activePairs.map(p=>p.className).join(' ')} beat-${beat%2} playing-${activeObject}`} ref={sceneRef}>
   <Art name={evening?"studio-room-evening":"studio-room"} className="room"/><Art name={pose} className="character"/>
   <div className="scene-caption">{activePairs.length ? activePairs[0].title : 'ห้องนี้ยังมีที่ให้ไอเดียของคุณ'}</div>
   {activePairs.length > 0 && <div className="combination-effects" aria-hidden="true"><Art name={`combo-${activePairs[0].className}`}/></div>}
   <div className="scene-slots">{state.slots.map((id,i) => <div className={`scene-slot ${selected ? 'ready' : ''}`} key={i} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); const id=e.dataTransfer.getData('text/plain'); if(objects.some(o=>o.id===id))place(id as ObjectId,i);}}><button className="placement" aria-label={`ตำแหน่ง ${i+1}${id ? `: ${objects.find(o=>o.id===id)!.label}` : ' ว่าง'}`} onClick={()=>{ if(selected)place(selected,i); else if(id){playObject(id);}else setMessage('เลือกของจากถาดก่อน แล้วแตะตำแหน่งนี้');}}>{id ? <Art name={id} className={`prop-${id}`} alt={objects.find(o=>o.id===id)!.label}/> : <span>＋<small>{selected?'วางตรงนี้':'เพิ่มอะไรดี?'}</small></span>}</button>{id && <button className="remove" aria-label={`นำ${objects.find(o=>o.id===id)!.label}ออก`} onClick={()=>dispatch({type:'remove',slot:i})}>×</button>}</div>)}</div>
  </div>
  {compareOpen && <div className={`ad-comparison ${ad?'ad-on':''}`}><div className="comparison-object"><Art name="shell-cosmetic" className="comparison-specimen"/>{ad && <div className="ad-slogans" aria-hidden="true"><span>NEW</span><span>COOL</span><span>YOUR STYLE</span></div>}</div><div><p className="example-label">ภาพโฆษณาบุหรี่ไฟฟ้าสมมติ</p><h2>{ad?'คำขาย แสง และกรอบภาพ':'เมื่อปิดภาพโฆษณา เหลืออะไร?'}</h2><p>สวิตช์นี้เปลี่ยนแค่การนำเสนอ ไม่เปลี่ยนตัวผลิตภัณฑ์หรือความเสี่ยง</p><button className="switch" aria-pressed={ad} onClick={()=>{setAd(!ad);setCompared(true);tone(); if(ad)setReflect(true);}}><span/>{ad?'ปิดภาพโฆษณา':'เปิดภาพโฆษณา'}</button>{compared && <button className="quiet" onClick={()=>setReflect(true)}>ดูสิ่งที่ค้นพบ →</button>}</div></div>}
  </div>
  <div className="studio-workbench"><div><h2>เลือกของเข้าฉาก <small>ได้ 3 ชิ้น · ย้ายหรือเปลี่ยนได้</small></h2><div className="object-tray">{objects.map(o=><button draggable key={o.id} onDragStart={e=>{e.dataTransfer.setData('text/plain',o.id);setSelected(o.id);}} className={selected===o.id?'selected':''} aria-pressed={selected===o.id} onClick={()=>{setSelected(o.id);setMessage(`เลือก${o.label}แล้ว แตะตำแหน่งเพื่อวาง`);}}><Art name={o.id}/><span>{o.label}</span></button>)}</div></div><button className="quiet" disabled={!state.history.length} onClick={()=>dispatch({type:'undo'})}>ย้อนกลับ ↶</button></div>
  <p className="live-message" role="status">{message}</p>
  {activePairs.length>0 && <p className="pair-description">✦ {activePairs.map(p=>p.detail).join(' · ')}</p>}
  <div className="studio-extra"><button className="quiet" onClick={()=>setEvening(!evening)} aria-pressed={evening}>{evening?"แสงเย็น → แสงบ่าย":"ลองแสงเย็น ☾"}</button>{state.slots.includes('drums')&&<div className="drum-pads" aria-label="ลองจังหวะกลอง">{[150,230,360].map((n,i)=><button key={n} onClick={()=>{tone(n);setBeat(x=>x+1);setActiveObject('drums');}} aria-label={`ตีกลองเสียง ${i+1}`}>{['ตุ้ม','ตั้ก','ฉ่า'][i]}</button>)}</div>}</div><div className="studio-actions"><div><h2>เท่ในแบบคุณ</h2><p>สิ่งที่ทำ มุมมองที่มี และเรื่องที่คุณอยากเล่า</p></div><button className="secondary" onClick={()=>setCompareOpen(!compareOpen)} aria-expanded={compareOpen}>ลองปิดภาพโฆษณา ↗</button><button className="primary" disabled={saving || !state.slots.some(Boolean)} onClick={()=>void saveScene()}>{saving?'กำลังสร้างภาพ…':'บันทึกฉากนี้ ↓'}</button></div>
  {saveMessage && <p role="status">{saveMessage}</p>}
  {reflect && <div className="takeaway"><span>✦</span><div><h2>ภาพโฆษณาเปลี่ยนได้ ตัวตนคุณมีมากกว่านั้น</h2><p>บุหรี่ไฟฟ้าไม่จำเป็นต้องเป็นส่วนหนึ่งของภาพที่คุณอยากสร้าง ฉากนี้เป็นการทดลองเรื่องภาพลักษณ์ ไม่ใช่การวัดว่าใครเท่กว่าใคร</p></div></div>}
  <Evidence><p>WHO อธิบายการใช้ภาพลักษณ์ กลิ่นรส และการตลาดเพื่อดึงดูดเยาวชน ฉากโฆษณานี้เป็นตัวอย่างที่สร้างขึ้นเพื่อสังเกตการนำเสนอ</p></Evidence><NextGame path="/disguise" title="เปิดสิ่งที่หน้าตาไม่ได้บอก"/>
 </section>;
}
const specimens = [{name:'เปลือกแบบแกดเจ็ต',shape:'gadget',color:'#9a84ca'},{name:'เปลือกแบบของเล่น',shape:'toy',color:'#e4a262'},{name:'เปลือกแบบเครื่องสำอาง',shape:'cosmetic',color:'#67a8a2'}];
const components=[{name:'แบตเตอรี่',text:'แหล่งพลังงานในภาพตัวอย่างนี้ รูปทรงจริงแตกต่างกันตามอุปกรณ์',id:'battery'},{name:'ส่วนให้ความร้อน',text:'ระบบให้ความร้อนกับน้ำยาเพื่อสร้างละออง ไม่ใช่เครื่องสร้างไอน้ำเปล่า',id:'heater'},{name:'ส่วนบรรจุน้ำยา',text:'น้ำยาอาจมีนิโคติน สารแต่งกลิ่น และสารอื่น ส่วนประกอบไม่เหมือนกันทุกผลิตภัณฑ์',id:'liquid'}];
function Cabinet({tone}:{tone:(frequency?:number)=>void}) {
 const saved=read('relight-cabinet-v1') as Record<string,unknown>|null;
 const integer=(key:string,max:number)=>saved&&typeof saved[key]==='number'&&Number.isInteger(saved[key])&&Number(saved[key])>=0&&Number(saved[key])<=max?Number(saved[key]):0;
 const [specimen,setSpecimen]=useState(integer('specimen',2));const [angle,setAngle]=useState(integer('angle',2));const [open,setOpen]=useState(integer('open',100));const [detail,setDetail]=useState<number|null>(saved&&typeof saved.detail==='number'&&Number.isInteger(saved.detail)&&saved.detail>=0&&saved.detail<3?saved.detail:null);const [path,setPath]=useState(saved?.path===true);
 useEffect(()=>write('relight-cabinet-v1',{specimen,angle,open,detail,path}),[specimen,angle,open,detail,path]);const [message,setMessage]=useState('หมุนดูได้ แล้วลองเปิดเปลือก');
 function turn(delta:number){setAngle((angle+delta+3)%3);tone(350);setMessage('เปลี่ยนมุมมองแล้ว');}
 return <section className="game cabinet-game"><GameHeading title="มองออกไหม?" subtitle="รูปร่างคุ้นตา อาจไม่ได้บอกเรื่องข้างในทั้งหมด" reset={()=>{setSpecimen(0);setAngle(0);setOpen(0);setDetail(null);setPath(false);}}/>
  <div className="cabinet-layout"><div className="cabinet-art"><div className="cabinet-title">หน้าตาบอกไม่หมด</div><div className={`inspection-view angle-${angle} ${open>35?'is-open':''}`}><Art name={`shell-${specimens[specimen].shape}`} className="closed-specimen"/><Art name={`open-${specimens[specimen].shape}`} className="exploded-specimen"/>{open>35&&<div className="inspection-markers"><svg className="diagram-leaders" viewBox="0 0 440 390" preserveAspectRatio="none" aria-hidden="true"><path d="M165 220 L106 274 L28 274 M220 203 L288 165 L410 165 M285 196 L330 82 L410 82"/><circle cx="165" cy="220" r="4"/><circle cx="220" cy="203" r="4"/><circle cx="285" cy="196" r="4"/></svg>{components.map((c,i)=><button key={c.id} className={`inspect-${c.id} ${detail===i?'active':''}`} onClick={()=>{setDetail(i);tone(450+i*80);setMessage(`เลือก${c.name}`);}} aria-label={`ตรวจ${c.name}`} aria-pressed={detail===i}>{c.name}</button>)}</div>}</div><div className="rotation"><button onClick={()=>turn(-1)} aria-label="ดูมุมก่อนหน้า">←</button><span>{['มุมหน้า','มุมเอียง','มุมอีกด้าน'][angle]} · ภาพจำลอง</span><button onClick={()=>turn(1)} aria-label="ดูมุมถัดไป">→</button></div><label className="open-control">เปิดเปลือก <input aria-label="ระดับการเปิดเปลือก" type="range" min="0" max="100" value={open} onChange={e=>{setOpen(Number(e.target.value));if(Number(e.target.value)>35)setMessage('เปิดแล้ว เลือกส่วนข้างในเพื่อสำรวจ');}}/><span>{open}%</span></label><button className="primary" onClick={()=>{setOpen(open>35?0:100);tone();}}>{open>35?'ปิดเปลือก':'ดูข้างใน ↗'}</button></div><aside className="cabinet-notes">{detail!==null&&<Art name={`component-${components[detail].id}`} className="component-detail-art"/>}<h2>{detail!==null?components[detail].name:'แค่เปลี่ยนเปลือก ข้างในเปลี่ยนไหม?'}</h2><p>{detail!==null?components[detail].text:'ลองสลับรูปร่างด้านล่าง แล้วเปิดดูส่วนประกอบ สีหรือหน้าตาไม่ใช่ใบรับรองความปลอดภัย'}</p><p className="example-label">อุปกรณ์สมมติ · แผนภาพอย่างง่าย ไม่ใช่แบบประกอบ</p><button className="secondary" onClick={()=>setPath(!path)} aria-expanded={path}>ตามรอยละออง →</button>{path && <div className="aerosol-path"><span>น้ำยา</span><b>→</b><span>ความร้อน</span><b>→</b><span>ละออง</span><p>บุหรี่ไฟฟ้าให้ความร้อนกับน้ำยาเพื่อสร้างละออง องค์ประกอบและปริมาณแตกต่างกัน ภาพนี้ไม่จำลองปริมาณสารหรือความเสี่ยงของคุณ</p></div>}</aside></div>
  <div className="specimen-tray"><h2>ลองเปลี่ยนหน้าตา</h2>{specimens.map((s,i)=><button key={s.name} className={i===specimen?'selected':''} aria-pressed={i===specimen} onClick={()=>{setSpecimen(i);tone(380+i*80);}}><Art name={`open-${s.shape}`} className="specimen-preview"/>{s.name}</button>)}</div><p role="status" className="live-message">{message}</p>
  {open>35&&detail!==null&&<div className="takeaway"><span>✦</span><div><h2>หน้าตาที่เปลี่ยน ไม่ได้ยืนยันว่าความเสี่ยงหายไป</h2><p>ของที่ดูเหมือนของเล่นหรือแกดเจ็ตอาจเป็นบุหรี่ไฟฟ้า การมองแค่เปลือกไม่พอจะบอกว่าข้างในมีอะไร</p></div></div>}<Evidence><p>WHO อธิบายว่าบุหรี่ไฟฟ้าบางแบบใช้ดีไซน์คล้ายของเล่น และให้ความร้อนกับน้ำยาเพื่อสร้างละออง น้ำยาอาจมีหรือไม่มีนิโคติน</p></Evidence><NextGame path="/claims" title="ลองทดสอบคำขาย"/>
 </section>;
}
function Museum({tone}:{tone:(frequency?:number)=>void}) {
 const saved=read('relight-museum-v1') as Record<string,unknown>|null;
 const [selected,setSelected]=useState(saved&&typeof saved.selected==='number'&&Number.isInteger(saved.selected)&&saved.selected>=0&&saved.selected<3?saved.selected:0);const [result,setResult]=useState<ReturnType<typeof testClaim>>(null);const [found,setFound]=useState<string[]>(Array.isArray(saved?.found)?saved.found.filter((x):x is string=>typeof x==='string'&&claims.some(c=>c.id===x)):[]);
 useEffect(()=>write('relight-museum-v1',{selected,found}),[selected,found]);const [message,setMessage]=useState('เลือกคำขาย แล้วเลือกเครื่องมือทดสอบ');const [stamp,setStamp]=useState(0);
 function run(toolId:string){const r=testClaim(claims[selected].id,toolId);setResult(r);setStamp(x=>x+1);tone(r?.matches?620:260);if(r?.matches){setFound(x=>x.includes(r.claim.id)?x:[...x,r.claim.id]);setMessage(r.claim.reveal);}else setMessage(r?.hint||'เลือกเครื่องมืออีกครั้ง');}
 return <section className="game museum-game"><GameHeading title="พิพิธภัณฑ์คำขาย" subtitle="เอาคำโฆษณาบุหรี่ไฟฟ้ามาลอง ว่ามันบอกอะไรจริง ๆ" reset={()=>{setSelected(0);setResult(null);setFound([]);setMessage('เริ่มการทดลองใหม่แล้ว');}}/>
  <div className="lab-bench" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const raw=e.dataTransfer.getData('claim');const n=Number(raw);if(raw!==''&&Number.isInteger(n)&&n>=0&&n<3){setSelected(n);setResult(null);}}}><div className="claim-tray">{claims.map((c,i)=><button key={c.id} draggable onDragStart={e=>{e.dataTransfer.setData('claim',String(i));setSelected(i);}} className={`claim-card card-${i} ${selected===i?'chosen':''}`} aria-pressed={selected===i} onClick={()=>{setSelected(i);setResult(null);setMessage(c.prompt);}}><Art name={`claim-${c.id}`} className="claim-art"/><strong>{c.word}</strong><small>{found.includes(c.id)?'เคยทดสอบแล้ว ✓':'คำขายสมมติ'}</small></button>)}</div><div className="lab-paper"><span className="example-label">โต๊ะทดสอบคำขาย</span><h2>“{claims[selected].word}”</h2><p>{claims[selected].prompt}</p><div className="tools">{tools.map(t=><button key={t.id} onClick={()=>run(t.id)}><span>{t.id === 'scope' ? <Art name="magnifier"/> : t.id === 'evidence' ? <Art name="stamp"/> : <Art name="separation-tool"/>}</span>{t.label}</button>)}</div>{result&&<div className={`test-result ${result.matches?'matched':'try-again'}`} key={stamp}>{result.matches?<><div className="result-stamp">คำขาย ≠ หลักฐาน</div><h3>{result.claim.reveal}</h3><div className="scope-comparison"><div><small>คำนี้กล่าวถึง</small><p>{result.claim.scope}</p></div><span>≠</span><div><small>ยังต้องดู</small><p>{result.claim.missing}</p></div></div><p>{result.claim.detail}</p><a href={WHO} target="_blank" rel="noreferrer">ดูหลักฐานจาก WHO ↗</a></>:<><h3>เครื่องมือนี้ยังตอบคำถามไม่ตรงจุด</h3><p>{result.hint}</p></>}</div>}</div></div><p className="live-message" role="status">{message}</p><div className="takeaway"><span>✦</span><div><h2>คำขายฟังดี แล้วหลักฐานบอกอะไร?</h2><p>ลองได้ทุกคำ ทุกเครื่องมือ ไม่ต้องแข่งทำคะแนนกับใคร</p></div></div><Evidence><p>ละอองบุหรี่ไฟฟ้าอาจมีนิโคตินและสารอื่นที่เป็นอันตราย บางผลิตภัณฑ์ที่อ้างว่าไม่มีนิโคตินตรวจพบว่ามี การทดลองนี้แยกคำกล่าวอ้างออกจากหลักฐาน ไม่ใช่การตรวจน้ำยาจริง</p></Evidence><NextGame path="/cool" title="กลับไปสร้างฉากที่เป็นคุณ"/>
 </section>;
}
function NextGame({path,title}:{path:string;title:string}){return <div className="next-game"><Link to="/">← เลือกเกมอื่น</Link><Link to={path}>{title} ↗</Link></div>;}
function About(){return <section className="reading"><h1 id="page-title" tabIndex={-1}>เรื่องเล็ก ๆ ที่อยากชวนมองอีกมุม</h1><p className="lede">RE:Light คือสามการทดลองเกี่ยวกับภาพลักษณ์ สิ่งที่ซ่อนอยู่ และคำชวนเชื่อของบุหรี่ไฟฟ้า</p><p>ลองเล่นได้โดยไม่ต้องไปนิทรรศการ ไม่ต้องสมัครสมาชิก และไม่ต้องบอกว่าเคยสูบหรือไม่ ทุกคนมีพื้นที่ให้ค้นพบ ตั้งคำถาม และเป็นตัวเอง</p><p>เราใช้ภาพและผลิตภัณฑ์สมมติเพื่อการเรียนรู้ ไม่มีการจัดอันดับความเท่หรือวัดความเสี่ยงสุขภาพ ภาพโฆษณาในเกมเป็นตัวอย่างที่สร้างขึ้น</p><h2>เท่ ดูดีได้ โดยไม่สูบบุหรี่ไฟฟ้า</h2><p>เว็บไซต์นี้เป็นโครงการเกมแยกจากเว็บไซต์ความรู้และภาพยนตร์ RE:Light คุณสามารถสำรวจต่อได้ตามความสนใจ</p><a href="https://relight-web-two.vercel.app" target="_blank" rel="noreferrer">เว็บไซต์ความรู้ RE:Light ↗</a><h2>สิ่งที่เก็บบนเครื่อง</h2><p>ฉากที่จัดไว้ มุมมองอุปกรณ์ และคำขายที่เคยสำรวจ เพื่อกลับมาเล่นต่อ ไม่มีการส่งภาพหรือคำตอบไปยังเซิร์ฟเวอร์ ล้างข้อมูลได้ที่ท้ายหน้า</p><Link to="/">เริ่มเล่น ↗</Link></section>;}
function Sources(){return <section className="reading"><h1 id="page-title" tabIndex={-1}>มองให้ลึกขึ้น</h1><p className="lede">เกมช่วยตั้งคำถาม แหล่งข้อมูลช่วยตรวจสิ่งที่เราเข้าใจ</p><article><h2>บุหรี่ไฟฟ้า ละออง และนิโคติน</h2><p>WHO อธิบายการทำงาน ความหลากหลายของผลิตภัณฑ์ การตลาดที่ดึงดูดเยาวชน และข้อจำกัดของคำกล่าวอ้าง</p><a href={WHO} target="_blank" rel="noreferrer">WHO · Tobacco: E-cigarettes ↗</a><p>เผยแพร่ 19 มกราคม 2024 · ตรวจแหล่งข้อมูล 6 ตุลาคม 2026</p></article><article><h2>แนวคิดของการแข่งขัน</h2><p>NoNic-Smart Gen: สร้างค่านิยมเยาวชนคนรุ่นใหม่ เท่ ดูดีได้โดยไม่สูบบุหรี่ไฟฟ้า</p><a href="https://www.artculture4health.com/Contents/view/4556" target="_blank" rel="noreferrer">ประกาศจากผู้จัด ↗</a></article><article><h2>ถ้าอยากเลิก หรืออยากช่วยเพื่อน</h2><p>การขอความช่วยเหลือเป็นทางเลือกหนึ่ง เริ่มดูบริการให้คำปรึกษาจากศูนย์บริการเลิกบุหรี่ทางโทรศัพท์แห่งชาติ</p><a href="https://www.thailandquitline.or.th/site/about/service" target="_blank" rel="noreferrer">บริการของ Quitline ↗</a></article><p>ภาพส่วนประกอบและผลการทดสอบในเกมเป็นคำอธิบายเชิงแนวคิด ไม่ใช่แบบประกอบ ผลตรวจน้ำยา หรือคำแนะนำทางการแพทย์เฉพาะบุคคล</p><Link to="/">กลับไปเล่น ↗</Link></section>;}
export default App;
