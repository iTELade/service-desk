import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPlugins} from '../lib/plugins.mjs';

const admin={id:1,role:'admin'};
const agent={id:2,role:'agent'};

function setup(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(id INTEGER PRIMARY KEY);');return {db,plugins:createPlugins(db)};}

test('plugin manifest validates compatibility and lifecycle',()=>{
  const {db,plugins}=setup();
  try{
    const installed=plugins.install({id:'sample.plugin',name:'Sample Plugin',version:'1.0.0',serviceDesk:'>=1.0.0',capabilities:['dashboard.widget','locale'],permissions:['tickets.read'],locales:['en','pl','de']},admin);
    assert.equal(installed.id,'sample.plugin');
    assert.equal(installed.enabled,false);
    assert.deepEqual(installed.manifest.locales,['en','pl','de']);
    const enabled=plugins.setEnabled('sample.plugin',true,admin);assert.equal(enabled.enabled,true);
    assert.throws(()=>plugins.remove('sample.plugin',admin),/Disable/);
    plugins.setEnabled('sample.plugin',false,admin);
    assert.deepEqual(plugins.remove('sample.plugin',admin),{ok:true});
    assert.equal(plugins.list(admin).length,0);
  }finally{db.close();}
});

test('plugin management requires global administrator and rejects unknown capabilities',()=>{
  const {db,plugins}=setup();
  try{
    assert.throws(()=>plugins.list(agent),e=>e.status===403);
    assert.throws(()=>plugins.install({id:'bad.plugin',name:'Bad Plugin',version:'1.0.0',serviceDesk:'>=1.0.0',capabilities:['root.shell']},admin),/Unknown plugin capability/);
    assert.throws(()=>plugins.install({id:'future.plugin',name:'Future Plugin',version:'1.0.0',serviceDesk:'>=9.0.0'},admin),/not compatible/);
  }finally{db.close();}
});

test('plugin API versions and dependency versions are checked before enabling',()=>{
 const {db,plugins}=setup();try{
  assert.throws(()=>plugins.install({id:'future.api',version:'1.0.0',apiVersion:2},admin),e=>e.status===409);
  plugins.install({id:'dependent.plugin',version:'1.0.0',dependencies:[{id:'base.plugin',minimum:'2.0.0'}]},admin);
  assert.throws(()=>plugins.setEnabled('dependent.plugin',true,admin),e=>e.status===409);
  plugins.install({id:'base.plugin',version:'1.0.0'},admin);plugins.setEnabled('base.plugin',true,admin);assert.throws(()=>plugins.setEnabled('dependent.plugin',true,admin),e=>e.status===409);
  plugins.install({id:'base.plugin',version:'2.0.0'},admin);assert.equal(plugins.list(admin).find(p=>p.id==='base.plugin').enabled,false);plugins.setEnabled('base.plugin',true,admin);assert.equal(plugins.setEnabled('dependent.plugin',true,admin).enabled,true);
 }finally{db.close();}
});

test('plugin dependency checks reject prerelease-as-stable and cyclic updates',()=>{
 const {db,plugins}=setup();try{
  const manifest=(id,version,dependencies=[])=>({id,name:id,version,dependencies});
  plugins.install(manifest('neutral.base','1.0.0-beta.2'),admin);plugins.setEnabled('neutral.base',true,admin);
  plugins.install(manifest('neutral.consumer','1.0.0',[{id:'neutral.base',minimum:'1.0.0'}]),admin);assert.throws(()=>plugins.setEnabled('neutral.consumer',true,admin),e=>e.status===409);
  plugins.install(manifest('neutral.base','1.0.0'),admin);plugins.setEnabled('neutral.base',true,admin);plugins.setEnabled('neutral.consumer',true,admin);
  plugins.install(manifest('neutral.base','1.1.0',[{id:'neutral.consumer',minimum:'1.0.0'}]),admin);assert.throws(()=>plugins.setEnabled('neutral.base',true,admin),/cycle/);
  assert.throws(()=>plugins.install(manifest('neutral.invalid','1.0.0-beta..2'),admin),e=>e.status===400);assert.throws(()=>plugins.install(manifest('neutral.invalid','1.0.0-01'),admin),e=>e.status===400);
 }finally{db.close();}
});
