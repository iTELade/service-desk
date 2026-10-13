import { fail, text } from './core.mjs';

const kinds = new Set(['admin.settings','project.settings','ticket.panel','ticket.action','portal.panel','dashboard.widget','form.field']);
const types = new Set(['text','number','date','checkbox','select','password']);
export function normalizePluginHooks(input, capabilities) {
  if (!Array.isArray(input) || input.length > 30) fail(400, 'Plugin hooks must be a bounded list.');
  const ids = new Set();
  return input.map(h => {
    if (!h || !kinds.has(h.kind) || !capabilities.includes(h.kind)) fail(400, 'Hook capability is not declared.');
    const id = text(h.id, 'Hook ID', 1, 64); if (!/^[a-z][a-z0-9._-]*$/.test(id) || ids.has(id)) fail(400, 'Hook IDs must be unique.'); ids.add(id);
    const roles = h.roles || ['admin','manager','agent']; if (!Array.isArray(roles) || roles.some(r => !['admin','manager','agent'].includes(r))) fail(400, 'Invalid hook roles.');
    const action = h.action ? text(h.action, 'Hook action', 1, 100) : null;
    if (h.kind === 'ticket.action' && (!action || !/^[a-zA-Z0-9._:-]+$/.test(action))) fail(400, 'Ticket action requires an action identifier.');
    const fieldIds = new Set(); if (!Array.isArray(h.fields || []) || (h.fields || []).length > 30) fail(400, 'Invalid hook fields.');
    const fields = (h.fields || []).map(f => {
      const key = text(f.key, 'Field key', 1, 50); if (!/^[a-z][a-z0-9_]*$/.test(key) || fieldIds.has(key) || ['constructor','prototype','__proto__'].includes(key) || !types.has(f.type)) fail(400, 'Invalid hook field.'); fieldIds.add(key);
      if (f.type === 'password' && !['admin.settings','project.settings'].includes(h.kind)) fail(400, 'Secret input belongs in plugin settings.');
      const options = f.options || []; if (!Array.isArray(options) || options.length > 50 || options.some(v => typeof v !== 'string' || !v || v.length > 100)) fail(400, 'Invalid hook options.');
      if (f.type === 'select' && !options.length) fail(400, 'Select field requires options.');
      return { key, label: text(f.label || key, 'Field label', 1, 100), type: f.type, required: f.required === true, options: [...new Set(options)] };
    });
    return { id, kind: h.kind, label: text(h.label, 'Hook label', 1, 100), description: text(h.description || '', 'Hook description', 0, 1000), roles: [...new Set(roles)], action, fields };
  });
}

export function hookInput(hook, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Invalid plugin input.');
  const result = {}, known = new Set(hook.fields.map(f => f.key));
  for (const key of Object.keys(input)) if (!known.has(key)) fail(400, 'Unknown plugin input field.');
  for (const f of hook.fields) {
    const value = input[f.key];
    if (value === undefined || value === '' || value === null) { if (f.required) fail(400, 'Required plugin field: ' + f.label); continue; }
    if (f.type === 'checkbox') { if (typeof value !== 'boolean') fail(400, 'Expected checkbox value.'); result[f.key] = value; }
    else if (f.type === 'number') { if (typeof value !== 'number' || !Number.isFinite(value)) fail(400, 'Expected finite number.'); result[f.key] = value; }
    else {
      result[f.key] = text(value, f.label, f.required ? 1 : 0, 2000);
      if (f.type === 'select' && !f.options.includes(value)) fail(400, 'Invalid selected value.');
      if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) fail(400, 'Invalid date.');
    }
  }
  return result;
}

export function pluginResultData(manifest, data) {
  const fields = new Map();
  for (const hook of manifest.hooks || []) if (['ticket.panel','portal.panel','dashboard.widget'].includes(hook.kind)) for (const f of hook.fields) if (f.type !== 'password') fields.set(f.key, { ...f, required: false });
  return hookInput({ fields: [...fields.values()] }, data);
}
