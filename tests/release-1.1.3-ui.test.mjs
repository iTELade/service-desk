import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const i18n = read('public/i18n.js');
const ui = read('public/release-1.1.3.js');
const css = read('public/release-1.1.3.css');
const index = read('public/index.html');
const server = read('server.mjs');

function translateLikeRuntime(value, locale='pl') {
  const terms = [
    ['Sortowanie','Sort','Sortierung'],
    ['Normalny','Normal','Normal']
  ];
  const target={pl:0,en:1,de:2}[locale];
  const raw=String(value??'');
  const lead=raw.match(/^\s*/)?.[0]||'';
  const tail=raw.match(/\s*$/)?.[0]||'';
  const body=raw.slice(lead.length,raw.length-tail.length);
  for(const row of terms) if(row.includes(body)) return lead+row[target]+tail;
  return raw;
}

test('translations stay exact and idempotent after retiring the 1.1.3 visual runtime',()=>{
  assert.match(i18n,/if \(row\.includes\(body\)\) return lead \+ row\[target\] \+ tail;/);
  assert.doesNotMatch(i18n,/out=out\.replaceAll\(row\[source\],replacement\)/);
  assert.equal(translateLikeRuntime('Normalny'),'Normalny');
  assert.equal(translateLikeRuntime(translateLikeRuntime('Normalny')),'Normalny');
  assert.equal(translateLikeRuntime('Sortowanie'),'Sortowanie');
  assert.equal(translateLikeRuntime(translateLikeRuntime('Sortowanie')),'Sortowanie');
  assert.equal(translateLikeRuntime('Normal'),'Normalny');
});

test('1.1.3 assets remain available for rollback but are not loaded by 1.3.2',()=>{
  assert.doesNotMatch(index,/release-1\.1\.3\.css\?v=/);
  assert.doesNotMatch(index,/release-1\.1\.3\.js\?v=/);
  assert.match(server,/\/release-1\.1\.3\.css/);
  assert.match(server,/\/release-1\.1\.3\.js/);
  assert.match(css,/r113-filter-bar/);
});

test('retired 1.1.3 code documents the snapshot mechanism that caused the duplicate queue regression',()=>{
  assert.match(ui,/function suppressQueueFlicker\(\)/);
  assert.match(ui,/main\.innerHTML=queueSnapshot/);
});
