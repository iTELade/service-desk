import {createKnowledge} from './knowledge.mjs';
import {createMailTemplates} from './mail-templates.mjs';
import {maintenance} from './maintenance.mjs';
import {fail,integer,text,txFor,now} from './core.mjs';
import {createApi} from './api.mjs';
import {VERSION,SCHEMA_VERSION} from './version.mjs';
import {createLifecycle} from './lifecycle.mjs';
import {createTemplates} from './templates.mjs';
import {createNotifications} from './notifications.mjs';
import {createSync} from './sync.mjs';
import {createResources} from './resources.mjs';
import {createMail} from './mail.mjs';
import {createWebhooks} from './webhooks.mjs';
import {createPlugins} from './plugins.mjs';
export function createExtensions(db,projects,catalog,workflows,desk,accounts,identity,sso,options){
  const knowledge=createKnowledge(db,projects),mailTemplates=createMailTemplates(db,projects),tx=txFor(db),api=createApi(db,projects,catalog,workflows,desk),lifecycle=createLifecycle(db,projects,desk),templates=createTemplates(db,projects,workflows),notifications=createNotifications(db,projects,desk),sync=createSync(db,projects,desk,workflows),resources=createResources(db,projects,desk,workflows),mail=createMail(db,projects,catalog,workflows,desk,accounts,options),webhooks=createWebhooks(db,projects,desk,workflows,options),plugins=createPlugins(db);let processing=false,timer;
  workflows.automation.setHooks({webhook:webhooks.enqueue,email:mail.automationEmail});
  function commentActions(event){
    if(event.event!=='comment_added')return;
    const t=desk.ticket(event.ticket_id),payload=JSON.parse(event.payload),c=db.prepare('SELECT * FROM comments WHERE id=?').get(payload.comment_id),u=db.prepare('SELECT * FROM users WHERE id=?').get(c.author_id),p=projects.project(t.project_id);
    if(!['sync','automation'].includes(c.origin))workflows.automation.emit(t.id,'comment_added',u,undefined,{author_kind:u.account_kind==='service'?'service':projects.canWork(u,p)?'agent':'customer',comment_visibility:c.internal?'internal':'public',comment_body:c.body,origin:c.origin});

  }
  function events(){if(maintenance())return;if(processing)return;processing=true;try{
    for(let n=0;n<500;n++){
      const event=db.prepare("SELECT * FROM desk_events WHERE status='queued' ORDER BY id LIMIT 1").get();if(!event)break;
      if(desk.ticket(event.ticket_id)?.deleted_at){db.prepare("UPDATE desk_events SET status='done' WHERE id=?").run(event.id);continue;}
      const errors=[];
      for(const [name,run] of [['watchers',notifications.autoWatch],['sync',sync.process],['mail',mail.notify],['webhooks',webhooks.notify],['comments',commentActions],['notifications',notifications.notify]]){
        if(db.prepare('SELECT 1 FROM desk_event_deliveries WHERE event_id=? AND module=?').get(event.id,name))continue;
        try{tx(()=>{run(event);db.prepare('INSERT INTO desk_event_deliveries VALUES(?,?)').run(event.id,name);});}
        catch(e){errors.push(name+': '+(e.status?e.message:e.message?.includes('DESK_RESOLUTION_REQUIRED')?'Mapowanie wymaga rozwiązania.':'Błąd obsługi zdarzenia; sprawdź konfigurację i log.'));if(!e.status)console.error('Moduł '+name+':',e.message);}
      }
      db.prepare('UPDATE desk_events SET status=?,error=? WHERE id=?').run(errors.length?'failed':'done',errors.length?errors.join(' | ').slice(0,500):null,event.id);
    }
  }finally{processing=false;}}
  async function handle(method,path,user,query,read){if(!path.startsWith('/api/desk/'))return null;const b=method==='GET'?{}:await read();user=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);if(!user?.active||!user.directory_active||user.registration_state!=='active'||user.account_kind!=='human')fail(401,'Sesja wygasła.');const parts=path.slice('/api/desk/'.length).split('/'),[resource,id,action]=parts,pid=id?Number(id):null;let value,status=200;
    if(resource==='knowledge')value=method==='GET'?knowledge.status(user):knowledge.save(b,user);
    else if(resource==='mail-templates')value=method==='GET'?mailTemplates.list(user):action==='delete'?mailTemplates.remove(pid,b,user):mailTemplates.save(pid,b,user);
    else if(resource==='api-tokens')value=method==='GET'?api.list(user):action==='revoke'?api.revoke(pid,user):api.create(b,user);
    else if(resource==='system'){
      if(user.role!=='admin')fail(403,'Wymagany administrator.');
      const pluginHealth=plugins.health(),smtp=accounts.smtp.settings(),ldapRow=db.prepare('SELECT config FROM ldap_settings WHERE id=1').get(),ldapConfig=ldapRow?JSON.parse(ldapRow.config||'{}'):null;
      value={version:VERSION,schema_version:SCHEMA_VERSION,node:process.version,uptime_seconds:Math.floor(process.uptime()),maintenance:maintenance(),database:'ok',mail_queued:db.prepare("SELECT COUNT(*) n FROM mail_outbox WHERE status='queued'").get().n,mail_failed:db.prepare("SELECT COUNT(*) n FROM mail_outbox WHERE status='failed'").get().n,events_failed:db.prepare("SELECT COUNT(*) n FROM desk_events WHERE status='failed'").get().n,smtp:{configured:Boolean(smtp.configured),enabled:Boolean(smtp.enabled)},ldap:ldapConfig?{enabled:Boolean(ldapConfig.enabled),url:ldapConfig.url||''}:null,plugins:pluginHealth};
    }
    else if(resource==='plugins'){
      if(method==='GET')value=id==='capabilities'?{capabilities:plugins.capabilities}:id?plugins.events(id,user):plugins.list(user);
      else if(action==='enable'||action==='disable')value=plugins.setEnabled(id,action==='enable',user);
      else if(action==='delete')value=plugins.remove(id,user);
      else value=plugins.install(b,user);
    }
    else if(resource==='notifications')value=method==='GET'?notifications.list(user):notifications.seen(user,b);
    else if(resource==='smtp'){if(user.role!=='admin')fail(403,'Wymagany administrator.');value=method==='GET'?accounts.smtp.settings():id==='test'?await accounts.smtp.test(user,accounts.settings().brand_name):accounts.smtp.save(b,user);}
    else if(resource==='lookup')value=lifecycle.lookup(user,query.get('q')||'',query.get('exclude'));
    else if(resource==='outbox'){if(user.role!=='admin')fail(403,'Wymagany administrator.');if(method!=='GET'){db.prepare("UPDATE mail_outbox SET status='queued',attempts=0,next_attempt=0,last_error=NULL WHERE id=? AND status='failed' AND body<>''").run(integer(pid,'Wiadomość'));}value=accounts.status();}
    else if(resource==='profile'){
      if(method==='GET')value={requests:identity.requests(user),notifications:db.prepare('SELECT n.*,t.key ticket_key FROM notifications n LEFT JOIN tickets t ON t.id=n.ticket_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 100').all(user.id).filter(n=>!n.ticket_id||projects.canRead(user,projects.project(desk.ticket(n.ticket_id).project_id),desk.ticket(n.ticket_id)))};
      else if(id==='name'||id==='email-request')value=identity.request(user,{...b,kind:id==='name'?'name':'email'});
      else if(id==='email-start')value=identity.emailBegin(user,b);else if(id==='email-code')value=identity.emailVerify(user,b);else if(id==='avatar')value=identity.avatar(user,b);else if(id==='theme')value=identity.theme(user,b);else fail(404,'Nieznana operacja profilu.');
    }else if(resource==='profile-requests'){if(method==='GET')value=identity.requests(user);else value=identity.review(pid,b,user);}
    else if(resource==='organizations')value=method==='GET'?resources.organizations(user):resources.saveOrganization(pid,b,user);
    else if(resource==='people'){if(!['admin','agent'].includes(user.role))fail(403,'Dostęp zespołu.');value=db.prepare("SELECT id,name,username FROM users WHERE account_kind='human' AND active=1 AND directory_active=1 AND registration_state='active' ORDER BY name").all();}
    else if(resource==='assets')value=method==='GET'?resources.assets(user,query.get('project'),query.get('q')||''):resources.saveAsset(pid,b,user);
    else if(resource==='templates')value=method==='GET'?templates.list(user):action==='delete'?templates.remove(pid,b,user):action==='apply'?templates.apply(pid,b,user):action==='clone'?templates.clone(pid,b,user):templates.save(pid,b,user);
    else if(resource==='sync')value=method==='GET'?sync.configs(user):sync.save(pid,b,user);
    else if(resource==='sso')value=method==='GET'?sso.list(user):action==='mapping'?sso.mapping(pid,b,user):sso.save(pid,b,user);
    else if(resource==='mail')value=method==='GET'?(id==='receipts'?mail.receipts(user):mail.list(user)):mail.save(pid,b,user);
    else if(resource==='webhooks')value=method==='GET'?(id==='jobs'?webhooks.jobs(user):webhooks.list(user)):webhooks.save(pid,b,user);
    else if(resource==='projects'){
      const p=projects.requireProject(pid,user,action==='settings');if(method==='POST'&&action==='detach-template')value=templates.detach(pid,b,user);else if(method==='GET'&&action==='reporters')value=desk.reporters(p,user,query.get('q')||'');else if(method==='GET'&&action==='settings')value=projects.view(p,user);else if(method==='PATCH'&&action==='settings')value=desk.saveSettings(pid,b,user);else fail(404,'Nieznane ustawienie projektu.');
    }else if(resource==='tickets'){
      const t=desk.requireTicket(pid,user);
      if(method==='GET')value={...desk.detail(t,user),sync:sync.available(t,user)};
      else if(action==='watch')value=lifecycle.watch(t.id,b,user);else if(action==='unlink')value=lifecycle.unlink(t.id,b,user);else if(action==='archive'){value=lifecycle.archive(t.id,b,user);if(!b.archived)workflows.automation.reconcile(t.project_id);}else if(action==='delete')value=lifecycle.remove(t.id,b,user);
      else if(action==='clone')value={key:desk.clone(t.id,b,user).key};else if(action==='link'){const other=db.prepare('SELECT id FROM tickets WHERE key=?').get(text(b.key,'Numer sprawy',3,30).toUpperCase());if(!other)fail(404,'Nie znaleziono sprawy.');desk.link(t.id,other.id,'related',user);value={ok:true};}
      else if(action==='transfer')value={key:sync.transfer(t.id,b.config_id,user,b).key};else if(action==='asset')value=resources.attach(t.id,b.asset_id,b.remove,user);else fail(404,'Nieznana operacja zgłoszenia.');
    }else if(resource==='mentions'){
      const t=desk.ticket(integer(Number(query.get('ticket')),'Zgłoszenie')),p=projects.project(t.project_id);if(!projects.canRead(user,p,t))fail(404,'Nieznana sprawa.');const q=(query.get('q')||'').toLowerCase(),staff=projects.canWork(user,p);value=db.prepare("SELECT * FROM users WHERE active=1 AND directory_active=1 AND registration_state='active' ORDER BY name").all().filter(u=>(u.name+' '+u.username).toLowerCase().includes(q)&&projects.canRead(u,p,t)&&(staff||u.id===user.id||projects.canWork(u,p))).slice(0,20).map(u=>({id:u.id,name:u.name,username:u.username}));
    }else if(resource==='events'){
      if(user.role!=='admin')fail(403,'Wymagany administrator.');if(method==='GET')value=db.prepare("SELECT e.id,e.event,e.error,e.created_at,t.key FROM desk_events e JOIN tickets t ON t.id=e.ticket_id WHERE e.status='failed' ORDER BY e.id DESC LIMIT 100").all();else{db.prepare("UPDATE desk_events SET status='queued' WHERE id=? AND status='failed'").run(integer(pid,'Zdarzenie'));events();value={ok:true};}
    }else fail(404,'Nieznany moduł.');if(resource==='tickets'&&method!=='GET'&&action!=='watch')notifications.autoWatch({ticket_id:pid,event:'ticket_updated',payload:JSON.stringify({actor_id:user.id,origin:'web'})});events();return {status,value};
  }
  return {api,lifecycle,templates,notifications,sync,resources,mail,webhooks,plugins,events,handle,start(){timer=setInterval(events,1000).unref();mail.start();webhooks.start();},stop(){clearInterval(timer);mail.stop();webhooks.stop();}};
}
