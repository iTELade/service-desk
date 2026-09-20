(()=>{
  'use strict';

  const VERSION='1.6.0';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const currentRoute=()=>location.hash.split('?')[0]||'';
  const norm=value=>String(value||'').replace(/\s+/g,' ').trim();
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let scheduled=false;

  function headingPanel(root,matcher){
    return $$('.detail-panel',root).find(panel=>matcher(norm(panel.querySelector('h2')?.textContent)));
  }

  function ticketPanels(main){
    const layout=$('.ticket-layout',main),primary=layout?.firstElementChild;
    if(!layout||!primary)return null;
    const description=headingPanel(primary,text=>/^Opis$/i.test(text));
    const conversation=$$('.detail-panel',primary).find(panel=>panel.querySelector('.conversation'))||null;
    const related=headingPanel(primary,text=>/Powiązania|urządzenia/i.test(text));
    const history=$('.sd14-history',primary)||headingPanel(primary,text=>/^Historia zmian$/i.test(text));
    const attachments=$('[data-r112-attachments]',primary)||$('[data-r112-attachments]',main);
    return {layout,primary,description,conversation,related,history,attachments};
  }

  function setActivity(main,name){
    const parts=ticketPanels(main);if(!parts)return;
    const map={comments:parts.conversation,attachments:parts.attachments,related:parts.related,history:parts.history};
    const available=Object.entries(map).filter(([,node])=>node);
    if(!map[name])name=available[0]?.[0]||'comments';
    main.dataset.jira16Activity=name;
    for(const [key,node] of available){
      node.hidden=key!==name;
      node.dataset.jira16ActivityPanel=key;
    }
    for(const button of $$('.jira16-activity-tabs button',main)){
      const active=button.dataset.jira16Tab===name;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
    }
  }

  function ensureActivity(main,parts){
    const entries=[
      ['comments','Komentarze',parts.conversation],
      ['attachments','Załączniki',parts.attachments],
      ['related','Powiązania',parts.related],
      ['history','Historia',parts.history]
    ].filter(([, ,node])=>node);
    if(!entries.length)return;
    const signature=entries.map(([key])=>key).join('|');
    let tabs=$('.jira16-activity-tabs',parts.primary);
    if(!tabs){
      tabs=document.createElement('div');
      tabs.className='jira16-activity-tabs';
      tabs.setAttribute('role','tablist');
      const anchor=parts.conversation||parts.attachments||parts.related||parts.history;
      anchor?.before(tabs);
    }
    if(tabs.dataset.signature!==signature){
      tabs.dataset.signature=signature;
      tabs.innerHTML=entries.map(([key,label])=>`<button type="button" role="tab" data-jira16-tab="${key}">${escapeHtml(label)}</button>`).join('');
      for(const button of $$('button',tabs))button.addEventListener('click',()=>setActivity(main,button.dataset.jira16Tab));
    }
    const requested=main.dataset.jira16Activity||'comments';
    setActivity(main,requested);
  }

  function decorateTicket(){
    if(!currentRoute().startsWith('#/ticket/'))return;
    const main=$('#main');
    if(!main||main.querySelector('.loading'))return;
    const header=$('.jsm-ticket-header',main)||$('.sd14-ticket-header',main);
    const parts=ticketPanels(main);
    if(!header||!parts)return;

    main.classList.add('jira16-ticket');
    document.body.classList.add('jira16-agent-ticket');

    let context=$('.jira16-ticket-context',header);
    if(!context){
      context=document.createElement('div');
      context.className='jira16-ticket-context';
      const breadcrumb=norm($('.breadcrumb',header)?.textContent||$('.breadcrumb',main)?.textContent);
      const eyebrow=norm($('.page-heading .eyebrow',header)?.textContent);
      const routeKey=decodeURIComponent(currentRoute().split('/').pop()||'');
      context.innerHTML=`<span class="jira16-type">Service request</span><span class="jira16-separator">/</span><span class="jira16-context-text">${escapeHtml(breadcrumb||eyebrow||routeKey)}</span>`;
      header.prepend(context);
    }

    if(parts.description)parts.description.classList.add('jira16-description-panel');
    if(parts.conversation)parts.conversation.classList.add('jira16-conversation-panel');
    if(parts.related)parts.related.classList.add('jira16-related-panel');
    if(parts.history)parts.history.classList.add('jira16-history-panel');
    if(parts.attachments)parts.attachments.classList.add('jira16-attachments-panel');
    parts.layout.classList.add('jira16-ticket-layout');
    parts.primary.classList.add('jira16-ticket-primary');

    const sidebar=$('.ticket-sidebar',parts.layout);
    if(sidebar){
      sidebar.classList.add('jira16-inspector');
      const cards=[...sidebar.children].filter(node=>node.matches?.('.panel,.detail-panel'));
      cards.forEach((card,index)=>card.dataset.jira16InspectorCard=String(index+1));
    }

    ensureActivity(main,parts);
  }

  const settingsIcons={
    'Start':'⌂',
    'Ogólne':'⚙',
    'Tożsamość i dostęp':'♙',
    'Zarządzanie usługami':'▦',
    'Komunikacja':'✉',
    'Integracje':'⌘',
    'Zasoby / CMDB':'◆',
    'System':'◈'
  };

  function filterSettings(nav,query){
    const needle=norm(query).toLocaleLowerCase('pl');
    let visible=0;
    for(const group of $$('.settings-nav-group',nav)){
      let groupVisible=0;
      for(const item of $$('button,.settings-nav-link,a',group)){
        const match=!needle||norm(item.textContent).toLocaleLowerCase('pl').includes(needle)||norm(group.querySelector('h3')?.textContent).toLocaleLowerCase('pl').includes(needle);
        item.hidden=!match;
        if(match)groupVisible++;
      }
      group.hidden=groupVisible===0;
      if(groupVisible)visible+=groupVisible;
    }
    let empty=$('.jira16-settings-empty-filter',nav);
    if(!empty){empty=document.createElement('div');empty.className='jira16-settings-empty-filter';empty.textContent='Brak ustawień pasujących do wyszukiwania.';nav.append(empty);}
    empty.hidden=visible>0;
  }

  function settingsNavHeader(nav){
    let header=$('.jira16-settings-nav-head',nav);
    if(!header){
      header=document.createElement('div');
      header.className='jira16-settings-nav-head';
      header.innerHTML='<span class="jira16-admin-kicker">Service Management</span><strong>Administracja</strong><label class="jira16-settings-filter"><input type="search" autocomplete="off" placeholder="Szukaj ustawień…" aria-label="Szukaj ustawień"></label>';
      nav.prepend(header);
      const input=$('input',header);
      input.addEventListener('input',()=>filterSettings(nav,input.value));
      input.addEventListener('keydown',event=>{if(event.key==='Escape'){input.value='';filterSettings(nav,'');input.blur();}});
    }
    return header;
  }

  function decorateSettings(){
    const route=currentRoute();
    if(route!=='#/settings')return;
    const main=$('#main');
    if(!main||main.querySelector('.loading'))return;
    const center=$('.settings-center',main)||$('.settings-shell',main);
    if(!center)return;

    main.classList.add('jira16-settings');
    document.body.classList.add('jira16-agent-settings');
    main.dataset.jira16Settings=VERSION;

    const pageHead=[...main.children].find(node=>node.classList?.contains('settings-section-head')&&node!==$('.settings-content .settings-section-head',main));
    if(pageHead)pageHead.classList.add('jira16-settings-page-head');

    const nav=$('.settings-nav',center);
    if(nav){
      settingsNavHeader(nav);
      for(const group of $$('.settings-nav-group',nav)){
        const title=group.querySelector('h3');
        if(title){
          const clean=norm(title.textContent);
          title.dataset.jira16Icon=settingsIcons[clean]||'·';
        }
      }
      const input=$('.jira16-settings-filter input',nav);
      if(input?.value)filterSettings(nav,input.value);
    }

    const content=$('.settings-content',center);
    if(content){
      content.dataset.jira16Content='1';
      const head=$(':scope > .settings-section-head',content);
      if(head)head.classList.add('jira16-settings-content-head');
      for(const row of $$('.settings-row',content))row.classList.add('jira16-settings-row');
      for(const block of $$('.settings-block,.settings-form',content))block.classList.add('jira16-settings-card');
    }

    for(const chip of $$('.version-chip',main))chip.textContent='Wersja '+VERSION;
  }

  function clearRouteClasses(){
    if(!currentRoute().startsWith('#/ticket/'))document.body.classList.remove('jira16-agent-ticket');
    if(currentRoute()!=='#/settings')document.body.classList.remove('jira16-agent-settings');
  }

  function apply(){
    scheduled=false;
    document.documentElement.dataset.agentExperience=VERSION;
    clearRouteClasses();
    decorateTicket();
    decorateSettings();
    for(const chip of $$('.version-chip'))if(chip.textContent!==`Wersja ${VERSION}`)chip.textContent=`Wersja ${VERSION}`;
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  }

  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  window.addEventListener('popstate',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
