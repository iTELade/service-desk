(() => {
  const VERSION='1.2.3';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let scheduled=false;
  const route=()=>location.hash.split('?')[0]||'#/' ;
  const isAgent=()=>Boolean($('.workspace .sidebar nav a[href="#/board"]')||$('.workspace .sidebar nav a[href="#/users"]')||$('.workspace .sidebar nav a[href="#/settings"]'));

  function surfaceClasses(){
    const body=document.body;if(!body)return;
    [...body.classList].filter(x=>x.startsWith('v120-')||x.startsWith('agent-route-')).forEach(x=>body.classList.remove(x));
    if($('.auth-layout')){body.classList.add('v120-auth');return;}
    if($('.portal-workspace')){body.classList.add(location.pathname.startsWith('/portal/')&&!isAgent()?'v120-public-portal':'v120-portal');return;}
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
    if(!isAgent())return;const nav=$('.sidebar nav');if(!nav||nav.dataset.v120)return;nav.dataset.v120='1';
    const settings=nav.querySelector('a[href="#/settings"]');if(!settings)return;
    const section=document.createElement('div');section.className='v120-nav-section';section.innerHTML='<span class="v120-nav-label">ZARZĄDZANIE USŁUGAMI</span>'+
      '<a href="#/admin/knowledge"><span class="v120-nav-dot">◇</span><span>Baza wiedzy</span></a>'+
      '<a href="#/admin/assets"><span class="v120-nav-dot">◆</span><span>Assets / CMDB</span></a>'+
      '<a href="#/admin/mail"><span class="v120-nav-dot">✉</span><span>Kanały pocztowe</span></a>';
    nav.insertBefore(section,settings);
  }

  function collapseSidebarControl(){
    if(!isAgent())return;const sidebar=$('.sidebar');if(!sidebar||sidebar.querySelector('[data-v120-collapse]'))return;
    const btn=document.createElement('button');btn.type='button';btn.dataset.v120Collapse='1';btn.className='v120-collapse';btn.title='Zwiń / rozwiń pasek boczny';btn.setAttribute('aria-label','Zwiń lub rozwiń pasek boczny');btn.textContent='‹';
    sidebar.append(btn);
    const apply=()=>{const collapsed=localStorage.getItem('desk.sidebar.collapsed')==='1';document.body.classList.toggle('v120-sidebar-collapsed',collapsed);btn.textContent=collapsed?'›':'‹';btn.setAttribute('aria-expanded',String(!collapsed));};
    btn.addEventListener('click',()=>{localStorage.setItem('desk.sidebar.collapsed',document.body.classList.contains('v120-sidebar-collapsed')?'0':'1');apply();});apply();
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
    const panel=$('.panel',main);if(panel?.querySelector('table'))panel.classList.add('v120-issue-list');
    const filters=$('form.filters',main);if(filters)filters.classList.add('v120-filters');
    $$('.r113-sla-chip',main).forEach(el=>{el.title=el.textContent.trim();el.textContent=el.textContent.replace(/^Pierwsza odpowiedź:\s*/,'Odpowiedź · ').replace(/^Rozwiązanie:\s*/,'Rozwiązanie · ');});
  }

  function ticketPolish(){
    if(!route().startsWith('#/ticket/'))return;const main=$('#main');if(!main)return;
    $('.ticket-layout',main)?.classList.add('v120-ticket-layout');
    $('.ticket-sidebar',main)?.classList.add('v120-ticket-sidebar');
    $('.ticket-current-status',main)?.classList.add('v120-current-status');
    $('.transition-bar',main)?.classList.add('v120-ticket-actions');
    $('.ticket-tools',main)?.classList.add('v120-ticket-tools');
    $('.conversation',main)?.classList.add('v120-conversation');
    const heading=$('.page-heading',main);if(heading&&!heading.querySelector('.v120-ticket-kicker')){
      const key=heading.querySelector('.eyebrow')?.textContent?.trim();if(key)heading.classList.add('v120-issue-heading');
    }
  }

  function tablesAndCards(){
    if(!isAgent())return;
    $$('#main table').forEach(t=>t.classList.add('v120-data-table'));
    $$('#main .panel').forEach(p=>p.classList.add('v120-panel'));
    $$('.banner').forEach(b=>b.classList.add('v120-banner'));
  }

  function settingsPolish(){
    if(route()!=='#/settings')return;const main=$('#main');if(!main)return;
    main.classList.add('v120-settings');
    const version=$('.version-chip',main);if(version)version.textContent='Wersja '+VERSION;
  }

  function portalPolish(){
    if(!$('.portal-workspace'))return;
    const main=$('#main');if(!main)return;
    $$('.service-card',main).forEach(c=>c.classList.add('v120-service-card'));
    $$('.panel',main).forEach(p=>p.classList.add('v120-portal-panel'));
  }

// 1.2.1 updater UX hotfix: live progress, restart resilience and one automatic reload.
let updatePollTimer=null,updatePollBusy=false,lastUpdateStatus=null,updateReloadScheduled=false;
const updatePhaseMeta={
  queued:{label:'Weryfikacja wydania',progress:8},
  pulling:{label:'Pobieranie obrazu',progress:28},
  backing_up:{label:'Kopia danych',progress:48},
  starting:{label:'Uruchamianie nowej wersji',progress:68},
  checking:{label:'Kontrola zdrowia',progress:86},
  committed:{label:'Zatwierdzanie wydania',progress:96},
  done:{label:'Aktualizacja zakończona',progress:100},
  failed:{label:'Aktualizacja przerwana',progress:100,bad:true},
  rollback:{label:'Przywracanie poprzedniej wersji',progress:78,warn:true},
  rolled_back:{label:'Przywrócono poprzednią wersję',progress:100,warn:true},
  rollback_failed:{label:'Wymagana interwencja administratora',progress:100,bad:true}
};
const updateEsc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
function ensureUpdateProgressStyles(){
  if($('#update-progress-121-style'))return;
  const style=document.createElement('style');style.id='update-progress-121-style';style.textContent=`
    #release-progress-121{margin:14px 0 0;padding:14px 15px;border:1px solid #dfe1e6;border-radius:6px;background:#fff;color:#172b4d;box-shadow:0 1px 2px rgba(9,30,66,.08)}
    #release-progress-121[hidden]{display:none!important}
    #release-progress-121.update-progress-bad{border-color:#ffbdad;background:#fff7f5}
    #release-progress-121.update-progress-warn{border-color:#f5cd47;background:#fffdf3}
    #release-progress-121.update-progress-offline{border-color:#85b8ff;background:#f7faff}
    .update-progress-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:9px}
    .update-progress-heading strong{font-size:13px;color:#172b4d}.update-progress-heading span{font-size:12px;font-weight:700;color:#44546f}
    .update-progress-track{position:relative;height:10px;overflow:hidden;border-radius:999px;background:#dfe1e6;box-shadow:inset 0 1px 1px rgba(9,30,66,.08)}
    .update-progress-track>span{display:block;height:100%;border-radius:inherit;background:#0c66e4;transition:width .35s ease}
    .update-progress-bad .update-progress-track>span{background:#c9372c}.update-progress-warn .update-progress-track>span{background:#e2b203}
    .update-progress-message{margin:9px 0 5px;font-size:12px;line-height:1.45;color:#44546f}
    .update-progress-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;color:#626f86;font-size:10px}
    .update-progress-reload{margin-top:8px;padding:7px 9px;border-radius:4px;background:#e9f2ff;color:#0c66e4;font-size:11px;font-weight:650}
  `;document.head.append(style);
}
function ensureUpdateProgressHost(){
  const legacy=$('#release-job');if(!legacy)return null;
  let host=$('#release-progress-121');
  if(!host){host=document.createElement('section');host.id='release-progress-121';host.hidden=true;legacy.before(host);}
  return {host,legacy};
}
function scheduleUpdateReload(status){
  const job=status?.job;if(!job||!['done','rolled_back'].includes(job.phase)||updateReloadScheduled)return;
  const marker='desk.update.reload';
  try{if(sessionStorage.getItem(marker)===job.id)return;sessionStorage.setItem(marker,job.id);}catch{}
  updateReloadScheduled=true;
  const host=$('#release-progress-121');if(host&&!host.querySelector('.update-progress-reload'))host.insertAdjacentHTML('beforeend','<div class="update-progress-reload">Strona odświeży się automatycznie za chwilę…</div>');
  setTimeout(()=>location.reload(),1200);
}
function renderUpdateProgress(status,offline=false){
  const pair=ensureUpdateProgressHost();if(!pair)return;const {host,legacy}=pair,job=status?.job;
  if(!job){host.hidden=true;legacy.hidden=false;return;}
  const meta=updatePhaseMeta[job.phase]||{label:job.phase||'Aktualizacja',progress:5};
  const pct=Math.max(0,Math.min(100,Number(meta.progress)||0));
  legacy.hidden=true;host.hidden=false;host.className=(meta.bad?'update-progress-bad ':meta.warn?'update-progress-warn ':'')+(offline?'update-progress-offline':'');
  const message=offline?'Połączenie z aplikacją zostało chwilowo przerwane. To normalne podczas restartu — oczekiwanie na ponowne uruchomienie usługi…':(job.message||meta.label);
  const stamp=job.at?new Date(job.at).toLocaleString():'';
  host.innerHTML=`<div class="update-progress-heading"><strong>${updateEsc(meta.label)}</strong><span>${pct}%</span></div><div class="update-progress-track" role="progressbar" aria-label="Postęp aktualizacji" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><p class="update-progress-message">${updateEsc(message)}</p><div class="update-progress-meta"><span>Wersja docelowa: ${updateEsc(job.version||'—')}</span><span>${updateEsc(stamp)}</span></div>`;
  if(!offline)scheduleUpdateReload(status);
}
async function pollUpdateStatus(){
  if(route()!=='#/admin/updates'){stopUpdatePolling();return;}if(updatePollBusy)return;updatePollBusy=true;
  try{
    const response=await fetch('/api/desk/updates',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('status '+response.status);
    const status=await response.json();lastUpdateStatus=status;renderUpdateProgress(status,false);
  }catch{if(lastUpdateStatus?.job)renderUpdateProgress(lastUpdateStatus,true);}
  finally{updatePollBusy=false;}
}
function startUpdatePolling(){if(updatePollTimer)return;void pollUpdateStatus();updatePollTimer=setInterval(()=>void pollUpdateStatus(),1250);}
function stopUpdatePolling(){if(updatePollTimer){clearInterval(updatePollTimer);updatePollTimer=null;}updatePollBusy=false;}
function updateHotfix(){
  if(route()!=='#/admin/updates'){stopUpdatePolling();return;}
  ensureUpdateProgressStyles();if(ensureUpdateProgressHost())startUpdatePolling();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&route()==='#/admin/updates')void pollUpdateStatus();});
addEventListener('online',()=>{if(route()==='#/admin/updates')void pollUpdateStatus();});

  function enhance(){scheduled=false;surfaceClasses();addAdminNav();collapseSidebarControl();cleanSettingsNavigation();queuePolish();ticketPolish();tablesAndCards();settingsPolish();portalPolish();updateHotfix();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);addEventListener('DOMContentLoaded',schedule);schedule();
})();
