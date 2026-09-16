(() => {
  const VERSION='1.2.4';
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

  function install124Styles(){
    if($('#desk-ui-124'))return;
    const style=document.createElement('style');style.id='desk-ui-124';style.textContent=`
      /* Service Desk 1.2.4 — queue and ticket views rebuilt as coherent JSM-style work surfaces. */
      body.v114-agent{--v124-bg:#f7f8fa;--v124-surface:#fff;--v124-border:#dfe1e6;--v124-text:#172b4d;--v124-muted:#626f86;--v124-blue:#0c66e4;--v124-soft:#f1f2f4}
      body.v114-agent .workspace-content{background:var(--v124-bg)!important}
      body.v114-agent #main{max-width:1680px!important;margin:0 auto!important;padding:28px 32px 56px!important}
      body.v114-agent #main>.page-heading{margin:0 0 24px!important;padding:0!important;min-height:0!important}
      body.v114-agent #main>.page-heading h1{font-size:28px!important;line-height:1.2!important;font-weight:650!important;letter-spacing:-.025em!important;color:var(--v124-text)!important}
      body.v114-agent #main>.page-heading .eyebrow{font-size:11px!important;letter-spacing:.08em!important;color:var(--v124-muted)!important}

      body.v114-agent.agent-route-queue #main.v124-queue{display:block!important}
      body.v114-agent.agent-route-queue .metrics{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important;margin:0 0 18px!important;padding:0!important;border:0!important;background:transparent!important}
      body.v114-agent.agent-route-queue .metrics>div{min-width:0!important;padding:16px 18px!important;border:1px solid var(--v124-border)!important;border-radius:8px!important;background:var(--v124-surface)!important;box-shadow:0 1px 2px rgba(9,30,66,.06)!important}
      body.v114-agent.agent-route-queue .metrics span{font-size:12px!important;color:var(--v124-muted)!important}
      body.v114-agent.agent-route-queue .metrics strong{font-size:26px!important;line-height:1.2!important;margin-top:7px!important;color:var(--v124-text)!important}
      body.v114-agent.agent-route-queue .tabs{display:flex!important;align-items:center!important;gap:22px!important;margin:0 0 14px!important;border-bottom:1px solid var(--v124-border)!important;background:transparent!important}
      body.v114-agent.agent-route-queue .tabs a{padding:9px 2px 11px!important;font-size:12px!important;color:var(--v124-muted)!important;border-bottom:2px solid transparent!important}
      body.v114-agent.agent-route-queue .tabs a[aria-current]{color:var(--v124-blue)!important;border-bottom-color:var(--v124-blue)!important}
      body.v114-agent.agent-route-queue .r112-queue-tools{display:block!important;margin:0 0 12px!important;padding:14px!important;border:1px solid var(--v124-border)!important;border-radius:8px!important;background:var(--v124-surface)!important;box-shadow:0 1px 2px rgba(9,30,66,.04)!important}
      body.v114-agent.agent-route-queue .r112-queue-row{display:grid!important;grid-template-columns:repeat(5,minmax(150px,1fr))!important;gap:10px!important;align-items:end!important}
      body.v114-agent.agent-route-queue .r112-queue-row label{min-width:0!important;font-size:11px!important;color:var(--v124-muted)!important}
      body.v114-agent.agent-route-queue .r112-columns,body.v114-agent.agent-route-queue .r112-column-toggles{display:flex!important;align-items:center!important;gap:6px!important;flex-wrap:wrap!important;margin-top:10px!important;padding-top:10px!important;border-top:1px solid #f0f1f3!important}
      body.v114-agent.agent-route-queue .r112-columns button{min-height:30px!important;padding:4px 8px!important;font-size:10px!important;background:var(--v124-soft)!important;border-color:transparent!important}
      body.v114-agent.agent-route-queue .r112-column-toggles label{display:inline-flex!important;flex-direction:row!important;align-items:center!important;gap:5px!important;font-size:10px!important;font-weight:500!important;color:var(--v124-muted)!important}
      body.v114-agent.agent-route-queue form.filters{display:grid!important;grid-template-columns:minmax(240px,1.4fr) repeat(5,minmax(140px,.8fr)) auto auto!important;gap:10px!important;align-items:end!important;margin:0 0 12px!important;padding:14px!important;border:1px solid var(--v124-border)!important;border-radius:8px!important;background:var(--v124-surface)!important}
      body.v114-agent.agent-route-queue form.filters label{min-width:0!important;font-size:11px!important;color:var(--v124-muted)!important}
      body.v114-agent.agent-route-queue form.filters input,body.v114-agent.agent-route-queue form.filters select{min-height:36px!important;padding:6px 9px!important;font-size:12px!important}
      body.v114-agent.agent-route-queue .v120-issue-list,body.v114-agent.agent-route-queue #main>.panel{width:100%!important;border:1px solid var(--v124-border)!important;border-radius:8px!important;background:var(--v124-surface)!important;box-shadow:0 1px 2px rgba(9,30,66,.04)!important;overflow:hidden!important}
      body.v114-agent.agent-route-queue table{font-size:12px!important}
      body.v114-agent.agent-route-queue th{height:42px!important;padding:10px 12px!important;background:#fafbfc!important;color:var(--v124-muted)!important;font-size:10px!important;text-transform:uppercase!important;letter-spacing:.04em!important}
      body.v114-agent.agent-route-queue td{padding:12px!important;border-bottom:1px solid #f0f1f3!important}
      body.v114-agent.agent-route-queue .issue-title{font-size:12px!important;line-height:1.35!important}
      body.v114-agent.agent-route-queue .row-meta{font-size:10px!important;color:var(--v124-muted)!important}

      body.v114-agent.agent-route-ticket #main.v124-ticket{max-width:1600px!important;padding-top:20px!important}
      body.v114-agent.agent-route-ticket .ticket-current-status{display:flex!important;align-items:center!important;gap:8px!important;margin:0 0 8px!important;font-size:11px!important;color:var(--v124-muted)!important}
      body.v114-agent.agent-route-ticket .transition-bar{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;margin:0 0 18px!important;padding:0 0 16px!important;border-bottom:1px solid var(--v124-border)!important}
      body.v114-agent.agent-route-ticket .transition-bar button{min-height:34px!important;padding:6px 11px!important;font-size:11px!important;border-radius:4px!important}
      body.v114-agent.agent-route-ticket .breadcrumb{margin:0 0 12px!important;font-size:11px!important;color:var(--v124-muted)!important}
      body.v114-agent.agent-route-ticket #main>.page-heading{align-items:flex-start!important;margin-bottom:14px!important}
      body.v114-agent.agent-route-ticket #main>.page-heading h1{max-width:1050px!important;font-size:26px!important;line-height:1.25!important}
      body.v114-agent.agent-route-ticket .ticket-tools{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:wrap!important;margin:0 0 22px!important;padding:0 0 14px!important;border-bottom:1px solid var(--v124-border)!important}
      body.v114-agent.agent-route-ticket .ticket-tools button,body.v114-agent.agent-route-ticket .ticket-tools .button{min-height:32px!important;padding:5px 9px!important;font-size:10px!important;background:#fff!important}
      body.v114-agent.agent-route-ticket .ticket-layout{display:grid!important;grid-template-columns:minmax(0,1fr) 340px!important;gap:32px!important;align-items:start!important;width:100%!important}
      body.v114-agent.agent-route-ticket .ticket-layout>div:first-child{display:flex!important;flex-direction:column!important;gap:16px!important;min-width:0!important}
      body.v114-agent.agent-route-ticket .ticket-layout>div:first-child>.detail-panel{margin:0!important;padding:18px 20px!important;border:1px solid var(--v124-border)!important;border-radius:8px!important;background:var(--v124-surface)!important;box-shadow:0 1px 2px rgba(9,30,66,.04)!important}
      body.v114-agent.agent-route-ticket .ticket-layout>div:first-child>.detail-panel>h2,body.v114-agent.agent-route-ticket .ticket-layout>div:first-child>.detail-panel .section-heading h2{font-size:15px!important;color:var(--v124-text)!important;margin:0 0 14px!important}
      body.v114-agent.agent-route-ticket .ticket-layout>div:first-child>.detail-panel .prose,body.v114-agent.agent-route-ticket .ticket-layout>div:first-child>.detail-panel .ticket-description{font-size:13px!important;line-height:1.7!important;color:#44546f!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important}
      body.v114-agent.agent-route-ticket .conversation{display:flex!important;flex-direction:column!important;gap:10px!important}
      body.v114-agent.agent-route-ticket .conversation .comment{padding:12px 14px!important;border:1px solid var(--v124-border)!important;border-radius:6px!important;background:#fff!important}
      body.v114-agent.agent-route-ticket form[data-form="comment"]{margin-top:12px!important;padding:14px!important;border:1px solid var(--v124-border)!important;border-radius:8px!important;background:#fafbfc!important}
      body.v114-agent.agent-route-ticket form[data-form="comment"] textarea{min-height:120px!important;font-size:12px!important;background:#fff!important}
      body.v114-agent.agent-route-ticket .ticket-sidebar{position:sticky!important;top:78px!important;display:flex!important;flex-direction:column!important;gap:12px!important;max-height:calc(100vh - 92px)!important;overflow:auto!important;padding-right:3px!important}
      body.v114-agent.agent-route-ticket .ticket-sidebar>.panel,body.v114-agent.agent-route-ticket .ticket-sidebar>.detail-panel{margin:0!important;padding:16px!important;border:1px solid var(--v124-border)!important;border-radius:8px!important;background:#fff!important;box-shadow:0 1px 2px rgba(9,30,66,.04)!important}
      body.v114-agent.agent-route-ticket .ticket-sidebar h2{font-size:14px!important;margin:0 0 12px!important;color:var(--v124-text)!important}
      body.v114-agent.agent-route-ticket .ticket-sidebar label{font-size:10px!important;color:var(--v124-muted)!important}
      body.v114-agent.agent-route-ticket .ticket-sidebar select,body.v114-agent.agent-route-ticket .ticket-sidebar input{min-height:36px!important;font-size:11px!important}
      body.v114-agent.agent-route-ticket .ticket-sidebar dl{grid-template-columns:92px minmax(0,1fr)!important;gap:8px 10px!important}
      body.v114-agent.agent-route-ticket .ticket-sidebar dt{font-size:9px!important;color:var(--v124-muted)!important}
      body.v114-agent.agent-route-ticket .ticket-sidebar dd{font-size:11px!important;color:var(--v124-text)!important}
      body.v114-agent.agent-route-ticket .r112-attachments{order:90!important;margin:0!important;padding:18px 20px!important;border:1px solid var(--v124-border)!important;border-radius:8px!important;background:#fff!important;box-shadow:0 1px 2px rgba(9,30,66,.04)!important}
      body.v114-agent.agent-route-ticket .r112-attachments-head{display:flex!important;align-items:center!important;justify-content:space-between!important;margin-bottom:12px!important}
      body.v114-agent.agent-route-ticket .r112-attachments-head h2{margin:0!important;font-size:15px!important}
      body.v114-agent.agent-route-ticket .r112-upload{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto!important;gap:10px!important;align-items:center!important;margin-top:12px!important;padding-top:12px!important;border-top:1px solid var(--v124-border)!important}
      body.v114-agent.agent-route-ticket .r112-upload label{display:flex!important;flex-direction:row!important;align-items:center!important;gap:6px!important;font-size:10px!important}
      body.v114-agent.agent-route-ticket .r112-upload button{min-height:34px!important;font-size:11px!important}
      body.v114-agent.agent-route-ticket .r112-attachment{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding:9px 0!important;border-bottom:1px solid #f0f1f3!important}
      body.v114-agent.agent-route-ticket .r112-attachment:last-child{border-bottom:0!important}

      @media(max-width:1220px){
        body.v114-agent.agent-route-queue .r112-queue-row{grid-template-columns:repeat(3,minmax(160px,1fr))!important}
        body.v114-agent.agent-route-queue form.filters{grid-template-columns:repeat(3,minmax(160px,1fr))!important}
        body.v114-agent.agent-route-ticket .ticket-layout{grid-template-columns:minmax(0,1fr) 300px!important;gap:20px!important}
      }
      @media(max-width:920px){
        body.v114-agent #main{padding:20px 16px 40px!important}
        body.v114-agent.agent-route-queue .metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        body.v114-agent.agent-route-ticket .ticket-layout{grid-template-columns:1fr!important}
        body.v114-agent.agent-route-ticket .ticket-sidebar{position:static!important;max-height:none!important;overflow:visible!important}
      }
      @media(max-width:640px){
        body.v114-agent.agent-route-queue .metrics,body.v114-agent.agent-route-queue .r112-queue-row,body.v114-agent.agent-route-queue form.filters{grid-template-columns:1fr!important}
        body.v114-agent.agent-route-ticket .r112-upload{grid-template-columns:1fr!important}
      }
    `;document.head.append(style);
  }

  function queuePolish(){
    if(route()!=='#/queue')return;const main=$('#main');if(!main)return;
    main.classList.add('v124-queue');
    $('.metrics',main)?.setAttribute('aria-label','Podsumowanie kolejki');
    const panel=$('.panel',main);if(panel?.querySelector('table'))panel.classList.add('v120-issue-list');
    const filters=$('form.filters',main);if(filters)filters.classList.add('v120-filters');
    $$('.r113-sla-chip',main).forEach(el=>{el.title=el.textContent.trim();el.textContent=el.textContent.replace(/^Pierwsza odpowiedź:\s*/,'Odpowiedź · ').replace(/^Rozwiązanie:\s*/,'Rozwiązanie · ');});
  }

  function ticketPolish(){
    if(!route().startsWith('#/ticket/'))return;const main=$('#main');if(!main)return;
    main.classList.add('v124-ticket');
    const layout=$('.ticket-layout',main);layout?.classList.add('v120-ticket-layout');
    $('.ticket-sidebar',main)?.classList.add('v120-ticket-sidebar');
    $('.ticket-current-status',main)?.classList.add('v120-current-status');
    $('.transition-bar',main)?.classList.add('v120-ticket-actions');
    $('.ticket-tools',main)?.classList.add('v120-ticket-tools');
    $('.conversation',main)?.classList.add('v120-conversation');
    const heading=$('.page-heading',main);if(heading&&!heading.querySelector('.v120-ticket-kicker')){
      const key=heading.querySelector('.eyebrow')?.textContent?.trim();if(key)heading.classList.add('v120-issue-heading');
    }
    const attachments=$$('[data-r112-attachments]',main);
    if(attachments.length){
      const keep=attachments[0];for(const duplicate of attachments.slice(1))duplicate.remove();
      const left=layout?.firstElementChild;if(left&&keep.parentElement!==left)left.append(keep);
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

  function enhance(){scheduled=false;surfaceClasses();install124Styles();addAdminNav();collapseSidebarControl();cleanSettingsNavigation();queuePolish();ticketPolish();tablesAndCards();settingsPolish();portalPolish();updateHotfix();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);addEventListener('DOMContentLoaded',schedule);schedule();
})();
