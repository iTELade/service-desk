import { blueprintPluginIds } from './blueprint-process.mjs';
import { fail, text, choice, integer } from './core.mjs';
import { normalizeRule } from './automation.mjs';
const key = (v,fallback) => {const out=text(v||fallback,'Identyfikator roli',2,40);if(!/^[a-z][a-z0-9_]*$/.test(out))fail(400,'Nieprawidłowy identyfikator mapowania.');return out;};
export function captureAutomationReferences(db, workflow, project, projects, responsibility=[]) {
  const users=new Set(),resources=new Map();
  for(const raw of workflow.rules||[]){const r=normalizeRule(raw);if(r.actor_id)users.add(r.actor_id);for(const c of r.conditions||[]){if(['assignee_id','reporter_id'].includes(c.field)&&c.value!==null)users.add(c.value);if(c.field==='organization_id'&&c.value!==null)resources.set('organization:'+c.value,{id:c.value,kind:'organization'});}for(const a of r.actions){if(a.bot_id)users.add(a.bot_id);if(a.type==='assign'&&Number.isSafeInteger(a.value))users.add(a.value);if(['email','webhook'].includes(a.type))resources.set(a.type+':'+a.value,{id:a.value,kind:a.type});}}
  for(const rule of responsibility){for(const id of rule.approvers||[])users.add(id);if(rule.organization_id)resources.set('organization:'+rule.organization_id,{id:rule.organization_id,kind:'organization'});}
  return {roles:[...users].map((id,i)=>{const account=db.prepare('SELECT * FROM users WHERE id=?').get(id);return {id,alias:'role_'+(i+1),label:'Rola automatyzacji '+(i+1),project_role:account?.role==='admin'?'manager':account?.role==='agent'?(db.prepare("SELECT 1 FROM project_members WHERE project_id=? AND user_id=? AND role='manager'").get(project.id,id)?'manager':'agent'):'requester'};}),integrations:[...resources.values()].map((r,i)=>({...r,alias:'integration_'+(i+1),label:'Integracja '+(i+1)}))};
}
export function portableAutomation(p, forms) {
  if(!Array.isArray(p.roles||[])||(p.roles||[]).length>100||!Array.isArray(p.integrations||[])||(p.integrations||[]).length>100)fail(400,'Nieprawidłowe role lub integracje szablonu.');
  const userIds=new Map(),roleKeys=new Set(),resourceIds=new Map(),resourceKeys=new Set(),formIds=new Map();
  const roles=(p.roles||[]).map((r,i)=>{const alias=key(r.alias,'role_'+(i+1));if(roleKeys.has(alias))fail(400,'Powtórzona rola.');roleKeys.add(alias);if(r.id)userIds.set(r.id,alias);const project_role=choice(r.project_role||'agent',['manager','agent','requester'],'Rola projektu');if(project_role==='requester'&&p.project_type==='internal')fail(400,'Projekt wewnętrzny nie obsługuje roli klienta.');return {alias,label:text(r.label||'Rola '+(i+1),'Nazwa roli',2,100),project_role};});
  const integrations=(p.integrations||[]).map((r,i)=>{const alias=key(r.alias,'integration_'+(i+1)),kind=choice(r.kind,['email','webhook','organization'],'Rodzaj integracji');if(resourceKeys.has(alias))fail(400,'Powtórzona integracja.');resourceKeys.add(alias);if(r.id)resourceIds.set(kind+':'+r.id,alias);return {alias,kind,label:text(r.label||'Integracja '+(i+1),'Nazwa integracji',2,100)};});
  p.forms.forEach((f,i)=>{if(f.id)formIds.set(f.id,forms[i].alias);});const formKeys=new Set(forms.map(f=>f.alias));
  const ref=(value,map,keys,name)=>{const alias=typeof value==='string'?value:map.get(value);if(!keys.has(alias))fail(400,'Wskaż mapowanie: '+name);return alias;};
  const resourceKind=alias=>integrations.find(d=>d.alias===alias)?.kind;
  if(!Array.isArray(p.workflow?.rules||[])||(p.workflow?.rules||[]).length>100)fail(400,'Maksymalnie 100 reguł szablonu.');
  const rules=(p.workflow?.rules||[]).map((raw,i)=>{
    const r=normalizeRule(raw,i),out={id:r.id||'rule_'+(i+1),name:r.name,enabled:r.enabled??true,event:r.event,from:r.from??'*',match:r.match||'all',conditions:[],actions:[],...(r.after?{after:{value:r.after.value,unit:r.after.unit}}:{}),...(r.legacy?{legacy:true}:{})};
    if(r.actor_role||r.actor_id)out.actor_role=ref(r.actor_role||r.actor_id,userIds,roleKeys,'aktor automatyzacji');
    if(!Array.isArray(r.conditions||[])||(r.conditions||[]).length>20||!Array.isArray(r.actions)||r.actions.length>10)fail(400,'Nieprawidłowa automatyzacja szablonu.');
    out.conditions=(r.conditions||[]).map(c=>{const result={field:c.field,op:c.op,value:c.value};if(['assignee_id','reporter_id'].includes(c.field)&&c.value!==null){result.value={role:ref(c.value?.role||c.value,userIds,roleKeys,c.field)};}if(c.field==='request_type_id')result.value={form:ref(c.value?.form||c.value,formIds,formKeys,'formularz')};if(c.field==='organization_id'&&c.value!==null)result.value={integration:ref(c.value?.integration||resourceIds.get('organization:'+c.value),new Map(),resourceKeys,'organizacja')};if(result.value?.integration&&resourceKind(result.value.integration)!=='organization')fail(400,'Warunek organizacji wymaga mapowania organizacji.');return result;});
    out.actions=r.actions.map(a=>{
      const result={type:a.type};if(['status','priority'].includes(a.type)){result.value=a.value;if(a.type==='status')result.resolution=a.resolution||'';}
      else if(a.type==='assign'){result.value=Number.isSafeInteger(a.value)||a.value?.role?{role:ref(a.value?.role||a.value,userIds,roleKeys,'opiekun')}:a.value;}
      else if(a.type==='comment'){result.body=a.body;result.internal=a.internal??false;}
      else if(a.type==='resolution')result.body=a.body;
      else if(['email','webhook'].includes(a.type))result.value={integration:ref(a.value?.integration||resourceIds.get(a.type+':'+a.value),new Map(),resourceKeys,a.type)};
      else if(a.type==='plugin')result.value={plugin_id:a.value?.plugin_id,action:a.value?.action};
      else if(!['lock','unlock'].includes(a.type))fail(400,'Nieznana akcja szablonu.');
      if(result.value?.integration&&resourceKind(result.value.integration)!==a.type)fail(400,'Rodzaj integracji nie pasuje do akcji.');
      if(a.bot_role||a.bot_id)result.bot_role=ref(a.bot_role||a.bot_id,userIds,roleKeys,'konto komentarza');return result;
    });return out;
  });
  return {roles,integrations,rules};
}
export function applyAutomationMappings(db,{p,m,project,projects,user,formIds}) {
  const roles={},integrations={};const active=a=>a?.active&&a.directory_active&&a.registration_state==='active';
  for(const role of p.roles){const id=integer(m.roles?.[role.alias],'Konto roli '+role.label),account=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!active(account)||role.project_role!=='requester'&&!['agent','admin'].includes(account.role))fail(400,'Rola wymaga aktywnego konta o odpowiednich uprawnieniach.');const existing=db.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=? AND source='manual'").get(project.id,id),rank={requester:1,agent:2,manager:3};projects.setMember(project.id,id,rank[existing?.role]>rank[role.project_role]?existing.role:role.project_role,user);roles[role.alias]=id;}
  for(const definition of p.integrations){const id=integer(m.integrations?.[definition.alias],'Integracja '+definition.label);let old,newId;
    if(definition.kind==='organization'){old=db.prepare('SELECT * FROM organizations WHERE id=?').get(id);if(old){db.prepare('INSERT OR IGNORE INTO project_organizations VALUES(?,?)').run(project.id,id);newId=id;}}
    else if(definition.kind==='email'){old=db.prepare('SELECT * FROM mail_templates WHERE id=? AND enabled=1').get(id);if(old){if(old.project_id)projects.requireProject(old.project_id,user,true);newId=Number(db.prepare('INSERT INTO mail_templates(name,project_id,event,subject,body,audience,enabled) VALUES(?,?,?,?,?,?,1)').run(old.name,project.id,old.event,old.subject,old.body,old.audience).lastInsertRowid);}}
    else{old=db.prepare("SELECT * FROM webhook_endpoints WHERE id=? AND direction='outbound' AND enabled=1").get(id);if(old){projects.requireProject(old.project_id,user,true);newId=Number(db.prepare('INSERT INTO webhook_endpoints(name,project_id,direction,config,secret,enabled) VALUES(?,?,?,?,?,1)').run(old.name,project.id,old.direction,old.config,old.secret).lastInsertRowid);}}
    if(!old)fail(400,'Wybrana integracja jest niedostępna: '+definition.label);integrations[definition.alias]=newId;
  }
  const pluginIds=blueprintPluginIds(p);
  for(const id of pluginIds){if(m.plugin_scopes?.[id]!==true)fail(400,'Potwierdź udostępnienie nowego projektu pluginowi '+id);const plugin=db.prepare('SELECT * FROM plugin_registry WHERE id=? AND enabled=1').get(id),connector=db.prepare('SELECT * FROM plugin_connectors WHERE plugin_id=?').get(id);if(!plugin||!connector)fail(400,'Plugin jest niedostępny.');const config=JSON.parse(connector.config),account=db.prepare('SELECT * FROM users WHERE id=?').get(config.execution_user_id);if(!active(account)||!['agent','admin'].includes(account.role))fail(400,'Konto wykonawcze pluginu jest niedostępne.');if(!projects.canWork(account,project))projects.setMember(project.id,account.id,'agent',user);config.project_ids=[...new Set([...config.project_ids,project.id])];db.prepare('UPDATE plugin_connectors SET config=?,version=version+1 WHERE plugin_id=?').run(JSON.stringify(config),id);db.prepare("UPDATE platform_jobs SET state='paused',version=version+1 WHERE plugin_id=? AND state='queued'").run(id);projects.audit(project.id,user,'blueprint.plugin_scope',{plugin_id:id,execution_user_id:account.id});}
  const rules=p.workflow.rules.map(r=>{const {actor_role,...out}=r;return {...out,conditions:r.conditions.map(c=>({...c,value:c.value?.role?roles[c.value.role]:c.value?.form?formIds[c.value.form]:c.value?.integration?integrations[c.value.integration]:c.value})),actions:r.actions.map(a=>{const {bot_role,...rest}=a;return {...rest,value:a.value?.role?roles[a.value.role]:a.value?.integration?integrations[a.value.integration]:a.value,...(bot_role?{bot_id:roles[bot_role]}:{})};})};});
  return {roles,rules,actors:p.workflow.rules.map(r=>r.actor_role?roles[r.actor_role]:user.id)};
}
