import { syncServiceSettings } from './service-settings.mjs';
import { portableProcessSettings, blueprintPluginIds, portableResponsibility } from './blueprint-process.mjs';
import { captureAutomationReferences, portableAutomation, applyAutomationMappings } from './blueprint-automation.mjs';
import { fingerprint } from './workspace-v21.mjs';
import { portableProjectMappings, portablePluginRequirements } from './blueprint-mappings.mjs';
import { comparePluginVersions } from './plugin-versions.mjs';
import { fail, text, integer, now, txFor } from './core.mjs';
import {validateSlaConfig} from './sla.mjs';
import { defaultWorkflow } from './workflows.mjs';

const form = (name, fields = []) => ({ name, description: '', base_type: 'request', portal_visible: true, enabled: true, fields });
export const builtinBlueprints = {
  hr: { name: 'HR', projects: [{ alias: 'hr', project_type: 'internal', forms: [form('Zatrudnienie', [{ key: 'start_date', label: 'Data rozpoczęcia', type: 'date', required: true }]), form('Zakończenie współpracy'), form('Zmiana stanowiska')] }] },
  it: { name: 'IT / Helpdesk', projects: [{ alias: 'it', project_type: 'external', forms: [form('Awaria'), form('Wniosek o dostęp'), form('Sprzęt'), form('Oprogramowanie')] }] },
  accounts: { name: 'Administracja kontami', projects: [{ alias: 'accounts', project_type: 'internal', forms: [form('Utworzenie konta'), form('Zmiana uprawnień'), form('Wyłączenie konta')] }] },
  facilities: { name: 'Administracja / Facilities', projects: [{ alias: 'facilities', project_type: 'external', forms: [form('Wyposażenie'), form('Naprawa'), form('Wydanie mienia'), form('Zwrot mienia')] }] },
  hr_it: { name: 'HR + IT', projects: [{ alias: 'hr', project_type: 'internal', forms: [form('Wniosek HR')] }, { alias: 'it', project_type: 'internal', forms: [form('Realizacja IT')] }], links: [{ source: 'hr', target: 'it', name: 'Przekaż do IT' }] },
};
export function portableBlueprint(input) {
    if (!input || !Array.isArray(input.projects) || !input.projects.length || input.projects.length > 10) fail(400, 'Pakiet wymaga od 1 do 10 projektów.');
    const aliases = new Set();
    const config = { format: 1, projects: input.projects.map(p => {
      const alias = text(p.alias, 'Identyfikator projektu', 2, 40);
      if (!/^[a-z][a-z0-9_]*$/.test(alias) || aliases.has(alias)) fail(400, 'Identyfikatory projektów muszą być unikalne.'); aliases.add(alias);
      if (!['internal', 'external'].includes(p.project_type)) fail(400, 'Nieprawidłowy typ projektu.');
      if (!Array.isArray(p.forms) || p.forms.length > 50 || !p.forms.length) fail(400, 'Projekt wymaga formularzy.');
      const w = p.workflow || defaultWorkflow();
      const workflow = { initial: w.initial, statuses: w.statuses, transitions: w.transitions, rules: [] };
      if (!Array.isArray(workflow.statuses) || !Array.isArray(workflow.transitions)) fail(400, 'Nieprawidłowy workflow.');
      const mapped=portableProjectMappings(p,workflow.statuses.map(s=>s.key)),automation=portableAutomation({...p,workflow:w},mapped.forms);workflow.rules=automation.rules;const queues=(p.queues||[]).map(q=>({name:text(q.name,'Nazwa kolejki',2,100),filters:Object.fromEntries(Object.entries(q.filters||{}).filter(([key])=>['status','priority','type','sort','queue'].includes(key)))}));return { alias, project_type: p.project_type, ...mapped,responsibility_rules:portableResponsibility(p,mapped.teams,automation.roles,automation.integrations),process_settings:portableProcessSettings(p.process_settings,p.forms),roles:automation.roles,integrations:automation.integrations, workflow,queues,plugins:portablePluginRequirements(p.plugins) };
    }), links: [] };
    if (input.links) {
      if (!Array.isArray(input.links) || input.links.length > 50) fail(400, 'Nieprawidłowe powiązania pakietu.');
      config.links = input.links.map(l => { if (!aliases.has(l.source) || !aliases.has(l.target) || l.source === l.target) fail(400, 'Nieznany projekt w połączeniu.'); return { source: l.source, target: l.target, name: text(l.name, 'Nazwa przekazania', 2, 100) }; });
    }
    if (JSON.stringify(config).length > 250000) fail(400, 'Szablon jest za duży.');
    return config;
  }
export function createBlueprints(db, { projects, catalog, workflows, sync, governance, processes }) {
  const tx = txFor(db), admin = u => { if (u.role !== 'admin') fail(403, 'Szablony projektów konfiguruje administrator.'); };
  const portable=portableBlueprint;let pluginTemplates=()=>[];
  function list(u) { admin(u); return { plugin_templates:pluginTemplates(u),builtins: Object.entries(builtinBlueprints).map(([id, b]) => ({ id, name: b.name, config: portable(b) })), custom: db.prepare('SELECT * FROM project_blueprints WHERE deleted_at IS NULL ORDER BY name').all().map(r => ({ ...r, config: JSON.parse(r.config) })), drafts: db.prepare('SELECT * FROM project_drafts ORDER BY id DESC').all().map(r => ({ ...r, config: JSON.parse(r.config), project_ids: JSON.parse(r.project_ids) })) }; }
  function save(id, b, u) {
    admin(u); const cfg = portable(b.config), name = text(b.name, 'Nazwa', 2, 120);
    return tx(() => { if (id) { const old = db.prepare('SELECT * FROM project_blueprints WHERE id=? AND deleted_at IS NULL').get(integer(id, 'Szablon')); if (!old || old.version !== b.version) fail(409, 'Szablon zmienił się.'); db.prepare('UPDATE project_blueprints SET name=?,config=?,version=version+1 WHERE id=?').run(name, JSON.stringify(cfg), id); } else id = Number(db.prepare('INSERT INTO project_blueprints(name,config,created_by,created_at) VALUES(?,?,?,?)').run(name, JSON.stringify(cfg), u.id, now()).lastInsertRowid); projects.audit(null, u, 'blueprint.saved', { blueprint_id: id }); return { id, config: cfg }; });
  }
  function fromProject(id, b, u) {
    const p = projects.requireProject(id, u, true); admin(u);
    const responsibility=processes.rules(id,u);
    return save(null, { name: b.name, config: { projects: [{ alias: 'project', project_type: p.project_type, forms: catalog.list(id, u, 'manage'), workflow: workflows.get(id),process_settings:portableProcessSettings(JSON.parse(p.settings||'{}'),catalog.list(id,u,'manage')),...captureAutomationReferences(db,workflows.get(id),p,projects,responsibility),responsibility_rules:responsibility,teams:db.prepare('SELECT id,name FROM teams WHERE project_id=? AND deleted_at IS NULL').all(id),sla:JSON.parse(p.settings||'{}').sla||null,queues:db.prepare('SELECT name,filters FROM v8_saved_views WHERE project_id=?').all(id).map(q=>({...q,filters:JSON.parse(q.filters)})) }] } }, u);
  }
  function draft(id, b, u) {
    admin(u); const blueprint = b.blueprint && builtinBlueprints[b.blueprint];
    const cfg = portable(blueprint || b.config), name = text(b.name, 'Nazwa draftu', 2, 120);
    if (id) { const old = db.prepare('SELECT * FROM project_drafts WHERE id=?').get(integer(id, 'Draft')); if (!old || old.activated_at || old.version !== b.version) fail(409, 'Draft zmienił się lub został aktywowany.'); db.prepare('UPDATE project_drafts SET name=?,config=?,version=version+1 WHERE id=?').run(name, JSON.stringify(cfg), id); }
    else id = Number(db.prepare('INSERT INTO project_drafts(name,config,created_by,created_at) VALUES(?,?,?,?)').run(name, JSON.stringify(cfg), u.id, now()).lastInsertRowid);
    return db.prepare('SELECT * FROM project_drafts WHERE id=?').get(id);
  }
  function validate(id, b, u) {
    admin(u); const row = db.prepare('SELECT * FROM project_drafts WHERE id=?').get(integer(id, 'Draft')); if (!row || row.activated_at || row.version !== b.version) fail(409, 'Draft zmienił się.');
    const cfg = portable(JSON.parse(row.config)), mapping = b.mapping || {}, errors = [],warnings=[];
    for (const p of cfg.projects) {
      const m = mapping[p.alias];
      if (!m?.key || !m?.name) { errors.push(p.alias + ': wskaż klucz i nazwę.'); continue; }
      if (!/^[A-Z][A-Z0-9]{1,9}$/.test(m.key) || db.prepare('SELECT 1 FROM project_keys WHERE key=?').get(m.key)) errors.push(p.alias + ': klucz nieprawidłowy lub zarezerwowany.');
      if (db.prepare('SELECT 1 FROM projects WHERE portal_slug=?').get(m.key.toLowerCase())) errors.push(p.alias + ': adres portalu zajęty.');
      for(const team of p.teams){const members=m.teams?.[team.alias];if(!Array.isArray(members)||!members.length||members.length>1000)errors.push(p.alias+': wskaż członków zespołu '+team.name);else for(const id of members){const account=Number.isSafeInteger(id)?db.prepare('SELECT * FROM users WHERE id=?').get(id):null;if(!Number.isSafeInteger(id)||!account?.active||!account.directory_active||account.registration_state!=='active'||!['admin','agent'].includes(account.role))errors.push(p.alias+': członek zespołu nie jest aktywnym agentem.');}}
      for(const dep of p.plugins){const plugin=db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(dep.id);if(!plugin?.enabled||comparePluginVersions(plugin.plugin_version,dep.minimum)<0)(dep.required?errors:warnings).push(p.alias+': '+(dep.required?'wymagany':'opcjonalny')+' plugin '+dep.id+' >= '+dep.minimum);}
      try { workflows.validate({...p.workflow,rules:[]}, { id: -1 }, u, { rules: [] }); } catch (err) { errors.push(p.alias + ': ' + err.message); }
    }
    const keys = cfg.projects.map(p => mapping[p.alias]?.key); if (new Set(keys).size !== keys.length) errors.push('Klucze w pakiecie nie mogą się powtarzać.');
    if(!errors.length){db.exec('SAVEPOINT blueprint_validation');try{build(cfg,mapping,u);}catch(err){errors.push(err.status?err.message:'Nieprawidłowe mapowanie konfiguracji.');}finally{db.exec('ROLLBACK TO blueprint_validation;RELEASE blueprint_validation');}}
    const revisions=cfg.projects.map(p=>({alias:p.alias,integrations:p.integrations.map(d=>{const id=mapping[p.alias]?.integrations?.[d.alias],table={email:'mail_templates',webhook:'webhook_endpoints',organization:'organizations'}[d.kind];return {alias:d.alias,version:Number.isSafeInteger(id)?db.prepare('SELECT version FROM '+table+' WHERE id=?').get(id)?.version:null};}),plugins:blueprintPluginIds(p).map(id=>({id,version:db.prepare('SELECT version FROM plugin_connectors WHERE plugin_id=?').get(id)?.version,registry_revision:db.prepare('SELECT version FROM plugin_registry WHERE id=?').get(id)?.version}))}));
    let person=null,responsibility_preview=[];if(b.sample_person_id){const id=integer(b.sample_person_id,'Osoba podglądu'),account=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!account?.active||!account.directory_active||account.registration_state!=='active'||account.account_kind!=='human')fail(400,'Osoba podglądu jest niedostępna.');const row=db.prepare('SELECT * FROM people_attributes WHERE user_id=?').get(id);person={id,attributes:JSON.parse(row?.config||'{}'),version:row?.version||0};responsibility_preview=cfg.projects.map(p=>{const m=mapping[p.alias]||{},matches=p.responsibility_rules.filter(r=>(!r.department||r.department===person.attributes.department)&&(!r.location||r.location===person.attributes.location)&&(!r.organization_alias||db.prepare('SELECT 1 FROM organization_members WHERE organization_id=? AND user_id=?').get(m.integrations?.[r.organization_alias]||0,id)));if(matches.length!==1)return {project_alias:p.alias,matched:false,reason:matches.length?'Kilka reguł pasuje; wymagane ręczne przypisanie.':'Brak reguły; wymagane ręczne przypisanie.'};const r=matches[0];return {project_alias:p.alias,matched:true,team_alias:r.team_alias,team_name:p.teams.find(t=>t.alias===r.team_alias).name,approver_ids:r.approver_roles.map(key=>m.roles?.[key])};});person.organizations=db.prepare('SELECT organization_id FROM organization_members WHERE user_id=? ORDER BY organization_id').all(id).map(r=>r.organization_id);}
    const preview_fingerprint=fingerprint({cfg,mapping,version:row.version,revisions,person});
    return { valid: !errors.length, errors,warnings,preview_fingerprint,responsibility_preview, projects: cfg.projects.map(p => ({ alias: p.alias, key: mapping[p.alias]?.key, forms: p.forms.map(f => f.name), statuses: p.workflow.statuses.map(s => s.name) })), links: cfg.links, config: cfg, mapping };
  }
  function build(cfg,mapping,u){
      const ids = {};
      for (const p of cfg.projects) {
        const m = mapping[p.alias], saved = projects.create({ key: m.key, name: m.name, project_type: p.project_type, portal_access: 'members' }, u); ids[p.alias] = saved.id;
        db.prepare('UPDATE request_types SET enabled=0,portal_visible=0 WHERE project_id=?').run(saved.id);
        const teamIds={},formIds={};for(const team of p.teams){const members=[...new Set(m.teams[team.alias])];for(const uid of members){const existing=db.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=? AND source='manual'").get(saved.id,uid);projects.setMember(saved.id,uid,existing?.role==='manager'?'manager':team.project_role,u);}teamIds[team.alias]=Number(db.prepare('INSERT INTO teams(name,project_id) VALUES(?,?)').run(team.name,saved.id).lastInsertRowid);for(const uid of members)db.prepare('INSERT INTO team_members VALUES(?,?)').run(teamIds[team.alias],uid);}
        for (const f of p.forms){const fields=f.fields.map(field=>{const {allowed_team_aliases,...clean}=field;return {...clean,...(allowed_team_aliases?{allowed_team_ids:allowed_team_aliases.map(key=>teamIds[key])}:{})};});formIds[f.alias]=catalog.save(saved.id,null,{...f,fields},u).id;}
        const mappedAutomation=applyAutomationMappings(db,{p,m,project:saved,projects,user:u,formIds}),current=workflows.get(saved.id);workflows.save(saved.id,{...p.workflow,rules:mappedAutomation.rules,version:current.version},u);const installed=workflows.get(saved.id);installed.rules.forEach((rule,i)=>{const actor=db.prepare('SELECT * FROM users WHERE id=?').get(mappedAutomation.actors[i]);if(!actor?.active||!actor.directory_active||actor.registration_state!=='active'||!projects.canWork(actor,projects.project(saved.id)))fail(400,'Aktor automatyzacji musi obsługiwać nowy projekt.');rule.actor_id=actor.id;});db.prepare('UPDATE project_workflows SET config=? WHERE project_id=?').run(JSON.stringify({initial:installed.initial,statuses:installed.statuses,transitions:installed.transitions,rules:installed.rules}),saved.id);
        for(const rule of p.responsibility_rules)processes.saveRule(null,{project_id:saved.id,name:rule.name,department:rule.department||'',location:rule.location||'',organization_id:rule.organization_alias?m.integrations[rule.organization_alias]:null,team_id:teamIds[rule.team_alias],approvers:rule.approver_roles.map(key=>mappedAutomation.roles[key])},u);
        const settings=JSON.parse(projects.project(saved.id).settings||'{}');settings.versioned_process=true;if(p.sla)settings.sla=validateSlaConfig({...p.sla,rules:p.sla.rules.map(rule=>({...rule,request_type_ids:rule.request_type_aliases.map(key=>formIds[key])}))},p.workflow.statuses.map(s=>s.key));db.prepare('UPDATE projects SET settings=?,version=version+1 WHERE id=?').run(JSON.stringify(settings),saved.id);if(Object.keys(p.process_settings).length){governance.settings(saved.id,{...p.process_settings,...(p.process_settings.customer_form_layouts?{customer_form_layouts:Object.fromEntries(Object.entries(p.process_settings.customer_form_layouts).map(([key,value])=>[formIds[key],value]))}:{}),version:projects.project(saved.id).version},u);const final=JSON.parse(projects.project(saved.id).settings);for(const key of ['customer_layout','attachments'])if(p.process_settings[key]===undefined)delete final[key];db.prepare('UPDATE projects SET settings=? WHERE id=?').run(JSON.stringify(final),saved.id);}for(const q of p.queues)db.prepare('INSERT INTO v8_saved_views(owner_id,name,project_id,filters,shared,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').run(u.id,q.name,saved.id,JSON.stringify(q.filters),now(),now());
        syncServiceSettings(db,projects.project(saved.id));
      }
      for (const l of cfg.links) { const w = workflows.get(ids[l.source]), target = workflows.get(ids[l.target]); sync.save(null, { name: l.name, source_project: ids[l.source], target_project: ids[l.target], enabled: true, config: { author_id: u.id, comments: 'both', internal_notes: false, to_target: w.statuses.filter(s => target.statuses.some(t => t.key === s.key)).map(s => ({ from: s.key, to: s.key })), to_source: [] } }, u); }
    return ids;
  }
  function activate(id, b, u) {
    return tx(() => {
      const preview = validate(id, b, u); if (!preview.valid) fail(400, preview.errors.join('\n'));if((b.preview_fingerprint||preview.config.projects.some(p=>p.roles.length||p.integrations.length||blueprintPluginIds(p).length))&&b.preview_fingerprint!==preview.preview_fingerprint)fail(409,'Wykonaj podgląd aktualnych mapowań.');
      const ids=build(preview.config,preview.mapping,u);
      db.prepare('UPDATE project_drafts SET activated_at=?,project_ids=?,version=version+1 WHERE id=?').run(now(), JSON.stringify(Object.values(ids)), id);
      projects.audit(null, u, 'draft.activated', { draft_id: id, projects: ids }); return { projects: ids };
    });
  }
  return { setPluginTemplates(provider){pluginTemplates=provider;},list, save, fromProject, draft, validate, activate, portable };
}
