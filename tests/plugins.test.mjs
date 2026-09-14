import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPlugins} from '../lib/plugins.mjs';

const admin={id:1,role:'admin'};
const agent={id:2,role:'agent'};

function setup(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');return {db,plugins:createPlugins(db)};}

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
