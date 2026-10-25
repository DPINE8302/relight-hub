import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('offline shell invalidates when an imported JavaScript runtime changes',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'relight-offline-version-'));
 try{
  await mkdir(join(folder,'app/analytics'),{recursive:true});await mkdir(join(folder,'public/games/puff-world-inside'),{recursive:true});
  await writeFile(join(folder,'public/games/puff-world-inside/offline-assets.json'),'{}');await writeFile(join(folder,'public/sw.js'),'const VERSION = "initial";');
  const runtime=join(folder,'app/analytics/web-health.js');await writeFile(runtime,'export const behavior = 1;');
  const build=async()=>{execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/prepare-offline.mjs',import.meta.url))],{cwd:folder,stdio:'pipe'});return readFile(join(folder,'public/sw.js'),'utf8');};
  const first=await build();assert.equal(await build(),first,'identical runtime must not churn cache');await writeFile(runtime,'export const behavior = 2;');assert.notEqual(await build(),first,'changed JavaScript must invalidate the old offline shell');
 }finally{await rm(folder,{recursive:true,force:true});}
});
