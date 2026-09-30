(()=>{
'use strict';
const VERSION='2.0.0';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const route=()=>location.hash.split('?')[0]||'#/';
const routeName=value=>{
  if(value.startsWith('#/ticket/'))return 'ticket';
  if(value.startsWith('#/project/')&&value.includes('/settings'))return 'project-settings';
  if(value.startsWith('#/portal'))return 'portal';
  return value.startsWith('#/')?(value.slice(2).split('/')[0]||'home'):'home';
};
const labels={queue:'Queues',board:'Board',projects:'Projects',users:'Customers & people',settings:'Administration',ticket:'Request',portal:'Help center',reports:'Reports'};
function navGroup(link){const href=link.getAttribute('href')||'';if(/queue|board/.test(href))return 'Work';if(/projects|assets|knowledge|reports/.test(href))return 'Service management';if(/users|organizations/.test(href))return 'People';if(/settings|admin/.test(href))return 'Administration';return 'More';}
function decorateNavigation(){
  const nav=$('.workspace .sidebar nav');if(!nav)return;
  nav.classList.add('sd20-nav');
  if(nav.dataset.sd20Decorated==='1')return;
  nav.dataset.sd20Decorated='1';
  const seen=new Set();
  for(const link of $$(':scope > a',nav)){
    const group=navGroup(link);link.dataset.sd20Group=group;link.classList.add('sd20-nav-link');
    if(!seen.has(group)){
      const title=document.createElement('div');title.className='sd20-nav-group';title.textContent=group;nav.insertBefore(title,link);seen.add(group);
    }
  }
}
function decorateShell(){
  const workspace=$('.workspace');if(!workspace)return;
  workspace.classList.add('sd20-shell');workspace.dataset.productVersion=VERSION;
  const sidebar=$('.sidebar',workspace);if(sidebar)sidebar.classList.add('sd20-sidebar');
  const brand=$('.brand span',workspace);if(brand)brand.textContent='iTELade Service Management';
  const content=$('.workspace-content',workspace);if(content)content.classList.add('sd20-workspace');
  const topbar=$('.topbar',workspace);if(topbar){topbar.classList.add('sd20-topbar');if(!$('.sd20-context',topbar)){const context=document.createElement('div');context.className='sd20-context';const name=routeName(route());context.innerHTML='<span>Service Management</span><strong>'+String(labels[name]||name||'Workspace')+'</strong>';topbar.prepend(context);}}
  decorateNavigation();
}
function decorateMain(){
  const main=$('#main');if(!main)return;
  const name=routeName(route());
  document.body.dataset.sd20Route=name;main.classList.add('sd20-main','sd20-'+name);
  const heading=$('.page-heading',main);if(heading)heading.classList.add('sd20-page-heading');
  $$('.panel,.detail-panel',main).forEach(el=>el.classList.add('sd20-surface'));
  $$('table',main).forEach(el=>el.classList.add('sd20-table'));
  $$('.pill',main).forEach(el=>el.classList.add('sd20-status'));
  if(name==='queue'){
    main.classList.add('sd20-queue-workspace');
    $('.metrics',main)?.classList.add('sd20-metrics');
    $('.filters',main)?.classList.add('sd20-filters');
    $('.table-scroll',main)?.classList.add('sd20-queue-table');
  }
  if(name==='ticket'){
    main.classList.add('sd20-ticket-workspace');
    $('.ticket-layout',main)?.classList.add('sd20-ticket-layout');
    $('.ticket-sidebar',main)?.classList.add('sd20-inspector');
    $('.conversation',main)?.classList.add('sd20-activity');
  }
  if(name==='settings')decorateSettings(main);
  if(name==='project-settings')main.classList.add('sd20-project-settings');
  if(name==='portal')main.classList.add('sd20-customer-portal');
}
function decorateSettings(main){
  const center=$('.settings-center',main);if(!center)return;
  center.classList.add('sd20-settings-center');
  const nav=$('.settings-nav',center);if(nav){nav.classList.add('sd20-settings-nav');if(!$('.sd20-settings-search',nav)){const wrap=document.createElement('label');wrap.className='sd20-settings-search';wrap.innerHTML='<span>Search settings</span><input type="search" placeholder="Search settings…" autocomplete="off">';nav.prepend(wrap);const input=$('input',wrap);input.addEventListener('input',()=>{const needle=input.value.trim().toLowerCase();$$('.settings-nav-link,.settings-nav-group',nav).forEach(el=>{if(el===wrap)return;const match=!needle||el.textContent.toLowerCase().includes(needle);el.hidden=!match&&el.classList.contains('settings-nav-link');});});}}
  $('.settings-content',center)?.classList.add('sd20-settings-content');
  $('.version-chip',main)?.classList.add('sd20-version-chip');
}
let scheduled=false;
function apply(){scheduled=false;decorateShell();decorateMain();}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}
addEventListener('hashchange',schedule);
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
schedule();
})();
