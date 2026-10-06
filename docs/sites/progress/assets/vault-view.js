const TYPES={planning:'บทและแผน',film:'ภาพยนตร์',assets:'ภาพและสถานที่',room:'ห้อง',application:'แอปควบคุม',review:'เอกสารรีวิว',sites:'เว็บไซต์และประวัติ'};
const TEXT=new Set(['md','txt','json','js','mjs','cjs','ts','tsx','jsx','css','html','htm','xml','py','sh','swift','toml','yml','yaml','csv','ini','sql','log','srt','vtt']);
const IMAGE=new Set(['png','jpg','jpeg','webp','gif','avif','svg']);
const VIDEO=new Set(['mp4','webm','mov','m4v']);
const AUDIO=new Set(['mp3','wav','m4a','aac','ogg']);
const $=id=>document.getElementById(id);
function formatSize(bytes){return bytes>=1e6?(bytes/1e6).toFixed(1)+' MB':bytes>=1e3?Math.round(bytes/1e3)+' KB':bytes+' B'}
function message(text){const p=document.createElement('p');p.className='preview-message';p.textContent=text;$('file-preview').replaceChildren(p)}
async function preview(file){const ext=file.path.split('.').pop().toLowerCase(),box=$('file-preview');let el;
  if(IMAGE.has(ext)){el=document.createElement('img');el.src=file.url;el.alt=file.name}
  else if(VIDEO.has(ext)){el=document.createElement('video');el.src=file.url;el.controls=true;el.preload='metadata';el.playsInline=true}
  else if(AUDIO.has(ext)){el=document.createElement('audio');el.src=file.url;el.controls=true;el.preload='metadata'}
  else if(ext==='glb'){el=document.createElement('model-viewer');el.src=file.url;el.alt=file.name;el.setAttribute('camera-controls','');el.setAttribute('touch-action','pan-y');el.setAttribute('camera-orbit','35deg 75deg auto');el.setAttribute('shadow-intensity','0.6');el.setAttribute('tone-mapping','aces')}
  else if(ext==='pdf'){el=document.createElement('iframe');el.src=file.url;el.title=file.name}
  else if(TEXT.has(ext)&&file.bytes<3e6){const response=await fetch(file.url);if(!response.ok)throw Error('เปิดไฟล์ไม่ได้');let content=await response.text();if(ext==='json'){try{content=JSON.stringify(JSON.parse(content),null,2)}catch{}}el=document.createElement('pre');el.textContent=content}
  else{message('ไฟล์ชนิดนี้ไม่มีตัวอย่างในเบราว์เซอร์ เลือกดาวน์โหลดเมื่อต้องการเปิดด้วยแอปที่รองรับ');return}
  el.className='preview-content';el.addEventListener('error',()=>message('ดูตัวอย่างไฟล์นี้ไม่ได้ กรุณาใช้ปุ่มดาวน์โหลด'));box.replaceChildren(el)
}
async function start(){const requested=new URLSearchParams(location.search).get('path');if(!requested){message('ไม่พบชื่อไฟล์');$('file-title').textContent='ไม่พบไฟล์';return}
  try{const response=await fetch('/relight-hub/sites/progress/vault/manifest.json');if(!response.ok)throw Error('manifest');const manifest=await response.json(),file=manifest.files.find(f=>f.path===requested);if(!file)throw Error('file');
    $('file-category').textContent=TYPES[file.category]||file.category;$('file-title').textContent=file.name;$('file-path').textContent=file.path;$('file-meta').textContent=`${formatSize(file.bytes)} · ${file.status==='archive'?'งานก่อนหน้า':file.status==='review'?'ไฟล์ดูงาน':'ไฟล์อ้างอิง'}`;
    document.title=file.name+' | RE:LIGHT';const folder=file.path.includes('/')?file.path.split('/')[0]:null,back='/relight-hub/sites/progress/vault/?category='+encodeURIComponent(file.category)+(folder?'&folder='+encodeURIComponent(folder):'');document.querySelectorAll('.vault-back,.vault-view-actions .quiet-link,.global-nav .nav-action').forEach(a=>a.href=back);const download=$('file-download');download.href=file.url;download.download=file.path.split('/').pop();download.hidden=false;await preview(file)
  }catch{message('ไม่พบไฟล์ในคลัง');$('file-title').textContent='ไม่พบไฟล์'}}
start();
