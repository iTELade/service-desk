import {randomBytes,createHash} from 'node:crypto';
import {fail,now,text,integer} from './core.mjs';

const DEFAULT_COLUMNS=['issue','status','priority','assignee','sla','updated'];
const ALLOWED_COLUMNS=new Set(DEFAULT_COLUMNS);
const QUICK_FILTERS=new Set(['','active','mine','unassigned','waiting','oldest','sla_risk']);
const SORTS=new Set(['updated_desc','created_desc','created_asc','priority']);
const SECONDARY_SORTS=new Set(['','updated','priority','status']);
const MAX_ATTACHMENT_BYTES=2*1024*1024;
const BLOCKED_EXT=/\.(?:exe|com|bat|cmd|ps1|sh|js|mjs|cjs|html?|svg)$/i;
const BLOCKED_MIME=/^(?:text\/html|image\/svg\+xml|application\/(?:javascript|x-javascript|x-msdownload|x-sh|x-shellscript))/i;

export function ensureRelease112Tables(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS r112_queue_preferences(
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL DEFAULT 0,
      columns_json TEXT NOT NULL DEFAULT '["issue","status","priority","assignee","sla","updated"]',
      sort_primary TEXT NOT NULL DEFAULT 'updated_desc',
      sort_secondary TEXT NOT NULL DEFAULT '',
      quick_filter TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,project_id)
    );
    CREATE TABLE IF NOT EXISTS r112_attachments(
      id TEXT PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL CHECK(size>=0),
      internal INTEGER NOT NULL DEFAULT 0 CHECK(internal IN (0,1)),
      sha256 TEXT NOT NULL,
      content BLOB NOT NULL,
      source TEXT NOT NULL DEFAULT 'web' CHECK(source IN ('web','email','api')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_r112_attachments_ticket ON r112_attachments(ticket_id,created_at,id);
    CREATE INDEX IF NOT EXISTS idx_r112_attachments_comment ON r112_attachments(comment_id,id);
  `);
}

function cleanFilename(value){
  const name=String(value||'').replace(/[\\/\0\r\n]/g,'_').trim().slice(0,200);
  if(!name)fail(400,'Nazwa pliku jest wymagana.');
  if(BLOCKED_EXT.test(name))fail(400,'Ten typ pliku jest zablokowany.');
  return name;
}
function cleanMime(value){
  const mime=String(value||'application/octet-stream').toLowerCase().trim().slice(0,120)||'application/octet-stream';
  if(BLOCKED_MIME.test(mime))fail(400,'Ten typ MIME jest zablokowany.');
  return mime;
}
function decodeBase64(value){
  if(typeof value!=='string'||value.length>Math.ceil(MAX_ATTACHMENT_BYTES/3)*4+16||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))fail(400,'Nieprawidłowa zawartość załącznika.');
  const data=Buffer.from(value,'base64');
  if(!data.length)fail(400,'Załącznik jest pusty.');
  if(data.length>MAX_ATTACHMENT_BYTES)fail(413,'Załącznik może mieć maksymalnie 2 MB.');
  return data;
}
function safeColumns(value){
  if(!Array.isArray(value))return [...DEFAULT_COLUMNS];
  const columns=[...new Set(value.map(String).filter(x=>ALLOWED_COLUMNS.has(x)))];
  if(!columns.includes('issue'))columns.unshift('issue');
  return columns.length?columns:['issue','status','priority','updated'];
}
function visibleTicket(db,projects,desk,user,value){
  let t;
  if(Number.isSafeInteger(Number(value))&&Number(value)>0)t=desk.ticket(Number(value));
  else t=db.prepare('SELECT * FROM tickets WHERE key=? OR id=(SELECT ticket_id FROM ticket_aliases WHERE key=?) LIMIT 1').get(String(value||'').toUpperCase(),String(value||'').toUpperCase());
  if(!t||!projects.canRead(user,projects.project(t.project_id),t))fail(404,'Nie znaleziono zgłoszenia.');
  return t;
}
function canSeeUser(db,projects,actor,target){
  if(actor.role==='admin'||actor.id===target.id)return true;
  if(actor.role!=='agent')return false;
  const actorProjects=projects.list(actor).filter(p=>p.can_work).map(p=>p.id);
  if(!actorProjects.length)return false;
  const marks=actorProjects.map(()=>'?').join(',');
  return Boolean(db.prepare(`SELECT 1 FROM project_members WHERE user_id=? AND project_id IN (${marks}) LIMIT 1`).get(target.id,...actorProjects));
}
function store(db,{ticketId,commentId=null,uploaderId=null,filename,mime,data,internal=false,source='web'}){
  const id=randomBytes(18).toString('hex'),sha=createHash('sha256').update(data).digest('hex');
  db.prepare('INSERT INTO r112_attachments(id,ticket_id,comment_id,uploader_id,filename,mime,size,internal,sha256,content,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,ticketId,commentId,uploaderId,filename,mime,data.length,Number(Boolean(internal)),sha,data,source,now());
  return id;
}

export function storeInboundAttachments(db,ticketId,commentId,attachments,uploaderId=null){
  ensureRelease112Tables(db);
  let stored=0,rejected=0;
  for(const item of Array.isArray(attachments)?attachments:[]){
    try{
      const content=Buffer.isBuffer(item?.content)?item.content:Buffer.from(item?.content||'');
      if(!content.length||content.length>MAX_ATTACHMENT_BYTES){rejected++;continue;}
      const filename=cleanFilename(item.filename||'attachment.bin'),mime=cleanMime(item.contentType||'application/octet-stream');
      if(item.contentDisposition==='inline'&&/^image\//.test(mime)&&content.length<4096)continue;
      store(db,{ticketId,commentId,uploaderId,filename,mime,data:content,internal:false,source:'email'});stored++;
    }catch{rejected++;}
  }
  return {stored,rejected};
}

export function createRelease112(db,projects,desk){
  ensureRelease112Tables(db);
  function preferences(method,user,query,b){
    if(!['admin','agent'].includes(user.role))fail(403,'Kolejki są dostępne zespołowi.');
    const projectId=Number(method==='GET'?query.get('project'):(b.project_id??0))||0;
    if(projectId){const p=projects.project(projectId);if(!p||!projects.canWork(user,p))fail(403,'Brak dostępu do kolejki projektu.');}
    if(method==='GET'){
      const row=db.prepare('SELECT * FROM r112_queue_preferences WHERE user_id=? AND project_id=?').get(user.id,projectId);
      return row?{project_id:projectId,columns:safeColumns(JSON.parse(row.columns_json)),sort_primary:row.sort_primary,sort_secondary:row.sort_secondary,quick_filter:row.quick_filter}:{project_id:projectId,columns:[...DEFAULT_COLUMNS],sort_primary:'updated_desc',sort_secondary:'',quick_filter:''};
    }
    const columns=safeColumns(b.columns),sortPrimary=SORTS.has(String(b.sort_primary||''))?String(b.sort_primary):'updated_desc',sortSecondary=SECONDARY_SORTS.has(String(b.sort_secondary||''))?String(b.sort_secondary):'',quick=QUICK_FILTERS.has(String(b.quick_filter||''))?String(b.quick_filter):'';
    db.prepare(`INSERT INTO r112_queue_preferences(user_id,project_id,columns_json,sort_primary,sort_secondary,quick_filter,updated_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET columns_json=excluded.columns_json,sort_primary=excluded.sort_primary,sort_secondary=excluded.sort_secondary,quick_filter=excluded.quick_filter,updated_at=excluded.updated_at`)
      .run(user.id,projectId,JSON.stringify(columns),sortPrimary,sortSecondary,quick,now());
    return {project_id:projectId,columns,sort_primary:sortPrimary,sort_secondary:sortSecondary,quick_filter:quick};
  }

  function search(user,query){
    const q=text(query.get('q')||'','Szukaj',2,120),like='%'+q.toLowerCase()+'%',upper=q.toUpperCase(),results={tickets:[],users:[],organizations:[],assets:[],knowledge:[]};
    const ticketRows=db.prepare(`SELECT t.id,t.key,t.title,t.status,t.workflow_status,t.priority,t.project_id,t.updated_at,p.name project_name FROM tickets t JOIN projects p ON p.id=t.project_id
      WHERE t.deleted_at IS NULL AND (lower(t.key)=? OR lower(t.key) LIKE ? OR lower(t.title) LIKE ? OR lower(t.description) LIKE ?) ORDER BY CASE WHEN upper(t.key)=? THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 80`)
      .all(q.toLowerCase(),like,like,like,upper);
    for(const r of ticketRows){const full=desk.ticket(r.id);if(full&&projects.canRead(user,projects.project(r.project_id),full)){results.tickets.push(r);if(results.tickets.length>=20)break;}}
    if(user.role!=='customer'){
      for(const u of db.prepare("SELECT id,name,username,email FROM users WHERE account_kind='human' AND active=1 AND directory_active=1 AND registration_state='active' AND (lower(name) LIKE ? OR lower(username) LIKE ? OR lower(email) LIKE ?) ORDER BY name LIMIT 80").all(like,like,like)){
        if(canSeeUser(db,projects,user,u)){results.users.push(u);if(results.users.length>=15)break;}
      }
      for(const o of db.prepare('SELECT id,name FROM organizations WHERE lower(name) LIKE ? ORDER BY name LIMIT 50').all(like)){
        const allowed=user.role==='admin'||db.prepare('SELECT project_id FROM project_organizations WHERE organization_id=?').all(o.id).some(x=>projects.canWork(user,projects.project(x.project_id)));
        if(allowed){results.organizations.push(o);if(results.organizations.length>=15)break;}
      }
      for(const a of db.prepare('SELECT id,asset_key,name,kind,serial,status,project_id FROM assets WHERE lower(name) LIKE ? OR lower(asset_key) LIKE ? OR lower(serial) LIKE ? ORDER BY name LIMIT 80').all(like,like,like)){
        if(projects.canWork(user,projects.project(a.project_id))){results.assets.push(a);if(results.assets.length>=15)break;}
      }
    }
    return {query:q,...results};
  }

  function attachmentList(user,query){
    const t=visibleTicket(db,projects,desk,user,query.get('ticket'));
    const canWork=projects.canWork(user,projects.project(t.project_id));
    return db.prepare('SELECT id,ticket_id,comment_id,uploader_id,filename,mime,size,internal,sha256,source,created_at FROM r112_attachments WHERE ticket_id=? ORDER BY created_at,id').all(t.id)
      .filter(a=>canWork||!a.internal).map(a=>({...a,internal:Boolean(a.internal)}));
  }
  function attachmentCreate(user,b){
    const t=visibleTicket(db,projects,desk,user,b.ticket_id??b.ticket_key),p=projects.project(t.project_id),internal=Boolean(b.internal);
    if(internal&&!projects.canWork(user,p))fail(403,'Tylko zespół może dodać załącznik wewnętrzny.');
    if(t.status==='closed')fail(409,'Zamknięta sprawa jest ostateczna.');
    let commentId=null;if(b.comment_id!==undefined&&b.comment_id!==null){commentId=integer(Number(b.comment_id),'Komentarz');const c=db.prepare('SELECT ticket_id,internal FROM comments WHERE id=?').get(commentId);if(!c||c.ticket_id!==t.id)fail(400,'Komentarz nie należy do zgłoszenia.');if(Boolean(c.internal)!==internal)fail(400,'Widoczność załącznika musi odpowiadać komentarzowi.');}
    const filename=cleanFilename(b.filename),mime=cleanMime(b.mime),data=decodeBase64(b.data_base64),id=store(db,{ticketId:t.id,commentId,uploaderId:user.id,filename,mime,data,internal,source:'web'});
    projects.audit(t.project_id,user,'ticket.attachment_added',{ticket_id:t.id,attachment_id:id,filename,size:data.length,internal});
    return attachmentList(user,new URLSearchParams({ticket:String(t.id)})).find(x=>x.id===id);
  }
  function attachmentContent(user,id){
    const a=db.prepare('SELECT * FROM r112_attachments WHERE id=?').get(String(id||''));if(!a)fail(404,'Załącznik nie istnieje.');const t=visibleTicket(db,projects,desk,user,a.ticket_id),canWork=projects.canWork(user,projects.project(t.project_id));if(a.internal&&!canWork)fail(404,'Załącznik nie istnieje.');
    return {id:a.id,filename:a.filename,mime:a.mime,size:a.size,sha256:a.sha256,data_base64:Buffer.from(a.content).toString('base64')};
  }
  function attachmentDelete(user,id){
    const a=db.prepare('SELECT * FROM r112_attachments WHERE id=?').get(String(id||''));if(!a)fail(404,'Załącznik nie istnieje.');const t=visibleTicket(db,projects,desk,user,a.ticket_id),p=projects.project(t.project_id);if(user.id!==a.uploader_id&&!projects.canWork(user,p))fail(403,'Nie możesz usunąć tego załącznika.');if(t.status==='closed')fail(409,'Zamknięta sprawa jest ostateczna.');db.prepare('DELETE FROM r112_attachments WHERE id=?').run(a.id);projects.audit(t.project_id,user,'ticket.attachment_removed',{ticket_id:t.id,attachment_id:a.id});return {ok:true};
  }

  function handle(method,id,action,user,query,b){
    if(id==='queue-preferences')return preferences(method,user,query,b);
    if(id==='search'){if(method!=='GET')fail(405,'Metoda niedozwolona.');return search(user,query);}
    if(id==='attachments')return method==='GET'?attachmentList(user,query):attachmentCreate(user,b);
    if(id==='attachment'&&action)return method==='GET'?attachmentContent(user,action):b?.delete?attachmentDelete(user,action):fail(405,'Metoda niedozwolona.');
    fail(404,'Nieznana funkcja Service Desk 1.1.2.');
  }
  return {handle,preferences,search,attachmentList,attachmentCreate,attachmentContent,attachmentDelete};
}
