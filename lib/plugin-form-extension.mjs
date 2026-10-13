import { createHash } from 'node:crypto';
import { fail, integer } from './core.mjs';
import { validateFields } from './catalog.mjs';

export function createPluginFormExtension(db, { runtime, projects, catalog }) {
  return (projectId, body, user) => {
    const p = projects.requireProject(projectId,user,true); if (p.archived) fail(409,'Projekt jest w archiwum.');
    const form = catalog.list(p.id,user,'manage').find(f=>f.id===integer(body.form_id,'Formularz')); if (!form) fail(404,'Formularz niedostępny.');
    if (form.version !== body.version) fail(409,'Formularz zmienił się.');
    const plugin = runtime.uiContract(p.id,user).find(p=>p.id===body.plugin_id), hook = plugin?.hooks.find(h=>h.id===body.hook_id&&h.kind==='form.field');
    if (!hook) fail(404,'Pola pluginu niedostępne.');
    const fields = validateFields(hook.fields.map(f=>({
      key:'ext_'+createHash('sha256').update(plugin.id+'/'+hook.id+'/'+f.key).digest('hex').slice(0,8)+'_'+f.key.slice(0,24),
      label:f.label,type:f.type,required:f.required,options:f.options,visibility:'internal',help:hook.description
    })));
    const combined = validateFields([...form.fields,...fields]), registry = db.prepare('SELECT version FROM plugin_registry WHERE id=?').get(plugin.id), connector = db.prepare('SELECT version FROM plugin_connectors WHERE plugin_id=?').get(plugin.id);
    const fingerprint = createHash('sha256').update(JSON.stringify([p.id,form.id,form.version,plugin.id,registry.version,connector.version,combined])).digest('hex');
    if (!body.confirm) return {preview:true,fingerprint,form_version:form.version,added:fields};
    if (body.preview_fingerprint !== fingerprint) fail(409,'Podgląd importu pól jest nieaktualny.');
    const result = catalog.save(p.id,form.id,{...form,fields:combined,version:form.version},user);
    projects.audit(p.id,user,'plugin.form_fields_imported',{plugin_id:plugin.id,hook_id:hook.id,form_id:form.id,fields:fields.map(f=>f.key)});
    return {ok:true,form:result,added:fields};
  };
}
