(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let sessionCache=null,searchTimer=null,lastQueueKey='',pendingCreateFiles=[];
  async function session(){if(sessionCache)return sessionCache;const r=await fetch('/api/me',{credentials:'same-origin'});if(!r.ok)throw new Error('Sesja wygasła.');sessionCache=await r.json();return sessionCache;}
  async function call(path,{method='GET',data}={}){const s=await session();const r=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(method==='GET'?{}:{'X-CSRF-Token':s.csrf})},...(data===undefined?{}:{body:JSON.stringify(data)})});let v;try{v=await r.json();}catch{throw new Error('Nieprawidłowa odpowiedź serwera.');}if(!r.ok)throw new Error(v.error||'Operacja nie powiodła się.');return v;}
  const hashParts=()=>{const [route,query='']=location.hash.split('?');return {route,query:new URLSearchParams(query)};};
  function toast(message,bad=false){const host=document.querySelector('#notices');if(!host)return;const el=document.createElement('div');el.className='notice'+(bad?' bad':'');el.textContent=message;host.append(el);setTimeout(()=>el.remove(),6000);}
  function debounce(fn,ms=220){clearTimeout(searchTimer);searchTimer=setTimeout(fn,ms);}

  function installGlobalSearch(){
    const top=document.querySelector('.topbar');if(!top||top.querySelector('[data-r112-search]'))return;
    const wrap=document.createElement('div');wrap.className='r112-global-search';wrap.dataset.r112Search='1';wrap.innerHTML='<input type="search" placeholder="Szukaj zgłoszeń, osób, firm, urządzeń…" aria-label="Globalne wyszukiwanie"><div class="r112-search-results" hidden></div>';
    top.insertBefore(wrap,top.lastElementChild);
    const input=wrap.querySelector('input'),box=wrap.querySelector('.r112-search-results');
    input.addEventListener('input',()=>debounce(async()=>{
      const q=input.value.trim();if(q.length<2){box.hidden=true;box.innerHTML='';return;}
      try{const d=await call('/desk/r112/search?q='+encodeURIComponent(q));const sections=[];
        if(d.tickets?.length)sections.push('<section><strong>Zgłoszenia</strong>'+d.tickets.map(x=>`<a href="#/ticket/${esc(x.key)}"><b>${esc(x.key)}</b><span>${esc(x.title)}</span><small>${esc(x.project_name)} · ${esc(x.priority)}</small></a>`).join('')+'</section>');
        if(d.users?.length)sections.push('<section><strong>Użytkownicy</strong>'+d.users.map(x=>`<div class="r112-search-row"><b>${esc(x.name)}</b><span>${esc(x.username||'')}</span></div>`).join('')+'</section>');
        if(d.organizations?.length)sections.push('<section><strong>Organizacje</strong>'+d.organizations.map(x=>`<div class="r112-search-row"><b>${esc(x.name)}</b></div>`).join('')+'</section>');
        if(d.assets?.length)sections.push('<section><strong>Assets / CMDB</strong>'+d.assets.map(x=>`<div class="r112-search-row"><b>${esc(x.asset_key)}</b><span>${esc(x.name)}</span><small>${esc(x.serial||x.kind||'')}</small></div>`).join('')+'</section>');
        box.innerHTML=sections.join('')||'<div class="r112-search-empty">Brak wyników.</div>';box.hidden=false;
      }catch(e){box.innerHTML=`<div class="r112-search-empty">${esc(e.message)}</div>`;box.hidden=false;}
    }));
    input.addEventListener('keydown',e=>{if(e.key==='Escape'){box.hidden=true;input.blur();}});
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))box.hidden=true;});
  }

  const headers={issue:'Zgłoszenie',status:'Status',priority:'Priorytet',assignee:'Opiekun',sla:'SLA',updated:'Aktualizacja'};
  function tableColumnMap(table){return [...table.querySelectorAll('thead th')].map((th,i)=>{const t=th.textContent.trim();const key=Object.entries(headers).find(([,label])=>t.startsWith(label))?.[0];return {key,index:i};}).filter(x=>x.key);}
  function applyColumns(pref){
    const table=document.querySelector('#main table');if(!table)return;const map=tableColumnMap(table),byKey=Object.fromEntries(map.map(x=>[x.key,x.index]));
    const order=pref.columns.filter(k=>byKey[k]!==undefined),visible=new Set(order);
    for(const row of table.rows){const cells=[...row.cells],original=[...cells];for(const k of order){const idx=byKey[k];if(original[idx])row.append(original[idx]);}for(const {key,index} of map){if(!visible.has(key)&&original[index])original[index].style.display='none';else if(original[index])original[index].style.display='';}}
  }
  function queueQueryForQuick(q,quick){
    const n=new URLSearchParams(q);for(const key of ['assignee','status','queue'])if(['mine','unassigned','waiting','active'].includes(quick))n.delete(key);
    if(quick==='mine')n.set('assignee','me');else if(quick==='unassigned')n.set('assignee','unassigned');else if(quick==='waiting')n.set('status','waiting');else if(quick==='active')n.set('queue','active');else if(quick==='oldest')n.set('sort','created_asc');
    n.delete('page');return n;
  }
  function applySecondarySort(pref){
    if(!pref.sort_secondary)return;const table=document.querySelector('#main table tbody');if(!table)return;const rows=[...table.rows];const map={updated:r=>r.cells[r.cells.length-1]?.textContent.trim()||'',priority:r=>r.textContent.includes('P1')?1:r.textContent.includes('P2')?2:r.textContent.includes('P3')?3:4,status:r=>r.cells[1]?.textContent.trim()||''};const getter=map[pref.sort_secondary.replace('_desc','').replace('_asc','')]||map.updated;rows.sort((a,b)=>String(getter(a)).localeCompare(String(getter(b)),'pl',{numeric:true}));for(const r of rows)table.append(r);
  }
  async function installQueueTools(){
    const {route,query}=hashParts();if(route!=='#/queue')return;const current=(await session()).user||await session();if(current?.role==='customer')return;const anchor=document.querySelector('#main .tabs');if(!anchor||document.querySelector('[data-r112-queue-tools]'))return;
    const project=Number(query.get('project')||0),pref=await call('/desk/r112/queue-preferences?project='+project),views=await call('/desk/v8/views').catch(()=>[]);
    const box=document.createElement('section');box.className='r112-queue-tools';box.dataset.r112QueueTools='1';
    box.innerHTML=`<div class="r112-queue-row"><label>Widok zapisany<select data-r112-view><option value="">— wybierz —</option>${views.filter(v=>!v.project_id||Number(v.project_id)===project).map(v=>`<option value="${v.id}">${esc(v.name)}${v.shared?' · wspólny':''}</option>`).join('')}</select></label><button type="button" data-r112-save-view>Zapisz bieżący widok</button><label>Szybki filtr<select data-r112-quick><option value="">Brak</option><option value="active">Otwarte</option><option value="mine">Przypisane do mnie</option><option value="unassigned">Bez opiekuna</option><option value="waiting">Oczekuje na klienta</option><option value="oldest">Najdłużej oczekujące</option><option value="sla_risk">SLA zagrożone</option></select></label><label>Sortowanie 1<select data-r112-sort1><option value="updated_desc">Ostatnio zmienione</option><option value="created_desc">Najnowsze</option><option value="created_asc">Najstarsze</option><option value="priority">Priorytet</option></select></label><label>Sortowanie 2<select data-r112-sort2><option value="">Brak</option><option value="updated">Aktualizacja</option><option value="priority">Priorytet</option><option value="status">Status</option></select></label></div><div class="r112-columns" aria-label="Kolumny kolejki">${pref.columns.map(k=>`<button type="button" draggable="true" data-column="${k}">${esc(headers[k]||k)} <span aria-hidden="true">↕</span></button>`).join('')}</div><div class="r112-column-toggles">${Object.keys(headers).map(k=>`<label><input type="checkbox" value="${k}" ${pref.columns.includes(k)?'checked':''}>${esc(headers[k])}</label>`).join('')}<button type="button" class="primary" data-r112-save-prefs>Zapisz układ</button></div>`;
    anchor.after(box);box.querySelector('[data-r112-quick]').value=pref.quick_filter||'';box.querySelector('[data-r112-sort1]').value=pref.sort_primary||'updated_desc';box.querySelector('[data-r112-sort2]').value=pref.sort_secondary||'';applyColumns(pref);applySecondarySort(pref);
    if(pref.quick_filter==='sla_risk'){for(const tr of document.querySelectorAll('#main tbody tr')){const cell=[...tr.cells].find(td=>td.textContent.includes('Pozostało')||td.textContent.includes('Przekroczono'));if(cell&&!/Przekroczono|Pozostało\s+(?:[0-9]+m|[0-1]h)/.test(cell.textContent))tr.hidden=true;}}
    box.querySelector('[data-r112-quick]').addEventListener('change',e=>{location.hash='#/queue?'+queueQueryForQuick(query,e.target.value);});
    box.querySelector('[data-r112-sort1]').addEventListener('change',e=>{const q=new URLSearchParams(query);q.set('sort',e.target.value);q.delete('page');location.hash='#/queue?'+q;});
    box.querySelector('[data-r112-view]').addEventListener('change',e=>{const v=views.find(x=>String(x.id)===e.target.value);if(!v)return;const q=new URLSearchParams();for(const [k,val] of Object.entries(v.filters||{})){if(['columns','sort_secondary','quick_filter'].includes(k))continue;if(val!==''&&val!==null&&val!==undefined)q.set(k,String(val));}location.hash='#/queue?'+q;});
    box.querySelector('[data-r112-save-view]').addEventListener('click',async()=>{const name=prompt('Nazwa widoku');if(!name)return;const filters=Object.fromEntries(query.entries());filters.columns=pref.columns;filters.sort_secondary=pref.sort_secondary;filters.quick_filter=pref.quick_filter;try{await call('/desk/v8/views',{method:'POST',data:{name,project_id:project||null,filters,shared:false,is_default:false}});toast('Widok zapisany.');}catch(e){toast(e.message,true);}});
    box.querySelector('[data-r112-save-prefs]').addEventListener('click',async()=>{const checked=new Set([...box.querySelectorAll('.r112-column-toggles input:checked')].map(x=>x.value)),dragOrder=[...box.querySelectorAll('.r112-columns [data-column]')].map(x=>x.dataset.column),columns=[...dragOrder.filter(x=>checked.has(x)),...Object.keys(headers).filter(x=>checked.has(x)&&!dragOrder.includes(x))];if(!columns.includes('issue'))columns.unshift('issue');const data={project_id:project,columns,sort_primary:box.querySelector('[data-r112-sort1]').value,sort_secondary:box.querySelector('[data-r112-sort2]').value,quick_filter:box.querySelector('[data-r112-quick]').value};try{await call('/desk/r112/queue-preferences',{method:'POST',data});toast('Układ kolejki zapisany.');lastQueueKey='';decorate();}catch(e){toast(e.message,true);}});
    let drag=null;box.querySelectorAll('.r112-columns button').forEach(btn=>{btn.addEventListener('dragstart',()=>drag=btn);btn.addEventListener('dragover',e=>e.preventDefault());btn.addEventListener('drop',e=>{e.preventDefault();if(drag&&drag!==btn)btn.before(drag);});});
  }

  async function fileBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file);});}
  async function uploadFiles(ticket,files,internal=false){for(const file of files){if(file.size>2*1024*1024){toast(`${file.name}: maksymalnie 2 MB`,true);continue;}try{await call('/desk/r112/attachments',{method:'POST',data:{ticket_key:ticket,filename:file.name,mime:file.type||'application/octet-stream',internal,data_base64:await fileBase64(file)}});toast(`Dodano załącznik: ${file.name}`);}catch(e){toast(`${file.name}: ${e.message}`,true);}}}
  async function installCreateAttachment(){const form=document.querySelector('form[data-form="create"]');if(!form||form.querySelector('[data-r112-create-files]'))return;const label=document.createElement('label');label.innerHTML='Załączniki <input type="file" multiple data-r112-create-files><small class="hint">Maks. 2 MB na plik. Zablokowane pliki wykonywalne i aktywna zawartość HTML/JS.</small>';form.querySelector('.form-actions')?.before(label);label.querySelector('input').addEventListener('change',e=>pendingCreateFiles=[...e.target.files]);}
  async function installAttachments(){
    const {route}=hashParts(),m=route.match(/^#\/ticket\/([^/]+)$/);if(!m)return;const key=decodeURIComponent(m[1]);if(document.querySelector('[data-r112-attachments]'))return;
    try{const detail=await call('/tickets/'+encodeURIComponent(key)),ticket=detail.ticket||detail,me=(await session()).user||await session();const list=await call('/desk/r112/attachments?ticket='+ticket.id);const main=document.querySelector('#main');if(!main)return;
      const section=document.createElement('section');section.className='panel detail-panel r112-attachments';section.dataset.r112Attachments='1';section.innerHTML=`<div class="r112-attachments-head"><h2>Załączniki</h2><span>${list.length}</span></div><div class="r112-attachment-list">${list.map(a=>`<div class="r112-attachment"><div><strong>${esc(a.filename)}</strong><small>${Math.ceil(a.size/1024)} KB · ${esc(a.mime)}${a.internal?' · wewnętrzny':''}${a.source==='email'?' · e-mail':''}</small></div><button type="button" data-r112-download="${esc(a.id)}">Pobierz</button></div>`).join('')||'<p class="hint">Brak załączników.</p>'}</div><div class="r112-upload"><input type="file" multiple>${me?.role!=='customer'?'<label><input type="checkbox" data-r112-internal> Wewnętrzny</label>':''}<button type="button" class="primary" data-r112-upload>Dodaj</button></div>`;main.append(section);
      section.querySelector('[data-r112-upload]').addEventListener('click',async()=>{const files=[...section.querySelector('input[type=file]').files];if(!files.length)return;await uploadFiles(key,files,Boolean(section.querySelector('[data-r112-internal]')?.checked));section.remove();decorate();});
      section.querySelectorAll('[data-r112-download]').forEach(btn=>btn.addEventListener('click',async()=>{try{const a=await call('/desk/r112/attachment/'+btn.dataset.r112Download),bytes=Uint8Array.from(atob(a.data_base64),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:a.mime}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=a.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){toast(e.message,true);}}));
      if(pendingCreateFiles.length){const files=pendingCreateFiles;pendingCreateFiles=[];await uploadFiles(key,files,false);section.remove();decorate();}
    }catch{}
  }

  async function decorate(){
    installGlobalSearch();installCreateAttachment();
    const {route,query}=hashParts(),qkey=route==='#/queue'?route+'?'+query.toString():'';
    if(qkey&&qkey!==lastQueueKey){lastQueueKey=qkey;installQueueTools().catch(e=>toast(e.message,true));}
    installAttachments();
  }
  const observer=new MutationObserver(()=>decorate());observer.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('hashchange',()=>{lastQueueKey='';setTimeout(decorate,0);});window.addEventListener('load',decorate);decorate();
})();
