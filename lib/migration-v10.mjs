import { txFor } from './core.mjs';

export function migrateV10(db) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version === 10) return;
  if (version !== 9) throw new Error('Migracja v10 wymaga bazy v9.');
  txFor(db)(() =>
    db.exec(`
    CREATE TABLE ticket_worklogs(id INTEGER PRIMARY KEY,ticket_id INTEGER NOT NULL REFERENCES tickets(id),user_id INTEGER NOT NULL REFERENCES users(id),minutes INTEGER NOT NULL CHECK(minutes>0),body TEXT NOT NULL,started_at TEXT NOT NULL,created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX idx_worklogs_ticket ON ticket_worklogs(ticket_id,id);
    CREATE TABLE ticket_estimates(ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),estimated_minutes INTEGER NOT NULL DEFAULT 0,remaining_minutes INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE ticket_presence(ticket_id INTEGER NOT NULL REFERENCES tickets(id),user_id INTEGER NOT NULL REFERENCES users(id),mode TEXT NOT NULL CHECK(mode IN ('viewing','writing')),expires_at INTEGER NOT NULL,PRIMARY KEY(ticket_id,user_id));
    CREATE TABLE workspace_receipts(user_id INTEGER NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,request_key));
    CREATE TABLE reply_templates(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),name TEXT NOT NULL,body TEXT NOT NULL,internal INTEGER NOT NULL CHECK(internal IN (0,1)),version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE ticket_checklist(id INTEGER PRIMARY KEY,ticket_id INTEGER NOT NULL REFERENCES tickets(id),label TEXT NOT NULL,owner_id INTEGER REFERENCES users(id),done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE ticket_csat(ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),user_id INTEGER NOT NULL REFERENCES users(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE managed_services(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',owner_id INTEGER REFERENCES users(id),state TEXT NOT NULL CHECK(state IN ('operational','degraded','outage','maintenance')),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE service_dependencies(service_id INTEGER NOT NULL REFERENCES managed_services(id),depends_on INTEGER NOT NULL REFERENCES managed_services(id),PRIMARY KEY(service_id,depends_on),CHECK(service_id<>depends_on));
    CREATE TABLE service_assets(service_id INTEGER NOT NULL REFERENCES managed_services(id),asset_id INTEGER NOT NULL REFERENCES assets(id),PRIMARY KEY(service_id,asset_id));
    CREATE TABLE ticket_services(ticket_id INTEGER NOT NULL REFERENCES tickets(id),service_id INTEGER NOT NULL REFERENCES managed_services(id),PRIMARY KEY(ticket_id,service_id));
    CREATE TABLE operational_cases(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),kind TEXT NOT NULL CHECK(kind IN ('incident','problem','change')),title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',state TEXT NOT NULL CHECK(state IN ('open','investigating','monitoring','resolved','closed','planned','approved','rejected','implementing')),severity TEXT NOT NULL DEFAULT 'P2',owner_id INTEGER REFERENCES users(id),service_id INTEGER REFERENCES managed_services(id),risk TEXT NOT NULL DEFAULT 'medium' CHECK(risk IN ('low','medium','high')),starts_at TEXT,ends_at TEXT,rollback_plan TEXT NOT NULL DEFAULT '',root_cause TEXT NOT NULL DEFAULT '',workaround TEXT NOT NULL DEFAULT '',postmortem TEXT NOT NULL DEFAULT '',known_error INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX idx_cases_project ON operational_cases(project_id,kind,state,updated_at);
    CREATE TABLE case_tickets(case_id INTEGER NOT NULL REFERENCES operational_cases(id),ticket_id INTEGER NOT NULL REFERENCES tickets(id),PRIMARY KEY(case_id,ticket_id));
    CREATE TABLE case_events(id INTEGER PRIMARY KEY,case_id INTEGER NOT NULL REFERENCES operational_cases(id),actor_id INTEGER REFERENCES users(id),body TEXT NOT NULL,public INTEGER NOT NULL DEFAULT 0 CHECK(public IN (0,1)),created_at TEXT NOT NULL);
    CREATE TABLE case_tasks(id INTEGER PRIMARY KEY,case_id INTEGER NOT NULL REFERENCES operational_cases(id),label TEXT NOT NULL,owner_id INTEGER REFERENCES users(id),done INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE change_windows(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('maintenance','freeze')),starts_at TEXT NOT NULL,ends_at TEXT NOT NULL);
    CREATE TABLE workflow_drafts(project_id INTEGER PRIMARY KEY REFERENCES projects(id),config TEXT NOT NULL,positions TEXT NOT NULL DEFAULT '{}',base_version INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
    CREATE TABLE workspace_preferences(user_id INTEGER PRIMARY KEY REFERENCES users(id),config TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE monitoring_connectors(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),service_id INTEGER NOT NULL REFERENCES managed_services(id),name TEXT NOT NULL,token_hash TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
    CREATE TABLE monitoring_events(connector_id INTEGER NOT NULL REFERENCES monitoring_connectors(id),event_id TEXT NOT NULL,request_hash TEXT NOT NULL,case_id INTEGER NOT NULL REFERENCES operational_cases(id),state TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(connector_id,event_id));
    PRAGMA user_version=10;
    PRAGMA optimize;
  `),
  );
}
