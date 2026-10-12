(()=>{
'use strict';
const VERSION='2.1.1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=v=>window.DeskLocale?.t?.(v)||v;
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const route=()=>location.hash.split('?')[0]||'#/';
const query=()=>new URLSearchParams(location.hash.split('?')[1]||'');
const routeName=value=>{
  if(value.startsWith('#/ticket/'))return 'ticket';
  if(value.startsWith('#/project/')&&value.includes('/settings'))return 'project-settings';
  if(value.startsWith('#/project/'))return 'project-settings';
  if(value.startsWith('#/portal'))return 'portal';
  return value.startsWith('#/')?(value.slice(2).split('/')[0]||'home'):'home';
};
const labels={queue:'Kolejki',board:'Tablica',projects:'Projekty',users:'Użytkownicy',settings:'Administracja',ticket:'Zgłoszenie',portal:'Portal klienta',reports:'Radar i raporty',cases:'Incydenty i zmiany',case:'Sprawa operacyjna',services:'Usługi',service:'Usługa',calendar:'Kalendarz zmian',workflow:'Projektant obiegu',replies:'Gotowe odpowiedzi',assist:'Podpowiedzi i usprawnienia'};
function currentProject(){
  const r=route();
  const m=r.match(/^#\/(?:project|workflow|replies|assist)\/(\d+)/);
  const id=m?.[1]||$('#main')?.dataset.workspaceProject||query().get('project')||$('select[data-workspace-project]')?.value||'';
  if(!id)return null;
  const select=$('select[data-workspace-project]');
  const option=select?[...select.options].find(o=>String(o.value)===String(id)):null;
  const breadcrumb=$('#main .breadcrumb');
  const key=$('#main')?.dataset.workspaceProjectKey||breadcrumb?.querySelector('span:last-child')?.textContent?.trim()||'';
  return {id:String(id),name:option?.textContent?.trim()||$('h1')?.textContent?.replace(/^Tablica\s*·\s*/,'').trim()||'Project',key};
}
function navGroup(link){const href=link.getAttribute('href')||'';if(/queue|board/.test(href))return 'Praca';if(/projects|assets|knowledge|reports/.test(href))return 'Zarządzanie usługami';if(/users|organizations/.test(href))return 'Osoby';if(/settings|admin/.test(href))return 'Administracja';return 'Więcej';}
function normalizeNotices(){
  const host=$('#notices');if(!host)return;
  const seen=new Set();
  for(const item of $$('.notice',host)){
    const text=item.textContent.trim();
    if(document.querySelector('.auth-layout')&&/^Sesja wygasła\.?$/i.test(text)){item.remove();continue;}
    if(seen.has(text)){item.remove();continue;}seen.add(text);
  }
  while(host.children.length>4)host.firstElementChild?.remove();
}
function cleanupQueueTools(){
  const boxes=$$('[data-r112-queue-tools]');
  boxes.slice(1).forEach(x=>x.remove());
  const box=boxes[0];if(!box)return;
  box.classList.add('sd201-queue-tools');
  if(!$('.sd201-layout-details',box)){
    const columns=$('.r112-columns',box),toggles=$('.r112-column-toggles',box);
    if(columns||toggles){const details=document.createElement('details');details.className='sd201-layout-details';details.innerHTML='<summary>'+esc(tr('Kolumny i układ'))+'</summary><div class="sd201-layout-body"></div>';const body=$('.sd201-layout-body',details);if(columns)body.append(columns);if(toggles)body.append(toggles);box.append(details);}
  }
}
function projectAccent(id){let n=0;for(const c of String(id))n=(n*31+c.charCodeAt(0))%360;return n;}
function decorateNavigation(){
  const nav=$('.workspace .sidebar nav');if(!nav)return;
  nav.classList.add('sd20-nav');
  const project=currentProject();
  const signature=JSON.stringify([project?.id,[...nav.querySelectorAll(':scope > a:not([data-sd201-project-settings])')].map(a=>a.textContent),window.DeskLocale?.locale]);
  if(nav.dataset.signature===signature)return;nav.dataset.signature=signature;
  for(const old of $$('.sd20-nav-group',nav))old.remove();
  for(const link of $$(':scope > a',nav)){
    const href=link.getAttribute('href')||'';
    link.classList.add('sd20-nav-link');if(!link.hasAttribute('aria-label'))link.setAttribute('aria-label',link.textContent.trim());
    if(project){
      if(/^#\/queue/.test(href)||/\/#\/queue/.test(href))link.setAttribute('href',`#/queue?project=${project.id}`);
      if(/^#\/board/.test(href)||/\/#\/board/.test(href))link.setAttribute('href',`#/board?project=${project.id}`);
    }
  }
  const seen=new Set();
  for(const link of $$(':scope > a',nav)){
    const group=navGroup(link);if(!seen.has(group)){const title=document.createElement('div');title.className='sd20-nav-group';title.textContent=tr(group);nav.insertBefore(title,link);seen.add(group);}
  }
  const oldSettings=$('[data-sd201-project-settings]',nav);if(oldSettings)oldSettings.remove();
  if(project&&($('.workspace')?.dataset.role==='admin'||JSON.parse($('.workspace')?.dataset.managedProjects||'[]').includes(project.id))){
    const link=document.createElement('a');link.href=`#/project/${project.id}`;link.dataset.sd201ProjectSettings='1';link.className='sd20-nav-link';link.innerHTML='<span class="sd201-dot" aria-hidden="true"></span><span>Ustawienia projektu</span>';nav.append(link);
  }
}
function projectContext(workspace){
  const project=currentProject(),sidebar=$('.sidebar',workspace),topbar=$('.topbar',workspace);
  const existing=$('[data-sd201-project-context]',sidebar||document);
  if(!project){existing?.remove();document.body.classList.remove('sd201-project-mode');document.body.style.removeProperty('--sd201-project-hue');return;}
  document.body.classList.add('sd201-project-mode');document.body.style.setProperty('--sd201-project-hue',String(projectAccent(project.id)));
  let card=existing;if(!card&&sidebar){card=document.createElement('section');card.dataset.sd201ProjectContext='1';card.className='sd201-project-context';const nav=$('nav',sidebar);sidebar.insertBefore(card,nav);}
  if(card&&card.dataset.context!==JSON.stringify(project)){card.dataset.context=JSON.stringify(project);card.innerHTML=`<span class="sd201-project-avatar">${esc((project.key||project.name.slice(0,2)).slice(0,3))}</span><span><small>${esc(tr('Projekt'))}</small><strong>${esc(project.name)}</strong></span><a href="#/projects" title="Zmień projekt" aria-label="Zmień projekt">↔</a>`;}
  const context=$('.sd20-context',topbar||document);if(context&&context.dataset.context!==JSON.stringify(project)){context.dataset.context=JSON.stringify(project);context.innerHTML=`<span>${project.key?esc(tr('Projekt')+' '+project.key):esc(tr('Obszar projektu'))}</span><strong>${esc(project.name)}</strong>`;}
}
function decorateShell(){
  const workspace=$('.workspace');if(!workspace)return;
  workspace.classList.add('sd20-shell');workspace.dataset.productVersion=VERSION;
  const sidebar=$('.sidebar',workspace);if(sidebar)sidebar.classList.add('sd20-sidebar');

  const content=$('.workspace-content',workspace);if(content)content.classList.add('sd20-workspace');
  const topbar=$('.topbar',workspace);if(topbar){topbar.classList.add('sd20-topbar');if(!$('.sd20-context',topbar)){const context=document.createElement('div');context.className='sd20-context';const name=routeName(route());context.innerHTML='<span>Service Desk</span><strong>'+esc(tr(labels[name]||name||'Obszar pracy'))+'</strong>';topbar.prepend(context);}const picker=$('.workspace-picker',topbar);picker?.classList.add('sd201-project-picker');}
  projectContext(workspace);decorateNavigation();
}
function wrapBoardFilters(main){
  const filters=$('.filters',main);if(!filters||filters.closest('.sd201-board-filter-details'))return;
  const details=document.createElement('details');details.className='sd201-board-filter-details';details.innerHTML='<summary>'+esc(tr('Filtry'))+'</summary>';filters.before(details);details.append(filters);
}
function decorateProjects(main){
  main.classList.add('sd201-projects');const panel=$('.panel',main);panel?.classList.add('sd201-project-directory');
  for(const row of $$('tbody tr',main)){
    const primary=$('td:first-child a',row);if(primary)primary.classList.add('sd201-project-link');
  }
}
function decorateMain(){
  const main=$('#main');if(!main)return;
  const name=routeName(route());
  main.className=[...main.classList].filter(x=>!x.startsWith('sd20-')&&!x.startsWith('sd201-route-')).join(' ');
  main.classList.add('sd20-main','sd20-'+name,'sd201-route-'+name);
  const heading=$('.page-heading',main);if(heading)heading.classList.add('sd20-page-heading');
  $$('.panel,.detail-panel',main).forEach(el=>el.classList.add('sd20-surface'));
  $$('table',main).forEach(el=>el.classList.add('sd20-table'));
  $$('.pill',main).forEach(el=>el.classList.add('sd20-status'));
  if(name==='queue'){
    main.classList.add('sd20-queue-workspace');$('.metrics',main)?.classList.add('sd20-metrics');$('.filters',main)?.classList.add('sd20-filters');$('.table-scroll',main)?.classList.add('sd20-queue-table');$('.tabs[aria-label="Kolejki"]',main)?.classList.add('sd201-queue-tabs');cleanupQueueTools();
  }
  if(name==='board'){main.classList.add('sd201-board');$('.custom-kanban',main)?.classList.add('sd201-kanban');wrapBoardFilters(main);}
  if(name==='users'){main.classList.add('sd201-users');$('.table-scroll',main)?.classList.add('sd201-users-table');}
  if(name==='ticket'){main.classList.add('sd20-ticket-workspace');$('.ticket-layout',main)?.classList.add('sd20-ticket-layout');$('.ticket-sidebar',main)?.classList.add('sd20-inspector');$('.conversation',main)?.classList.add('sd20-activity');}
  if(name==='settings')decorateSettings(main);
  if(name==='projects')decorateProjects(main);
  if(name==='project-settings')main.classList.add('sd20-project-settings','sd201-project-settings');
  if(name==='portal')main.classList.add('sd20-customer-portal');
}
function decorateSettings(main){
  const center=$('.settings-center',main);if(!center)return;
  center.classList.add('sd20-settings-center','sd201-settings-center');
  const nav=$('.settings-nav',center);if(nav){nav.classList.add('sd20-settings-nav');if(!$('.sd20-settings-search',nav)){const wrap=document.createElement('label');wrap.className='sd20-settings-search';wrap.innerHTML='<span>Szukaj ustawień</span><input type="search" placeholder="Szukaj ustawień…" autocomplete="off">';nav.prepend(wrap);const input=$('input',wrap);input.addEventListener('input',()=>{const needle=input.value.trim().toLowerCase();$$('.settings-nav-link,[data-settings-section]',nav).forEach(el=>el.hidden=Boolean(needle)&&!el.textContent.toLowerCase().includes(needle));});}}
  const content=$('.settings-content',center);if(content){content.classList.add('sd20-settings-content','sd201-settings-content');$$(':scope > section,:scope > .panel',content).forEach(el=>el.classList.add('sd201-settings-card'));}
  $('.version-chip',main)?.classList.add('sd20-version-chip');
}
function decorateActivity(){
  const tabs=$('[data-ticket-tabs]');if(!tabs||tabs.dataset.ready)return;tabs.dataset.ready='1';
  const buttons=$$('[role="tab"]',tabs),panel=$('[data-ticket-activity]'),history=$('[data-ticket-history]'),files=$('[data-ticket-files]');
  function choose(button){const value=button.dataset.activityTab;for(const b of buttons){b.setAttribute('aria-selected',String(b===button));b.tabIndex=b===button?0:-1;}if(panel){panel.hidden=['history','files'].includes(value);panel.setAttribute('aria-labelledby',button.id);$$('.comment',panel).forEach(c=>c.hidden=value==='notes'?!c.classList.contains('internal'):c.classList.contains('internal'));}if(history)history.hidden=value!=='history';if(files)files.hidden=value!=='files';}
  for(const button of buttons)button.addEventListener('click',()=>choose(button));
  tabs.addEventListener('keydown',event=>{const current=buttons.indexOf(document.activeElement);let next;if(event.key==='ArrowRight')next=(current+1)%buttons.length;else if(event.key==='ArrowLeft')next=(current+buttons.length-1)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();buttons[next].focus();choose(buttons[next]);});
  document.addEventListener('desk:activity-refresh',()=>{if(tabs.isConnected)choose(buttons.find(b=>b.getAttribute('aria-selected')==='true')||buttons[0]);});
  choose(buttons[0]);
}
function decoratePeople(){
  const table=$('.sd201-users table');if(!table||$('[data-people-filter]'))return;
  const label=document.createElement('label');label.className='people-filter';label.innerHTML='<span>Szukaj użytkownika</span><input type="search" data-people-filter placeholder="Imię, login lub e-mail"><small role="status" data-people-count></small>';table.closest('.table-scroll').before(label);
  const rows=$$('tbody tr',table),input=$('input',label),count=$('small',label);function filter(){const q=input.value.toLowerCase().trim();let visible=0;rows.forEach(r=>{r.hidden=!r.textContent.toLowerCase().includes(q);if(!r.hidden)visible++;});count.textContent=visible+' / '+rows.length;}input.addEventListener('input',filter);filter();
}
function decorateAccessibility(){
  const workspace=$('.workspace');if(!workspace)return;
  const main=$('#main');if(main){main.tabIndex=-1;}
  const inspector=$('[data-ticket-inspector]');if(inspector&&!inspector.dataset.ready){inspector.dataset.ready='1';if(window.matchMedia?.('(max-width:820px)').matches)inspector.open=false;}
  if(!$('.sd202-skip',workspace)){const skip=document.createElement('a');skip.className='sd202-skip';skip.href='#main';skip.textContent=tr('Przejdź do treści');skip.addEventListener('click',e=>{e.preventDefault();$('#main')?.focus();});workspace.prepend(skip);}
  const sidebar=$('.sidebar');if(sidebar&&!sidebar.id)sidebar.id='workspace-navigation';
  const top=$('.topbar');if(top&&!$('[data-navigation-toggle]',top)){const b=document.createElement('button');b.type='button';b.dataset.navigationToggle='1';b.className='sd202-menu';b.textContent=tr('Menu');b.setAttribute('aria-controls','workspace-navigation');b.setAttribute('aria-expanded',String(!window.matchMedia?.('(max-width:820px)').matches&&!document.body.classList.contains('sd202-sidebar-collapsed')));b.addEventListener('click',()=>{if(window.matchMedia?.('(max-width:820px)').matches){const open=document.body.classList.toggle('sd202-navigation-open');b.setAttribute('aria-expanded',String(open));}else{const collapsed=document.body.classList.toggle('sd202-sidebar-collapsed');b.setAttribute('aria-expanded',String(!collapsed));document.dispatchEvent(new CustomEvent('desk:sidebar-change',{detail:{collapsed}}));}});top.prepend(b);}
}
function decorateForms(){
  for(const form of $$('form[data-settings-center-form],form[data-form="project"],form[data-form="project-settings"],form[data-form="ldap"]')){
    if(form.dataset.uiReady)return;form.dataset.uiReady='1';
    const actions=$('.form-actions',form);if(!actions)continue;
    const status=document.createElement('span');status.dataset.unsaved='1';status.hidden=true;status.setAttribute('role','status');status.textContent=tr('Niezapisane zmiany');actions.append(status);
    const cancel=document.createElement('button');cancel.type='reset';cancel.textContent=tr('Anuluj');actions.append(cancel);
    form.addEventListener('input',()=>{form.dataset.dirty='1';status.hidden=false;});form.addEventListener('change',()=>{form.dataset.dirty='1';status.hidden=false;});form.addEventListener('reset',()=>{delete form.dataset.dirty;status.hidden=true;});
  }
}
document.addEventListener('click',event=>{const target=event.target.closest('a[href],[data-settings-section],[data-settings-open]');if(!target||!$('form[data-dirty="1"]'))return;if(target.tagName==='A'&&target.getAttribute('href')?.startsWith('#main'))return;if(!confirm(tr('Opuścić widok i odrzucić niezapisane zmiany?'))){event.preventDefault();event.stopImmediatePropagation();}},true);
addEventListener('beforeunload',event=>{if($('form[data-dirty="1"]')){event.preventDefault();event.returnValue='';}});
let scheduled=false;
window.DeskProductMount={shell(){decorateShell();decorateAccessibility();}};
function apply(){scheduled=false;if(document.querySelector("[data-native21]"))return;observer.disconnect();try{normalizeNotices();decorateShell();decorateMain();cleanupQueueTools();decorateActivity();decoratePeople();decorateAccessibility();decorateForms();}finally{observer.observe(document.documentElement,{subtree:true,childList:true});}}
function schedule(){if(document.querySelector("[data-native21]"))return;if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}
addEventListener('hashchange',schedule);const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{subtree:true,childList:true});schedule();
})();
