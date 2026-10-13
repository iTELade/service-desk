import { txFor } from './core.mjs';

export function migrateV12(db) {
  if (db.prepare('PRAGMA user_version').get().user_version >= 12) return;
  txFor(db)(() => {
    db.exec(`
      CREATE TABLE project_blueprints(id INTEGER PRIMARY KEY,name TEXT NOT NULL,config TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL,deleted_at TEXT);
      CREATE TABLE project_drafts(id INTEGER PRIMARY KEY,name TEXT NOT NULL,config TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,activated_at TEXT,project_ids TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE teams(id INTEGER PRIMARY KEY,name TEXT NOT NULL,project_id INTEGER NOT NULL REFERENCES projects(id),version INTEGER NOT NULL DEFAULT 1,deleted_at TEXT);
      CREATE TABLE team_members(team_id INTEGER NOT NULL REFERENCES teams(id),user_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(team_id,user_id));
      CREATE TABLE people_attributes(user_id INTEGER PRIMARY KEY REFERENCES users(id),config TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE responsibility_rules(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),name TEXT NOT NULL,department TEXT,location TEXT,organization_id INTEGER REFERENCES organizations(id),team_id INTEGER NOT NULL REFERENCES teams(id),approvers TEXT NOT NULL DEFAULT '[]',version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE ticket_context(ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),subject_id INTEGER REFERENCES users(id),team_id INTEGER REFERENCES teams(id),parent_id INTEGER REFERENCES tickets(id),required INTEGER NOT NULL DEFAULT 0,handover TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE ticket_participants(ticket_id INTEGER NOT NULL REFERENCES tickets(id),user_id INTEGER NOT NULL REFERENCES users(id),added_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,PRIMARY KEY(ticket_id,user_id));
      CREATE TABLE ticket_dependencies(ticket_id INTEGER NOT NULL REFERENCES tickets(id),blocked_by INTEGER NOT NULL REFERENCES tickets(id),required INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,PRIMARY KEY(ticket_id,blocked_by),CHECK(ticket_id<>blocked_by));
      CREATE TABLE configuration_revisions(id INTEGER PRIMARY KEY,project_id INTEGER REFERENCES projects(id),kind TEXT NOT NULL,resource_id INTEGER NOT NULL,config TEXT NOT NULL,actor_id INTEGER REFERENCES users(id),created_at TEXT NOT NULL);
      CREATE TABLE process_instances(ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),definition TEXT NOT NULL,workflow_version INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
      CREATE TABLE approval_runs(id INTEGER PRIMARY KEY,ticket_id INTEGER NOT NULL REFERENCES tickets(id),config TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',stage_index INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
      CREATE TABLE approval_votes(run_id INTEGER NOT NULL REFERENCES approval_runs(id),stage INTEGER NOT NULL,approver_id INTEGER NOT NULL REFERENCES users(id),actor_id INTEGER NOT NULL REFERENCES users(id),decision TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(run_id,stage,approver_id));
      CREATE TABLE user_delegations(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),delegate_id INTEGER NOT NULL REFERENCES users(id),project_id INTEGER REFERENCES projects(id),starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE platform_jobs(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,ticket_id INTEGER REFERENCES tickets(id),user_id INTEGER NOT NULL REFERENCES users(id),plugin_id TEXT,request_key TEXT NOT NULL,payload TEXT NOT NULL,run_at TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,result TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,UNIQUE(user_id,request_key));
      CREATE INDEX platform_jobs_due ON platform_jobs(state,run_at);
      CREATE TABLE plugin_connectors(plugin_id TEXT PRIMARY KEY REFERENCES plugin_registry(id) ON DELETE CASCADE,config TEXT NOT NULL,secret TEXT,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE notification_preferences(user_id INTEGER PRIMARY KEY REFERENCES users(id),config TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE recycle_entries(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,resource_id INTEGER NOT NULL,project_id INTEGER REFERENCES projects(id),snapshot TEXT NOT NULL,deleted_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,expires_at TEXT NOT NULL,restored_at TEXT,purged_at TEXT);
      CREATE TABLE passkeys(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),credential_id TEXT NOT NULL UNIQUE,public_key BLOB NOT NULL,counter INTEGER NOT NULL DEFAULT 0,name TEXT NOT NULL,transports TEXT NOT NULL DEFAULT '[]',device_type TEXT NOT NULL,backed_up INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,last_used_at TEXT);
      CREATE TABLE passkey_challenges(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),purpose TEXT NOT NULL,challenge TEXT NOT NULL,expires INTEGER NOT NULL,account_version INTEGER);
      CREATE TABLE reauth_grants(user_id INTEGER PRIMARY KEY REFERENCES users(id),session_token TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE shared_queue_views(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),name TEXT NOT NULL,config TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id));
      CREATE VIRTUAL TABLE ticket_search USING fts5(title,description,content='tickets',content_rowid='id',tokenize='unicode61 remove_diacritics 2');
      INSERT INTO ticket_search(ticket_search) VALUES('rebuild');
      CREATE TRIGGER ticket_search_insert AFTER INSERT ON tickets BEGIN INSERT INTO ticket_search(rowid,title,description) VALUES(new.id,new.title,new.description); END;
      CREATE TRIGGER ticket_search_update AFTER UPDATE OF title,description ON tickets BEGIN INSERT INTO ticket_search(ticket_search,rowid,title,description) VALUES('delete',old.id,old.title,old.description); INSERT INTO ticket_search(rowid,title,description) VALUES(new.id,new.title,new.description); END;
      CREATE TRIGGER ticket_search_delete AFTER DELETE ON tickets BEGIN INSERT INTO ticket_search(ticket_search,rowid,title,description) VALUES('delete',old.id,old.title,old.description); END;
      INSERT INTO process_instances(ticket_id,definition,workflow_version,created_at) SELECT t.id,w.config,w.version,t.created_at FROM tickets t JOIN project_workflows w ON w.project_id=t.project_id;
      CREATE TRIGGER process_snapshot22 AFTER INSERT ON tickets BEGIN INSERT INTO process_instances(ticket_id,definition,workflow_version,created_at) SELECT new.id,config,version,new.created_at FROM project_workflows WHERE project_id=new.project_id; END;
      CREATE TRIGGER approval_dirty22 AFTER UPDATE OF title,description,custom_values,reporter_id ON tickets WHEN new.title<>old.title OR new.description<>old.description OR new.custom_values<>old.custom_values OR new.reporter_id<>old.reporter_id BEGIN UPDATE approval_runs SET state='cancelled',version=version+1 WHERE ticket_id=new.id AND state IN ('pending','approved'); END;
      CREATE TRIGGER process_blockers22 BEFORE UPDATE OF status ON tickets WHEN new.status IN ('resolved','closed') AND new.status<>old.status BEGIN
        SELECT CASE WHEN EXISTS(SELECT 1 FROM ticket_dependencies d JOIN tickets t ON t.id=d.blocked_by WHERE d.ticket_id=new.id AND d.required=1 AND (t.status NOT IN ('resolved','closed') OR t.deleted_at IS NOT NULL)) THEN RAISE(ABORT,'DESK_PROCESS_DEPENDENCY') END;
        SELECT CASE WHEN EXISTS(SELECT 1 FROM ticket_context c JOIN tickets t ON t.id=c.ticket_id WHERE c.parent_id=new.id AND c.required=1 AND (t.status NOT IN ('resolved','closed') OR t.deleted_at IS NOT NULL)) THEN RAISE(ABORT,'DESK_PROCESS_CHILD') END;
        SELECT CASE WHEN EXISTS(SELECT 1 FROM approval_runs r WHERE r.id=(SELECT max(id) FROM approval_runs WHERE ticket_id=new.id) AND r.state<>'approved') THEN RAISE(ABORT,'DESK_PROCESS_APPROVAL') END;
      END;
      PRAGMA user_version=12;
    `);
  });
}
