const send = type => parent.postMessage({source:"puff-inside",type},location.origin);
const welcome=document.getElementById("welcome"), ending=document.getElementById("ending");
let started=false,finished=false;
new MutationObserver(()=>{
 if(welcome.hidden&&!started){started=true;send("start");}
 if(!ending.hidden&&!finished){finished=true;send("complete");}
 if(ending.hidden&&finished){finished=false;send("start");}
}).observe(document.body,{subtree:true,attributes:true,attributeFilter:["hidden"]});
