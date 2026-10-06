export const experiments = [
 {id:'hit',name:'ONE MORE HIT',thai:'แค่คำเดียวเอง',tease:'ลองกด แล้วดูว่าใครเริ่มคุมใคร',color:'citron'},
 {id:'cool',name:'BUILD YOUR COOL',thai:'สร้างตัวเอง',tease:'ทำบางอย่างจริง ๆ แล้วลองเทียบกับคำขาย',color:'blue'},
 {id:'cloud',name:"WHAT’S IN THE CLOUD?",thai:'จับสิ่งที่มองไม่เห็น',tease:'ลากละอองเข้าเครื่อง แล้วดูคำว่า “แค่น้ำ”',color:'pink'},
 {id:'body',name:'KEEP ME ALIVE',thai:'ห้องควบคุมร่างกาย',tease:'หนึ่งทางเข้า หลายระบบที่ต้องดู',color:'orange'},
 {id:'feed',name:'THE ALGORITHM',thai:'คุณเลือก หรือมันเลือก?',tease:'ลองเปลี่ยนสิ่งที่ฟีดคิดว่าคุณชอบ',color:'violet'},
] as const;
export type GameId=typeof experiments[number]['id'];
export function pulseRule(hits:number){return hits<3?{phase:0,need:1,lasts:4600}:hits<7?{phase:1,need:2,lasts:2600}:{phase:2,need:3,lasts:1400};}
export type Topic='music'|'art'|'sport'|'photo'|'vape';
export const topics:Topic[]=['music','art','sport','photo','vape'];
export const topicNames:Record<Topic,string>={music:'ดนตรี',art:'ศิลปะ',sport:'กีฬา',photo:'ภาพถ่าย',vape:'คำขายบุหรี่ไฟฟ้า'};
export type FeedWeights=Record<Topic,number>;
export const initialWeights:FeedWeights={music:3,art:3,sport:3,photo:3,vape:1};
export function changeWeight(w:FeedWeights,t:Topic,action:'like'|'linger'|'skip'){return {...w,[t]:Math.max(1,Math.min(16,w[t]+(action==='like'?4:action==='linger'?2:-2)))};}
export function nextFeed(w:FeedWeights):Topic[]{
 const total=topics.reduce((n,t)=>n+w[t],0),current={music:0,art:0,sport:0,photo:0,vape:0};const result:Topic[]=[];
 for(let i=0;i<total;i++){topics.forEach(t=>current[t]+=w[t]);const selected=topics.reduce((best,t)=>current[t]>current[best]?t:best,topics[0]);result.push(selected);current[selected]-=total;}
 return result;
}
export const particleTypes=[
 {id:'nicotine',title:'นิโคติน',glyph:'N',color:'#dadf26',note:'สารที่เสพติดสูง น้ำยาอาจมีหรือไม่มีนิโคติน การมองกลุ่มละอองไม่ได้บอกปริมาณ'},
 {id:'small',title:'อนุภาคขนาดเล็ก',glyph:'••',color:'#77c4df',note:'ละอองอาจมีอนุภาคขนาดเล็กที่สูดลึกเข้าไปในปอดได้ มองไม่เห็นไม่ได้แปลว่าไม่มี'},
 {id:'metal',title:'โลหะบางชนิด',glyph:'M',color:'#c7bddf',note:'CDC ระบุว่าในละอองอาจพบโลหะ เช่น นิกเกิล ดีบุก และตะกั่ว ไม่ใช่ทุกผลิตภัณฑ์มีส่วนผสมเหมือนกัน'},
 {id:'chemical',title:'สารอื่น ๆ',glyph:'?',color:'#ef9c81',note:'ละอองอาจมีสารที่เป็นอันตราย รวมถึงสารก่อมะเร็ง ภาพนี้เป็นชุดตัวอย่าง ไม่ใช่ผลตรวจน้ำยาจริง'},
] as const;
export function readLights():GameId[]{try{const v=JSON.parse(localStorage.getItem('relight-v2-lights')||'[]');return Array.isArray(v)?[...new Set(v.filter((x):x is GameId=>experiments.some(e=>e.id===x)))]:[];}catch{return [];}}
