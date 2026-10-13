import {createProjects} from './projects.mjs';
export function mailAllowed(db,message,metadata={}){
  if(!message.ticket_id)return true;
  const t=db.prepare('SELECT * FROM tickets WHERE id=?').get(message.ticket_id),u=db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(message.recipient);
  if(!t||t.deleted_at||!u?.active||!u.directory_active||u.registration_state!=='active'||u.account_kind!=='human')return false;
  const projects=createProjects(db),p=projects.project(t.project_id);
  if(!projects.canRead(u,p,t)||metadata.desk_internal&&!projects.canWork(u,p))return false;
  if(metadata.desk_digest_ticket_ids!==undefined){
    const ids=metadata.desk_digest_ticket_ids;
    if(!metadata.desk_internal||!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length||!ids.includes(t.id))return false;
    for(const id of ids){
      const other=db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
      if(!other||other.deleted_at||other.project_id!==t.project_id||!projects.canRead(u,p,other)||!projects.canWork(u,p))return false;
    }
  }
  return true;
}
