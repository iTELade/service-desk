import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const css=readFileSync(new URL('../public/agent-experience-1.6.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/agent-experience-1.6.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');

const settle=()=>new Promise(resolve=>setTimeout(resolve,35));

function ticketDom(){
  return new JSDOM(`<!doctype html><body class="jsm-route-ticket"><main id="main">
    <section class="jsm-ticket-header">
      <div class="breadcrumb"><a>Zgłoszenia</a><span>/</span><span>IT Support</span></div>
      <div class="sd14-ticket-title-row"><div class="page-heading"><div><div class="eyebrow">IT-17</div><h1>Brak dostępu do VPN</h1></div><button>Edytuj opis</button></div></div>
      <div class="ticket-current-status"><span>Bieżący status</span><span class="pill in_progress">W toku</span></div>
      <div class="transition-bar"><button class="primary">Rozwiąż</button><button>Oczekiwanie</button></div>
      <div class="ticket-tools"><button>Klonuj zgłoszenie</button><button>Powiąż zgłoszenie</button></div>
    </section>
    <div class="ticket-layout"><div class="sd14-ticket-main">
      <section class="detail-panel"><h2>Opis</h2><div class="prose">Opis zgłoszenia</div></section>
      <section class="detail-panel"><div class="section-heading"><h2>Rozmowa</h2></div><div class="conversation"><article class="comment"><div class="comment-heading"><img class="comment-avatar"><strong>Agent</strong><time>teraz</time></div><div class="prose">Odpowiedź</div></article></div><form data-form="comment"><textarea></textarea></form></section>
      <section data-r112-attachments><h2>Załączniki</h2></section>
      <section class="detail-panel"><h2>Powiązania i urządzenia</h2><p>Brak</p></section>
      <details class="sd14-history"><summary>Historia zmian</summary><ol class="activity"><li>Utworzono</li></ol></details>
    </div><aside class="ticket-sidebar"><section class="panel detail-panel"><h2>Szczegóły</h2><dl><dt>Zgłaszający</dt><dd>Adam</dd></dl></section><section class="panel detail-panel"><h2>SLA</h2><div class="sla-block"><span>First response</span><strong class="sla-ok">W toku</strong></div></section></aside></div>
  </main></body>`,{url:'http://localhost/#/ticket/IT-17',runScripts:'dangerously',pretendToBeVisual:true});
}

function settingsDom(){
  return new JSDOM(`<!doctype html><body class="jsm-route-settings"><main id="main">
    <div class="settings-section-head"><div><div class="eyebrow">ADMINISTRACJA</div><h2>Ustawienia systemu</h2><p>Wszystkie ustawienia w jednym miejscu.</p></div><span class="version-chip">Wersja 1.2.1</span></div>
    <div class="settings-center"><aside class="settings-nav">
      <div class="settings-nav-group"><h3>Start</h3><button class="active">Przegląd</button></div>
      <div class="settings-nav-group"><h3>Integracje</h3><button>Integracje</button><a class="settings-nav-link">GitHub Issues</a></div>
      <div class="settings-nav-group"><h3>System</h3><button>Diagnostyka i utrzymanie</button></div>
    </aside><section class="settings-content"><div class="settings-section-head"><div><div class="eyebrow">ADMINISTRACJA</div><h2>Przegląd administracji</h2><p>Stan systemu</p></div></div><div class="settings-metrics"><div><span>Wersja</span><strong>1.6.0</strong></div></div><section class="panel settings-block"><h3>Stan konfiguracji</h3><article class="settings-row"><div class="settings-row-main"><h3>GitHub</h3><p>Integracja</p></div><div class="settings-row-side"><span class="settings-status ok">Aktywne</span></div></article></section></section></div>
  </main></body>`,{url:'http://localhost/#/settings?section=overview',runScripts:'dangerously',pretendToBeVisual:true});
}

test('1.6 release metadata and assets are wired into the application',()=>{
  assert.equal(pkg.version,'1.6.0');
  assert.match(version,/VERSION='1\.6\.0'/);
  assert.match(index,/agent-experience-1\.6\.css\?v=1\.6\.0/);
  assert.match(index,/agent-experience-1\.6\.js\?v=1\.6\.0/);
  assert.match(index,/app\.css\?v=1\.6\.0/);
  assert.match(index,/app\.js\?v=1\.6\.0/);
});

test('1.6 ticket design defines a full work item shell, activity and inspector',()=>{
  for(const token of ['jira16-ticket','jira16-ticket-context','jira16-activity-tabs','jira16-conversation-panel','jira16-inspector'])assert.match(ui,new RegExp(token));
  for(const token of ['.jira16-ticket .ticket-layout','.jira16-activity-tabs','.jira16-conversation-panel','.jira16-ticket .ticket-sidebar','.jira16-ticket .sla-block'])assert.ok(css.includes(token),`missing ticket style ${token}`);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) 360px/);
});

test('1.6 ticket controller turns the legacy ticket DOM into an activity workspace',async()=>{
  const dom=ticketDom();dom.window.eval(ui);await settle();
  const doc=dom.window.document,main=doc.querySelector('#main');
  assert.ok(main.classList.contains('jira16-ticket'));
  assert.ok(doc.querySelector('.jira16-ticket-context'));
  assert.ok(doc.querySelector('.jira16-description-panel'));
  assert.ok(doc.querySelector('.jira16-conversation-panel'));
  assert.ok(doc.querySelector('.jira16-inspector'));
  const tabs=[...doc.querySelectorAll('.jira16-activity-tabs button')];
  assert.deepEqual(tabs.map(x=>x.textContent),['Komentarze','Załączniki','Powiązania','Historia']);
  assert.equal(doc.querySelector('[data-r112-attachments]').hidden,true);
  tabs[1].click();await settle();
  assert.equal(doc.querySelector('[data-r112-attachments]').hidden,false);
  assert.equal(doc.querySelector('.jira16-conversation-panel').hidden,true);
  dom.window.close();
});

test('1.6 settings controller builds a searchable administration sidebar and cards',async()=>{
  const dom=settingsDom();dom.window.eval(ui);await settle();
  const doc=dom.window.document,main=doc.querySelector('#main');
  assert.ok(main.classList.contains('jira16-settings'));
  assert.ok(doc.querySelector('.jira16-settings-nav-head'));
  assert.equal(doc.querySelector('.version-chip').textContent,'Wersja 1.6.0');
  assert.ok(doc.querySelector('.settings-row').classList.contains('jira16-settings-row'));
  const input=doc.querySelector('.jira16-settings-filter input');
  input.value='GitHub';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await settle();
  const groups=[...doc.querySelectorAll('.settings-nav-group')];
  assert.equal(groups.find(g=>g.querySelector('h3').textContent==='Integracje').hidden,false);
  assert.equal(groups.find(g=>g.querySelector('h3').textContent==='System').hidden,true);
  dom.window.close();
});

test('1.6 settings CSS fully styles generated settings-center primitives',()=>{
  for(const token of ['.settings-row{','.settings-status{','.settings-metrics{','.settings-block,','.settings-form{','.settings-shortcuts{','.settings-kv{','.settings-brand-preview{'])assert.ok(css.includes(token),`missing settings style ${token}`);
  assert.match(css,/grid-template-columns:292px minmax\(0,1fr\)/);
});
