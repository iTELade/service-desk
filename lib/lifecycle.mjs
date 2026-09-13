import {fail,integer,text,boolean,txFor,now} from './core.mjs';

export function createLifecycle(db,projects,desk){
  const tx=txFor(db);
  function lookup(u,q,exclude){
    if(!['admin','agent'].includes(u.role))fail(403,'Dostęp zespołu.');
    q=text(q,'Klucz',0,30).toUpperCase();
    if(!/^[A-Z][A-Z0-9]{1,9}-\d{3,10}$/.test(q))return [];
    const scope=projects.ticketScope(u);
    return db.prepare(`SELECT t.* FROM tickets t WHERE ${scope.sql} AND t.deleted_at IS NULL AND t.id<>? AND t.key LIKE ? ORDER BY t.number LIMIT 50`).all(...scope.values,Number(exclude)||0,q+'%').filter(t=>projects.canWork(u,projects.project(t.project_id))).slice(0,15).map(t=>({id:t.id,key:t.key,title:t.title,status:t.status,archived:Boolean(t.archived_at)}));
  }
  function unlink(id,b,u){return tx(()=>{
    const t=desk.requireTicket(id,u),link=db.prepare('SELECT * FROM ticket_links WHERE id=? AND (source_id=? OR target_id=?)').get(integer(b.link_id,'Powiązanie'),id,id);
    if(!link)fail(404,'Powiązanie nie istnieje.');
    desk.requireTicket(link.source_id===id?link.target_id:link.source_id,u);
    db.prepare('UPDATE sync_pairs SET enabled=0 WHERE (source_id=? AND target_id=?) OR (source_id=? AND target_id=?)').run(link.source_id,link.target_id,link.target_id,link.source_id);
    db.prepare('DELETE FROM ticket_links WHERE id=?').run(link.id);
    projects.audit(t.project_id,u,'ticket.unlinked',{ticket_id:id,link_id:link.id,other_id:link.source_id===id?link.target_id:link.source_id});return {ok:true};
  });}
  function archive(id,b,u){return tx(()=>{
    const t=desk.requireTicket(id,u);if(b.version!==t.version)fail(409,'Zgłoszenie zmieniło się. Odśwież.');
    const value=boolean(b.archived,'Archiwizacja'),stamp=now();
    db.prepare('UPDATE tickets SET archived_at=?,updated_at=?,version=version+1,last_actor_id=? WHERE id=?').run(value?stamp:null,stamp,u.id,id);
    if(value)cancel(id);
    projects.audit(t.project_id,u,value?'ticket.archived':'ticket.restored',{ticket_id:id,key:t.key});return {ok:true};
  });}
  function cancel(id){
    db.prepare("UPDATE automation_jobs SET status='cancelled' WHERE ticket_id=? AND status='queued'").run(id);
  }
  function remove(id,b,u){return tx(()=>{
    if(u.role!=='admin')fail(403,'Zgłoszenie usuwa administrator. Agent może je zarchiwizować.');
    const t=desk.requireTicket(id,u);if(b.version!==t.version)fail(409,'Zgłoszenie zmieniło się. Odśwież.');
    if(b.confirm_key!==t.key)fail(400,'Wpisz pełny klucz usuwanej sprawy.');
    const stamp=now();cancel(id);
    db.prepare('UPDATE sync_pairs SET enabled=0 WHERE source_id=? OR target_id=?').run(id,id);
    db.prepare('DELETE FROM ticket_links WHERE source_id=? OR target_id=?').run(id,id);
    db.prepare('DELETE FROM ticket_assets WHERE ticket_id=?').run(id);
    db.prepare('DELETE FROM ticket_watchers WHERE ticket_id=?').run(id);
    db.prepare('DELETE FROM notifications WHERE ticket_id=?').run(id);
    db.prepare("UPDATE mail_outbox SET status='failed',body='',metadata=NULL,last_error='Zgłoszenie usunięte.' WHERE ticket_id=? AND status<>'sent'").run(id);
    db.prepare("UPDATE desk_events SET status='done',error=NULL WHERE ticket_id=?").run(id);
    // Retain the minimal ticket tombstone and relational audit identity, never the conversation.
    db.prepare("UPDATE comments SET body='[Usunięto treść]',source_comment_id=NULL WHERE ticket_id=?").run(id);
    db.prepare("UPDATE activity SET body='[Usunięto treść historii]' WHERE ticket_id=?").run(id);
    db.prepare("UPDATE tickets SET deleted_at=?,archived_at=COALESCE(archived_at,?),title='[Usunięte zgłoszenie]',description='',custom_values='{}',form_snapshot='{}',resolution_text='',updated_at=?,version=version+1,last_actor_id=? WHERE id=?").run(stamp,stamp,stamp,u.id,id);
    projects.audit(t.project_id,u,'ticket.deleted',{ticket_id:id,key:t.key,key_reserved:true});return {ok:true,reserved_key:t.key};
  });}
  function watch(id,b,u){const t=desk.requireTicket(id,u);if(u.account_kind!=='human')fail(403,'Obserwowanie wymaga konta osoby.');const watching=boolean(b.watching,'Obserwowanie');if(watching)db.prepare('INSERT OR IGNORE INTO ticket_watchers VALUES(?,?,?)').run(t.id,u.id,now());else db.prepare('DELETE FROM ticket_watchers WHERE ticket_id=? AND user_id=?').run(t.id,u.id);return {watching};}
  return {lookup,unlink,archive,remove,watch};
}
