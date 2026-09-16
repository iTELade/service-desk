(() => {
  const VERSION='1.3.0';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let scheduled=false;
  const route=()=>location.hash.split('?')[0]||'#/' ;
  const isAgent=()=>Boolean($('.workspace .sidebar nav a[href="#/board"]')||$('.workspace .sidebar nav a[href="#/users"]')||$('.workspace .sidebar nav a[href="#/settings"]'));

  function surfaceClasses(){
    const body=document.body;if(!body)return;
    [...body.classList].filter(x=>x.startsWith('agent-route-')||x==='v120-auth'||x==='v120-portal'||x==='v120-public-portal').forEach(x=>body.classList.remove(x));
    if($('.auth-layout')){body.classList.add('v120-auth');document.documentElement.dataset.deskUi=VERSION;return;}
    if($('.portal-workspace')){body.classList.add(location.pathname.startsWith('/portal/')&&!isAgent()?'v120-public-portal':'v120-portal');document.documentElement.dataset.deskUi=VERSION;return;}
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

  function disableLegacy124Style(){
    const old=$('#desk-ui-124');
    if(old&&old.dataset.sd13Stub==='1')return;
    if(old)old.remove();
    const stub=document.createElement('style');stub.id='desk-ui-124';stub.dataset.sd13Stub='1';stub.textContent='/* 1.2.4 injected layout retired by 1.3.0 */';document.head.append(stub);
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
    const btn=document.createElement('button');btn.type='button';btn.dataset.v120Collapse='1';btn.className='v120-collapse';btn.title='Zwiń / rozwiń pasek boczny';btn.setAttribute('aria-label','Zwiń lub rozwiń pasek boczny');
    sidebar.append(btn);
    const apply=()=>{const collapsed=localStorage.getItem('desk.sidebar.collapsed')==='1';document.body.classList.toggle('v120-sidebar-collapsed',collapsed);btn.textContent=collapsed?'›':'‹';btn.setAttribute('aria-expanded',String(!collapsed));};
    btn.addEventListener('click',()=>{localStorage.setItem('desk.sidebar.collapsed',document.body.classList.contains('v120-sidebar-collapsed')?'0':'1');apply();});apply();
    addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select,[contenteditable="true"]'))return;if(e.key==='['||e.key===']'){localStorage.setItem('desk.sidebar.collapsed',e.key==='['?'1':'0');apply();}});
  }

  function cleanSettingsNavigation(){
    if(!route().startsWith('#/settings'))return;const nav=$('.settings-nav');if(!nav)return;
    for(const group of $$('.settings-nav-group',nav)){
      const labels=new Set($$('button',group).map(b=>b.textContent.trim()));
      $$('.settings-nav-link',group).forEach(link=>{if(labels.has(link.textContent.trim()))link.remove();});
    }
  }

  function rebuildQueue(){
    if(route()!=='#/queue')return;const main=$('#main');if(!main)return;
    main.classList.add('sd13-queue');
    if(main.dataset.sd13Queue==='1'){syncQueueModules(main);return;}
    const heading=$(':scope > .page-heading',main),metrics=$(':scope > .metrics',main),tabs=$(':scope > .tabs',main),filters=$(':scope > form.filters',main);
    const panel=$$(':scope > .panel',main).find(p=>p.querySelector('table'));
    if(!heading||!metrics||!tabs||!filters||!panel)return;

    const hero=document.createElement('section');hero.className='sd13-queue-hero';
    const title=heading.querySelector('h1');if(title&&!heading.querySelector('.sd13-queue-subtitle')){
      const subtitle=document.createElement('p');subtitle.className='sd13-queue-subtitle';subtitle.textContent='Pracuj na zgłoszeniach, pilnuj SLA i szybko przechodź między najważniejszymi kolejkami.';title.after(subtitle);
    }
    hero.append(heading);

    const workspace=document.createElement('section');workspace.className='sd13-queue-workspace';workspace.setAttribute('aria-label','Lista zgłoszeń');
    const prefs=document.createElement('div');prefs.className='sd13-queue-preferences-slot';
    panel.classList.add('sd13-queue-table');
    workspace.append(tabs,prefs,filters,panel);
    main.prepend(hero);
    metrics.after(workspace);
    main.dataset.sd13Queue='1';
    syncQueueModules(main);
  }

  function syncQueueModules(main=$('#main')){
    if(!main||route()!=='#/queue')return;const slot=$('.sd13-queue-preferences-slot',main),tools=$('.r112-queue-tools',main);
    if(slot&&tools&&tools.parentElement!==slot)slot.append(tools);
    $('.metrics',main)?.setAttribute('aria-label','Podsumowanie kolejki');
    $('.sd13-queue-table table',main)?.setAttribute('aria-label','Zgłoszenia w kolejce');
  }

  function rebuildTicket(){
    if(!route().startsWith('#/ticket/'))return;const main=$('#main');if(!main)return;
    main.classList.add('sd13-ticket');
    if(main.dataset.sd13Ticket==='1'){syncTicketModules(main);return;}
    const layout=$(':scope > .ticket-layout',main),heading=$(':scope > .page-heading',main),breadcrumb=$(':scope > .breadcrumb',main);
    if(!layout||!heading)return;
    const current=$(':scope > .ticket-current-status',main),transitions=$(':scope > .transition-bar',main),tools=$(':scope > .ticket-tools',main);
    const header=document.createElement('section');header.className='sd13-ticket-header';
    if(breadcrumb)header.append(breadcrumb);
    const titleRow=document.createElement('div');titleRow.className='sd13-ticket-title-row';titleRow.append(heading);header.append(titleRow);
    if(current)header.append(current);
    if(transitions)header.append(transitions);
    if(tools)header.append(tools);
    main.insertBefore(header,layout);

    const primary=layout.firstElementChild,side=$('.ticket-sidebar',layout);
    if(primary){primary.classList.add('sd13-ticket-main');primary.dataset.ticketPrimary='1';}
    if(side)side.dataset.ticketContext='1';
    main.dataset.sd13Ticket='1';
    syncTicketModules(main);
  }

  function syncTicketModules(main=$('#main')){
    if(!main||!route().startsWith('#/ticket/'))return;
    const primary=$('[data-ticket-primary]',main)||$('.ticket-layout>div',main);if(!primary)return;
    const attachments=$$('[data-r112-attachments]',main);
    if(attachments.length){
      const keep=attachments[0];attachments.slice(1).forEach(x=>x.remove());
      if(keep.parentElement!==primary){
        const conversation=$$('.detail-panel',primary).find(p=>p.querySelector('.conversation'));
        if(conversation)conversation.after(keep);else primary.append(keep);
      }
    }
    const history=$$('.detail-panel',primary).find(p=>/^Historia zmian$/i.test(p.querySelector('h2')?.textContent?.trim()||''));
    if(history&&!history.dataset.sd13Collapsible){
      history.dataset.sd13Collapsible='1';
      const h=history.querySelector('h2'),body=[...history.childNodes].filter(n=>n!==h);
      const details=document.createElement('details');details.className='sd13-history';
      const summary=document.createElement('summary');summary.textContent='Historia zmian';details.append(summary,...body);history.replaceWith(details);
    }
  }

  function settingsPolish(){
    if(!route().startsWith('#/settings'))return;const main=$('#main');if(!main)return;main.classList.add('v120-settings');
    const version=$('.version-chip',main);if(version)version.textContent='Wersja '+VERSION;
  }

  function portalPolish(){
    if(!$('.portal-workspace'))return;const main=$('#main');if(!main)return;
    $$('.service-card',main).forEach(c=>c.classList.add('v120-service-card'));
    $$('.panel',main).forEach(p=>p.classList.add('v120-portal-panel'));
  }

  // 1.2.1 updater UX hotfix retained in 1.3.0: live progress, restart resilience and one automatic reload.
  let updatePollTimer=null,updatePollBusy=false,lastUpdateStatus=null,updateReloadScheduled=false;
  const updatePhaseMeta={
    queued:{label:'Weryfikacja wydania',progress:8},pulling:{label:'Pobieranie obrazu',progress:28},backing_up:{label:'Kopia danych',progress:48},
    starting:{label:'Uruchamianie nowej wersji',progress:68},checking:{label:'Kontrola zdrowia',progress:86},committed:{label:'Zatwierdzanie wydania',progress:96},
    done:{label:'Aktualizacja zakończona',progress:100},failed:{label:'Aktualizacja przerwana',progress:100,bad:true},rollback:{label:'Przywracanie poprzedniej wersji',progress:78,warn:true},
    rolled_back:{label:'Przywrócono poprzednią wersję',progress:100,warn:true},rollback_failed:{label:'Wymagana interwencja administratora',progress:100,bad:true}
  };
  const updateEsc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  function ensureUpdateProgressStyles(){
    if($('#update-progress-121-style'))return;const style=document.createElement('style');style.id='update-progress-121-style';style.textContent=`
      #release-progress-121{margin:14px 0 0;padding:14px 15px;border:1px solid #dfe1e6;border-radius:8px;background:#fff;color:#172b4d;box-shadow:0 1px 2px rgba(9,30,66,.08)}
      #release-progress-121[hidden]{display:none!important}#release-progress-121.update-progress-bad{border-color:#ffbdad;background:#fff7f5}#release-progress-121.update-progress-warn{border-color:#f5cd47;background:#fffdf3}#release-progress-121.update-progress-offline{border-color:#85b8ff;background:#f7faff}
      .update-progress-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:9px}.update-progress-heading strong{font-size:13px}.update-progress-heading span{font-size:12px;font-weight:700;color:#44546f}
      .update-progress-track{height:10px;overflow:hidden;border-radius:999px;background:#dfe1e6}.update-progress-track>span{display:block;height:100%;border-radius:inherit;background:#0c66e4;transition:width .35s ease}.update-progress-bad .update-progress-track>span{background:#c9372c}.update-progress-warn .update-progress-track>span{background:#e2b203}
      .update-progress-message{margin:9px 0 5px;font-size:12px;line-height:1.45;color:#44546f}.update-progress-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;color:#626f86;font-size:10px}.update-progress-reload{margin-top:8px;padding:7px 9px;border-radius:4px;background:#e9f2ff;color:#0c66e4;font-size:11px;font-weight:650}`;document.head.append(style);
  }
  function ensureUpdateProgressHost(){const legacy=$('#release-job');if(!legacy)return null;let host=$('#release-progress-121');if(!host){host=document.createElement('section');host.id='release-progress-121';host.hidden=true;legacy.before(host);}return {host,legacy};}
  function scheduleUpdateReload(status){const job=status?.job;if(!job||!['done','rolled_back'].includes(job.phase)||updateReloadScheduled)return;const marker='desk.update.reload';try{if(sessionStorage.getItem(marker)===job.id)return;sessionStorage.setItem(marker,job.id);}catch{}updateReloadScheduled=true;const host=$('#release-progress-121');if(host&&!host.querySelector('.update-progress-reload'))host.insertAdjacentHTML('beforeend','<div class="update-progress-reload">Strona odświeży się automatycznie za chwilę…</div>');setTimeout(()=>location.reload(),1200);}
  function renderUpdateProgress(status,offline=false){const pair=ensureUpdateProgressHost();if(!pair)return;const {host,legacy}=pair,job=status?.job;if(!job){host.hidden=true;legacy.hidden=false;return;}const meta=updatePhaseMeta[job.phase]||{label:job.phase||'Aktualizacja',progress:5},pct=Math.max(0,Math.min(100,Number(meta.progress)||0));legacy.hidden=true;host.hidden=false;host.className=(meta.bad?'update-progress-bad ':meta.warn?'update-progress-warn ':'')+(offline?'update-progress-offline':'');const message=offline?'Połączenie z aplikacją zostało chwilowo przerwane. To normalne podczas restartu — oczekiwanie na ponowne uruchomienie usługi…':(job.message||meta.label),stamp=job.at?new Date(job.at).toLocaleString():'';host.innerHTML=`<div class="update-progress-heading"><strong>${updateEsc(meta.label)}</strong><span>${pct}%</span></div><div class="update-progress-track" role="progressbar" aria-label="Postęp aktualizacji" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><p class="update-progress-message">${updateEsc(message)}</p><div class="update-progress-meta"><span>Wersja docelowa: ${updateEsc(job.version||'—')}</span><span>${updateEsc(stamp)}</span></div>`;if(!offline)scheduleUpdateReload(status);}
  async function pollUpdateStatus(){if(route()!=='#/admin/updates'){stopUpdatePolling();return;}if(updatePollBusy)return;updatePollBusy=true;try{const response=await fetch('/api/desk/updates',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw new Error('status '+response.status);const status=await response.json();lastUpdateStatus=status;renderUpdateProgress(status,false);}catch{if(lastUpdateStatus?.job)renderUpdateProgress(lastUpdateStatus,true);}finally{updatePollBusy=false;}}
  function startUpdatePolling(){if(updatePollTimer)return;void pollUpdateStatus();updatePollTimer=setInterval(()=>void pollUpdateStatus(),1250);}
  function stopUpdatePolling(){if(updatePollTimer){clearInterval(updatePollTimer);updatePollTimer=null;}updatePollBusy=false;}
  function updateHotfix(){if(route()!=='#/admin/updates'){stopUpdatePolling();return;}ensureUpdateProgressStyles();if(ensureUpdateProgressHost())startUpdatePolling();}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&route()==='#/admin/updates')void pollUpdateStatus();});
  addEventListener('online',()=>{if(route()==='#/admin/updates')void pollUpdateStatus();});

  function enhance(){scheduled=false;disableLegacy124Style();surfaceClasses();addAdminNav();collapseSidebarControl();cleanSettingsNavigation();rebuildQueue();rebuildTicket();settingsPolish();portalPolish();updateHotfix();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);addEventListener('DOMContentLoaded',schedule);schedule();
})();
