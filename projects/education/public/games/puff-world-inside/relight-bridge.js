const send = type => parent.postMessage({source:"puff-inside",type},location.origin);
const welcome=document.getElementById("welcome"), ending=document.getElementById("ending");
let started=false,finished=false,ready=false;
function inspect(){
 const error=document.getElementById('error');
 if(error&&!error.hidden){send('error');return;}
 if(!ready&&document.getElementById('start')?.disabled===false){ready=true;send('ready');}
 if(welcome.hidden&&!started){started=true;send("start");}
 if(!ending.hidden&&!finished){finished=true;send("complete");}
 if(ending.hidden&&finished){finished=false;send("start");}
}
new MutationObserver(inspect).observe(document.body,{subtree:true,attributes:true,attributeFilter:["hidden","disabled","aria-busy"]});
document.getElementById('game')?.addEventListener('webglcontextlost',()=>send('error'));
window.addEventListener('error',()=>send('error'));
inspect();
