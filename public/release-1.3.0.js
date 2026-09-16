(() => {
  const VERSION='1.3.0';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let scheduled=false;
  const route=()=>location.hash.split('?')[0]||'#/' ;
  const isAgent=()=>Boolean($('.workspace .sidebar nav a[href="#/board"]')||$('.workspace .sidebar nav a[href="#/users"]')||$('.workspace .sidebar nav a[href="#/settings"]'));

  function surfaceClasses(){
    const body=document.body;if(!body)return;
    [...body.classList].filter(x=>x.startsWith('v130-')||x.startsWith('agent-route-')).forEach(x=>body.classList.remove(x));
    if($('.auth-layout')){body.classList.add('v130-auth');return;}
    if($('.portal-workspace')){body.classList.add(location.pathname.startsWith('/portal/')&&!isAgent()?'v130-public-portal':'v130-portal');return;}
    if(!isAgent())return;
    body.classList.add('v114-agent');
    const r=route();let name='other';
    if(r==='#/queue')name='queue';
    else if(r==='#/board')name='board';
    else if(r==='#/portal')name='portal';
    else if(r==='#/projects'||r.startsWith('#/project'))name='projects';
    else if(r==='#/users')name='users';
    else if(r==='#/settings'||r.startsWith('#/admin')||r==='#/directory'||r==='#/admin-settings')name='settings';
    else if(r.startsWith('#/ticket/'))name='ticket';
    else if(r==='#/profile')name='profile';
    body.classList.add('agent-route-'+name);
    document.documentElement.dataset.deskUi=VERSION;
  }

  function addAdminNav(){
    if(!isAgent())return;const nav=$('.sidebar nav');if(!nav||nav.dataset.v130)return;nav.dataset.v130='1';
    const settings=nav.querySelector('a[href="#/settings"]');if(!settings)return;
    const section=document.createElement('div');section.className='v130-nav-section';section.innerHTML='<span class="v130-nav-label">ZARZĄDZANIE USŁUGAMI</span>'+
      '<a href="#/admin/knowledge"><span class="v130-nav-dot">◇</span><span>Baza wiedzy</span></a>'+
      '<a href="#/admin/assets"><span class="v130-nav-dot">◆</span><span>Assets / CMDB</span></a>'+
      '<a href="#/admin/mail"><span class="v130-nav-dot">✉</span><span>Kanały pocztowe</span></a>';
    nav.insertBefore(section,settings);
  }

  function collapseSidebarControl(){
    if(!isAgent())return;const sidebar=$('.sidebar');if(!sidebar||sidebar.querySelector('[data-v130-collapse]'))return;
    const btn=document.createElement('button');btn.type='button';btn.dataset.v130Collapse='1';btn.className='v130-collapse';btn.title='Zwiń / rozwiń pasek boczny';btn.setAttribute('aria-label','Zwiń lub rozwiń pasek boczny');btn.textContent='‹';
    sidebar.append(btn);
    const apply=()=>{const collapsed=localStorage.getItem('desk.sidebar.collapsed')==='1';document.body.classList.toggle('v130-sidebar-collapsed',collapsed);btn.textContent=collapsed?'›':'‹';btn.setAttribute('aria-expanded',String(!collapsed));};
    btn.addEventListener('click',()=>{localStorage.setItem('desk.sidebar.collapsed',document.body.classList.contains('v130-sidebar-collapsed')?'0':'1');apply();});apply();
    addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select,[contenteditable="true"]'))return;if(e.key==='['||e.key===']'){const collapse=e.key==='[';localStorage.setItem('desk.sidebar.collapsed',collapse?'1':'0');apply();}});
  }

  function cleanSettingsNavigation(){
    if(route()!=='#/settings')return;const nav=$('.settings-nav');if(!nav)return;
    for(const group of $$('.settings-nav-group',nav)){
      const labels=new Set($$('button',group).map(b=>b.textContent.trim()));
      $$('.settings-nav-link',group).forEach(link=>{if(labels.has(link.textContent.trim()))link.remove();});
    }
  }

  function queuePolish(){
    if(route()!=='#/queue')return;const main=$('#main');if(!main)return;
    $('.metrics',main)?.setAttribute('aria-label','Podsumowanie kolejki');
    const panel=$('.panel',main);if(panel?.querySelector('table'))panel.classList.add('v130-issue-list');
    const filters=$('form.filters',main);if(filters)filters.classList.add('v130-filters');
    $$('.r113-sla-chip',main).forEach(el=>{el.title=el.textContent.trim();el.textContent=el.textContent.replace(/^Pierwsza odpowiedź:\s*/,'Odpowiedź · ').replace(/^Rozwiązanie:\s*/,'Rozwiązanie · ');});
  }

  function ticketPolish(){
    if(!route().startsWith('#/ticket/'))return;const main=$('#main');if(!main)return;
    $('.ticket-layout',main)?.classList.add('v130-ticket-layout');
    $('.ticket-sidebar',main)?.classList.add('v130-ticket-sidebar');
    $('.ticket-current-status',main)?.classList.add('v130-current-status');
    $('.transition-bar',main)?.classList.add('v130-ticket-actions');
    $('.ticket-tools',main)?.classList.add('v130-ticket-tools');
    $('.conversation',main)?.classList.add('v130-conversation');
    const heading=$('.page-heading',main);if(heading&&!heading.querySelector('.v130-ticket-kicker')){
      const key=heading.querySelector('.eyebrow')?.textContent?.trim();if(key)heading.classList.add('v130-issue-heading');
    }
  }

  function tablesAndCards(){
    if(!isAgent())return;
    $$('#main table').forEach(t=>t.classList.add('v130-data-table'));
    $$('#main .panel').forEach(p=>p.classList.add('v130-panel'));
    $$('.banner').forEach(b=>b.classList.add('v130-banner'));
  }

  function settingsPolish(){
    if(route()!=='#/settings')return;const main=$('#main');if(!main)return;
    main.classList.add('v130-settings');
    const version=$('.version-chip',main);if(version)version.textContent='Wersja '+VERSION;
  }

  function portalPolish(){
    if(!$('.portal-workspace'))return;
    const main=$('#main');if(!main)return;
    $$('.service-card',main).forEach(c=>c.classList.add('v130-service-card'));
    $$('.panel',main).forEach(p=>p.classList.add('v130-portal-panel'));
  }

  function enhance(){scheduled=false;surfaceClasses();addAdminNav();collapseSidebarControl();cleanSettingsNavigation();queuePolish();ticketPolish();tablesAndCards();settingsPolish();portalPolish();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);addEventListener('DOMContentLoaded',schedule);schedule();
})();
