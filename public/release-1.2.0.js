(() => {
  'use strict';

  const VERSION='1.4.0';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const currentRoute=()=>location.hash.split('?')[0]||'#/';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isAgent=()=>Boolean($('.workspace .sidebar nav a[href="#/board"]')||$('.workspace .sidebar nav a[href="#/users"]')||$('.workspace .sidebar nav a[href="#/settings"]'));

  const DIRECT_SETTINGS_LINKS={
    'Ogólne':[['Organizacja i rejestracja','/#/settings?section=general'],['Wygląd i marka','/#/settings?section=branding']],
    'Tożsamość i dostęp':[['Użytkownicy','/#/users'],['Katalog LDAP / Active Directory','/#/directory'],['Logowanie SSO / OIDC','/#/admin/sso'],['MFA i moje konto','/#/profile'],['Wnioski o zmiany profilu','/#/admin/approvals']],
    'Zarządzanie usługami':[['Projekty','/#/projects'],['Szablony workflow i statusów','/#/admin/templates'],['Firmy i grupy klientów','/#/admin/organizations'],['Zatwierdzenia obiegu','/#/settings?section=approvals']],
    'Komunikacja':[['Domyślna poczta SMTP i kolejka','/#/settings?section=communication'],['Skrzynki zespołów · IMAP i SMTP','/#/admin/mail'],['Szablony powiadomień e-mail','/#/admin/mail-templates']],
    'Integracje':[['Przegląd integracji','/#/settings?section=integrations'],['Synchronizacja projektów','/#/admin/sync'],['GitHub Issues','/#/settings?section=github'],['Webhooki','/#/admin/webhooks'],['Baza wiedzy','/#/admin/knowledge'],['Tokeny API','/#/admin/api-tokens'],['Wtyczki','/#/settings?section=plugins']],
    'Zasoby / CMDB':[['Przegląd zasobów / CMDB','/#/settings?section=assets'],['Katalog środków trwałych','/#/admin/assets']],
    'System':[['Diagnostyka i utrzymanie','/#/settings?section=system'],['Audyt','/#/settings?section=audit'],['Wersja i aktualizacje','/#/admin/updates'],['Błędy modułów','/#/admin/events'],['Zaawansowane ustawienia systemu','/#/admin-settings']]
  };

  const routeMeta={
    '#/queue':{name:'queue',intro:'Przeglądaj, priorytetyzuj i obsługuj zgłoszenia bez przełączania się między zbędnymi ekranami.'},
    '#/board':{name:'board',intro:'Kontroluj przepływ pracy i przenoś zgłoszenia między statusami w jednym widoku.'},
    '#/portal':{name:'portal',intro:'Zarządzaj portalami i doświadczeniem klientów.'},
    '#/projects':{name:'projects',intro:'Usługi, zespoły, formularze, workflow i SLA są zarządzane per projekt.'},
    '#/users':{name:'users',intro:'Konta lokalne, katalogowe, role globalne i dostęp użytkowników.'},
    '#/profile':{name:'profile',intro:'Bezpieczeństwo konta, profil, MFA i aktywne sesje.'}
  };

  function forceLightTheme(){
    const root=document.documentElement;
    if(root.dataset.theme!=='light')root.dataset.theme='light';
    if(root.dataset.deskUi!==VERSION)root.dataset.deskUi=VERSION;
    if(root.style.colorScheme!=='light')root.style.colorScheme='light';
    for(const select of $$('select')){
      const values=[...select.options].map(option=>String(option.value||'').toLowerCase());
      if(!values.includes('light')||(!values.includes('dark')&&!values.includes('system')))continue;
      select.value='light';
      for(const option of [...select.options])if(String(option.value||'').toLowerCase()!=='light')option.remove();
      if(select.options[0]&&select.options[0].textContent!=='Jasny')select.options[0].textContent='Jasny';
    }
    for(const input of $$('input[type="radio"]')){
      if(!['dark','system'].includes(String(input.value||'').toLowerCase()))continue;
      const label=input.closest('label');
      if(label){if(!label.hidden)label.hidden=true;}else if(!input.hidden)input.hidden=true;
    }
  }

  function applySurfaceClasses(){
    const body=document.body;if(!body)return;
    for(const cls of [...body.classList])if(cls.startsWith('agent-route-')||cls.startsWith('sd14-surface-'))body.classList.remove(cls);
    if($('.auth-layout')){body.classList.add('sd14-surface-auth');return;}
    if($('.portal-workspace')){body.classList.add(location.pathname.startsWith('/portal/')&&!isAgent()?'sd14-surface-public-portal':'sd14-surface-portal');return;}
    if(!isAgent())return;
    const r=currentRoute();let name=routeMeta[r]?.name||'other';
    if(r.startsWith('#/ticket/'))name='ticket';
    else if(r.startsWith('#/project/'))name='projects';
    else if(r==='#/settings'||r.startsWith('#/settings?')||r.startsWith('#/admin')||r==='#/directory'||r==='#/admin-settings')name='settings';
    body.classList.add('agent-route-'+name,'sd14-surface-agent');
  }

  function addEnterpriseNavigation(){
    if(!isAgent())return;
    const nav=$('.sidebar nav');if(!nav)return;
    let group=nav.querySelector('.sd14-nav-group');
    const settings=nav.querySelector('a[href="#/settings"]');
    if(settings&&!group){
      group=document.createElement('div');group.className='sd14-nav-group';
      group.innerHTML='<span class="sd14-nav-label">ZARZĄDZANIE USŁUGAMI</span>'+
        '<a href="#/admin/knowledge"><span class="sd14-nav-dot">◇</span><span>Baza wiedzy</span></a>'+
        '<a href="#/admin/assets"><span class="sd14-nav-dot">◆</span><span>Assets / CMDB</span></a>'+
        '<a href="#/admin/mail"><span class="sd14-nav-dot">✉</span><span>Kanały pocztowe</span></a>';
      nav.insertBefore(group,settings);
    }
    if(group){
      const r=currentRoute();for(const link of $$('a',group)){
        const active=link.getAttribute('href')===r;
        if(active&&link.getAttribute('aria-current')!=='page')link.setAttribute('aria-current','page');
        else if(!active&&link.hasAttribute('aria-current'))link.removeAttribute('aria-current');
      }
    }
  }

  function installSidebarCollapse(){
    if(!isAgent())return;
    const sidebar=$('.sidebar');if(!sidebar)return;
    let button=sidebar.querySelector('[data-sd14-collapse]');
    if(!button){
      button=document.createElement('button');button.type='button';button.className='sd14-collapse';button.dataset.sd14Collapse='1';button.title='Zwiń lub rozwiń nawigację';button.setAttribute('aria-label','Zwiń lub rozwiń nawigację');sidebar.append(button);
      button.addEventListener('click',()=>{const next=!document.body.classList.contains('sd14-sidebar-collapsed');localStorage.setItem('desk.sidebar.collapsed',next?'1':'0');applySidebarState();});
    }
    applySidebarState();
  }

  function applySidebarState(){
    const button=$('[data-sd14-collapse]');
    const collapsed=localStorage.getItem('desk.sidebar.collapsed')==='1';
    document.body.classList.toggle('sd14-sidebar-collapsed',collapsed);
    if(button){
      const glyph=collapsed?'›':'‹',expanded=String(!collapsed);
      if(button.textContent!==glyph)button.textContent=glyph;
      if(button.getAttribute('aria-expanded')!==expanded)button.setAttribute('aria-expanded',expanded);
    }
  }

  function ensurePageIntro(){
    const r=currentRoute(),meta=routeMeta[r];if(!meta)return;
    const heading=$('#main .page-heading');if(!heading||heading.querySelector('.sd14-page-intro'))return;
    const title=heading.querySelector('h1');if(!title)return;
    const intro=document.createElement('p');intro.className='sd14-page-intro';intro.textContent=meta.intro;title.after(intro);
  }

  function keepNewest(nodes){
    if(!nodes.length)return null;
    const keep=nodes[nodes.length-1];
    for(const node of nodes.slice(0,-1))node.remove();
    return keep;
  }

  let queueSnapshotHTML='',queueSnapshotHeight=0;
  function sanitizeGhost(ghost){
    ghost.setAttribute('aria-hidden','true');
    for(const node of $$('*',ghost)){
      node.removeAttribute('id');
      for(const attr of [...node.attributes])if(attr.name.startsWith('data-')||attr.name.startsWith('aria-live'))node.removeAttribute(attr.name);
      if(/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(node.tagName)){node.tabIndex=-1;node.setAttribute('disabled','');}
    }
  }
  function clearQueueGhost(){
    $('.sd14-queue-ghost')?.remove();
    const main=$('#main');if(main){main.classList.remove('sd14-queue-loading');main.style.removeProperty('min-height');}
  }
  function captureQueueSnapshot(main){
    if(!main||main.querySelector('.loading')||!main.querySelector('table'))return;
    queueSnapshotHTML=main.innerHTML;queueSnapshotHeight=Math.ceil(main.getBoundingClientRect().height);
  }
  function showQueueGhost(main){
    if(!queueSnapshotHTML||$('.sd14-queue-ghost'))return;
    const host=main.closest('.workspace-content');if(!host)return;
    const ghost=document.createElement('div');ghost.className='sd14-queue-ghost';ghost.innerHTML=queueSnapshotHTML;sanitizeGhost(ghost);host.append(ghost);
    ghost.style.left=main.offsetLeft+'px';ghost.style.top=main.offsetTop+'px';ghost.style.width=main.offsetWidth+'px';ghost.style.minHeight=Math.max(1,queueSnapshotHeight)+'px';
    main.style.minHeight=Math.max(1,queueSnapshotHeight)+'px';main.classList.add('sd14-queue-loading');
  }

  function rebuildQueueWorkspace(){
    if(currentRoute()!=='#/queue'){clearQueueGhost();queueSnapshotHTML='';queueSnapshotHeight=0;return;}
    const main=$('#main');if(!main)return;
    if(main.querySelector('.loading')){showQueueGhost(main);return;}
    clearQueueGhost();main.classList.add('sd14-queue');
    const heading=$('.page-heading',main),metrics=$('.metrics',main),tabs=$('.tabs',main),filters=$('form.filters',main),panel=$$('.panel',main).find(node=>node.querySelector('table'));
    if(!heading||!metrics||!tabs||!filters||!panel){captureQueueSnapshot(main);return;}

    let hero=$('.sd14-queue-hero',main);if(!hero){hero=document.createElement('section');hero.className='sd14-queue-hero';main.insertBefore(hero,metrics);}if(heading.parentElement!==hero)hero.append(heading);
    const title=heading.querySelector('h1');if(title&&!heading.querySelector('.sd14-queue-subtitle')){const subtitle=document.createElement('p');subtitle.className='sd14-queue-subtitle';subtitle.textContent='Przeglądaj, priorytetyzuj i obsługuj zgłoszenia bez przełączania się między zbędnymi ekranami.';title.after(subtitle);}

    let workspace=$('.sd14-queue-workspace',main);if(!workspace){workspace=document.createElement('section');workspace.className='sd14-queue-workspace';workspace.setAttribute('aria-label','Kolejka zgłoszeń');metrics.after(workspace);}if(tabs.parentElement!==workspace)workspace.append(tabs);
    let view=$('.sd14-view-settings',workspace);if(!view){view=document.createElement('details');view.className='sd14-view-settings';view.innerHTML='<summary>Widok i sortowanie</summary><div class="sd14-view-settings-body"></div>';tabs.after(view);}
    const tools=keepNewest($$('[data-r112-queue-tools]',main));if(tools){const body=$('.sd14-view-settings-body',view);if(tools.parentElement!==body)body.append(tools);}
    if(filters.parentElement!==workspace)workspace.append(filters);
    if(panel.parentElement!==workspace)workspace.append(panel);panel.classList.add('sd14-queue-table');
    for(const duplicate of $$('.sd14-queue-workspace',main).slice(1))duplicate.remove();
    for(const legacy of $$('.sd13-queue-preferences-slot,.sd131-view-settings',main))if(!legacy.closest('.sd14-view-settings'))legacy.remove();
    captureQueueSnapshot(main);
  }

  function rebuildTicketWorkspace(){
    if(!currentRoute().startsWith('#/ticket/'))return;
    const main=$('#main');if(!main||main.querySelector('.loading'))return;
    const layout=$('.ticket-layout',main),heading=$('.page-heading',main);if(!layout||!heading)return;
    main.classList.add('sd14-ticket');
    let header=$('.sd14-ticket-header',main);if(!header){header=document.createElement('section');header.className='sd14-ticket-header';main.insertBefore(header,layout);}
    const breadcrumb=$('.breadcrumb',main),current=$('.ticket-current-status',main),transitions=$('.transition-bar',main),tools=$('.ticket-tools',main);
    if(breadcrumb&&breadcrumb.parentElement!==header)header.append(breadcrumb);
    let titleRow=$('.sd14-ticket-title-row',header);if(!titleRow){titleRow=document.createElement('div');titleRow.className='sd14-ticket-title-row';header.append(titleRow);}if(heading.parentElement!==titleRow)titleRow.append(heading);
    if(current&&current.parentElement!==header)header.append(current);if(transitions&&transitions.parentElement!==header)header.append(transitions);if(tools&&tools.parentElement!==header)header.append(tools);
    const primary=layout.firstElementChild;if(primary)primary.classList.add('sd14-ticket-main');
    const attachments=keepNewest($$('[data-r112-attachments]',main));if(attachments&&primary&&attachments.parentElement!==primary){const conversation=$$('.detail-panel',primary).find(panel=>panel.querySelector('.conversation'));if(conversation)conversation.after(attachments);else primary.append(attachments);}
    const history=primary&&$$('.detail-panel',primary).find(panel=>/^Historia zmian$/i.test(panel.querySelector('h2')?.textContent?.trim()||''));if(history&&!history.dataset.sd14Collapsible){history.dataset.sd14Collapsible='1';const h=history.querySelector('h2'),body=[...history.childNodes].filter(node=>node!==h),details=document.createElement('details'),summary=document.createElement('summary');details.className='sd14-history';summary.textContent='Historia zmian';details.append(summary,...body);history.replaceWith(details);}
    for(const duplicate of $$('.sd14-ticket-header',main).slice(1))duplicate.remove();
  }

  function settingsCenterPresent(main=$('#main')){return Boolean(main?.querySelector('.settings-center'));}
  function looksLikeLegacySettings(main=$('#main')){return Boolean(main&&(main.querySelector('[data-form="settings"]')||main.querySelector('[data-v6="smtp"]')||main.textContent?.includes('Domyślna poczta SMTP')));}
  function recoverSettingsCenter(){
    const r=currentRoute();if(r!=='#/settings'&&!r.startsWith('#/settings'))return;
    const main=$('#main');if(!main||settingsCenterPresent(main)||!looksLikeLegacySettings(main))return;
    if(main.dataset.settingsRecovery===VERSION)return;delete main.dataset.settingsCenterVersion;main.dataset.settingsRecovery=VERSION;main.append(document.createComment('settings-center-recover-'+VERSION));
  }
  function completeSettingsNavigation(){
    const r=currentRoute();if(r!=='#/settings'&&!r.startsWith('#/settings'))return;
    const main=$('#main'),nav=$('.settings-nav'),chip=$('.version-chip');
    const versionLabel='Wersja '+VERSION;if(chip&&chip.textContent!==versionLabel)chip.textContent=versionLabel;
    if(!nav){recoverSettingsCenter();return;}if(main?.dataset.settingsRecovery)delete main.dataset.settingsRecovery;
    for(const group of $$('.settings-nav-group',nav)){
      const title=group.querySelector('h3')?.textContent?.replace(/^[^A-Za-zĄĆĘŁŃÓŚŹŻ]+/,'')?.trim(),links=DIRECT_SETTINGS_LINKS[title];if(!links)continue;
      const labels=new Set($$('button',group).map(button=>button.textContent.trim()));
      for(const [label,href] of links){if(labels.has(label)||group.querySelector(`a[href="${href}"]`))continue;const link=document.createElement('a');link.className='settings-nav-link';link.href=href;link.textContent=label;group.append(link);}
    }
  }

  let updatePollTimer=null,updatePollBusy=false,lastUpdateStatus=null,updateReloadScheduled=false;
  const updatePhaseMeta={queued:{label:'Weryfikacja wydania',progress:8},pulling:{label:'Pobieranie obrazu',progress:28},backing_up:{label:'Kopia danych',progress:48},starting:{label:'Uruchamianie nowej wersji',progress:68},checking:{label:'Kontrola zdrowia',progress:86},committed:{label:'Zatwierdzanie wydania',progress:96},done:{label:'Aktualizacja zakończona',progress:100},failed:{label:'Aktualizacja przerwana',progress:100,bad:true},rollback:{label:'Przywracanie poprzedniej wersji',progress:78,warn:true},rolled_back:{label:'Przywrócono poprzednią wersję',progress:100,warn:true},rollback_failed:{label:'Wymagana interwencja administratora',progress:100,bad:true}};
  function ensureUpdateHost(){const legacy=$('#release-job');if(!legacy)return null;let host=$('#release-progress-140');if(!host){host=document.createElement('section');host.id='release-progress-140';host.hidden=true;legacy.before(host);}return {host,legacy};}
  function scheduleUpdateReload(status){const job=status?.job;if(!job||!['done','rolled_back'].includes(job.phase)||updateReloadScheduled)return;const marker='desk.update.reload';try{if(sessionStorage.getItem(marker)===job.id)return;sessionStorage.setItem(marker,job.id);}catch{}updateReloadScheduled=true;const host=$('#release-progress-140');if(host&&!host.querySelector('.update-progress-reload'))host.insertAdjacentHTML('beforeend','<div class="update-progress-reload">Strona odświeży się automatycznie za chwilę…</div>');setTimeout(()=>location.reload(),1200);}
  function renderUpdateProgress(status,offline=false){const pair=ensureUpdateHost();if(!pair)return;const {host,legacy}=pair,job=status?.job;if(!job){host.hidden=true;legacy.hidden=false;return;}const meta=updatePhaseMeta[job.phase]||{label:job.phase||'Aktualizacja',progress:5},pct=Math.max(0,Math.min(100,Number(meta.progress)||0));legacy.hidden=true;host.hidden=false;host.className=(meta.bad?'update-progress-bad ':meta.warn?'update-progress-warn ':'')+(offline?'update-progress-offline':'');const message=offline?'Połączenie zostało chwilowo przerwane. To normalne podczas restartu — oczekiwanie na ponowne uruchomienie usługi…':(job.message||meta.label),stamp=job.at?new Date(job.at).toLocaleString():'';host.innerHTML=`<div class="update-progress-heading"><strong>${escapeHtml(meta.label)}</strong><span>${pct}%</span></div><div class="update-progress-track" role="progressbar" aria-label="Postęp aktualizacji" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><p class="update-progress-message">${escapeHtml(message)}</p><div class="update-progress-meta"><span>Wersja docelowa: ${escapeHtml(job.version||'—')}</span><span>${escapeHtml(stamp)}</span></div>`;if(!offline)scheduleUpdateReload(status);}
  async function pollUpdateStatus(){if(currentRoute()!=='#/admin/updates'){stopUpdatePolling();return;}if(updatePollBusy)return;updatePollBusy=true;try{const response=await fetch('/api/desk/updates',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw new Error('status '+response.status);const status=await response.json();lastUpdateStatus=status;renderUpdateProgress(status,false);}catch{if(lastUpdateStatus?.job)renderUpdateProgress(lastUpdateStatus,true);}finally{updatePollBusy=false;}}
  function startUpdatePolling(){if(currentRoute()!=='#/admin/updates'){stopUpdatePolling();return;}if(!updatePollTimer){void pollUpdateStatus();updatePollTimer=setInterval(()=>void pollUpdateStatus(),1250);}}
  function stopUpdatePolling(){if(updatePollTimer){clearInterval(updatePollTimer);updatePollTimer=null;}updatePollBusy=false;}

  function decorate(){forceLightTheme();applySurfaceClasses();addEnterpriseNavigation();installSidebarCollapse();ensurePageIntro();completeSettingsNavigation();rebuildQueueWorkspace();rebuildTicketWorkspace();startUpdatePolling();}
  let scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;decorate();});}
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-theme']});
  addEventListener('hashchange',()=>{if(currentRoute()!=='#/queue'){queueSnapshotHTML='';queueSnapshotHeight=0;clearQueueGhost();}schedule();});
  addEventListener('DOMContentLoaded',schedule);
  addEventListener('resize',()=>{if(currentRoute()==='#/queue'&&$('.sd14-queue-ghost'))clearQueueGhost();});
  forceLightTheme();if(document.readyState!=='loading')schedule();
})();
