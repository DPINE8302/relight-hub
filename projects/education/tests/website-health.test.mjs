import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadTypescript} from './helpers/load-typescript.mjs';
import {loadBucket,observeWebHealth} from '../app/analytics/web-health.js';
const {parseMetrics}=await loadTypescript(new URL('../app/api/analytics/validation.ts',import.meta.url));
const {statisticsFromPool}=await loadTypescript(new URL('../app/api/analytics/aggregates.ts',import.meta.url));
const metric=(patch={})=>({id:randomUUID(),visitor:randomUUID(),session:randomUUID(),page:'/',type:'site_error',section:'runtime-error',at:new Date().toISOString(),device:'mobile',referrer:'direct',...patch});
test('website health rejects free-form codes and scopes Hub independently from game errors',()=>{
 for(const section of ['runtime-error','unhandled-rejection','resource-error','wall-read-failed','wall-write-failed'])assert.equal(parseMetrics({events:[metric({section})]})[0].section,section);
 for(const patch of [{section:'private URL'},{page:'/skyfront'},{page:'/hub',section:'wall-read-failed'},{type:'site_performance',section:'1234ms'}])assert.throws(()=>parseMetrics({events:[metric(patch)]}),/INVALID/);
 const value=parseMetrics({events:[metric({type:'site_performance',page:'/hub',section:'load-1-3s',message:'private'})]})[0];assert.equal(value.section,'load-1-3s');assert.ok(!JSON.stringify(value).includes('private'));
});
test('document load buckets preserve explicit boundaries without retaining exact timings',()=>{
 assert.deepEqual([0,999,1000,2999,3000,5999,6000,10000].map(loadBucket),['load-under-1s','load-under-1s','load-1-3s','load-1-3s','load-3-6s','load-3-6s','load-over-6s','load-over-6s']);
 for(const value of [NaN,-1,Infinity])assert.equal(loadBucket(value),null);
});
test('global observer caps repeated errors, never reads their messages and detaches cleanly',()=>{
 const listeners=new Map(),observations=[];
 const env={document:{readyState:'loading'},addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),clearTimeout(){}};
 const stop=observeWebHealth((type,detail)=>observations.push({type,...detail}),env);
 const event={target:env,get message(){throw Error('private message must never be accessed')}};
 for(let i=0;i<20;i++)listeners.get('error')(event);listeners.get('unhandledrejection')();assert.equal(observations.length,6);assert.equal(observations[0].section,'runtime-error');stop();assert.equal(listeners.size,0);
});
test('health aggregates retain source/time predicates, viewport grain and honest coverage',async()=>{
 const queries=[];const health=[{type:'site_performance',code:'load-1-3s',page:'/hub',device:'mobile',events:'2',sessions:'2'}];
 const pool={async query(sql,params){queries.push({sql,params});return {rows:sql.includes('SELECT type,section AS code,page,device')?health:[{first_event:null,returning_visits:0,active:0}]};}};
 const result=await statisticsFromPool(pool,7,'hub');assert.deepEqual(result.health.observations,health);assert.equal(result.coverage.performance,'awaiting-events');
 const query=queries.find(q=>q.sql.includes('SELECT type,section AS code,page,device'));assert.deepEqual(query.params,[7,'hub']);assert.match(query.sql,/GROUP BY type,section,page,device/);assert.match(query.sql,/at <= NOW\(\)/);assert.match(query.sql,/\$2='hub' AND page='\/hub'/);
 const errorOnly=await statisticsFromPool({async query(){return {rows:[{first_event:'2026-10-25T00:00:00Z',first_performance_event:null,first_error_event:'2026-10-25T00:00:00Z',returning_visits:0,active:0}]};}},7,'education');
 assert.equal(errorOnly.coverage.performance,'awaiting-events');
});
