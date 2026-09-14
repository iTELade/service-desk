import {fail,now,integer,txFor} from './core.mjs';

export function createNotifications(db,projects,desk){
  const staff=u=>['admin','agent'].includes(u.role),tx=txFor(db);
  function recipients(t,{internal=false,actor_id=null,mentions=[],staff_update=false}={}){
    const p=projects.project(t.project_id),actor=actor_id?db.prepare('SELECT * FROM users WHERE id=?').get(actor_id):null,isAgent=staff_update||(actor&&projects.canWork(actor,p));
    const ids=new Set([...(isAgent?[t.reporter_id]:actor?[t.assignee_id,t.created_by]:[t.reporter_id,t.assignee_id,t.created_by]),...db.prepare('SELECT user_id FROM ticket_watchers WHERE ticket_id=?').all(t.id).map(x=>x.user_id),...mentions]);
    return [...ids].filter(Boolean).map(id=>db.prepare('SELECT * FROM users WHERE id=?').get(id)).filter(u=>u&&u.id!==actor_id&&u.active&&u.directory_active&&u.registration_state==='active'&&u.account_kind==='human'&&projects.canRead(u,projects.project(t.project_id),t)&&(!internal||projects.canWork(u,projects.project(t.project_id))));
  }
  function notify(e){
    const t=desk.ticket(e.ticket_id);if(!t||t.deleted_at)return;
    const payload=JSON.parse(e.payload);let actor=e.event==='ticket_created'?t.created_by:payload.actor_id??t.last_actor_id,internal=false,mentions=[],staffUpdate=['sync','automation'].includes(payload.origin),action=e.event==='ticket_created'?'Utworzono zgłoszenie':e.event==='status_changed'?'Zmieniono status':e.event==='ticket_updated'?'Zaktualizowano zgłoszenie':null;
    if(e.event==='comment_added'){
      const c=db.prepare('SELECT * FROM comments WHERE id=?').get(payload.comment_id);if(!c)return;actor=c.actual_actor_id||c.author_id;internal=Boolean(c.internal);staffUpdate=['sync','automation'].includes(c.origin);action=internal?'Dodano notatkę wewnętrzną':'Dodano odpowiedź';
      mentions=[...c.body.matchAll(/@([a-zA-Z0-9._-]+)/g)].map(m=>db.prepare('SELECT id FROM users WHERE username=?').get(m[1])?.id).filter(Boolean);
    }
    if(!action)return;
    for(const u of recipients(t,{actor_id:actor,internal,mentions,staff_update:staffUpdate}).filter(staff))db.prepare('INSERT OR IGNORE INTO notifications(user_id,ticket_id,body,event_id,created_at) VALUES(?,?,?,?,?)').run(u.id,t.id,`${action}: ${t.key} — ${t.title}`,e.id,e.created_at);
  }
  function list(u){if(!staff(u))fail(403,'Powiadomienia zespołu.');
    const scope=projects.ticketScope(u);
    const allowed=`n.user_id=? AND (n.ticket_id IS NULL OR (t.deleted_at IS NULL AND ${scope.sql}))`;
    const args=[u.id,...scope.values];
    const rows=db.prepare(`SELECT n.*,t.key ticket_key FROM notifications n LEFT JOIN tickets t ON t.id=n.ticket_id WHERE ${allowed} ORDER BY n.id DESC LIMIT 100`).all(...args);
    const unread=db.prepare(`SELECT COUNT(*) n FROM notifications n LEFT JOIN tickets t ON t.id=n.ticket_id WHERE ${allowed} AND n.seen=0`).get(...args).n;
    return {items:rows,unread};
  }
  function seen(u,b){if(!staff(u))fail(403,'Powiadomienia zespołu.');if(b.all===true){const through=integer(b.through_id,'Ostatnie widoczne powiadomienie',0);db.prepare('UPDATE notifications SET seen=1 WHERE user_id=? AND id<=?').run(u.id,through);}else db.prepare('UPDATE notifications SET seen=1 WHERE user_id=? AND id=?').run(u.id,integer(b.id,'Powiadomienie'));return list(u);}
  function autoWatch(e){const t=desk.ticket(e.ticket_id);if(!t||t.deleted_at)return;const p=projects.project(t.project_id),payload=JSON.parse(e.payload),cfg=JSON.parse(p.settings||'{}');if(cfg.auto_watch===false)return;let actorId=e.event==='ticket_created'?t.created_by:payload.actor_id??t.last_actor_id,origin=payload.origin;if(e.event==='comment_added'){const c=db.prepare('SELECT * FROM comments WHERE id=?').get(payload.comment_id);if(!c)return;actorId=c.actual_actor_id||c.author_id;origin=c.origin;}if(['automation','sync','api','webhook'].includes(origin))return;const u=db.prepare('SELECT * FROM users WHERE id=?').get(actorId??0);if(u?.active&&u.directory_active&&projects.canWork(u,p))db.prepare('INSERT OR IGNORE INTO ticket_watchers(ticket_id,user_id,created_at) VALUES(?,?,?)').run(t.id,u.id,now());}
  return {recipients,notify,list,seen,autoWatch};
}
