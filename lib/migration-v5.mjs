import {txFor,now} from './core.mjs';
import {parts,username} from './usernames.mjs';
export function migrateV5(db){
  const v=db.prepare('PRAGMA user_version').get().user_version;if(v===5)return;if(v!==4)throw new Error('Migracja v5 wymaga bazy v4.');
  txFor(db)(()=>{
    db.exec(`
      ALTER TABLE users ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'human' CHECK(account_kind IN ('human','service'));
      ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE;
      ALTER TABLE users ADD COLUMN sso_only INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'system';
      CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;
      ALTER TABLE projects ADD COLUMN module_type TEXT NOT NULL DEFAULT 'tickets';
      ALTER TABLE projects ADD COLUMN settings TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE request_types ADD COLUMN base_fields TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE tickets ADD COLUMN created_by INTEGER REFERENCES users(id);
      ALTER TABLE tickets ADD COLUMN resolution_text TEXT NOT NULL DEFAULT '';
      ALTER TABLE tickets ADD COLUMN closed_at TEXT;
      ALTER TABLE tickets ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
      ALTER TABLE tickets ADD COLUMN origin TEXT NOT NULL DEFAULT 'web';
      ALTER TABLE tickets ADD COLUMN change_source TEXT NOT NULL DEFAULT 'web';
      ALTER TABLE tickets ADD COLUMN mail_channel_id INTEGER REFERENCES email_channels(id);
      ALTER TABLE tickets ADD COLUMN tracking_complete INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE comments ADD COLUMN actual_actor_id INTEGER REFERENCES users(id);
      ALTER TABLE comments ADD COLUMN origin TEXT NOT NULL DEFAULT 'web';
      ALTER TABLE comments ADD COLUMN source_comment_id INTEGER REFERENCES comments(id);
      CREATE TABLE organizations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,share_tickets INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE organization_members(organization_id INTEGER NOT NULL REFERENCES organizations(id),user_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(organization_id,user_id));
      CREATE INDEX idx_org_user ON organization_members(user_id,organization_id);
      CREATE TABLE project_organizations(project_id INTEGER NOT NULL REFERENCES projects(id),organization_id INTEGER NOT NULL REFERENCES organizations(id),PRIMARY KEY(project_id,organization_id));
      CREATE TABLE status_spans(id INTEGER PRIMARY KEY,ticket_id INTEGER NOT NULL REFERENCES tickets(id),status_key TEXT NOT NULL,status_name TEXT NOT NULL,category TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT);
      CREATE INDEX idx_spans_ticket ON status_spans(ticket_id,started_at);
      CREATE UNIQUE INDEX idx_span_current ON status_spans(ticket_id) WHERE ended_at IS NULL;
      CREATE TABLE ticket_links(id INTEGER PRIMARY KEY,source_id INTEGER NOT NULL REFERENCES tickets(id),target_id INTEGER NOT NULL REFERENCES tickets(id),kind TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,UNIQUE(source_id,target_id,kind),CHECK(source_id<>target_id));
      CREATE INDEX idx_links_target ON ticket_links(target_id);
      CREATE TABLE workflow_templates(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,config TEXT NOT NULL,is_default INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1);
      CREATE UNIQUE INDEX idx_workflow_default ON workflow_templates(is_default) WHERE is_default=1;
      CREATE TABLE sync_configs(id INTEGER PRIMARY KEY,name TEXT NOT NULL,source_project INTEGER NOT NULL REFERENCES projects(id),target_project INTEGER NOT NULL REFERENCES projects(id),config TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1,CHECK(source_project<>target_project));
      CREATE TABLE sync_pairs(id INTEGER PRIMARY KEY,config_id INTEGER NOT NULL REFERENCES sync_configs(id),source_id INTEGER NOT NULL REFERENCES tickets(id),target_id INTEGER NOT NULL REFERENCES tickets(id),created_at TEXT NOT NULL,UNIQUE(config_id,source_id),UNIQUE(config_id,target_id));
      CREATE TABLE sync_deliveries(pair_id INTEGER NOT NULL REFERENCES sync_pairs(id),comment_id INTEGER NOT NULL REFERENCES comments(id),copied_id INTEGER NOT NULL REFERENCES comments(id),PRIMARY KEY(pair_id,comment_id));
      CREATE TABLE avatars(user_id INTEGER PRIMARY KEY REFERENCES users(id),mime TEXT NOT NULL,body BLOB NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE profile_requests(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,reviewer_id INTEGER REFERENCES users(id),reviewed_at TEXT);
      CREATE TABLE identity_tokens(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),purpose TEXT NOT NULL,payload TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX idx_identity_user ON identity_tokens(user_id,purpose);
      CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),ticket_id INTEGER REFERENCES tickets(id),body TEXT NOT NULL,seen INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
      CREATE INDEX idx_notifications_user ON notifications(user_id,seen,id DESC);
      CREATE TABLE assets(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),asset_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'Urządzenie',serial TEXT NOT NULL DEFAULT '',owner_id INTEGER REFERENCES users(id),status TEXT NOT NULL DEFAULT 'W użyciu',data TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE INDEX idx_assets_project ON assets(project_id,name);
      CREATE TABLE ticket_assets(ticket_id INTEGER NOT NULL REFERENCES tickets(id),asset_id INTEGER NOT NULL REFERENCES assets(id),PRIMARY KEY(ticket_id,asset_id));
      CREATE TABLE email_channels(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,config TEXT NOT NULL,secret TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,uidvalidity TEXT,uid_cursor INTEGER NOT NULL DEFAULT 0,last_error TEXT,last_poll TEXT,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE mail_receipts(id INTEGER PRIMARY KEY,channel_id INTEGER NOT NULL REFERENCES email_channels(id),uidvalidity TEXT NOT NULL,uid INTEGER NOT NULL,message_id TEXT,ticket_id INTEGER REFERENCES tickets(id),status TEXT NOT NULL,detail TEXT,created_at TEXT NOT NULL,UNIQUE(channel_id,uidvalidity,uid));
      CREATE INDEX idx_receipt_message ON mail_receipts(channel_id,message_id);
      CREATE TABLE mail_threads(message_id TEXT PRIMARY KEY,ticket_id INTEGER NOT NULL REFERENCES tickets(id),channel_id INTEGER REFERENCES email_channels(id));
      ALTER TABLE mail_outbox ADD COLUMN channel_id INTEGER REFERENCES email_channels(id);
      ALTER TABLE mail_outbox ADD COLUMN ticket_id INTEGER REFERENCES tickets(id);
      ALTER TABLE mail_outbox ADD COLUMN metadata TEXT;
      CREATE TABLE sso_providers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,issuer TEXT NOT NULL,client_id TEXT NOT NULL,secret TEXT NOT NULL,config TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE sso_subjects(provider_id INTEGER NOT NULL REFERENCES sso_providers(id),subject TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(provider_id,subject));
      CREATE TABLE sso_states(state TEXT PRIMARY KEY,provider_id INTEGER NOT NULL REFERENCES sso_providers(id),payload TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE webhook_endpoints(id INTEGER PRIMARY KEY,name TEXT NOT NULL,project_id INTEGER NOT NULL REFERENCES projects(id),direction TEXT NOT NULL,config TEXT NOT NULL,secret TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE webhook_jobs(id INTEGER PRIMARY KEY,endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id),payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,last_error TEXT,created_at TEXT NOT NULL);
      CREATE INDEX idx_webhook_due ON webhook_jobs(status,next_attempt);
      CREATE TABLE webhook_receipts(endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id),receipt TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(endpoint_id,receipt));
      CREATE TABLE desk_events(id INTEGER PRIMARY KEY,ticket_id INTEGER NOT NULL REFERENCES tickets(id),event TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',error TEXT);
      CREATE INDEX idx_desk_events_status ON desk_events(status,id);
      CREATE TABLE desk_event_deliveries(event_id INTEGER NOT NULL REFERENCES desk_events(id),module TEXT NOT NULL,PRIMARY KEY(event_id,module));
    `);
    for(const u of db.prepare('SELECT * FROM users ORDER BY id').all()){
      const p=parts(u.name),login=u.auth_source==='ldap'?u.ldap_login:null;
      // Directory logins retain their original spelling; collisions abort instead of silently renaming.
      const un=login||username(db,p.first_name,p.last_name);
      db.prepare('UPDATE users SET username=?,first_name=?,last_name=? WHERE id=?').run(un,p.first_name,p.last_name,u.id);
    }
    const stamp=now();
    db.prepare("INSERT INTO users(email,name,password,role,must_change,created_at,is_internal,email_verified,account_kind,username,first_name) VALUES('bot@desk.invalid','iTELade Bot','!service','agent',0,?,1,1,'service','itelade.bot','iTELade Bot')").run(stamp);
    const bot=db.prepare("SELECT id FROM users WHERE username='itelade.bot'").get();
    db.prepare("INSERT INTO project_members(project_id,user_id,role) SELECT id,?,'agent' FROM projects").run(bot.id);
    db.exec("UPDATE tickets SET created_by=COALESCE((SELECT actor_id FROM activity WHERE ticket_id=tickets.id ORDER BY id LIMIT 1),reporter_id),tracking_complete=0,closed_at=CASE WHEN status='closed' THEN updated_at END;");
    for(const t of db.prepare('SELECT * FROM tickets').all()){
      const w=JSON.parse(db.prepare('SELECT config FROM project_workflows WHERE project_id=?').get(t.project_id).config),s=w.statuses.find(s=>s.key===t.workflow_status);
      const start=t.closed_at||stamp;
      db.prepare('INSERT INTO status_spans(ticket_id,status_key,status_name,category,started_at,ended_at) VALUES(?,?,?,?,?,?)').run(t.id,t.workflow_status,s?.name||t.status,t.status,start,t.closed_at||null);
    }
    const w=db.prepare('SELECT config FROM project_workflows ORDER BY project_id LIMIT 1').get();
    if(w){const c=JSON.parse(w.config);c.rules=[];c.transitions=c.transitions.filter(t=>c.statuses.find(s=>s.key===t.from)?.category!=='closed');db.prepare('INSERT INTO workflow_templates(name,config,is_default) VALUES(?,?,1)').run('Domyślny obieg iTELade',JSON.stringify(c));}
    db.exec(`
      CREATE TRIGGER ticket_final BEFORE UPDATE OF status,workflow_status ON tickets WHEN OLD.status='closed' AND (NEW.status<>OLD.status OR NEW.workflow_status<>OLD.workflow_status) BEGIN SELECT RAISE(ABORT,'DESK_FINAL_CLOSED'); END;
      CREATE TRIGGER ticket_resolution BEFORE UPDATE OF workflow_status ON tickets WHEN OLD.workflow_status<>NEW.workflow_status AND
        (SELECT json_extract(settings,'$.resolution_required') FROM projects WHERE id=NEW.project_id)=1 AND
        (NEW.status='closed' OR EXISTS(SELECT 1 FROM projects p,json_each(p.settings,'$.resolution_statuses') s WHERE p.id=NEW.project_id AND s.value=NEW.workflow_status)) AND length(trim(NEW.resolution_text))=0
        BEGIN SELECT RAISE(ABORT,'DESK_RESOLUTION_REQUIRED'); END;
      CREATE TRIGGER ticket_span_insert AFTER INSERT ON tickets BEGIN
        INSERT INTO status_spans(ticket_id,status_key,status_name,category,started_at,ended_at) VALUES(NEW.id,NEW.workflow_status,COALESCE((SELECT json_extract(s.value,'$.name') FROM project_workflows w,json_each(w.config,'$.statuses') s WHERE w.project_id=NEW.project_id AND json_extract(s.value,'$.key')=NEW.workflow_status),NEW.status),NEW.status,NEW.created_at,NEW.closed_at);
        INSERT INTO desk_events(ticket_id,event,payload,created_at) VALUES(NEW.id,'ticket_created','{}',NEW.created_at);
      END;
      CREATE TRIGGER ticket_span_change AFTER UPDATE OF workflow_status ON tickets WHEN OLD.workflow_status<>NEW.workflow_status BEGIN
        UPDATE status_spans SET ended_at=NEW.updated_at WHERE ticket_id=NEW.id AND ended_at IS NULL;
        INSERT INTO status_spans(ticket_id,status_key,status_name,category,started_at,ended_at) VALUES(NEW.id,NEW.workflow_status,COALESCE((SELECT json_extract(s.value,'$.name') FROM project_workflows w,json_each(w.config,'$.statuses') s WHERE w.project_id=NEW.project_id AND json_extract(s.value,'$.key')=NEW.workflow_status),NEW.status),NEW.status,NEW.updated_at,CASE WHEN NEW.status='closed' THEN NEW.updated_at END);
        UPDATE tickets SET closed_at=CASE WHEN NEW.status='closed' THEN NEW.updated_at END,customer_reply_locked=CASE WHEN NEW.status='closed' THEN 1 ELSE customer_reply_locked END WHERE id=NEW.id;
        INSERT INTO desk_events(ticket_id,event,payload,created_at) VALUES(NEW.id,'status_changed',json_object('from',OLD.workflow_status,'to',NEW.workflow_status,'origin',NEW.change_source),NEW.updated_at);
      END;
      CREATE TRIGGER comment_event AFTER INSERT ON comments BEGIN
        INSERT INTO desk_events(ticket_id,event,payload,created_at) VALUES(NEW.ticket_id,'comment_added',json_object('comment_id',NEW.id,'origin',NEW.origin),NEW.created_at);
      END;
      PRAGMA user_version=5; PRAGMA optimize;
    `);
  });
}
