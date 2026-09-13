import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {defaultWorkflow,categories,workflowEvents} from '../lib/workflows.mjs';
import {baseTypes} from '../lib/catalog.mjs';

// Renderowanie funkcji i kontrakty danych, bez przeglądarki i bez uruchamiania witryny.
function ui(){
  const elements=new Map(),events=new Map();
  const document={querySelector(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',append(){}});return elements.get(id);},addEventListener(name,fn){events.set(name,fn);}};
  const context=vm.createContext({document,window:{addEventListener(){}},location:{hash:'',pathname:'/',origin:'https://help.itelade.pl'},URLSearchParams,crypto:webcrypto,Intl,Date,console,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{}});
  vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/void boot\(\);/,''),context);
  const state=vm.runInContext('S',context),w=defaultWorkflow();
  state.user={id:1,role:'admin',name:'Admin'};state.meta={statuses:categories,types:baseTypes,priorities:{P1:'Krytyczny',P2:'Wysoki',P3:'Normalny',P4:'Niski'},workflow_events:workflowEvents,assignees:[{id:2,name:'Agent'}],projects:[{id:1,name:'Wsparcie',key:'IT',project_type:'external',can_work:true,can_manage:true,can_request:true,portal_access:'authenticated',portal_slug:'it',portal_title:'Wsparcie',workflow_statuses:w.statuses},{id:2,name:'Rozwój <img onerror=alert(1)>',key:'DEV',project_type:'internal',can_work:true,can_manage:true,workflow_statuses:w.statuses}]};
  context.mock=async()=>{throw new Error('Nieoczekiwane API');};vm.runInContext('api=(...args)=>mock(...args)',context);
  return {context,state,call:source=>vm.runInContext(source,context),elements};
}

test('Interfejs projektów pokazuje wiele projektów, tworzenie i jednoznaczną nawigację z portalu',async()=>{
  const u=ui();let html=await u.call('projectsView()');assert.match(html,/\/#\/projects\/new/);assert.match(html,/\/#\/queue\?project=1/);assert.match(html,/\/#\/queue\?project=2/);assert.ok(!html.includes('<img onerror='));
  u.call('portalShell()');html=u.elements.get('#app').innerHTML;assert.match(html,/href="\/#\/projects"/);assert.match(html,/href="\/#\/settings"/);assert.match(html,/Moje konto/);
  html=u.call('newProjectView()');assert.equal((html.match(/<form\b/g)||[]).length,1);for(const key of ['name','key','project_type','next_number','number_padding'])assert.ok(html.includes('name="'+key+'"'));
});

test('Kreator własnego formularza renderuje etykiety, kolejność, widoczność i podgląd bez wykonywania treści',async()=>{
  const u=ui();u.context.mock=async path=>path==='/projects/1'?{project:u.state.meta.projects[0]}:{id:9,version:2,name:'VPN',fields:[{key:'service',label:'Usługa <script>',type:'select',options:['VPN','<img src=x>'],required:true,visibility:'portal'},{key:'secret',label:'Wewnętrzne',type:'text',visibility:'internal',help:'Tylko zespół'}]};
  const html=await u.call("formEditorView(1,'9')");assert.equal((html.match(/<form\b/g)||[]).length,1);assert.match(html,/data-form="request-type"/);assert.match(html,/data-field-key="service"/);assert.match(html,/fieldset disabled id="form-preview-fields"/);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x>'));assert.match(html,/Tylko zespół/);
});

test('Mapa statusów i filtry renderują własne nazwy oraz zachowują warunki przy przełączaniu kolejki',async()=>{
  const u=ui(),w=defaultWorkflow();w.version=3;w.statuses.push({key:'answered',name:'Klient odpowiedział',category:'in_progress'});w.transitions.push({from:'waiting',to:'answered',actor:'team',name:'Odpowiedź'});u.context.mock=async()=>w;
  const html=await u.call('workflowView(S.meta.projects[0])');assert.equal((html.match(/<form\b/g)||[]).length,1);assert.match(html,/Klient odpowiedział/);assert.match(html,/data-state-key="answered"/);assert.match(html,/name="rule_event"/);
  const link=u.call("queueTabLink(new URLSearchParams('project=2&priority=P1&q=VPN&page=4'),'mine')");const params=new URLSearchParams(link.split('?')[1]);assert.equal(params.get('project'),'2');assert.equal(params.get('priority'),'P1');assert.equal(params.get('q'),'VPN');assert.equal(params.get('queue'),'mine');assert.equal(params.has('page'),false);
  const filters=u.call("filters(new URLSearchParams('project=1&state=1:waiting&status=waiting&assignee=2'))");assert.match(filters,/value="1:waiting" selected/);assert.match(filters,/value="2" selected>Agent/);assert.match(filters,/name="status"/);
});

test('Dane dynamicznego formularza serializują liczbę, checkbox i wielokrotny wybór zgodnie z API',()=>{
  const u=ui();u.context.form={elements:{cf_count:{value:'0'},cf_optional:{value:''},cf_yes:{checked:false},cf_multi:{selectedOptions:[{value:'A'},{value:'B'}]}}};u.context.fields=[{key:'count',type:'number'},{key:'optional',type:'number'},{key:'yes',type:'checkbox'},{key:'multi',type:'multiselect'}];
  const result=JSON.parse(JSON.stringify(u.call('customValues(form,fields)')));assert.deepEqual(result,{count:0,optional:null,yes:false,multi:['A','B']});
});

test('Gotowy schemat nie jest dostępny, a edytor zachowuje własne reguły',async()=>{
  const u=ui(),w=defaultWorkflow();w.version=1;u.context.mock=async()=>w;
  const html=await u.call('workflowView(S.meta.projects[0])');assert.ok(!html.includes('resolution-preset'));assert.ok(!html.includes('Gotowy schemat'));assert.match(html,/Dodaj regułę/);
});

test('Edytor reguł renderuje wyzwalacze czasowe, warunki, akcje i bezpieczny komentarz bota',()=>{
  const u=ui();u.context.r={id:'timed',name:'Zamknij',event:'status_elapsed',from:'resolved',enabled:true,after:{value:5,unit:'days'},match:'any',conditions:[{field:'priority',op:'eq',value:'P1'}],actions:[{type:'comment',body:'{{ticket.key}} <script>alert(1)</script>',internal:true},{type:'status',value:'closed'},{type:'lock'}]};u.context.map=categories;
  const html=u.call('ruleRow(r,map)');assert.match(html,/name="rule_delay" value="5"/);assert.match(html,/value="status_elapsed" selected/);assert.match(html,/value="any" selected/);assert.equal((html.match(/class="automation-action"/g)||[]).length,3);
  assert.ok(!html.includes('<script>'));assert.match(html,/name="action_internal" checked/);assert.match(html,/name="condition_field"/);
  const hidden=u.call("ruleRow({...r,event:'customer_reply'},map)");assert.match(hidden,/class="rule-delay form-row" hidden/);
});

test('Portal zamkniętej sprawy nie pokazuje klientowi formularza odpowiedzi; bot ma widoczne oznaczenie',async()=>{
  const u=ui();u.state.user={id:3,role:'customer'};u.context.mock=async()=>({ticket:{key:'IT-4',title:'Test',description:'Opis',status:'closed',status_name:'Zamknięte',project_name:'Wsparcie',transitions:[],customer_reply_locked:true,can_work:false,priority:'P3',created_at:'2026-09-01',updated_at:'2026-09-11',response_due_at:'2026-09-02',resolution_due_at:'2026-09-03'},comments:[{author_name:'iTELade Bot',is_bot:1,body:'Zamknięto IT-4',created_at:'2026-09-11'}],activity:[],agents:[]});
  const html=await u.call("detailView('IT-4',0)");assert.ok(!html.includes('data-form="comment"'));assert.ok(!html.includes('Otwórz je ponownie'));assert.ok(!html.includes('Historia zmian'));assert.match(html,/class="bot-label"/);
});
