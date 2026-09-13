import {createProjects} from './projects.mjs';
export function mailAllowed(db,message,metadata={}){
  if(!message.ticket_id)return true;
  const t=db.prepare('SELECT * FROM tickets WHERE id=?').get(message.ticket_id),u=db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(message.recipient);
  if(!t||t.deleted_at||!u?.active||!u.directory_active||u.registration_state!=='active'||u.account_kind!=='human')return false;
  const projects=createProjects(db),p=projects.project(t.project_id);
  return projects.canRead(u,p,t)&&(!metadata.desk_internal||projects.canWork(u,p));
}
