import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');

function boot(body,hash='#/queue'){
  const dom=new JSDOM(`<!doctype html><html><body>${body}</body></html>`,{url:`https://desk.example/${hash}`,runScripts:'outside-only'});
  const {window}=dom;
  window.requestAnimationFrame=callback=>window.setTimeout(callback,0);
  window.fetch=async()=>({ok:true,json:async()=>({})});
  window.eval(source);
  return dom;
}
async function settle(){for(let i=0;i<5;i++)await new Promise(resolve=>setTimeout(resolve,0));}

const staffShell=main=>`<div class="workspace">
  <aside class="sidebar"><a class="brand" href="#/queue"><img src="/favicon.svg"><span>iTELade Desk</span></a><nav>
    <a href="#/queue" class="selected"><span>Kolejki</span></a><a href="#/board"><span>Tablica</span></a><a href="#/projects"><span>Projekty</span></a><a href="#/users"><span>Użytkownicy</span></a><a href="#/settings"><span>Ustawienia</span></a>
  </nav><div class="sidebar-bottom"></div></aside>
  <div class="workspace-content"><header class="topbar"><label class="workspace-picker">Projekt<select><option>Wszystkie projekty</option></select></label><div class="r112-global-search"><input></div><div><button>Odśwież</button><button class="primary">Utwórz zgłoszenie</button></div></header><main id="main">${main}</main></div>
</div>`;

test('1.5 agent shell gains product context, management navigation and route breadcrumb without replacing the base shell',async()=>{
  const dom=boot(staffShell('<div class="page-heading"><div><div class="eyebrow">Kolejka</div><h1>Wszystkie zgłoszenia</h1></div></div>'));
  await settle();
  const doc=dom.window.document;
  assert.ok(doc.querySelector('.jsm-product-title'));
  assert.equal(doc.querySelectorAll('.jsm-management-nav').length,1);
  assert.ok(doc.querySelector('.jsm-management-nav a[href="#/admin/knowledge"]'));
  assert.ok(doc.querySelector('.jsm-management-nav a[href="#/admin/assets"]'));
  assert.ok(doc.querySelector('.jsm-management-nav a[href="#/admin/mail"]'));
  assert.ok(doc.querySelector('.jsm-route-breadcrumb'));
  assert.ok(doc.body.classList.contains('jsm-route-queue'));
  assert.ok(doc.querySelector('.workspace-content'));
});

test('1.5 queue restructuring preserves filters, ticket table and queue tools while grouping them into one work surface',async()=>{
  const main=`<div class="page-heading"><div><h1>Kolejki</h1></div></div>
    <section class="metrics"><div><span>Otwarte</span><strong>3</strong></div><div><span>W toku</span><strong>2</strong></div><div><span>SLA</span><strong>1</strong></div><div><span>Łącznie</span><strong>6</strong></div></section>
    <nav class="tabs"><a aria-current="page">Wszystkie</a></nav>
    <div data-r112-queue-tools><div class="r112-queue-tools">Narzędzia</div></div>
    <form class="filters"><label>Status<select><option>Wszystkie</option></select></label><button>Filtruj</button></form>
    <section class="panel"><div class="table-scroll"><table><thead><tr><th>Zgłoszenie</th></tr></thead><tbody><tr><td>IT-1</td></tr></tbody></table></div></section>`;
  const dom=boot(staffShell(main));await settle();const doc=dom.window.document,workspace=doc.querySelector('.jsm-queue-workspace');
  assert.ok(workspace,'queue workspace should be created');
  assert.ok(workspace.querySelector('.tabs'));
  assert.ok(workspace.querySelector('.sd14-view-settings [data-r112-queue-tools]'));
  assert.ok(workspace.querySelector('form.filters'));
  assert.ok(workspace.querySelector('table'));
  assert.equal(doc.querySelectorAll('form.filters').length,1);
  assert.equal(doc.querySelectorAll('table').length,1);
  assert.ok(doc.querySelector('.jsm-queue-summary .metrics'));
});

test('1.5 ticket restructuring keeps workflow actions, comments, attachments and context rail',async()=>{
  const main=`<div class="breadcrumb"><a href="#/queue">Kolejki</a><span>/</span><span>IT-1</span></div>
    <div class="page-heading"><div><h1>Brak dostępu do VPN</h1></div></div>
    <div class="ticket-current-status"><span class="pill">W toku</span></div>
    <div class="transition-bar"><button>Rozwiąż</button></div><div class="ticket-tools"><button>Połącz</button></div>
    <div class="ticket-layout"><div>
      <section class="detail-panel"><h2>Opis</h2><p>Opis zgłoszenia</p></section>
      <section class="detail-panel"><h2>Rozmowa</h2><div class="conversation"><article class="comment"><p>Test</p></article></div></section>
      <section data-r112-attachments>Załączniki</section>
      <section class="detail-panel"><h2>Historia zmian</h2><p>Utworzono</p></section>
    </div><aside class="ticket-sidebar"><section class="panel">Szczegóły</section></aside></div>`;
  const dom=boot(staffShell(main),'#/ticket/IT-1');await settle();const doc=dom.window.document;
  const header=doc.querySelector('.jsm-ticket-header');assert.ok(header);
  assert.ok(header.querySelector('.page-heading'));
  assert.ok(header.querySelector('.transition-bar'));
  assert.ok(header.querySelector('.ticket-tools'));
  assert.ok(doc.querySelector('.sd14-ticket-main [data-r112-attachments]'));
  assert.ok(doc.querySelector('.sd14-history'));
  assert.ok(doc.querySelector('.ticket-sidebar'));
  assert.equal(doc.querySelectorAll('.conversation').length,1);
});

test('1.5 Settings DOM keeps the native center and expands its navigation instead of replacing content',async()=>{
  const groups=['Ogólne','Tożsamość i dostęp','Zarządzanie usługami','Komunikacja','Integracje','Zasoby / CMDB','System'];
  const nav=groups.map(name=>`<div class="settings-nav-group"><h3>${name}</h3></div>`).join('');
  const main=`<span class="version-chip">Wersja 1.2.1</span><div class="settings-center"><aside class="settings-nav">${nav}</aside><section class="settings-content"><h1>Administracja</h1><div id="sentinel">Nie usuwaj mnie</div></section></div>`;
  const dom=boot(staffShell(main),'#/settings');await settle();const doc=dom.window.document;
  assert.ok(doc.querySelector('#sentinel'));
  assert.equal(doc.querySelector('.version-chip').textContent,'Wersja 1.5.0');
  assert.ok(doc.querySelector('.settings-nav-link[href="/#/admin/sso"]'));
  assert.ok(doc.querySelector('.settings-nav-link[href="/#/admin/updates"]'));
  assert.ok(doc.body.classList.contains('jsm-route-settings'));
});
