(() => {
  const VERSION='1.1.3';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let scheduled=false,lastHash='',queueSnapshot='';
  const route=()=>location.hash.split('?')[0];
  const normalize=s=>String(s||'').replace(/Normal(?:ny)+/g,'Normalny').replace(/Sort(?:owanie)+/g,'Sortowanie').replace(/Priorytet(?:tet)+/g,'Priorytet');

  function fixTextArtifacts(root=document){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode())){if(['SCRIPT','STYLE','TEXTAREA'].includes(n.parentElement?.tagName))continue;const clean=normalize(n.nodeValue);if(clean!==n.nodeValue)n.nodeValue=clean;}
    $$('.priority',root).forEach(el=>{
      const code=[...el.classList].find(x=>/^P[1-4]$/.test(x))||el.textContent.match(/P[1-4]/)?.[0];if(!code)return;
      const labels={P1:'Krytyczny',P2:'Wysoki',P3:'Normalny',P4:'Niski'};
      const label=normalize(el.querySelector('span')?.textContent||labels[code]||'');
      el.innerHTML=`<span class="r113-priority-code">${code}</span><span class="r113-priority-label">${label}</span>`;
    });
  }

  function enhanceQueue(){
    if(route()!=='#/queue')return;const main=$('#main');if(!main)return;main.classList.add('r113-queue-page');
    const heading=$('.page-heading',main);if(heading&&!heading.querySelector('.r113-page-help'))heading.insertAdjacentHTML('beforeend','<div class="r113-page-help"><span>Widok pracy zespołu</span><small>Filtruj, sortuj i otwieraj zgłoszenia bez przeładowywania całego pulpitu.</small></div>');
    const metrics=$('.metrics',main);if(metrics){metrics.classList.add('r113-metrics');$$(':scope > div',metrics).forEach((card,i)=>{card.classList.add('r113-metric-card');if(!card.querySelector('.r113-metric-icon'))card.insertAdjacentHTML('afterbegin',`<span class="r113-metric-icon" aria-hidden="true">${['○','◐','◷','✓'][i]||'•'}</span>`);});}
    const tabs=$('.tabs',main);if(tabs)tabs.classList.add('r113-segment-tabs');
    const filters=$('form.filters',main);if(filters&&!filters.dataset.r113){filters.dataset.r113='1';filters.classList.add('r113-filter-bar');
      const advancedNames=new Set(['type','status','archived','scope']);
      $$('label',filters).forEach(l=>{const field=$('select,input',l);if(field&&advancedNames.has(field.name))l.classList.add('r113-advanced-filter');});
      const details=$('details.date-filters',filters);if(details)details.classList.add('r113-advanced-filter');
      const toggle=document.createElement('button');toggle.type='button';toggle.className='r113-more-filters';toggle.textContent='Więcej filtrów';toggle.addEventListener('click',()=>{const open=filters.classList.toggle('r113-show-advanced');toggle.textContent=open?'Mniej filtrów':'Więcej filtrów';});
      const apply=$('button[type="submit"]',filters);if(apply)apply.before(toggle);else filters.append(toggle);
    }
    const panel=$('.panel',main);const table=panel?.querySelector('table');if(table){panel.classList.add('r113-ticket-panel');table.classList.add('r113-ticket-table');
      const headers=$$('thead th',table).map(x=>normalize(x.textContent.trim()));const sla=headers.findIndex(x=>x.startsWith('SLA')),assignee=headers.findIndex(x=>x.startsWith('Opiekun')),priority=headers.findIndex(x=>x.startsWith('Priorytet'));
      $$('tbody tr',table).forEach(tr=>{if(sla>=0&&tr.cells[sla]){tr.cells[sla].classList.add('r113-sla-cell');$$('span',tr.cells[sla]).forEach(x=>x.classList.add('r113-sla-chip'));}if(assignee>=0&&tr.cells[assignee]&&/Nieprzypisane/.test(tr.cells[assignee].textContent))tr.cells[assignee].innerHTML='<span class="r113-unassigned">Nieprzypisane</span>';if(priority>=0&&tr.cells[priority])tr.cells[priority].classList.add('r113-priority-cell');});
      const pagination=$('.pagination',panel);if(pagination)pagination.classList.add('r113-pagination');
    }
    const tools=$('[data-r112-queue-tools]',main);if(tools){tools.classList.add('r113-view-tools');const toggles=$('.r112-column-toggles',tools);if(toggles&&!toggles.previousElementSibling?.classList.contains('r113-tools-caption'))toggles.insertAdjacentHTML('beforebegin','<div class="r113-tools-caption"><strong>Widok kolejki</strong><span>Kolumny i kolejność są zapisywane dla Twojego konta.</span></div>');}
  }

  function enhancePortal(){
    if(route()!=='#/portal')return;const main=$('#main');if(!main)return;main.classList.add('r113-portal-home');
    const hero=$('.portal-hero',main);if(hero&&!hero.querySelector('.r113-portal-actions'))hero.insertAdjacentHTML('beforeend','<div class="r113-portal-actions"><a class="button primary" href="#/portal">Wybierz usługę</a><a class="button" href="#/queue?own=1">Moje zgłoszenia</a></div>');
    const grid=$('.service-grid',main);if(grid){grid.classList.add('r113-service-grid');$$('.service-card',grid).forEach((c,i)=>{c.classList.add('r113-service-card');c.style.setProperty('--service-index',i);});}
    const recent=$('.section-heading',main);if(recent)recent.classList.add('r113-recent-heading');
  }

  function enhancePublicPortal(){
    if(!location.pathname.startsWith('/portal/'))return;const main=$('#main');if(!main)return;document.body.classList.add('r113-public-portal');
    const heading=$('.page-heading',main);if(heading)heading.classList.add('r113-public-heading');
    $$('.panel',main).forEach(x=>x.classList.add('r113-public-panel'));
  }

  function enhanceSettings(){
    if(route()!=='#/settings')return;const main=$('#main');if(!main)return;main.classList.add('r113-settings-page');
    const chip=$('.version-chip',main);if(chip)chip.textContent='Wersja '+VERSION;
    const nav=$('.settings-nav',main);if(nav&&!nav.dataset.r113){nav.dataset.r113='1';nav.insertAdjacentHTML('afterbegin','<div class="r113-settings-search"><label for="r113-settings-filter">Znajdź ustawienie</label><input id="r113-settings-filter" type="search" placeholder="np. SMTP, GitHub, LDAP…"></div>');
      const input=$('#r113-settings-filter',nav);input.addEventListener('input',()=>{const q=input.value.trim().toLocaleLowerCase('pl');$$('.settings-nav-group',nav).forEach(g=>{const buttons=$$('button,a',g),hits=buttons.filter(b=>b.textContent.toLocaleLowerCase('pl').includes(q));buttons.forEach(b=>b.hidden=Boolean(q)&&!hits.includes(b));g.hidden=Boolean(q)&&!hits.length;});});
    }
    $$('.settings-nav-group',main).forEach((g,i)=>{g.classList.add('r113-settings-nav-group');if(!g.querySelector('.r113-settings-group-icon'))g.querySelector('h3')?.insertAdjacentHTML('afterbegin',`<span class="r113-settings-group-icon" aria-hidden="true">${['⌂','⚙','◉','▦','✉','↗','◇','◆'][i]||'•'}</span>`);});
    $$('.settings-row',main).forEach(x=>x.classList.add('r113-settings-row'));
    $$('.settings-block,.settings-form',main).forEach(x=>x.classList.add('r113-settings-card'));
  }

  function suppressQueueFlicker(){
    const main=$('#main');if(!main||route()!=='#/queue'){queueSnapshot='';lastHash=location.hash;return;}
    if(location.hash!==lastHash){queueSnapshot='';lastHash=location.hash;}
    const isLoading=main.children.length===1&&main.firstElementChild?.classList.contains('loading');
    if(isLoading&&queueSnapshot){main.innerHTML=queueSnapshot;main.classList.add('r113-background-refresh');return;}
    if(main.querySelector('table')&&!main.querySelector('.loading')){main.classList.remove('r113-background-refresh');queueSnapshot=main.innerHTML;}
  }

  function enhance(){scheduled=false;suppressQueueFlicker();fixTextArtifacts();enhanceQueue();enhancePortal();enhancePublicPortal();enhanceSettings();document.documentElement.dataset.deskUi='1.1.3';}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);}
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',()=>{lastHash=location.hash;queueSnapshot='';schedule();});addEventListener('DOMContentLoaded',schedule);schedule();
})();
