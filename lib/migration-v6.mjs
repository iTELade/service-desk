import {txFor} from './core.mjs';
import {defaultWorkflow} from './workflows.mjs';

export function migrateV6(db) {
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version===6)return;
  if(version!==5)throw new Error('Migracja v6 wymaga bazy v5.');
  txFor(db)(()=>{
    db.exec(`
      ALTER TABLE tickets ADD COLUMN archived_at TEXT;
      ALTER TABLE tickets ADD COLUMN deleted_at TEXT;
      ALTER TABLE tickets ADD COLUMN last_actor_id INTEGER REFERENCES users(id);
      ALTER TABLE projects ADD COLUMN workflow_template_id INTEGER REFERENCES workflow_templates(id);
      ALTER TABLE sync_pairs ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE notifications ADD COLUMN event_id INTEGER REFERENCES desk_events(id);
      CREATE UNIQUE INDEX idx_notifications_event ON notifications(user_id,event_id) WHERE event_id IS NOT NULL;
      CREATE INDEX idx_tickets_visible ON tickets(deleted_at,archived_at,project_id,updated_at);
      CREATE TABLE ticket_watchers(ticket_id INTEGER NOT NULL REFERENCES tickets(id),user_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,PRIMARY KEY(ticket_id,user_id));
      CREATE TABLE reserved_ticket_keys(key TEXT PRIMARY KEY COLLATE NOCASE,project_id INTEGER NOT NULL REFERENCES projects(id),number INTEGER NOT NULL,created_at TEXT NOT NULL);
      INSERT INTO reserved_ticket_keys SELECT key,project_id,number,created_at FROM tickets;
      INSERT OR IGNORE INTO reserved_ticket_keys SELECT a.key,t.project_id,t.number,t.created_at FROM ticket_aliases a JOIN tickets t ON t.id=a.ticket_id;
      CREATE TRIGGER ticket_key_reserved BEFORE INSERT ON tickets WHEN EXISTS(SELECT 1 FROM reserved_ticket_keys WHERE key=NEW.key) BEGIN SELECT RAISE(ABORT,'DESK_KEY_RESERVED'); END;
      CREATE TRIGGER ticket_key_reserve AFTER INSERT ON tickets BEGIN INSERT INTO reserved_ticket_keys VALUES(NEW.key,NEW.project_id,NEW.number,NEW.created_at); END;
      CREATE TRIGGER ticket_key_immutable BEFORE UPDATE OF key,number,project_id ON tickets WHEN NEW.key<>OLD.key OR NEW.number<>OLD.number OR NEW.project_id<>OLD.project_id BEGIN SELECT RAISE(ABORT,'DESK_KEY_IMMUTABLE'); END;
      CREATE TRIGGER project_key_immutable BEFORE UPDATE OF key,number_padding ON projects WHEN NEW.key<>OLD.key OR NEW.number_padding<>OLD.number_padding BEGIN SELECT RAISE(ABORT,'DESK_KEY_IMMUTABLE'); END;
      CREATE TRIGGER ticket_update_event AFTER UPDATE OF title,description,priority,assignee_id,reporter_id,custom_values ON tickets WHEN NEW.deleted_at IS NULL AND (NEW.title<>OLD.title OR NEW.description<>OLD.description OR NEW.priority<>OLD.priority OR NEW.assignee_id IS NOT OLD.assignee_id OR NEW.reporter_id<>OLD.reporter_id OR NEW.custom_values<>OLD.custom_values) BEGIN
        INSERT INTO desk_events(ticket_id,event,payload,created_at) VALUES(NEW.id,'ticket_updated',json_object('actor_id',NEW.last_actor_id,'origin',NEW.change_source),NEW.updated_at);
      END;
      CREATE TABLE smtp_settings(id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL,secret TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE brand_assets(id INTEGER PRIMARY KEY CHECK(id=1),mime TEXT NOT NULL,body BLOB NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE installation(id INTEGER PRIMARY KEY CHECK(id=1),completed_at TEXT);
      INSERT INTO installation SELECT 1,CASE WHEN EXISTS(SELECT id FROM users WHERE role='admin' AND account_kind='human') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END;
      CREATE TABLE api_tokens(id INTEGER PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,user_id INTEGER NOT NULL REFERENCES users(id),project_id INTEGER NOT NULL REFERENCES projects(id),scopes TEXT NOT NULL,expires_at TEXT,revoked_at TEXT,created_at TEXT NOT NULL,last_used_at TEXT);
      CREATE TABLE api_requests(token_id INTEGER NOT NULL REFERENCES api_tokens(id),request_key TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(token_id,request_key));
      CREATE TABLE release_settings(id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL DEFAULT '{}',secret TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1);
      PRAGMA user_version=6;
    `);
    const app=JSON.parse(db.prepare('SELECT config FROM app_settings WHERE id=1').get().config);
    if(app.brand_name==='iTELade Desk')db.prepare('UPDATE app_settings SET config=? WHERE id=1').run(JSON.stringify({...app,brand_name:'Service Desk'}));
    // Bind only identical existing maps; never overwrite a project's custom workflow.
    const shape=c=>JSON.stringify({initial:c.initial,statuses:c.statuses,transitions:c.transitions});
    for(const t of db.prepare('SELECT * FROM workflow_templates ORDER BY is_default DESC,id').all()){
      for(const w of db.prepare('SELECT w.* FROM project_workflows w JOIN projects p ON p.id=w.project_id WHERE p.workflow_template_id IS NULL').all()){
        if(shape(JSON.parse(t.config))===shape(JSON.parse(w.config)))db.prepare('UPDATE projects SET workflow_template_id=? WHERE id=?').run(t.id,w.project_id);
      }
    }
    if(!db.prepare('SELECT id FROM workflow_templates LIMIT 1').get()){
      const config=defaultWorkflow();config.rules=[];
      db.prepare('INSERT INTO workflow_templates(name,config,is_default) VALUES(?,?,1)').run('Domyślny obieg',JSON.stringify(config));
    }
    db.exec("UPDATE workflow_templates SET name='Domyślny obieg' WHERE name='Domyślny obieg iTELade' AND NOT EXISTS(SELECT id FROM workflow_templates WHERE name='Domyślny obieg');");
    db.exec("UPDATE users SET name='Automatyzacja',first_name='Automatyzacja' WHERE account_kind='service' AND username='itelade.bot' AND name='iTELade Bot';");
    db.exec("UPDATE users SET username='desk.bot' WHERE account_kind='service' AND username='itelade.bot' AND NOT EXISTS(SELECT id FROM users WHERE username='desk.bot');");
    db.exec("UPDATE tickets SET closed_at=COALESCE(closed_at,updated_at),customer_reply_locked=1 WHERE status='closed'; UPDATE status_spans SET ended_at=(SELECT closed_at FROM tickets WHERE id=ticket_id) WHERE ended_at IS NULL AND ticket_id IN(SELECT id FROM tickets WHERE status='closed');");
  });
}
