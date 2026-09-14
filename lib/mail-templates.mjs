import {fail,text,choice,integer,boolean} from './core.mjs';
export const mailEvents=['ticket_created','status_changed','comment_added','ticket_updated','manual'];
export const mailAudiences=['participants','reporter','watchers','team','managers'];
export function renderMail(template,values){return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g,(_,key)=>String(values[key]??''));}
export function createMailTemplates(db,projects){
  const admin=u=>{if(u.role!=='admin')fail(403,'Szablony poczty edytuje administrator.');};
  function list(u){if(!['agent','admin'].includes(u.role))fail(403,'Dostęp zespołu.');return db.prepare('SELECT * FROM mail_templates ORDER BY name,id').all().filter(t=>!t.project_id||projects.canWork(u,projects.project(t.project_id)));}
  function save(id,b,u){admin(u);const old=id?db.prepare('SELECT * FROM mail_templates WHERE id=?').get(id):null;if(id&&(!old||old.version!==b.version))fail(409,'Szablon zmienił się.');const project=b.project_id?integer(b.project_id,'Projekt'):null;if(project)projects.requireProject(project,u,true);const subject=text(b.subject,'Temat',1,200),body=text(b.body,'Treść',1,20000);if(/[\r\n]/.test(subject))fail(400,'Temat musi mieścić się w jednym wierszu.');for(const m of (subject+' '+body).matchAll(/\{\{\s*([^}]+)\s*\}\}/g))if(!['key','title','description','update','status','url','reporter','project'].includes(m[1].trim()))fail(400,'Nieznana zmienna: '+m[1]);
    const values=[text(b.name,'Nazwa szablonu',2,100),project,choice(b.event,mailEvents,'Wyzwalacz'),subject,body,choice(b.audience,mailAudiences,'Odbiorcy'),Number(boolean(b.enabled??true,'Aktywny'))];
    if(id)db.prepare('UPDATE mail_templates SET name=?,project_id=?,event=?,subject=?,body=?,audience=?,enabled=?,version=version+1 WHERE id=?').run(...values,id);else id=Number(db.prepare('INSERT INTO mail_templates(name,project_id,event,subject,body,audience,enabled) VALUES(?,?,?,?,?,?,?)').run(...values).lastInsertRowid);
    projects.audit(project,u,'mail.template_saved',{id});return db.prepare('SELECT * FROM mail_templates WHERE id=?').get(id);
  }
  function remove(id,b,u){admin(u);for(const w of db.prepare('SELECT config FROM project_workflows').all())if(JSON.parse(w.config).rules.some(r=>r.actions?.some(a=>a.type==='email'&&a.value===id)))fail(409,'Szablon jest używany w automatyzacji.');if(!db.prepare('DELETE FROM mail_templates WHERE id=? AND version=?').run(id,b.version).changes)fail(409,'Szablon zmienił się.');return {ok:true};}
  return {list,save,remove};
}
