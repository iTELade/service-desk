import { portableCustomerLayouts } from './customer-layout.mjs';
import { fail, text, boolean, integer } from './core.mjs';
export function portableProcessSettings(input={},forms=[]) {
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Nieprawidłowe ustawienia procesu szablonu.');
  const out={};
  if(input.customer_form_layouts!==undefined)out.customer_form_layouts=portableCustomerLayouts(input.customer_form_layouts,forms);
  if(input.versioned_process!==undefined)out.versioned_process=boolean(input.versioned_process,'Wersjonowanie procesu');
  for(const kind of ['transition_conditions','plugin_conditions'])if(input[kind]!==undefined){
    const rules=input[kind];if(!rules||typeof rules!=='object'||Array.isArray(rules)||Object.keys(rules).length>30)fail(400,'Nieprawidłowe warunki procesu.');out[kind]={};
    for(const [status,rule] of Object.entries(rules)){if(!/^[a-z][a-z0-9_]{0,49}$/.test(status)||['constructor','prototype','__proto__'].includes(status))fail(400,'Nieprawidłowy status warunku.');
      if(kind==='transition_conditions'){if(!rule||!Array.isArray(rule.fields)||rule.fields.length>30)fail(400,'Nieprawidłowe pola warunku.');out[kind][status]={fields:rule.fields.map(f=>text(f,'Pole',1,40)),manager:boolean(rule.manager??false,'Wymagany kierownik'),checklist:boolean(rule.checklist??false,'Wymagana checklista')};}
      else{if(!Array.isArray(rule)||rule.length>20)fail(400,'Nieprawidłowe warunki pluginów.');out[kind][status]=rule.map(r=>{const plugin_id=text(r?.plugin_id,'Plugin',2,64),action=text(r?.action,'Akcja warunku',1,100);if(!/^[a-z0-9._-]+$/.test(plugin_id))fail(400,'Nieprawidłowy plugin.');return {plugin_id,action};});}
    }
  }
  if(input.customer_layout!==undefined){if(!Array.isArray(input.customer_layout)||new Set(input.customer_layout).size!==input.customer_layout.length||input.customer_layout.some(s=>!['description','conversation','attachments','next'].includes(s)))fail(400,'Nieprawidłowy układ klienta.');out.customer_layout=[...input.customer_layout];}
  if(input.attachments!==undefined){const a=input.attachments;if(!a||!Array.isArray(a.extensions)||a.extensions.length>100||a.extensions.some(s=>!(/^[a-z0-9]{1,10}$/).test(s)))fail(400,'Nieprawidłowe ograniczenia załączników.');out.attachments={max_bytes:integer(a.max_bytes,'Rozmiar pliku',1024,2097152),extensions:[...new Set(a.extensions)],...(a.max_storage_bytes===undefined?{}:{max_storage_bytes:integer(a.max_storage_bytes,'Magazyn projektu',1024,1073741824)})};}
  return out;
}
export function blueprintPluginIds(p) { return [...new Set([...p.workflow.rules.flatMap(r=>r.actions.filter(a=>a.type==='plugin').map(a=>a.value.plugin_id)),...Object.values(p.process_settings.plugin_conditions||{}).flatMap(rules=>rules.map(r=>r.plugin_id))])]; }

export function portableResponsibility(p, teams, roles, integrations) {
  if(!Array.isArray(p.responsibility_rules||[])||(p.responsibility_rules||[]).length>100)fail(400,'Nieprawidłowa macierz odpowiedzialności.');
  const teamIds=new Map((p.teams||[]).map((t,i)=>[t.id,t.alias||'team_'+(i+1)]).filter(([id])=>id)),roleIds=new Map((p.roles||[]).map((r,i)=>[r.id,r.alias||'role_'+(i+1)]).filter(([id])=>id)),orgIds=new Map((p.integrations||[]).filter(d=>d.kind==='organization'&&d.id).map((d,i)=>[d.id,d.alias||'integration_'+((p.integrations||[]).indexOf(d)+1)]));
  return (p.responsibility_rules||[]).map(r=>{
    const team_alias=r.team_alias||teamIds.get(r.team_id);if(!teams.some(t=>t.alias===team_alias))fail(400,'Reguła wymaga mapowania zespołu.');
    const approver_roles=r.approver_roles||(r.approvers||[]).map(id=>roleIds.get(id));if(!Array.isArray(approver_roles)||approver_roles.length>100||approver_roles.some(key=>!roles.some(role=>role.alias===key&&role.project_role!=='requester')))fail(400,'Reguła wymaga mapowania akceptujących.');
    const organization_alias=r.organization_alias||(r.organization_id?orgIds.get(r.organization_id):null);if(r.organization_id&&!organization_alias||organization_alias&&!integrations.some(d=>d.alias===organization_alias&&d.kind==='organization'))fail(400,'Reguła wymaga mapowania organizacji.');
    return {name:text(r.name,'Nazwa reguły',2,100),department:text(r.department||'','Dział',0,100)||null,location:text(r.location||'','Lokalizacja',0,100)||null,organization_alias,team_alias,approver_roles:[...new Set(approver_roles)]};
  });
}
