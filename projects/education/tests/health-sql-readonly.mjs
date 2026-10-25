// Explicit opt-in; aggregate reads and transaction-local CTE fixtures only.
import nextEnv from '@next/env';
const {loadEnvConfig}=nextEnv;
import {Pool} from 'pg';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadTypescript} from './helpers/load-typescript.mjs';
loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {statisticsFromPool}=await loadTypescript(new URL('../app/api/analytics/aggregates.ts',import.meta.url));
const connection=new URL(process.env.DATABASE_URL);connection.searchParams.set('sslmode','verify-full');
const pool=new Pool({connectionString:connection.href,max:1,connectionTimeoutMillis:8000}),client=await pool.connect();
try{
 await client.query('BEGIN READ ONLY');const result={mode:'explicit PostgreSQL READ ONLY; no writes',sources:{},fixtures:{}};
 let healthQuery;
 for(const source of ['all','education','hub','skyfront']){
  const stats=await statisticsFromPool({async query(sql,params){if(sql.startsWith('SELECT type,section AS code,page,device'))healthQuery=sql;return client.query(sql,params);}},7,source);
  result.sources[source]={groups:stats.health.observations.length,coverage:stats.coverage.performance};
 }
 const fixture=`WITH fixture(type,section,page,device,session,at) AS (VALUES ('site_performance','load-1-3s','/hub','mobile','one',NOW()-INTERVAL '1 hour'),('site_performance','load-1-3s','/hub','mobile','two',NOW()-INTERVAL '1 hour'),('site_error','runtime-error','/','desktop','three',NOW()-INTERVAL '1 hour'),('site_error','resource-error','/','mobile','four',NOW()-INTERVAL '20 days'),('site_error','runtime-error','/hub','mobile','future',NOW()+INTERVAL '1 day')) `;
 for(const source of ['all','education','hub','skyfront']){
  const {rows}=await client.query(fixture+healthQuery.replaceAll('analytics_events','fixture'),[7,source]);const events=rows.reduce((sum,row)=>sum+Number(row.events),0);assert.equal(events,{all:3,education:1,hub:2,skyfront:0}[source]);result.fixtures[source]={events,groups:rows.length};
 }
 await client.query('ROLLBACK');if(process.env.RELIGHT_QA_OUTPUT)await writeFile(process.env.RELIGHT_QA_OUTPUT,JSON.stringify(result,null,2));console.log('Read-only PostgreSQL aggregate reconciliation and CTE source/time/viewport fixtures passed');
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Read-only health SQL validation failed ('+(error.code||error.name)+')');process.exitCode=1;}finally{client.release();await pool.end();}
