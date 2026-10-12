import { fail, text, integer, now, txFor } from './core.mjs';
import { validateFields } from './catalog.mjs';
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
export function createBlueprints(db, { projects, catalog, workflows, sync }) {
  const tx = txFor(db), admin = u => { if (u.role !== 'admin') fail(403, 'Szablony projektów konfiguruje administrator.'); };
  function portable(input) {
    if (!input || !Array.isArray(input.projects) || !input.projects.length || input.projects.length > 10) fail(400, 'Pakiet wymaga od 1 do 10 projektów.');
    const aliases = new Set();
    const config = { format: 1, projects: input.projects.map(p => {
      const alias = text(p.alias, 'Identyfikator projektu', 2, 40);
      if (!/^[a-z][a-z0-9_]*$/.test(alias) || aliases.has(alias)) fail(400, 'Identyfikatory projektów muszą być unikalne.'); aliases.add(alias);
      if (!['internal', 'external'].includes(p.project_type)) fail(400, 'Nieprawidłowy typ projektu.');
      if (!Array.isArray(p.forms) || p.forms.length > 50 || !p.forms.length) fail(400, 'Projekt wymaga formularzy.');
      const forms = p.forms.map(f => ({ name: text(f.name, 'Nazwa formularza', 2, 120), description: text(f.description || '', 'Opis', 0, 2000), base_type: ['request', 'incident', 'task', 'bug', 'story'].includes(f.base_type) ? f.base_type : 'request', fields: validateFields(f.fields || []), portal_visible: p.project_type === 'external' && f.portal_visible !== false, enabled: f.enabled !== false }));
      const w = p.workflow || defaultWorkflow();
      // Only portable workflow shape is exported; identities/secrets from automation are excluded.
      const workflow = { initial: w.initial, statuses: w.statuses, transitions: w.transitions, rules: (w.rules||[]).filter(r=>!r.actor_id&&(r.actions||[]).every(a=>['status','priority','lock','unlock','resolution'].includes(a.type))) };
      if (!Array.isArray(workflow.statuses) || !Array.isArray(workflow.transitions)) fail(400, 'Nieprawidłowy workflow.');
      const sla=p.sla?validateSlaConfig(p.sla,workflow.statuses.map(s=>s.key)):null;const queues=(p.queues||[]).map(q=>({name:text(q.name,'Nazwa kolejki',2,100),filters:Object.fromEntries(Object.entries(q.filters||{}).filter(([key])=>['status','priority','type','sort','queue'].includes(key)))}));return { alias, project_type: p.project_type, forms, workflow,sla,queues };
    }), links: [] };
    if (input.links) {
      if (!Array.isArray(input.links) || input.links.length > 50) fail(400, 'Nieprawidłowe powiązania pakietu.');
      config.links = input.links.map(l => { if (!aliases.has(l.source) || !aliases.has(l.target) || l.source === l.target) fail(400, 'Nieznany projekt w połączeniu.'); return { source: l.source, target: l.target, name: text(l.name, 'Nazwa przekazania', 2, 100) }; });
    }
    if (JSON.stringify(config).length > 250000) fail(400, 'Szablon jest za duży.');
    return config;
  }
  function list(u) { admin(u); return { builtins: Object.entries(builtinBlueprints).map(([id, b]) => ({ id, name: b.name, config: portable(b) })), custom: db.prepare('SELECT * FROM project_blueprints WHERE deleted_at IS NULL ORDER BY name').all().map(r => ({ ...r, config: JSON.parse(r.config) })), drafts: db.prepare('SELECT * FROM project_drafts ORDER BY id DESC').all().map(r => ({ ...r, config: JSON.parse(r.config), project_ids: JSON.parse(r.project_ids) })) }; }
  function save(id, b, u) {
    admin(u); const cfg = portable(b.config), name = text(b.name, 'Nazwa', 2, 120);
    return tx(() => { if (id) { const old = db.prepare('SELECT * FROM project_blueprints WHERE id=? AND deleted_at IS NULL').get(integer(id, 'Szablon')); if (!old || old.version !== b.version) fail(409, 'Szablon zmienił się.'); db.prepare('UPDATE project_blueprints SET name=?,config=?,version=version+1 WHERE id=?').run(name, JSON.stringify(cfg), id); } else id = Number(db.prepare('INSERT INTO project_blueprints(name,config,created_by,created_at) VALUES(?,?,?,?)').run(name, JSON.stringify(cfg), u.id, now()).lastInsertRowid); projects.audit(null, u, 'blueprint.saved', { blueprint_id: id }); return { id, config: cfg }; });
  }
  function fromProject(id, b, u) {
    const p = projects.requireProject(id, u, true); admin(u);
    return save(null, { name: b.name, config: { projects: [{ alias: 'project', project_type: p.project_type, forms: catalog.list(id, u, 'manage'), workflow: workflows.get(id),sla:JSON.parse(p.settings||'{}').sla?{...JSON.parse(p.settings).sla,rules:JSON.parse(p.settings).sla.rules.map(r=>({...r,request_type_ids:[]}))}:null,queues:db.prepare('SELECT name,filters FROM v8_saved_views WHERE project_id=?').all(id).map(q=>({...q,filters:JSON.parse(q.filters)})) }] } }, u);
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
    const cfg = portable(JSON.parse(row.config)), mapping = b.mapping || {}, errors = [];
    for (const p of cfg.projects) {
      const m = mapping[p.alias];
      if (!m?.key || !m?.name) { errors.push(p.alias + ': wskaż klucz i nazwę.'); continue; }
      if (!/^[A-Z][A-Z0-9]{1,9}$/.test(m.key) || db.prepare('SELECT 1 FROM project_keys WHERE key=?').get(m.key)) errors.push(p.alias + ': klucz nieprawidłowy lub zarezerwowany.');
      if (db.prepare('SELECT 1 FROM projects WHERE portal_slug=?').get(m.key.toLowerCase())) errors.push(p.alias + ': adres portalu zajęty.');
      try { workflows.validate(p.workflow, { id: -1 }, u, { rules: [] }); } catch (err) { errors.push(p.alias + ': ' + err.message); }
    }
    const keys = cfg.projects.map(p => mapping[p.alias]?.key); if (new Set(keys).size !== keys.length) errors.push('Klucze w pakiecie nie mogą się powtarzać.');
    return { valid: !errors.length, errors, projects: cfg.projects.map(p => ({ alias: p.alias, key: mapping[p.alias]?.key, forms: p.forms.map(f => f.name), statuses: p.workflow.statuses.map(s => s.name) })), links: cfg.links, config: cfg, mapping };
  }
  function activate(id, b, u) {
    return tx(() => {
      const preview = validate(id, b, u); if (!preview.valid) fail(400, preview.errors.join('\n'));
      const ids = {};
      for (const p of preview.config.projects) {
        const m = preview.mapping[p.alias], saved = projects.create({ key: m.key, name: m.name, project_type: p.project_type, portal_access: 'members' }, u); ids[p.alias] = saved.id;
        db.prepare('UPDATE request_types SET enabled=0,portal_visible=0 WHERE project_id=?').run(saved.id);
        for (const f of p.forms) catalog.save(saved.id, null, f, u);
        const current = workflows.get(saved.id); workflows.save(saved.id, { ...p.workflow, version: current.version }, u);
        const settings=JSON.parse(projects.project(saved.id).settings||'{}');settings.versioned_process=true;if(p.sla)settings.sla=p.sla;db.prepare('UPDATE projects SET settings=?,version=version+1 WHERE id=?').run(JSON.stringify(settings),saved.id);for(const q of p.queues)db.prepare('INSERT INTO v8_saved_views(owner_id,name,project_id,filters,shared,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').run(u.id,q.name,saved.id,JSON.stringify(q.filters),now(),now());
      }
      for (const l of preview.config.links) { const w = workflows.get(ids[l.source]), target = workflows.get(ids[l.target]); sync.save(null, { name: l.name, source_project: ids[l.source], target_project: ids[l.target], enabled: true, config: { author_id: u.id, comments: 'both', internal_notes: false, to_target: w.statuses.filter(s => target.statuses.some(t => t.key === s.key)).map(s => ({ from: s.key, to: s.key })), to_source: [] } }, u); }
      db.prepare('UPDATE project_drafts SET activated_at=?,project_ids=?,version=version+1 WHERE id=?').run(now(), JSON.stringify(Object.values(ids)), id);
      projects.audit(null, u, 'draft.activated', { draft_id: id, projects: ids }); return { projects: ids };
    });
  }
  return { list, save, fromProject, draft, validate, activate, portable };
}
