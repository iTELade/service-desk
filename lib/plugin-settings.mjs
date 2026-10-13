import { createHash } from 'node:crypto';
import { fail, integer, now } from './core.mjs';
import { hookInput } from './plugin-ui-contract.mjs';

export function createPluginSettings(db, { projects, secrets }) {
  db.exec(`CREATE TABLE IF NOT EXISTS plugin_settings(plugin_id TEXT NOT NULL REFERENCES plugin_registry(id) ON DELETE CASCADE,project_id INTEGER NOT NULL,hook_id TEXT NOT NULL,config TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(plugin_id,project_id,hook_id));`);
  function definitions(id, projectId, user) {
    const project = projectId ? projects.requireProject(projectId, user, true) : null;
    if (!project && user.role !== 'admin') fail(403, 'Ustawienia globalne wymagają administratora.');
    const plugin = db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(id), connector = db.prepare('SELECT * FROM plugin_connectors WHERE plugin_id=?').get(id);
    if (!plugin || !connector) fail(404, 'Konfiguracja pluginu niedostępna.');
    const config = JSON.parse(connector.config), manifest = JSON.parse(plugin.manifest);
    if (project && !config.project_ids.includes(project.id)) fail(404, 'Plugin nie jest dostępny w projekcie.');
    if (!config.permissions.includes('ui.extension') || !manifest.permissions.includes('ui.extension')) fail(403, 'Brak uprawnień rozszerzenia ustawień.');
    const role = user.role === 'admin' ? 'admin' : 'manager';
    return (manifest.hooks || []).filter(h => h.kind === (projectId ? 'project.settings' : 'admin.settings') && h.roles.includes(role));
  }
  function list(id, projectId, user) {
    integer(projectId, 'Projekt', 0);
    return definitions(id, projectId, user).map(h => {
      const row = db.prepare('SELECT * FROM plugin_settings WHERE plugin_id=? AND project_id=? AND hook_id=?').get(id, projectId, h.id), stored = row ? JSON.parse(secrets.open(row.config)) : {};
      return { hook: h, version: row?.version || 0, values: Object.fromEntries(h.fields.filter(f => f.type !== 'password').map(f => [f.key, stored[f.key] ?? null])), has_secret: Object.fromEntries(h.fields.filter(f => f.type === 'password').map(f => [f.key, Boolean(stored[f.key])])) };
    });
  }
  function save(id, projectId, body, user) {
    integer(projectId, 'Projekt', 0);
    if(projectId&&projects.project(projectId)?.archived)fail(409,'Projekt jest w archiwum.');
    const h = definitions(id, projectId, user).find(h => h.id === body.hook_id); if (!h) fail(404, 'Formularz ustawień niedostępny.');
    const old = db.prepare('SELECT * FROM plugin_settings WHERE plugin_id=? AND project_id=? AND hook_id=?').get(id, projectId, h.id);
    if ((old?.version || 0) !== body.version) fail(409, 'Ustawienia pluginu zmieniły się.');
    const previous = old ? JSON.parse(secrets.open(old.config)) : {}, input = { ...(body.input || {}) };
    for (const f of h.fields.filter(f => f.type === 'password')) if (input[f.key] === '' || input[f.key] === undefined) input[f.key] = previous[f.key];
    const config = hookInput(h, input);
    db.prepare('INSERT INTO plugin_settings VALUES(?,?,?,?,1) ON CONFLICT(plugin_id,project_id,hook_id) DO UPDATE SET config=excluded.config,version=plugin_settings.version+1').run(id, projectId, h.id, secrets.seal(JSON.stringify(config)));
    projects.audit(projectId || null, user, 'plugin.settings', { plugin_id: id, hook_id: h.id, changed_fields: Object.keys(config), at: now() });
    return list(id, projectId, user);
  }
  const rows = (id, projectId) => db.prepare('SELECT * FROM plugin_settings WHERE plugin_id=? AND project_id IN (0,?) ORDER BY project_id,hook_id').all(id, projectId);
  function digest(id, projectId) { return createHash('sha256').update(JSON.stringify(rows(id, projectId).map(r => [r.project_id,r.hook_id,r.version]))).digest('hex'); }
  function delivery(id, projectId, manifest) {
    const definitions = new Set((manifest.hooks || []).filter(h => ['admin.settings','project.settings'].includes(h.kind)).map(h => h.id));
    const result = { global: {}, project: {} };
    for (const r of rows(id, projectId)) if (definitions.has(r.hook_id)) result[r.project_id ? 'project' : 'global'][r.hook_id] = JSON.parse(secrets.open(r.config));
    return result;
  }
  return { list, save, digest, delivery };
}
