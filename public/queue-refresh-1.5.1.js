(()=>{
  'use strict';

  const VERSION='1.5.1';
  const nativeSetInterval=window.setInterval.bind(window);
  const nativeAddEventListener=window.addEventListener.bind(window);
  const nativeFetch=window.fetch.bind(window);
  let refreshCallback=null;
  let probeBusy=false;

  const source=fn=>{try{return Function.prototype.toString.call(fn);}catch{return '';}};
  const isLiveRefresh=fn=>typeof fn==='function'&&source(fn).includes('refreshLiveView');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cls=value=>String(value??'').replace(/[^a-zA-Z0-9_-]/g,'');
  const setText=(node,value)=>{if(node&&node.textContent!==String(value))node.textContent=String(value);};
  const setHtml=(node,value)=>{if(node&&node.innerHTML!==value)node.innerHTML=value;};

  function dirtyControl(el){
    if(el instanceof HTMLInputElement){
      if(el.type==='checkbox'||el.type==='radio')return el.checked!==el.defaultChecked;
      return el.value!==el.defaultValue;
    }
    if(el instanceof HTMLTextAreaElement)return el.value!==el.defaultValue;
    if(el instanceof HTMLSelectElement)return [...el.options].some(o=>o.selected!==o.defaultSelected);
    return false;
  }

  function queueEditorBusy(){
    if(document.hidden||document.querySelector('dialog[open]'))return true;
    const active=document.activeElement;
    if(active?.closest?.('#main form.filters'))return true;
    return [...document.querySelectorAll('#main form.filters input,#main form.filters textarea,#main form.filters select')].some(dirtyControl);
  }

  function generalEditorBusy(){
    if(document.hidden||document.querySelector('dialog[open]'))return true;
    const active=document.activeElement;
    if(active&&active!==document.body&&active.matches?.('input,textarea,select,[contenteditable="true"]'))return true;
    return false;
  }

  function fmtDate(value){
    if(!value)return '—';
    try{return new Intl.DateTimeFormat(document.documentElement.lang==='en'?'en-GB':'pl-PL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}
    catch{return String(value);}
  }

  function duration(ms){
    let total=Math.max(0,Math.round((Number(ms)||0)/60000));
    const days=Math.floor(total/1440);total-=days*1440;
    const hours=Math.floor(total/60);const minutes=total-hours*60;
    if(days)return `${days} d ${hours} godz. ${minutes} min`;
    if(hours)return `${hours} godz. ${minutes} min`;
    return `${minutes} min`;
  }

  function statusMarkup(t){
    const category=cls(t.status_category||t.status);
    return `<span class="pill ${category}">${esc(t.status_name||t.workflow_status||t.status||'—')}</span>`;
  }

  function priorityMarkup(t){
    return `<span class="priority ${cls(t.priority)}">${esc(t.priority||'—')}</span>`;
  }

  function slaMarkup(t){
    if(!t.sla?.length)return '<span class="hint">Brak mierników</span>';
    return t.sla.map(s=>{
      let label;
      if(s.state==='not_started')label='Nie rozpoczęto';
      else if(s.state==='paused')label='Wstrzymane';
      else if(s.state==='completed')label=s.breached?'Po terminie':'W terminie';
      else if(s.state==='stopped')label='Zatrzymane';
      else label=(s.breached?'Przekroczono o ':'Pozostało ')+duration(Math.abs(Number(s.remaining_ms)||0));
      return `<span class="${s.breached?'overdue':'sla-ok'}">${esc(s.name)}: ${esc(label)}</span>`;
    }).join('<br>');
  }

  function issueMarkup(t){
    const form=t.request_form?.name||t.type||'Zgłoszenie';
    return `<a class="issue-title" href="#/ticket/${esc(t.key)}"><span class="key">${esc(t.key)}</span><span>${esc(t.title)}</span></a><small class="row-meta">${esc(t.project_name||'')} · ${esc(form)}</small>`;
  }

  function tableShape(table){
    const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim().toLocaleLowerCase('pl'));
    const index=name=>headers.findIndex(h=>h===name||h.startsWith(name));
    return {headers,issue:index('zgłoszenie'),status:index('status'),priority:index('priorytet'),assignee:index('opiekun'),sla:index('sla'),updated:index('aktualizacja')};
  }

  function rowMarkup(t,shape){
    const values=new Array(shape.headers.length).fill('');
    if(shape.issue>=0)values[shape.issue]=issueMarkup(t);
    if(shape.status>=0)values[shape.status]=statusMarkup(t);
    if(shape.priority>=0)values[shape.priority]=priorityMarkup(t);
    if(shape.assignee>=0)values[shape.assignee]=esc(t.assignee_name||'Nieprzypisane');
    if(shape.sla>=0)values[shape.sla]=slaMarkup(t);
    if(shape.updated>=0)values[shape.updated]=esc(fmtDate(t.updated_at));
    return `<tr data-live-ticket="${esc(t.key)}">${values.map((html,i)=>`<td${i===shape.updated?' class="date"':''}>${html}</td>`).join('')}</tr>`;
  }

  function patchRow(row,t,shape){
    row.dataset.liveTicket=t.key;
    const cells=row.cells;
    if(shape.issue>=0)setHtml(cells[shape.issue],issueMarkup(t));
    if(shape.status>=0)setHtml(cells[shape.status],statusMarkup(t));
    if(shape.priority>=0)setHtml(cells[shape.priority],priorityMarkup(t));
    if(shape.assignee>=0)setText(cells[shape.assignee],t.assignee_name||'Nieprzypisane');
    if(shape.sla>=0)setHtml(cells[shape.sla],slaMarkup(t));
    if(shape.updated>=0)setText(cells[shape.updated],fmtDate(t.updated_at));
  }

  function patchQueue(data,stats){
    const main=document.querySelector('#main');
    if(!main)return;

    const metricValues=[stats?.open??0,stats?.in_progress??0,stats?.waiting??0,(stats?.resolved??0)+(stats?.closed??0)];
    [...main.querySelectorAll('.metrics>div strong')].slice(0,4).forEach((node,i)=>setText(node,metricValues[i]));

    const table=main.querySelector('.panel .table-scroll table');
    const tbody=table?.tBodies?.[0];
    if(!table||!tbody)return;
    const shape=tableShape(table);
    const tickets=data?.tickets||[];
    const rows=[...tbody.rows];
    const currentKeys=rows.map(row=>row.querySelector('.key')?.textContent?.trim()||row.dataset.liveTicket||'');
    const nextKeys=tickets.map(t=>String(t.key));
    const sameShape=currentKeys.length===nextKeys.length&&currentKeys.every((key,i)=>key===nextKeys[i]);

    if(!tickets.length){
      const html=`<tr><td colspan="${Math.max(1,shape.headers.length)}"><div class="queue-live-empty">Brak zgłoszeń w tym widoku</div></td></tr>`;
      setHtml(tbody,html);
    }else if(sameShape){
      rows.forEach((row,i)=>patchRow(row,tickets[i],shape));
    }else{
      setHtml(tbody,tickets.map(t=>rowMarkup(t,shape)).join(''));
    }

    const pagination=main.querySelector('.pagination');
    if(pagination){
      const pages=Math.max(1,Math.ceil((Number(data.total)||0)/(Number(data.limit)||1)));
      setText(pagination.querySelector('span'),`${data.total} zgłoszeń · strona ${data.page} z ${pages}`);
    }
  }

  async function refreshQueueInPlace(){
    if(probeBusy||queueEditorBusy())return;
    const hash=location.hash;
    if(!/^#\/queue(?:\?|$)/.test(hash))return;
    probeBusy=true;
    try{
      const query=hash.split('?')[1]||'';
      const [ticketsResponse,statsResponse]=await Promise.all([
        nativeFetch('/api/tickets?'+query,{credentials:'same-origin',cache:'no-store'}),
        nativeFetch('/api/stats?'+query,{credentials:'same-origin',cache:'no-store'})
      ]);
      if(!ticketsResponse.ok||!statsResponse.ok)return;
      const [data,stats]=await Promise.all([ticketsResponse.json(),statsResponse.json()]);
      if(location.hash!==hash)return;
      patchQueue(data,stats);
      document.documentElement.dataset.queueLastRefresh=String(Date.now());
    }catch{}finally{probeBusy=false;}
  }

  async function guardedRefresh(fn){
    if(/^#\/queue(?:\?|$)/.test(location.hash))return refreshQueueInPlace();
    if(generalEditorBusy())return;
    try{return fn?.();}catch{}
  }

  window.setInterval=function(fn,delay,...args){
    if(Number(delay)===5000&&isLiveRefresh(fn)){
      refreshCallback=()=>fn(...args);
      return nativeSetInterval(()=>void guardedRefresh(refreshCallback),5000);
    }
    return nativeSetInterval(fn,delay,...args);
  };

  window.addEventListener=function(type,listener,options){
    if(type==='focus'&&isLiveRefresh(listener)){
      return nativeAddEventListener(type,()=>void guardedRefresh(refreshCallback||listener),options);
    }
    return nativeAddEventListener(type,listener,options);
  };

  document.documentElement.dataset.queueRefreshGuard=VERSION;
})();
