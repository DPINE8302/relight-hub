import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(){
 const source=readFileSync(process.env.HUB_SCRIPT||new URL('../docs/assets/hub.js',import.meta.url),'utf8');
 let now=0,enabled=true,healthStarts=0;const events=[],handlers={},documentHandlers={},buttonHandlers={},timers=[];
 const privacy={hidden:true,setAttribute(){},addEventListener(type,fn){(buttonHandlers[type]??=[]).push(fn);}};
 const document={hidden:false,getElementById:()=>privacy,addEventListener(type,fn){documentHandlers[type]=fn;}};
 const metrics={disabled:()=>!enabled,setEnabled:value=>{enabled=value;},record:(type,detail={})=>{if(enabled)events.push({type,...detail});},flush(){}};
 vm.runInNewContext(source.slice(source.indexOf('if(metrics){')),{metrics,document,window:{addEventListener(type,fn){(handlers[type]??=[]).push(fn);}},performance:{now:()=>now},observeWebHealth(){healthStarts++;return ()=>{};},setInterval:fn=>timers.push(fn),URL,location:{href:'https://example.org/relight-hub/'}});
 return {events,document,setTime:seconds=>{now=seconds*1000;},toggle:()=>buttonHandlers.click.forEach(fn=>fn()),storage:(on,key='relight-statistics-disabled')=>{enabled=on;handlers.storage.forEach(fn=>fn({key}));},tick:()=>timers[0](),visibility:hide=>{document.hidden=hide;documentHandlers.visibilitychange();},healthStarts:()=>healthStarts};
}
test('re-enabling statistics cannot include the disabled interval',()=>{
 const f=fixture();f.setTime(1);f.toggle();f.setTime(10);f.toggle();f.setTime(15);f.tick();assert.deepEqual(f.events.filter(e=>e.type==='engagement').map(e=>e.seconds),[5]);
});
test('cross-tab privacy changes reset time, unrelated storage leaves the baseline and observer intact',()=>{
 const f=fixture();f.setTime(1);f.storage(false);f.setTime(10);f.storage(true);const starts=f.healthStarts();f.setTime(12);f.storage(true,'relight-skyfront-queue');assert.equal(f.healthStarts(),starts);f.setTime(15);f.tick();assert.deepEqual(f.events.filter(e=>e.type==='engagement').map(e=>e.seconds),[5]);
});
test('hidden time and disabled heartbeats cannot accumulate engagement',()=>{
 const f=fixture();f.setTime(2);f.visibility(true);f.setTime(40);f.tick();f.setTime(50);f.visibility(false);f.setTime(52);f.tick();f.toggle();f.setTime(80);f.tick();assert.deepEqual(f.events.filter(e=>e.type==='engagement').map(e=>e.seconds),[2,2]);
});
