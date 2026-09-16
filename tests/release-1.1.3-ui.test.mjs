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

test('1.1.3 translations are exact and idempotent for priority and sorting labels',()=>{
  assert.match(i18n,/if \(row\.includes\(body\)\) return lead \+ row\[target\] \+ tail;/);
  assert.doesNotMatch(i18n,/out=out\.replaceAll\(row\[source\],replacement\)/);
  assert.equal(translateLikeRuntime('Normalny'),'Normalny');
  assert.equal(translateLikeRuntime(translateLikeRuntime('Normalny')),'Normalny');
  assert.equal(translateLikeRuntime('Sortowanie'),'Sortowanie');
  assert.equal(translateLikeRuntime(translateLikeRuntime('Sortowanie')),'Sortowanie');
  assert.equal(translateLikeRuntime('Normal'),'Normalny');
});

test('1.1.3 Jira-inspired UI assets are loaded and served',()=>{
  assert.match(index,/release-1\.1\.3\.css\?v=1\.2\.2/);
  assert.match(index,/release-1\.1\.3\.js\?v=1\.2\.2/);
  assert.match(server,/\/release-1\.1\.3\.css/);
  assert.match(server,/\/release-1\.1\.3\.js/);
  assert.match(css,/r113-filter-bar/);
  assert.match(css,/r113-settings-search/);
  assert.match(css,/r113-portal-home/);
});

test('1.1.3 keeps queue content visible during same-route background refresh',()=>{
  assert.match(ui,/function suppressQueueFlicker\(\)/);
  assert.match(ui,/if\(isLoading&&queueSnapshot\)/);
  assert.match(ui,/main\.innerHTML=queueSnapshot/);
  assert.match(ui,/r113-background-refresh/);
});

test('1.1.3 settings and customer portal enhancements remain wired',()=>{
  assert.match(ui,/Znajdź ustawienie/);
  assert.match(ui,/Więcej filtrów/);
  assert.match(ui,/Wybierz usługę/);
  assert.match(ui,/Moje zgłoszenia/);
  assert.match(ui,/Normal\(\?:ny\)\+/);
});
