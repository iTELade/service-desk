import assert from 'node:assert/strict';
import {fixture,legacyDb} from './fixture.mjs';
import {createCatalog} from '../lib/catalog.mjs';
import {createWorkflows} from '../lib/workflows.mjs';
import {createDesk} from '../lib/desk.mjs';
import {createAccounts} from '../lib/accounts.mjs';
import {createIdentity} from '../lib/identity.mjs';
import {createSso} from '../lib/sso.mjs';
import {createExtensions} from '../lib/extensions.mjs';
import {createMail,stripReply} from '../lib/mail.mjs';
import {createWebhooks,allowedAddress} from '../lib/webhooks.mjs';
import {migrateV2,migrateV3,migrateV4} from '../lib/migrations.mjs';
import {migrateV5} from '../lib/migration-v5.mjs';
import {username} from '../lib/usernames.mjs';
import {workingMs,deadline,validateSlaConfig} from '../lib/sla.mjs';
import {secretStore} from '../lib/secrets.mjs';
export function setup(){
 const f=fixture();let time=Date.parse('2026-09-14T09:00:00Z');const clock=()=>time;
 const catalog=createCatalog(f.db,f.projects),workflows=createWorkflows(f.db,f.projects,{clock}),desk=createDesk(f.db,f.projects,catalog,workflows,{clock});const sent=[];
 const accounts=createAccounts(f.db,{origin:'https://help.example.test',dataDir:f.dataDir,encodePassword:async p=>'encoded:'+p,transport:{async sendMail(m){sent.push(m);}}});
 const identity=createIdentity(f.db,f.projects,accounts,{origin:'https://help.example.test',encodePassword:async p=>'encoded:'+p,clock}),sso=createSso(f.db,f.projects,{origin:'https://help.example.test',dataDir:f.dataDir,clock});const ext=createExtensions(f.db,f.projects,catalog,workflows,desk,accounts,identity,sso,{origin:'https://help.example.test',dataDir:f.dataDir,clock});
 const project=(key,type='external')=>f.projects.create({key,name:key+' Projekt',project_type:type,portal_access:'authenticated'},f.admin);
 const user=(email,role='customer',name='Adam Dehmel')=>{const id=Number(f.db.prepare("INSERT INTO users(email,name,username,password,role,must_change,created_at) VALUES(?,?,?,'TEST',?,0,?)").run(email,name,email.split('@')[0],role,new Date(time).toISOString()).lastInsertRowid);return f.db.prepare('SELECT * FROM users WHERE id=?').get(id);};
 const ticket=(p,reporter=f.admin)=>{const rt=f.db.prepare("SELECT * FROM request_types WHERE project_id=? AND base_type='incident' ORDER BY id LIMIT 1").get(p.id),form=catalog.prepare(p,{request_type_id:rt.id,request_type_version:rt.version,title:'Problem z kontem',description:'Opis problemu'},false),n=f.projects.project(p.id).next_number,stamp=new Date(time).toISOString();f.db.prepare('UPDATE projects SET next_number=next_number+1 WHERE id=?').run(p.id);const id=Number(f.db.prepare("INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values) VALUES(?,?,?,'Problem z kontem','Opis problemu','incident','P3','open','open',?,?,?,?,?,?,?)").run(p.id,f.projects.issueKey(p,n),n,reporter.id,f.admin.id,stamp,stamp,form.id,form.snapshot,form.values).lastInsertRowid);return desk.ticket(id);};
 const state=(id,to,actor=f.admin,extra={})=>{const t=desk.ticket(id),s=workflows.get(t.project_id).statuses.find(s=>s.key===to);f.db.prepare("UPDATE tickets SET workflow_status=?,status=?,resolution_text=?,updated_at=?,change_source='web',version=version+1 WHERE id=?").run(to,s.category,extra.resolution??t.resolution_text,new Date(time).toISOString(),id);workflows.automation.onChange(t,actor);return desk.ticket(id);};
 const comment=(t,u,body,internal=0)=>Number(f.db.prepare('INSERT INTO comments(ticket_id,author_id,actual_actor_id,body,internal,created_at) VALUES(?,?,?,?,?,?)').run(t.id,u.id,u.id,body,internal,new Date(time).toISOString()).lastInsertRowid);
 return {...f,catalog,workflows,desk,accounts,identity,sso,ext,project,user,ticket,state,comment,sent,clock,advance:n=>time+=n,close(){ext.stop();accounts.stop();workflows.automation.stop();f.close();}};
}
