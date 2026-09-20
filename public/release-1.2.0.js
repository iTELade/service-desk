(() => {
  'use strict';

  const VERSION='1.5.0';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const route=()=>location.hash.split('?')[0]||'#/';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isStaff=()=>Boolean($('.workspace .sidebar nav a[href="#/board"]')||$('.workspace .sidebar nav a[href="#/settings"]')||$('.workspace .sidebar nav a[href="#/users"]'));
  const isPortal=()=>Boolean($('.portal-workspace'));

  const ROUTES={
    '#/queue':{name:'queue',crumb:'Twoja praca',intro:'Priorytetyzuj zgłoszenia, korzystaj z zapisanych widoków, filtrów, SLA i szybkiej obsługi.'},
    '#/board':{name:'board',crumb:'Twoja praca',intro:'Śledź przepływ spraw pomiędzy statusami i zarządzaj pracą zespołu w widoku Kanban.'},
    '#/portal':{name:'portal',crumb:'Kanały',intro:'Zarządzaj doświadczeniem klienta i dostępem do katalogów usług.'},
    '#/projects':{name:'projects',crumb:'Projekty',intro:'Usługi, formularze, zespół, workflow, SLA i kanały są konfigurowane w projektach.'},
    '#/users':{name:'users',crumb:'Administracja',intro:'Zarządzaj kontami, źródłami tożsamości, rolami i dostępem do systemu.'},
    '#/profile':{name:'profile',crumb:'Konto',intro:'Profil, bezpieczeństwo konta, MFA i aktywne metody logowania.'}
  };
  const DIRECT_SETTINGS_LINKS={
    'Ogólne':[['Organizacja i rejestracja','/#/settings?section=general'],['Wygląd i marka','/#/settings?section=branding']],
    'Tożsamość i dostęp':[['Użytkownicy','/#/users'],['Katalog LDAP / Active Directory','/#/directory'],['Logowanie SSO / OIDC','/#/admin/sso'],['MFA i moje konto','/#/profile'],['Wnioski o zmiany profilu','/#/admin/approvals']],
    'Zarządzanie usługami':[['Projekty','/#/projects'],['Szablony workflow i statusów','/#/admin/templates'],['Firmy i grupy klientów','/#/admin/organizations'],['Zatwierdzenia obiegu','/#/settings?section=approvals']],
    'Komunikacja':[['Domyślna poczta SMTP i kolejka','/#/settings?section=communication'],['Skrzynki zespołów · IMAP i SMTP','/#/admin/mail'],['Szablony powiadomień e-mail','/#/admin/mail-templates']],
    'Integracje':[['Przegląd integracji','/#/settings?section=integrations'],['Synchronizacja projektów','/#/admin/sync'],['GitHub Issues','/#/settings?section=github'],['Webhooki','/#/admin/webhooks'],['Baza wiedzy','/#/admin/knowledge'],['Tokeny API','/#/admin/api-tokens'],['Wtyczki','/#/settings?section=plugins']],
    'Zasoby / CMDB':[['Przegląd zasobów / CMDB','/#/settings?section=assets'],['Katalog środków trwałych','/#/admin/assets']],
    'System':[['Diagnostyka i utrzymanie','/#/settings?section=system'],['Audyt','/#/settings?section=audit'],['Wersja i aktualizacje','/#/admin/updates'],['Błędy modułów','/#/admin/events'],['Zaawansowane ustawienia systemu','/#/admin-settings']]
  };

  function forceLightTheme(){
    const root=document.documentElement;
    if(root.dataset.theme!=='light')root.dataset.theme='light';
    if(root.dataset.deskUi!==VERSION)root.dataset.deskUi=VERSION;
    if(root.style.colorScheme!=='light')root.style.colorScheme='light';
    for(const select of $$('select')){
      const values=[...select.options].map(o=>String(o.value||'').toLowerCase());
      if(!values.includes('light')||(!values.includes('dark')&&!values.includes('system')))continue;
      select.value='light';for(const option of [...select.options])if(String(option.value||'').toLowerCase()!=='light')option.remove();
      if(select.options[0]&&select.options[0].textContent!=='Jasny')select.options[0].textContent='Jasny';
    }
    for(const input of $$('input[type="radio"]'))if(['dark','system'].includes(String(input.value||'').toLowerCase())){const label=input.closest('label');if(label){if(!label.hidden)label.hidden=true;}else if(!input.hidden)input.hidden=true;}
  }

  function surfaceClasses(){
    const body=document.body;if(!body)return;
    for(const cls of [...body.classList])if(cls.startsWith('jsm-route-')||cls.startsWith('jsm-surface-')||cls.startsWith('agent-route-')||cls.startsWith('sd14-surface-')||cls==='sd143-customer-portal'||cls==='sd143-updates-view')body.classList.remove(cls);
    if($('.auth-layout')){body.classList.add('jsm-surface-auth');return;}
    if(isPortal()){body.classList.add('jsm-surface-portal');return;}
    if(!isStaff())return;
    let name=ROUTES[route()]?.name||'other';
    if(route().startsWith('#/ticket/'))name='ticket';
    else if(route().startsWith('#/project/'))name='projects';
    else if(route()==='#/settings'||route().startsWith('#/settings?')||route().startsWith('#/admin/')||route()==='#/directory'||route()==='#/admin-settings')name='settings';
    body.classList.add('jsm-surface-agent','jsm-route-'+name,'agent-route-'+name);
  }

  function addManagementNavigation(){
    if(!isStaff())return;
    const nav=$('.sidebar nav'),settings=nav?.querySelector('a[href="#/settings"]');if(!nav||!settings)return;
    let group=nav.querySelector('.jsm-management-nav');
    if(!group){group=document.createElement('div');group.className='jsm-management-nav';group.innerHTML='<span class="sd14-nav-label">OPERACJE I ZASOBY</span><a href="#/admin/knowledge"><span class="sd14-nav-dot">◇</span><span>Baza wiedzy</span></a><a href="#/admin/assets"><span class="sd14-nav-dot">◆</span><span>Assets / CMDB</span></a><a href="#/admin/mail"><span class="sd14-nav-dot">✉</span><span>Kanały pocztowe</span></a>';nav.insertBefore(group,settings);}
    const r=route();for(const link of $$('a',group)){if(link.getAttribute('href')===r)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  }

  function decorateTopbar(){
    if(!isStaff())return;
    const topbar=$('.topbar'),picker=topbar?.querySelector('.workspace-picker');if(!topbar||!picker)return;
    let product=topbar.querySelector('.jsm-product-title');
    if(!product){product=document.createElement('div');product.className='jsm-product-title';product.innerHTML='<span>Service Management</span><b>1.5</b>';topbar.prepend(product);product.append(picker);}else if(picker.parentElement!==product)product.append(picker);
  }

  function sidebarCollapse(){
    if(!isStaff())return;
    const sidebar=$('.sidebar');if(!sidebar)return;
    let button=sidebar.querySelector('[data-sd14-collapse]');
    if(!button){button=document.createElement('button');button.type='button';button.className='sd14-collapse';button.dataset.sd14Collapse='1';button.title='Zwiń lub rozwiń nawigację';button.setAttribute('aria-label','Zwiń lub rozwiń nawigację');sidebar.append(button);button.addEventListener('click',()=>{const next=!document.body.classList.contains('sd14-sidebar-collapsed');localStorage.setItem('desk.sidebar.collapsed',next?'1':'0');applySidebarState();});}
    applySidebarState();
  }
  function applySidebarState(){const button=$('[data-sd14-collapse]'),collapsed=localStorage.getItem('desk.sidebar.collapsed')==='1';document.body.classList.toggle('sd14-sidebar-collapsed',collapsed);if(button){const glyph=collapsed?'›':'‹',expanded=String(!collapsed);if(button.textContent!==glyph)button.textContent=glyph;if(button.getAttribute('aria-expanded')!==expanded)button.setAttribute('aria-expanded',expanded);}}

  function routeMeta(){const r=route();if(ROUTES[r])return ROUTES[r];if(r.startsWith('#/ticket/'))return{name:'ticket',crumb:'Zgłoszenia',intro:'Szczegóły zgłoszenia, kontekst, SLA, aktywność i działania zespołu.'};if(r.startsWith('#/project/'))return{name:'projects',crumb:'Projekty',intro:'Konfiguracja usługi i jej operacyjnego modelu obsługi.'};if(r==='#/settings'||r.startsWith('#/settings?')||r.startsWith('#/admin/')||r==='#/directory'||r==='#/admin-settings')return{name:'settings',crumb:'Administracja',intro:'Konfiguracja Service Management, bezpieczeństwa, integracji i kanałów.'};return null;}
  function ensureBreadcrumbAndIntro(){
    if(!isStaff())return;const main=$('#main'),meta=routeMeta();if(!main||!meta)return;
    if(!main.querySelector('.jsm-route-breadcrumb')){const bar=document.createElement('div');bar.className='jsm-route-breadcrumb';bar.innerHTML='<a href="#/queue">Service Management</a><span>/</span><span>'+escapeHtml(meta.crumb)+'</span>';main.prepend(bar);}
    const heading=main.querySelector('.page-heading'),title=heading?.querySelector('h1');if(title&&!heading.querySelector('.jsm-page-intro')&&!heading.querySelector('.sd14-page-intro')&&!heading.querySelector('.sd14-queue-subtitle')){const p=document.createElement('p');p.className='jsm-page-intro';p.textContent=meta.intro;title.after(p);}
  }

  function keepNewest(nodes){if(!nodes.length)return null;const keep=nodes[nodes.length-1];for(const node of nodes.slice(0,-1))node.remove();return keep;}
  let queueSnapshotHTML='',queueSnapshotHeight=0;
  function sanitizeGhost(ghost){ghost.setAttribute('aria-hidden','true');for(const node of $$('*',ghost)){node.removeAttribute('id');for(const attr of [...node.attributes])if(attr.name.startsWith('data-')||attr.name==='aria-live')node.removeAttribute(attr.name);if(/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(node.tagName)){node.tabIndex=-1;node.setAttribute('disabled','');}}}
  function clearQueueGhost(){document.querySelector('.sd14-queue-ghost')?.remove();const main=$('#main');if(main){main.classList.remove('sd14-queue-loading');main.style.removeProperty('min-height');}}
  function captureQueueSnapshot(main){if(!main||main.querySelector('.loading')||!main.querySelector('table'))return;queueSnapshotHTML=main.innerHTML;queueSnapshotHeight=Math.ceil(main.getBoundingClientRect().height);}
  function showQueueGhost(main){if(!queueSnapshotHTML||$('.sd14-queue-ghost'))return;const host=main.closest('.workspace-content');if(!host)return;const ghost=document.createElement('div');ghost.className='sd14-queue-ghost';ghost.innerHTML=queueSnapshotHTML;sanitizeGhost(ghost);host.append(ghost);ghost.style.left=main.offsetLeft+'px';ghost.style.top=main.offsetTop+'px';ghost.style.width=main.offsetWidth+'px';ghost.style.minHeight=Math.max(1,queueSnapshotHeight)+'px';main.style.minHeight=Math.max(1,queueSnapshotHeight)+'px';main.classList.add('sd14-queue-loading');}

  function rebuildQueue(){
    if(route()!=='#/queue'){clearQueueGhost();queueSnapshotHTML='';queueSnapshotHeight=0;return;}
    const main=$('#main');if(!main)return;if(main.querySelector('.loading')){showQueueGhost(main);return;}clearQueueGhost();main.classList.add('jsm-queue');
    const heading=$('.page-heading',main),metrics=$('.metrics',main),tabs=$('.tabs',main),filters=$('form.filters',main),panel=$$('.panel',main).find(n=>n.querySelector('table'));
    if(heading&&metrics){let summary=$('.jsm-queue-summary',main);if(!summary){summary=document.createElement('section');summary.className='jsm-queue-summary';heading.before(summary);}if(heading.parentElement!==summary)summary.append(heading);if(metrics.parentElement!==summary)summary.append(metrics);}
    if(tabs&&filters&&panel){let workspace=$('.jsm-queue-workspace',main);if(!workspace){workspace=document.createElement('section');workspace.className='jsm-queue-workspace sd14-queue-workspace';(heading?.closest('.jsm-queue-summary')||heading||main.firstChild)?.after?.(workspace);}if(tabs.parentElement!==workspace)workspace.append(tabs);let view=$('.sd14-view-settings',workspace);if(!view){view=document.createElement('details');view.className='sd14-view-settings';view.innerHTML='<summary>Widok, kolumny i sortowanie</summary><div class="sd14-view-settings-body"></div>';tabs.after(view);}const tools=keepNewest($$('[data-r112-queue-tools]',main));if(tools){const body=$('.sd14-view-settings-body',view);if(tools.parentElement!==body)body.append(tools);}if(filters.parentElement!==workspace)workspace.append(filters);if(panel.parentElement!==workspace)workspace.append(panel);panel.classList.add('jsm-queue-table','sd14-queue-table');}
    captureQueueSnapshot(main);
  }

  function rebuildTicket(){
    if(!route().startsWith('#/ticket/'))return;const main=$('#main');if(!main||main.querySelector('.loading'))return;const layout=$('.ticket-layout',main),heading=$('.page-heading',main);if(!layout||!heading)return;main.classList.add('jsm-ticket');
    let header=$('.sd14-ticket-header',main);if(!header){header=document.createElement('section');header.className='sd14-ticket-header jsm-ticket-header';main.insertBefore(header,layout);}else header.classList.add('jsm-ticket-header');
    const breadcrumb=$('.breadcrumb',main),current=$('.ticket-current-status',main),transitions=$('.transition-bar',main),tools=$('.ticket-tools',main);if(breadcrumb&&breadcrumb.parentElement!==header)header.append(breadcrumb);
    let titleRow=$('.sd14-ticket-title-row',header);if(!titleRow){titleRow=document.createElement('div');titleRow.className='sd14-ticket-title-row';header.append(titleRow);}if(heading.parentElement!==titleRow)titleRow.append(heading);if(current&&current.parentElement!==header)header.append(current);if(transitions&&transitions.parentElement!==header)header.append(transitions);if(tools&&tools.parentElement!==header)header.append(tools);
    const primary=layout.firstElementChild;if(primary)primary.classList.add('sd14-ticket-main');
    const attachments=keepNewest($$('[data-r112-attachments]',main));if(attachments&&primary&&attachments.parentElement!==primary){const conversation=$$('.detail-panel',primary).find(p=>p.querySelector('.conversation'));if(conversation)conversation.after(attachments);else primary.append(attachments);}
    const history=primary&&$$('.detail-panel',primary).find(p=>/^Historia zmian$/i.test(p.querySelector('h2')?.textContent?.trim()||''));if(history&&!history.dataset.jsmCollapsible){history.dataset.jsmCollapsible='1';const h=history.querySelector('h2'),body=[...history.childNodes].filter(n=>n!==h),details=document.createElement('details'),summary=document.createElement('summary');details.className='sd14-history';summary.textContent='Historia zmian';details.append(summary,...body);history.replaceWith(details);}
  }

  function decorateBoard(){if(route()!=='#/board')return;const main=$('#main');if(main&&!main.querySelector('.loading'))main.classList.add('jsm-board');}
  function decorateProjects(){if(!(route()==='#/projects'||route().startsWith('#/project/')))return;const main=$('#main');if(main&&!main.querySelector('.loading'))main.classList.add('jsm-projects');}
  function decorateUsers(){if(route()!=='#/users')return;const main=$('#main');if(main&&!main.querySelector('.loading'))main.classList.add('jsm-users');}

  function settingsCenterPresent(main=$('#main')){return Boolean(main?.querySelector('.settings-center'));}
  function looksLikeLegacySettings(main=$('#main')){return Boolean(main&&(main.querySelector('[data-form="settings"]')||main.querySelector('[data-v6="smtp"]')||main.textContent?.includes('Domyślna poczta SMTP')));}
  function recoverSettingsCenter(){if(!(route()==='#/settings'||route().startsWith('#/settings?')))return;const main=$('#main');if(!main||settingsCenterPresent(main)||!looksLikeLegacySettings(main))return;if(main.dataset.settingsRecovery===VERSION)return;delete main.dataset.settingsCenterVersion;main.dataset.settingsRecovery=VERSION;main.append(document.createComment('settings-center-recover-'+VERSION));}
  function completeSettingsNavigation(){
    if(!(route()==='#/settings'||route().startsWith('#/settings?')))return;const main=$('#main'),nav=$('.settings-nav'),chip=$('.version-chip'),versionLabel='Wersja '+VERSION;if(chip&&chip.textContent!==versionLabel)chip.textContent=versionLabel;if(!nav){recoverSettingsCenter();return;}if(main?.dataset.settingsRecovery)delete main.dataset.settingsRecovery;
    for(const group of $$('.settings-nav-group',nav)){const title=group.querySelector('h3')?.textContent?.replace(/^[^A-Za-zĄĆĘŁŃÓŚŹŻ]+/,'')?.trim(),links=DIRECT_SETTINGS_LINKS[title];if(!links)continue;const labels=new Set($$('button',group).map(b=>b.textContent.trim()));for(const [label,href] of links){if(labels.has(label)||group.querySelector(`a[href="${href}"]`))continue;const link=document.createElement('a');link.className='settings-nav-link';link.href=href;link.textContent=label;group.append(link);}}
  }

  function makeSearch(host,selector,placeholder){
    if(!host||host.querySelector('.jsm-help-search'))return;const form=document.createElement('form');form.className='jsm-help-search';form.setAttribute('role','search');form.innerHTML='<label><span>Jak możemy Ci pomóc?</span><div><input type="search" autocomplete="off" placeholder="'+escapeHtml(placeholder)+'"><button type="submit" aria-label="Szukaj">⌕</button></div></label><small class="jsm-search-count" aria-live="polite"></small>';host.append(form);
    const input=$('input',form),count=$('.jsm-search-count',form),filter=()=>{const q=input.value.trim().toLocaleLowerCase('pl');let visible=0;for(const node of $$(selector)){const hit=!q||node.textContent.toLocaleLowerCase('pl').includes(q);node.hidden=!hit;if(hit)visible++;}count.textContent=q?(visible?`Znaleziono: ${visible}`:'Brak pasujących pozycji'):'';};input.addEventListener('input',filter);form.addEventListener('submit',event=>{event.preventDefault();filter();$$(selector).find(n=>!n.hidden)?.focus?.();});
  }
  function decoratePortalHome(main){main.classList.add('jsm-portal-home');makeSearch($('.portal-hero',main),'.service-grid .service-card','np. dostęp, sprzęt, konto, awaria…');}
  function decorateProjectPortal(main){main.classList.add('jsm-portal-project');const shell=$('[class*="portal-accent-"]',main)||main;shell.classList.add('jsm-portal-project-shell');makeSearch($('.portal-hero',shell),'.service-grid .service-card','np. problem techniczny, dostęp, licencja…');for(const grid of $$('.service-grid',shell))grid.classList.add('jsm-request-list');const search=$('.portal-search',shell);if(search){search.classList.add('jsm-ticket-search');const input=$('input[name="q"]',search);if(input)input.placeholder='Szukaj w swoich zgłoszeniach';}}
  function decorateCustomerQueue(main){main.classList.add('jsm-customer-queue');const h1=$('.page-heading h1',main);if(h1&&h1.textContent!=='Moje zgłoszenia')h1.textContent='Moje zgłoszenia';}
  function decorateCustomerTicket(main){
    main.classList.add('jsm-customer-ticket');const header=$('.sd14-ticket-header',main),layout=$('.ticket-layout',main);if(header&&layout&&!header.closest('.jsm-customer-case')){const card=document.createElement('section');card.className='jsm-customer-case';header.before(card);card.append(header,layout);}const primary=$('.sd14-ticket-main',main)||layout?.firstElementChild,form=$('form[data-form="comment"]',main);if(primary&&form&&!form.closest('.jsm-customer-compose')){const wrap=document.createElement('section');wrap.className='jsm-customer-compose';wrap.innerHTML='<div class="jsm-compose-head"><strong>Dodaj odpowiedź</strong><span>Wiadomość będzie widoczna dla zespołu obsługi.</span></div>';wrap.append(form);primary.prepend(wrap);}const conversation=$('.conversation',main);if(conversation&&!conversation.previousElementSibling?.classList?.contains('jsm-activity-heading')){const h=document.createElement('h2');h.className='jsm-activity-heading';h.textContent='Aktywność';conversation.before(h);}
  }
  function decoratePortal(){if(!isPortal())return;const main=$('.portal-workspace #main');if(!main||main.querySelector('.loading'))return;const r=route();if(r==='#/portal')decoratePortalHome(main);else if(r==='#/portal-home'||(location.pathname.startsWith('/portal/')&&r==='#/'))decorateProjectPortal(main);else if(r.startsWith('#/ticket/')){rebuildTicket();decorateCustomerTicket(main);}else if(r==='#/queue')decorateCustomerQueue(main);}
  function decorateDialog(){const dialog=$('#modal');if(!dialog)return;const portalForm=$('form[data-form="create-ticket"][data-portal="true"]',dialog);dialog.classList.toggle('jsm-portal-request-dialog',Boolean(portalForm));if(portalForm&&!dialog.querySelector('.jsm-request-intro')){const intro=document.createElement('div');intro.className='jsm-request-intro';intro.innerHTML='<span>PORTAL KLIENTA</span><strong>Utwórz zgłoszenie</strong><p>Wybierz usługę i opisz sprawę. Formularz zachowuje pola oraz reguły skonfigurowane w projekcie.</p>';portalForm.before(intro);}}

  function appendInline(parent,text){const re=/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;let last=0,match;while((match=re.exec(text))){if(match.index>last)parent.append(document.createTextNode(text.slice(last,match.index)));const token=match[0];if(token.startsWith('**')){const strong=document.createElement('strong');strong.textContent=token.slice(2,-2);parent.append(strong);}else if(token.startsWith('`')){const code=document.createElement('code');code.textContent=token.slice(1,-1);parent.append(code);}else{const split=token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/),a=document.createElement('a');a.textContent=split?.[1]||token;a.href=split?.[2]||'#';a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}last=re.lastIndex;}if(last<text.length)parent.append(document.createTextNode(text.slice(last)));}
  function renderMarkdown(raw){const out=document.createElement('div');out.className='release-notes-rendered';const lines=String(raw||'').replace(/\r/g,'').split('\n');let ul=null,code=null;for(const line of lines){if(line.startsWith('```')){ul=null;if(code)code=null;else{const pre=document.createElement('pre');code=document.createElement('code');pre.append(code);out.append(pre);}continue;}if(code){code.textContent+=(code.textContent?'\n':'')+line;continue;}if(!line.trim()){ul=null;continue;}const heading=line.match(/^(#{1,4})\s+(.+)$/);if(heading){ul=null;const h=document.createElement('h'+Math.min(4,heading[1].length+1));appendInline(h,heading[2]);out.append(h);continue;}const bullet=line.match(/^\s*[-*]\s+(.+)$/);if(bullet){if(!ul){ul=document.createElement('ul');out.append(ul);}const li=document.createElement('li');appendInline(li,bullet[1]);ul.append(li);continue;}ul=null;const p=document.createElement('p');appendInline(p,line);out.append(p);}return out;}

  let updatePollTimer=null,updatePollBusy=false,lastUpdateStatus=null,updateReloadScheduled=false;
  const updatePhaseMeta={queued:{label:'Weryfikacja wydania',progress:8},pulling:{label:'Pobieranie obrazu',progress:28},backing_up:{label:'Kopia danych',progress:48},starting:{label:'Uruchamianie nowej wersji',progress:68},checking:{label:'Kontrola zdrowia',progress:86},committed:{label:'Zatwierdzanie wydania',progress:96},done:{label:'Aktualizacja zakończona',progress:100},failed:{label:'Aktualizacja przerwana',progress:100,bad:true},rollback:{label:'Przywracanie poprzedniej wersji',progress:78,warn:true},rolled_back:{label:'Przywrócono poprzednią wersję',progress:100,warn:true},rollback_failed:{label:'Wymagana interwencja administratora',progress:100,bad:true}};
  function ensureUpdateHost(){const legacy=$('#release-job');if(!legacy)return null;let host=$('#release-progress-150');if(!host){host=document.createElement('section');host.id='release-progress-150';host.hidden=true;legacy.before(host);}return{host,legacy};}
  function scheduleUpdateReload(status){const job=status?.job;if(!job||!['done','rolled_back'].includes(job.phase)||updateReloadScheduled)return;const marker='desk.update.reload';try{if(sessionStorage.getItem(marker)===job.id)return;sessionStorage.setItem(marker,job.id);}catch{}updateReloadScheduled=true;setTimeout(()=>location.reload(),1200);}
  function renderUpdateProgress(status,offline=false){const pair=ensureUpdateHost();if(!pair)return;const{host,legacy}=pair,job=status?.job;if(!job){host.hidden=true;legacy.hidden=false;return;}const meta=updatePhaseMeta[job.phase]||{label:job.phase||'Aktualizacja',progress:5},pct=Math.max(0,Math.min(100,Number(meta.progress)||0));legacy.hidden=true;host.hidden=false;host.className=(meta.bad?'update-progress-bad ':meta.warn?'update-progress-warn ':'')+(offline?'update-progress-offline':'');const message=offline?'Połączenie zostało chwilowo przerwane podczas restartu. Oczekiwanie na ponowne uruchomienie usługi…':(job.message||meta.label),stamp=job.at?new Date(job.at).toLocaleString():'';host.innerHTML=`<div class="update-progress-heading"><strong>${escapeHtml(meta.label)}</strong><span>${pct}%</span></div><div class="update-progress-track" role="progressbar" aria-label="Postęp aktualizacji" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><p class="update-progress-message">${escapeHtml(message)}</p><div class="update-progress-meta"><span>Wersja docelowa: ${escapeHtml(job.version||'—')}</span><span>${escapeHtml(stamp)}</span></div>`;if(!offline)scheduleUpdateReload(status);}
  async function pollUpdateStatus(){if(route()!=='#/admin/updates'){stopUpdatePolling();return;}if(updatePollBusy)return;updatePollBusy=true;try{const response=await fetch('/api/desk/updates',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw new Error('status '+response.status);const status=await response.json();lastUpdateStatus=status;renderUpdateProgress(status,false);}catch{if(lastUpdateStatus?.job)renderUpdateProgress(lastUpdateStatus,true);}finally{updatePollBusy=false;}}
  function startUpdatePolling(){if(route()!=='#/admin/updates'){stopUpdatePolling();return;}if(!updatePollTimer){void pollUpdateStatus();updatePollTimer=setInterval(()=>void pollUpdateStatus(),1250);}}
  function stopUpdatePolling(){if(updatePollTimer){clearInterval(updatePollTimer);updatePollTimer=null;}updatePollBusy=false;}
  function decorateUpdates(){if(route()!=='#/admin/updates')return;const main=$('#main');if(!main)return;main.classList.add('jsm-updates');const pre=$('pre.release-notes',main);if(pre){const rendered=renderMarkdown(pre.textContent);rendered.dataset.jsmRendered='1';pre.replaceWith(rendered);}}

  function decorate(){
    forceLightTheme();surfaceClasses();addManagementNavigation();decorateTopbar();sidebarCollapse();ensureBreadcrumbAndIntro();
    if(isStaff()){rebuildQueue();rebuildTicket();decorateBoard();decorateProjects();decorateUsers();completeSettingsNavigation();decorateUpdates();startUpdatePolling();}else stopUpdatePolling();
    decoratePortal();decorateDialog();
  }
  let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;decorate();});}
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-theme']});
  addEventListener('hashchange',()=>{if(route()!=='#/queue'){queueSnapshotHTML='';queueSnapshotHeight=0;clearQueueGhost();}schedule();});
  addEventListener('DOMContentLoaded',schedule);addEventListener('resize',()=>{if(route()==='#/queue'&&$('.sd14-queue-ghost'))clearQueueGhost();});
  forceLightTheme();if(document.readyState!=='loading')schedule();
})();
