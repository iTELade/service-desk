(() => {
  const VERSION='1.1.4';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let scheduled=false;
  const route=()=>location.hash.split('?')[0]||'#/' ;
  const staffWorkspace=()=>Boolean($('.workspace .sidebar nav a[href="#/board"]')||$('.workspace .sidebar nav a[href="#/users"]')||$('.workspace .sidebar nav a[href="#/settings"]'));

  function routeClass(){
    const body=document.body;if(!body)return;
    [...body.classList].filter(x=>x.startsWith('agent-route-')).forEach(x=>body.classList.remove(x));
    if(!staffWorkspace()){body.classList.remove('v114-agent');return;}
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
    document.documentElement.dataset.deskUi='1.1.4';
  }

  function cleanSettingsNavigation(){
    if(route()!=='#/settings')return;
    const nav=$('.settings-nav');if(!nav)return;
    for(const group of $$('.settings-nav-group',nav)){
      const buttons=$$('button',group);
      for(const link of $$('.settings-nav-link',group)){
        const duplicate=buttons.some(b=>b.textContent.trim()===link.textContent.trim());
        if(duplicate)link.remove();
        else link.toggleAttribute('aria-current',link.getAttribute('href')===location.hash||link.getAttribute('href')==='/'+location.hash);
      }
    }
  }

  function normalizeQueue(){
    if(route()!=='#/queue')return;
    const main=$('#main');if(!main)return;
    const metrics=$('.metrics',main);if(metrics)metrics.setAttribute('aria-label','Podsumowanie kolejki');
    const panel=$('.panel',main);if(panel?.querySelector('table'))panel.classList.add('v114-issue-list');
    const filters=$('form.filters',main);if(filters)filters.classList.add('v114-filters');
    $$('.r113-sla-chip',main).forEach(el=>{
      el.title=el.textContent.trim();
      el.textContent=el.textContent.replace(/^Pierwsza odpowiedź:\s*/,'Odpowiedź · ').replace(/^Rozwiązanie:\s*/,'Rozwiązanie · ');
    });
  }

  function enhanceTicket(){
    if(!route().startsWith('#/ticket/'))return;
    const main=$('#main');if(!main)return;
    const layout=$('.ticket-layout',main);if(layout){layout.classList.add('v114-ticket-layout');const side=$('.ticket-sidebar',layout);if(side)side.classList.add('v114-ticket-sidebar');}
    const current=$('.ticket-current-status',main);if(current)current.classList.add('v114-current-status');
    const transitions=$('.transition-bar',main);if(transitions)transitions.classList.add('v114-ticket-actions');
    const tools=$('.ticket-tools',main);if(tools)tools.classList.add('v114-ticket-tools');
    const conversation=$('.conversation',main);if(conversation)conversation.classList.add('v114-conversation');
    const firstMain=layout?.firstElementChild;
    if(firstMain&&!firstMain.querySelector('.v114-activity-title')){
      const conversationPanel=$$('.detail-panel',firstMain).find(p=>p.querySelector('.conversation'));
      if(conversationPanel){const h=conversationPanel.querySelector('.section-heading');if(h)h.classList.add('v114-activity-title');}
    }
  }

  function enhanceLists(){
    if(!staffWorkspace())return;
    $$('#main>.panel table, #main .panel>.table-scroll>table').forEach(t=>t.classList.add('v114-data-table'));
    $$('.banner',document).forEach(b=>b.classList.add('v114-banner'));
  }

  function enhance(){
    scheduled=false;routeClass();if(!document.body.classList.contains('v114-agent'))return;
    cleanSettingsNavigation();normalizeQueue();enhanceTicket();enhanceLists();
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);addEventListener('DOMContentLoaded',schedule);schedule();
})();
