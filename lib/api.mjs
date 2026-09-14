import {randomBytes,createHash} from 'node:crypto';
import {fail,text,integer,now,txFor} from './core.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const SCOPES=['tickets:read','tickets:create','tickets:comment','tickets:transition','tickets:internal'];

export function createApi(db,projects,catalog,workflows,desk){
  const tx=txFor(db),admin=u=>{if(u.role!=='admin')fail(403,'Tokeny wydaje administrator.');};
  function list(u){admin(u);return db.prepare('SELECT a.id,a.name,a.user_id,a.project_id,a.scopes,a.expires_at,a.revoked_at,a.created_at,a.last_used_at,u.name user_name,p.key project_key FROM api_tokens a JOIN users u ON u.id=a.user_id JOIN projects p ON p.id=a.project_id ORDER BY a.id DESC').all().map(r=>({...r,scopes:JSON.parse(r.scopes)}));}
  function create(b,u){admin(u);const p=projects.requireProject(integer(b.project_id,'Projekt'),u,true),bot=db.prepare('SELECT * FROM users WHERE id=?').get(integer(b.user_id,'Konto'));
    if(p.archived||p.module_type==='assets'||!bot?.active||!bot.directory_active||bot.registration_state!=='active'||!projects.canWork(bot,p))fail(400,'Wybierz aktywne konto obsługujące ten projekt.');
    if(!Array.isArray(b.scopes)||!b.scopes.length||b.scopes.some(s=>!SCOPES.includes(s)))fail(400,'Wybierz uprawnienia API.');
    const secret='desk_'+randomBytes(32).toString('hex'),expiry=new Date(Date.now()+integer(b.expires_in_days??90,'Ważność w dniach',1,365)*86400000).toISOString();
    const id=Number(db.prepare('INSERT INTO api_tokens(name,token_hash,user_id,project_id,scopes,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(text(b.name,'Nazwa tokenu',2,100),hash(secret),bot.id,p.id,JSON.stringify([...new Set(b.scopes)]),expiry,now()).lastInsertRowid);
    projects.audit(p.id,u,'api.token_created',{token_id:id,scopes:b.scopes,user_id:bot.id});return {...list(u).find(x=>x.id===id),generated_secret:secret};
  }
  function revoke(id,u){admin(u);db.prepare('UPDATE api_tokens SET revoked_at=? WHERE id=?').run(now(),integer(id,'Token'));projects.audit(null,u,'api.token_revoked',{token_id:id});return {ok:true};}
  function authenticate(auth){const raw=String(auth||'').match(/^Bearer (desk_[a-f0-9]{64})$/)?.[1];if(!raw)fail(401,'Wymagany nagłówek Authorization: Bearer <token>.');const t=db.prepare('SELECT * FROM api_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').get(hash(raw),now());if(!t)fail(401,'Token wygasł lub został odwołany.');const user=db.prepare('SELECT * FROM users WHERE id=?').get(t.user_id),p=projects.project(t.project_id);if(!user?.active||!user.directory_active||user.registration_state!=='active'||!projects.canWork(user,p))fail(403,'Konto utraciło uprawnienia.');db.prepare('UPDATE api_tokens SET last_used_at=? WHERE id=?').run(now(),t.id);return {token:t,user,project:p,scopes:JSON.parse(t.scopes)};}
  function run(auth,method,path,query,b={},requestKey){
    const ctx=authenticate(auth),{token,user,project:p,scopes}=ctx,parts=path.slice('/api/v1/'.length).split('/'),[resource,key,action]=parts;
    const requireScope=s=>{if(!scopes.includes(s))fail(403,'Token nie posiada uprawnienia '+s);};
    const ticket=()=>{const t=db.prepare('SELECT * FROM tickets WHERE key=? COLLATE NOCASE AND project_id=? AND deleted_at IS NULL').get(text(key,'Klucz',3,30),p.id);if(!t)fail(404,'Zgłoszenie niedostępne dla tego tokenu.');return t;};
    const visible=t=>({id:t.id,key:t.key,title:t.title,description:t.description,priority:t.priority,reporter_id:t.reporter_id,assignee_id:t.assignee_id,status:t.workflow_status,status_name:workflows.ticket(t,true).status_name,category:t.status,version:t.version,workflow_version:workflows.get(p.id).version,created_at:t.created_at,updated_at:t.updated_at,closed_at:t.closed_at,archived_at:t.archived_at});
    if(method==='GET'){
      requireScope('tickets:read');
      if(resource==='forms')return {status:200,value:db.prepare('SELECT id,name,version,base_type,fields,base_fields FROM request_types WHERE project_id=? AND enabled=1 ORDER BY sort_order,id').all(p.id).map(r=>({...r,fields:JSON.parse(r.fields),base_fields:JSON.parse(r.base_fields)}))};
      if(resource!=='tickets')fail(404,'Nieznany zasób API.');
      if(key){const t=ticket();return {status:200,value:{...visible(t),transitions:workflows.transitions(t,true),comments:db.prepare(`SELECT id,author_id,body,internal,created_at FROM comments WHERE ticket_id=?${scopes.includes('tickets:internal')?'':' AND internal=0'} ORDER BY id`).all(t.id)}};}
      const after=integer(Number(query.get('after')||0),'Kursor',0),limit=integer(Number(query.get('limit')||50),'Limit',1,100),rows=db.prepare('SELECT * FROM tickets WHERE project_id=? AND deleted_at IS NULL AND id>? ORDER BY id LIMIT ?').all(p.id,after,limit+1);return {status:200,value:{tickets:rows.slice(0,limit).map(visible),next_after:rows.length>limit?rows[limit-1].id:null}};
    }
    if(method!=='POST')fail(405,'API obsługuje GET i POST.');
    if(p.archived)fail(409,'Projekt jest w archiwum.');
    requestKey=text(requestKey,'Nagłówek Idempotency-Key',8,200);const requestHash=hash(method+'\n'+path+'\n'+JSON.stringify(b));
    return tx(()=>{
      const prior=db.prepare('SELECT * FROM api_requests WHERE token_id=? AND request_key=?').get(token.id,requestKey);if(prior){if(prior.request_hash!==requestHash)fail(409,'Ten klucz idempotencji należy do innego żądania.');return JSON.parse(prior.response);}
      let t,result;if(resource!=='tickets')fail(404,'Nieznany zasób API.');
      if(!key){requireScope('tickets:create');const reporter=desk.reporter(p,integer(b.reporter_id,'Zgłaszający'),user),f=catalog.prepare(p,b,false),n=projects.project(p.id).next_number;if(n>2000000000)fail(409,'Wyczerpana numeracja.');const initial=workflows.start(p),stamp=now();db.prepare('UPDATE projects SET next_number=next_number+1,version=version+1 WHERE id=?').run(p.id);
        const id=Number(db.prepare("INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values,origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'api')").run(p.id,projects.issueKey(p,n),n,f.title,f.description,f.type,f.priority,initial.category,initial.key,reporter,user.id,stamp,stamp,f.id,f.snapshot,f.values).lastInsertRowid);t=desk.ticket(id);workflows.run(t,'ticket_created',user);result={status:201,value:visible(desk.ticket(id))};
      }else{
        t=ticket();if(t.archived_at||t.status==='closed')fail(409,'Zamknięte lub zarchiwizowane zgłoszenie nie przyjmuje zmian.');
        if(action==='comments'){requireScope('tickets:comment');if(b.internal===true)requireScope('tickets:internal');const stamp=now();db.prepare("INSERT INTO comments(ticket_id,author_id,actual_actor_id,body,internal,created_at,origin) VALUES(?,?,?,?,?,?,'api')").run(t.id,user.id,user.id,text(b.body,'Komentarz',1,20000),Number(b.internal===true),stamp);db.prepare('UPDATE tickets SET updated_at=?,version=version+1,first_response_at=CASE WHEN ? THEN COALESCE(first_response_at,?) ELSE first_response_at END,last_actor_id=? WHERE id=?').run(stamp,Number(b.internal!==true),stamp,user.id,t.id);workflows.run(t,b.internal?'internal_note':'agent_reply',user);result={status:201,value:{ok:true}};
        }else if(action==='transitions'){requireScope('tickets:transition');if(b.version!==t.version)fail(409,'Wersja zgłoszenia zmieniła się.');const target=workflows.transition(t,b,true);const stamp=now();db.prepare("UPDATE tickets SET status=?,workflow_status=?,resolution_text=?,resolved_at=?,version=version+1,updated_at=?,last_actor_id=?,change_source='api' WHERE id=?").run(target.category,target.key,text(b.resolution_text??t.resolution_text,'Rozwiązanie',0,20000),['resolved','closed'].includes(target.category)?t.resolved_at||stamp:null,stamp,user.id,t.id);workflows.automation.onChange(t,user);result={status:200,value:visible(desk.ticket(t.id))};}
        else fail(404,'Nieznana operacja API.');
      }
      projects.audit(p.id,user,'api.request',{token_id:token.id,ticket_id:t.id,action:action||'create'});db.prepare('INSERT INTO api_requests VALUES(?,?,?,?,?)').run(token.id,requestKey,requestHash,JSON.stringify(result),now());return result;
    });
  }
  return {list,create,revoke,authenticate,run};
}
