import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fixture} from './fixture.mjs';
import {createReset,applyPendingReset} from '../lib/reset.mjs';
function setup(){const f=fixture();let now=1000,sent=[],restarts=0;const accounts={settings:()=>({smtp_configured:true}),queue:(...args)=>sent.push(args)},reset=createReset(f.db,{dataDir:f.dataDir,accounts,checkPassword:async p=>p==='correct-password',clock:()=>now,onReset:()=>restarts++});return {...f,reset,sent,accounts,code:()=>sent.at(-1)[2].match(/Kod resetu: (\d+)/)[1],restarts:()=>restarts,advance:n=>now+=n};}
test('factory reset requires admin, current password, email code and explicit phrase; single-use and restart',async()=>{const f=setup();try{
 await assert.rejects(f.reset.begin({...f.admin,id:999},{password:'correct-password'}),e=>e.status===403);
 await assert.rejects(f.reset.begin(f.admin,{password:'wrong'}),e=>e.status===403);assert.equal(f.sent.length,0);
 await f.reset.begin(f.admin,{password:'correct-password'});assert.equal(f.sent[0][0],f.admin.email);assert.equal(existsSync(join(f.dataDir,'reset-pending.json')),false);
 await assert.rejects(f.reset.confirm(f.admin,{code:f.code(),password:'correct-password',confirmation:'wrong'}));assert.equal(f.restarts(),0);
 await f.reset.confirm(f.admin,{code:f.code(),password:'correct-password',confirmation:'USUŃ WSZYSTKO'});assert.equal(f.restarts(),1);assert.equal(f.reset.pending(),true);
 await assert.rejects(f.reset.confirm(f.admin,{code:f.code(),password:'correct-password',confirmation:'USUŃ WSZYSTKO'}));
 writeFileSync(join(f.dataDir,'desk.sqlite'),'old database');mkdirSync(join(f.dataDir,'uploads'));writeFileSync(join(f.dataDir,'uploads','old'),'old');
 assert.equal(applyPendingReset(f.dataDir),true);assert.equal(existsSync(join(f.dataDir,'desk.sqlite')),false);assert.equal(existsSync(join(f.dataDir,'uploads')),false);assert.equal(existsSync(join(f.dataDir,'reset-pending.json')),false);assert.equal(applyPendingReset(f.dataDir),true);
 }finally{f.close();}});
test('factory reset rejects stale identity, expired and exhausted challenges and missing SMTP',async()=>{const f=setup();try{
 f.accounts.settings=()=>({smtp_configured:false});await assert.rejects(f.reset.begin(f.admin,{password:'correct-password'}));f.accounts.settings=()=>({smtp_configured:true});
 await f.reset.begin(f.admin,{password:'correct-password'});f.advance(600001);await assert.rejects(f.reset.confirm(f.admin,{code:f.code(),password:'correct-password',confirmation:'USUŃ WSZYSTKO'}));
 await f.reset.begin(f.admin,{password:'correct-password'});for(let i=0;i<5;i++)await assert.rejects(f.reset.confirm(f.admin,{code:'bad',password:'correct-password',confirmation:'USUŃ WSZYSTKO'}));await assert.rejects(f.reset.confirm(f.admin,{code:f.code(),password:'correct-password',confirmation:'USUŃ WSZYSTKO'}));
 await f.reset.begin(f.admin,{password:'correct-password'});f.db.prepare('UPDATE users SET version=version+1 WHERE id=?').run(f.admin.id);await assert.rejects(f.reset.confirm(f.admin,{code:f.code(),password:'correct-password',confirmation:'USUŃ WSZYSTKO'}));assert.equal(f.restarts(),0);assert.equal(existsSync(join(f.dataDir,'reset-pending.json')),false);
 }finally{f.close();}});
