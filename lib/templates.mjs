import {fail,integer,text,txFor} from './core.mjs';
import {defaultWorkflow} from './workflows.mjs';

export function createTemplates(db,projects,workflows){
  const tx=txFor(db),admin=u=>{if(u.role!=='admin')fail(403,'Szablony edytuje administrator.');};
  const row=id=>db.prepare('SELECT * FROM workflow_templates WHERE id=?').get(integer(id,'Szablon'));
  const uses=id=>db.prepare('SELECT id,key,name,archived FROM projects WHERE workflow_template_id=? ORDER BY name').all(id);
  const view=t=>({...t,is_default:Boolean(t.is_default),config:JSON.parse(t.config),projects:uses(t.id)});
  function list(u){if(!['admin','agent'].includes(u.role))fail(403,'Dostęp zespołu.');return db.prepare('SELECT * FROM workflow_templates ORDER BY is_default DESC,name').all().map(view);}
  function save(id,b,u){admin(u);return tx(()=>{
    const old=id?row(id):null;if(id&&(!old||old.version!==b.version))fail(409,'Szablon zmienił się. Odśwież.');
    const name=text(b.name,'Nazwa szablonu',2,100);
    if(db.prepare('SELECT id FROM workflow_templates WHERE name=? AND id<>?').get(name,id||0))fail(409,'Ta nazwa szablonu jest zajęta.');
    let input=b.config;if(!input&&b.project_id)input=workflows.get(projects.requireProject(integer(b.project_id,'Projekt wzorcowy'),u,true).id);
    input??=old?JSON.parse(old.config):defaultWorkflow();
    const config=workflows.validate({...input,rules:[]},{id:-1},u,{rules:[]});
    const affected=old?uses(id):[];
    // Validate every project before any update. Existing tickets and rules must remain valid.
    const maps=affected.map(p=>{const current=workflows.get(p.id);return [p,workflows.validate({...config,rules:current.rules},projects.project(p.id),u,current)];});
    if(b.is_default===true)db.exec('UPDATE workflow_templates SET is_default=0 WHERE is_default=1');
    const isDefault=b.is_default===undefined?Number(old?.is_default||false):Number(b.is_default===true);
    if(old)db.prepare('UPDATE workflow_templates SET name=?,config=?,is_default=?,version=version+1 WHERE id=?').run(name,JSON.stringify(config),isDefault,id);
    else id=Number(db.prepare('INSERT INTO workflow_templates(name,config,is_default) VALUES(?,?,?)').run(name,JSON.stringify(config),isDefault).lastInsertRowid);
    for(const [p,w] of maps){db.prepare('UPDATE project_workflows SET config=?,version=version+1 WHERE project_id=?').run(JSON.stringify(w),p.id);db.prepare('UPDATE projects SET version=version+1 WHERE id=?').run(p.id);workflows.automation.reconcile(p.id);}
    projects.audit(null,u,'workflow.template_saved',{template_id:id,projects:affected.map(p=>p.id)});return view(row(id));
  });}
  function apply(id,b,u){return tx(()=>{
    const p=projects.requireProject(integer(b.project_id,'Projekt'),u,true),t=row(id);if(!t)fail(404,'Szablon nie istnieje.');
    const current=workflows.get(p.id),result=workflows.save(p.id,{...JSON.parse(t.config),rules:current.rules,version:b.version},u);
    db.prepare('UPDATE projects SET workflow_template_id=? WHERE id=?').run(id,p.id);return result;
  });}
  function clone(id,b,u){admin(u);const old=row(id);if(!old)fail(404,'Szablon nie istnieje.');return save(null,{name:b.name,config:JSON.parse(old.config),is_default:false},u);}
  function remove(id,b,u){admin(u);return tx(()=>{
    const t=row(id);if(!t)fail(404,'Szablon nie istnieje.');if(t.version!==b.version)fail(409,'Szablon zmienił się.');
    const assigned=uses(id);if(assigned.length)fail(409,'Szablon jest używany przez projekty: '+assigned.map(p=>p.key).join(', ')+'. Najpierw przypisz im inny szablon lub odłącz mapę.');
    db.prepare('DELETE FROM workflow_templates WHERE id=?').run(id);projects.audit(null,u,'workflow.template_deleted',{template_id:id,name:t.name});return {ok:true};
  });}
  function detach(projectId,b,u){const p=projects.requireProject(projectId,u,true);if(p.version!==b.version)fail(409,'Projekt zmienił się.');db.prepare('UPDATE projects SET workflow_template_id=NULL,version=version+1 WHERE id=?').run(p.id);projects.audit(p.id,u,'workflow.template_detached',{});return {ok:true};}
  return {list,save,apply,clone,remove,detach};
}
