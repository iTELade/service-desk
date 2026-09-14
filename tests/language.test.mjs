import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {createAccounts} from '../lib/accounts.mjs';

function setup(){
  const f=fixture();
  const accounts=createAccounts(f.db,{origin:'https://desk.example.test',encodePassword:async value=>'hash:'+value,dataDir:f.dataDir,env:{}});
  return {...f,accounts,close(){accounts.stop();f.close();}};
}

test('system language defaults to English and is exposed publicly',()=>{
  const f=setup();
  try{
    assert.equal(f.accounts.settings().language,'en');
    assert.equal(f.accounts.publicConfig().language,'en');
  }finally{f.close();}
});

test('administrator setting persists one language for the whole system',()=>{
  const f=setup();
  try{
    const current=f.accounts.settings();
    const saved=f.accounts.save({
      version:current.version,
      brand_name:current.brand_name,
      company_name:current.company_name||current.brand_name,
      registration_mode:current.registration_mode,
      allowed_domains:current.allowed_domains,
      language:'pl'
    });
    assert.equal(saved.language,'pl');
    assert.equal(f.accounts.publicConfig().language,'pl');
    const again=f.accounts.settings();
    assert.equal(again.language,'pl');
    assert.throws(()=>f.accounts.save({
      version:again.version,
      brand_name:again.brand_name,
      company_name:again.company_name||again.brand_name,
      registration_mode:again.registration_mode,
      allowed_domains:again.allowed_domains,
      language:'de'
    }),/język systemu/);
  }finally{f.close();}
});
