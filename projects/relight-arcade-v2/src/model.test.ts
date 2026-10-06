import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pulseRule,changeWeight,nextFeed,initialWeights,topics} from './model.ts';
test('pulse machine requires more work and gives shorter feedback across authored phases',()=>{
 const a=pulseRule(0),b=pulseRule(4),c=pulseRule(8);assert.ok(a.need<b.need&&b.need<c.need);assert.ok(a.lasts>b.lasts&&b.lasts>c.lasts);
});
test('recommendation signals change exposure while weighted queue preserves diversity',()=>{
 const w=changeWeight(changeWeight(initialWeights,'vape','like'),'vape','linger');const q=nextFeed(w);assert.equal(q.filter(t=>t==='vape').length,w.vape);assert.equal(q.filter(t=>t==='art').length,w.art);assert.ok(new Set(q.slice(0,5)).size>1);assert.ok(w.vape>initialWeights.vape);
});
test('skip and capped signals never erase a topic or create unbounded recommendations',()=>{
 let w={...initialWeights};for(let i=0;i<100;i++)w=changeWeight(w,'vape','like');assert.equal(w.vape,16);for(let i=0;i<100;i++)w=changeWeight(w,'vape','skip');assert.equal(w.vape,1);assert.ok(topics.every(t=>nextFeed(w).includes(t)));
});
