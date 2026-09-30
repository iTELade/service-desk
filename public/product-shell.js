(()=>{
'use strict';
const VERSION='2.0.1';
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
const labels={queue:'Queues',board:'Board',projects:'Projects',users:'Customers & people',settings:'Administration',ticket:'Request',portal:'Help center',reports:'Reports'};
function currentProject(){
  const r=route();
  const m=r.match(/^#\/project\/(\d+)/);
  const id=m?.[1]||query().get('project')||$('select[data-workspace-project]')?.value||'';
  if(!id)return null;
  const select=$('select[data-workspace-project]');
  const option=select?[...select.options].find(o=>String(o.value)===String(id)):null;
  const breadcrumb=$('#main .breadcrumb');
  const key=breadcrumb?.querySelector('span:last-child')?.textContent?.trim()||'';
  return {id:String(id),name:option?.textContent?.trim()||$('h1')?.textContent?.replace(/^Tablica\s*·\s*/,'').trim()||'Project',key};
}
function navGroup(link){const href=link.getAttribute('href')||'';if(/queue|board/.test(href))return 'Work';if(/projects|assets|knowledge|reports/.test(href))return 'Service management';if(/users|organizations/.test(href))return 'People';if(/settings|admin/.test(href))return 'Administration';return 'More';}
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
    if(columns||toggles){const details=document.createElement('details');details.className='sd201-layout-details';details.innerHTML='<summary>Columns and layout</summary><div class="sd201-layout-body"></div>';const body=$('.sd201-layout-body',details);if(columns)body.append(columns);if(toggles)body.append(toggles);box.append(details);}
  }
}
function projectAccent(id){let n=0;for(const c of String(id))n=(n*31+c.charCodeAt(0))%360;return n;}
function decorateNavigation(){
  const nav=$('.workspace .sidebar nav');if(!nav)return;
  nav.classList.add('sd20-nav');
  const project=currentProject();
  for(const old of $$('.sd20-nav-group',nav))old.remove();
  for(const link of $$(':scope > a',nav)){
    const href=link.getAttribute('href')||'';
    link.classList.add('sd20-nav-link');
    if(project){
      if(/^#\/queue/.test(href)||/\/#\/queue/.test(href))link.setAttribute('href',`#/queue?project=${project.id}`);
      if(/^#\/board/.test(href)||/\/#\/board/.test(href))link.setAttribute('href',`#/board?project=${project.id}`);
    }
  }
  const seen=new Set();
  for(const link of $$(':scope > a',nav)){
    const group=navGroup(link);if(!seen.has(group)){const title=document.createElement('div');title.className='sd20-nav-group';title.textContent=group;nav.insertBefore(title,link);seen.add(group);}
  }
  const oldSettings=$('[data-sd201-project-settings]',nav);if(oldSettings)oldSettings.remove();
  if(project&&/Administrator/i.test($('.sidebar-bottom .profile small')?.textContent||'')){
    const link=document.createElement('a');link.href=`#/project/${project.id}`;link.dataset.sd201ProjectSettings='1';link.className='sd20-nav-link';link.innerHTML='<span class="sd201-dot" aria-hidden="true"></span><span>Project settings</span>';nav.append(link);
  }
}
function projectContext(workspace){
  const project=currentProject(),sidebar=$('.sidebar',workspace),topbar=$('.topbar',workspace);
  const existing=$('[data-sd201-project-context]',sidebar||document);
  if(!project){existing?.remove();document.body.classList.remove('sd201-project-mode');document.body.style.removeProperty('--sd201-project-hue');return;}
  document.body.classList.add('sd201-project-mode');document.body.style.setProperty('--sd201-project-hue',String(projectAccent(project.id)));
  let card=existing;if(!card&&sidebar){card=document.createElement('section');card.dataset.sd201ProjectContext='1';card.className='sd201-project-context';const nav=$('nav',sidebar);sidebar.insertBefore(card,nav);}
  if(card)card.innerHTML=`<span class="sd201-project-avatar">${(project.key||project.name.slice(0,2)).slice(0,3)}</span><span><small>PROJECT</small><strong>${project.name}</strong></span><a href="#/projects" title="Change project" aria-label="Change project">↔</a>`;
  const context=$('.sd20-context',topbar||document);if(context){context.innerHTML=`<span>${project.key?`Project ${project.key}`:'Project workspace'}</span><strong>${project.name}</strong>`;}
}
function decorateShell(){
  const workspace=$('.workspace');if(!workspace)return;
  workspace.classList.add('sd20-shell');workspace.dataset.productVersion=VERSION;
  const sidebar=$('.sidebar',workspace);if(sidebar)sidebar.classList.add('sd20-sidebar');
  const brand=$('.brand span',workspace);if(brand)brand.textContent='iTELade Service Management';
  const content=$('.workspace-content',workspace);if(content)content.classList.add('sd20-workspace');
  const topbar=$('.topbar',workspace);if(topbar){topbar.classList.add('sd20-topbar');if(!$('.sd20-context',topbar)){const context=document.createElement('div');context.className='sd20-context';const name=routeName(route());context.innerHTML='<span>Service Management</span><strong>'+String(labels[name]||name||'Workspace')+'</strong>';topbar.prepend(context);}const picker=$('.workspace-picker',topbar);picker?.classList.add('sd201-project-picker');}
  projectContext(workspace);decorateNavigation();
}
function wrapBoardFilters(main){
  const filters=$('.filters',main);if(!filters||filters.closest('.sd201-board-filter-details'))return;
  const details=document.createElement('details');details.className='sd201-board-filter-details';details.innerHTML='<summary>Filters</summary>';filters.before(details);details.append(filters);
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
  const nav=$('.settings-nav',center);if(nav){nav.classList.add('sd20-settings-nav');if(!$('.sd20-settings-search',nav)){const wrap=document.createElement('label');wrap.className='sd20-settings-search';wrap.innerHTML='<span>Search settings</span><input type="search" placeholder="Search settings…" autocomplete="off">';nav.prepend(wrap);const input=$('input',wrap);input.addEventListener('input',()=>{const needle=input.value.trim().toLowerCase();$$('.settings-nav-link',nav).forEach(el=>el.hidden=Boolean(needle)&&!el.textContent.toLowerCase().includes(needle));});}}
  const content=$('.settings-content',center);if(content){content.classList.add('sd20-settings-content','sd201-settings-content');$$(':scope > section,:scope > .panel',content).forEach(el=>el.classList.add('sd201-settings-card'));}
  $('.version-chip',main)?.classList.add('sd20-version-chip');
}
let scheduled=false;
function apply(){scheduled=false;normalizeNotices();decorateShell();decorateMain();cleanupQueueTools();}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}
addEventListener('hashchange',schedule);new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});schedule();
})();
