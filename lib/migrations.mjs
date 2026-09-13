import { defaultSla, txFor } from './core.mjs';
import {seedRequestTypes} from './catalog.mjs';
import {seedWorkflow} from './workflows.mjs';
export function migrateV2(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>2)throw new Error('Baza wymaga nowszej wersji aplikacji.');
  if(version===2)return;
  if(version!==1)throw new Error('Najpierw wymagana jest migracja v1.');
  txFor(db)(()=>{
    db.exec(`
      ALTER TABLE users ADD COLUMN auth_source TEXT NOT NULL DEFAULT 'local' CHECK(auth_source IN ('local','ldap'));
      ALTER TABLE users ADD COLUMN ldap_uid TEXT;
      ALTER TABLE users ADD COLUMN ldap_dn TEXT;
      ALTER TABLE users ADD COLUMN ldap_login TEXT COLLATE NOCASE;
      ALTER TABLE users ADD COLUMN directory_active INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE users ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE users ADD COLUMN registration_state TEXT NOT NULL DEFAULT 'active' CHECK(registration_state IN ('active','pending_approval','pending_email'));
      ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
      CREATE UNIQUE INDEX idx_users_ldap_uid ON users(ldap_uid) WHERE ldap_uid IS NOT NULL;
      CREATE UNIQUE INDEX idx_users_ldap_login ON users(ldap_login) WHERE ldap_login IS NOT NULL;
      ALTER TABLE projects ADD COLUMN project_type TEXT NOT NULL DEFAULT 'external' CHECK(project_type IN ('internal','external'));
      ALTER TABLE projects ADD COLUMN portal_access TEXT NOT NULL DEFAULT 'members' CHECK(portal_access IN ('members','internal','authenticated'));
      ALTER TABLE projects ADD COLUMN portal_slug TEXT;
      ALTER TABLE projects ADD COLUMN portal_title TEXT NOT NULL DEFAULT '';
      ALTER TABLE projects ADD COLUMN portal_description TEXT NOT NULL DEFAULT '';
      ALTER TABLE projects ADD COLUMN number_padding INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects ADD COLUMN request_types TEXT NOT NULL DEFAULT '["incident","request"]';
      ALTER TABLE projects ADD COLUMN sla_policy TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      CREATE UNIQUE INDEX idx_projects_portal_slug ON projects(portal_slug) WHERE portal_slug IS NOT NULL;
      CREATE TABLE project_members (
        project_id INTEGER NOT NULL REFERENCES projects(id), user_id INTEGER NOT NULL REFERENCES users(id),
        role TEXT NOT NULL CHECK(role IN ('requester','agent','manager')),
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','ldap')),
        PRIMARY KEY(project_id,user_id,source)
      );
      CREATE INDEX idx_project_members_user ON project_members(user_id,project_id);
      CREATE TABLE project_keys (key TEXT PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id));
      ALTER TABLE tickets ADD COLUMN number INTEGER;
      UPDATE tickets SET number=CAST(substr(key,instr(key,'-')+1) AS INTEGER);
      CREATE UNIQUE INDEX idx_tickets_project_number ON tickets(project_id,number);
      CREATE TABLE ticket_aliases (key TEXT PRIMARY KEY,ticket_id INTEGER NOT NULL REFERENCES tickets(id));
      CREATE TABLE audit_events (id INTEGER PRIMARY KEY,project_id INTEGER REFERENCES projects(id),actor_id INTEGER REFERENCES users(id),action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX idx_audit_project ON audit_events(project_id,id);
      CREATE TABLE ldap_settings (id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL,secret TEXT,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE ldap_runs (id INTEGER PRIMARY KEY,kind TEXT NOT NULL,status TEXT NOT NULL,summary TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT);
      CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      INSERT INTO app_settings(id,config) VALUES(1,'{"registration_mode":"approval","allowed_domains":[],"brand_name":"iTELade Desk"}');
      CREATE TABLE account_tokens (token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),expires_at INTEGER NOT NULL);
      CREATE INDEX idx_account_tokens_user ON account_tokens(user_id,purpose);
      CREATE TABLE mail_outbox (id INTEGER PRIMARY KEY,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,created_at TEXT NOT NULL,last_error TEXT);
      UPDATE users SET is_internal=1 WHERE role IN ('agent','admin');
      DELETE FROM sessions;
    `);
    for(const p of db.prepare('SELECT * FROM projects').all()){
      db.prepare('UPDATE projects SET project_type=?,portal_access=?,portal_slug=?,portal_title=?,portal_description=?,sla_policy=? WHERE id=?')
        .run(p.kind==='service'?'external':'internal','authenticated',p.key.toLowerCase(),p.name,p.description,JSON.stringify(defaultSla),p.id);
      db.prepare('INSERT INTO project_keys(key,project_id) VALUES(?,?)').run(p.key,p.id);
      db.prepare("INSERT INTO project_members(project_id,user_id,role) SELECT ?,id,CASE role WHEN 'admin' THEN 'manager' ELSE 'agent' END FROM users WHERE role IN ('admin','agent')").run(p.id);
      if(p.kind==='service')db.prepare("INSERT OR IGNORE INTO project_members(project_id,user_id,role) SELECT ?,reporter_id,'requester' FROM tickets WHERE project_id=?").run(p.id,p.id);
    }
    db.exec('PRAGMA user_version=2; PRAGMA optimize;');
  });
}

export function migrateV3(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version===3)return;
  if(version!==2)throw new Error('Migracja v3 wymaga bazy v2.');
  txFor(db)(()=>{
    db.exec(`
      CREATE TABLE request_types (
        id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), system_key TEXT,
        name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',group_name TEXT NOT NULL DEFAULT '',icon TEXT NOT NULL DEFAULT 'queue',
        base_type TEXT NOT NULL CHECK(base_type IN ('incident','request','task','bug','story')),
        default_priority TEXT NOT NULL DEFAULT 'P3' CHECK(default_priority IN ('P1','P2','P3','P4')),
        portal_priority INTEGER NOT NULL DEFAULT 0 CHECK(portal_priority IN (0,1)),
        portal_visible INTEGER NOT NULL DEFAULT 0 CHECK(portal_visible IN (0,1)),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),sort_order INTEGER NOT NULL DEFAULT 10,
        fields TEXT NOT NULL DEFAULT '[]',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
        UNIQUE(project_id,system_key)
      );
      CREATE INDEX idx_request_types_order ON request_types(project_id,sort_order,id);
      CREATE TABLE project_workflows(project_id INTEGER PRIMARY KEY REFERENCES projects(id),config TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      ALTER TABLE tickets ADD COLUMN request_type_id INTEGER REFERENCES request_types(id);
      ALTER TABLE tickets ADD COLUMN form_snapshot TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE tickets ADD COLUMN custom_values TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE tickets ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'open';
      CREATE INDEX idx_tickets_workflow ON tickets(project_id,workflow_status,updated_at);
      CREATE INDEX idx_tickets_request_type ON tickets(project_id,request_type_id);
      UPDATE tickets SET workflow_status=status;
    `);
    for(const p of db.prepare('SELECT * FROM projects').all()){
      seedRequestTypes(db,p);seedWorkflow(db,p.id);
      for(const r of db.prepare('SELECT * FROM request_types WHERE project_id=?').all(p.id)){
        db.prepare('UPDATE tickets SET request_type_id=?,form_snapshot=? WHERE project_id=? AND type=?').run(r.id,JSON.stringify({id:r.id,name:r.name,base_type:r.base_type,fields:[]}),p.id,r.base_type);
      }
    }
    db.exec('PRAGMA user_version=3; PRAGMA optimize;');
  });
}

// v4 rozszerza wyłącznie automatyzację. Istniejące obiegi pozostają nietknięte.
export function migrateV4(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version===4)return;
  if(version!==3)throw new Error('Migracja v4 wymaga bazy v3.');
  txFor(db)(()=>{
    db.exec(`
      ALTER TABLE tickets ADD COLUMN automation_state_since TEXT;
      ALTER TABLE tickets ADD COLUMN automation_cycle INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tickets ADD COLUMN automation_customer_at TEXT;
      ALTER TABLE tickets ADD COLUMN customer_reply_locked INTEGER NOT NULL DEFAULT 0 CHECK(customer_reply_locked IN (0,1));
      UPDATE tickets SET automation_state_since=COALESCE(resolved_at,updated_at,created_at);
      ALTER TABLE comments ADD COLUMN automation_rule TEXT;
      ALTER TABLE activity ADD COLUMN automation_rule TEXT;
      CREATE TABLE automation_jobs (
        id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id), project_id INTEGER NOT NULL REFERENCES projects(id),
        rule_id TEXT NOT NULL, revision INTEGER NOT NULL, cycle INTEGER NOT NULL, anchor TEXT NOT NULL,
        due_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','done','cancelled','failed')),
        last_error TEXT, created_at TEXT NOT NULL, finished_at TEXT,
        UNIQUE(ticket_id,rule_id,revision,cycle,anchor)
      );
      CREATE INDEX idx_automation_jobs_due ON automation_jobs(due_at,id) WHERE status='queued';
      CREATE INDEX idx_automation_jobs_ticket ON automation_jobs(ticket_id,status);
      CREATE INDEX idx_automation_jobs_project ON automation_jobs(project_id,status,due_at);
      CREATE TABLE automation_runs (
        id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), ticket_id INTEGER NOT NULL REFERENCES tickets(id),
        rule_id TEXT NOT NULL, rule_name TEXT NOT NULL, event TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('done','skipped','failed')), detail TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX idx_automation_runs_project ON automation_runs(project_id,id DESC);
      PRAGMA user_version=4;
      PRAGMA optimize;
    `);
  });
}
