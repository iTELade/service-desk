import {txFor} from './core.mjs';
export function migrateV7(db){
  if(db.prepare('PRAGMA user_version').get().user_version>=7)return;
  txFor(db)(()=>{
    db.exec(`
      CREATE TABLE user_mfa(user_id INTEGER PRIMARY KEY REFERENCES users(id),secret TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,last_step INTEGER NOT NULL DEFAULT -1,recovery TEXT NOT NULL DEFAULT '[]',pending_until INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE mfa_challenges(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),user_version INTEGER NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE mail_templates(id INTEGER PRIMARY KEY,name TEXT NOT NULL,project_id INTEGER REFERENCES projects(id),event TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,audience TEXT NOT NULL DEFAULT 'participants',enabled INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE knowledge_settings(id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL DEFAULT 1);
      INSERT INTO knowledge_settings(id) VALUES(1);
    `);
    const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='ticket_span_change'").get().sql;
    db.exec('DROP TRIGGER ticket_span_change');
    db.exec(trigger.replace("'origin',NEW.change_source)","'origin',NEW.change_source,'actor_id',NEW.last_actor_id)"));
    for(const [event,name] of [['ticket_created','Potwierdzenie nowego zgłoszenia'],['comment_added','Nowa odpowiedź'],['status_changed','Zmiana statusu'],['ticket_updated','Aktualizacja zgłoszenia']])db.prepare('INSERT INTO mail_templates(name,event,subject,body) VALUES(?,?,?,?)').run(name,event,'[{{key}}] {{title}}','Dzień dobry,\n\n{{update}}\n\nZgłoszenie: {{key}}\nStatus: {{status}}\n{{url}}');
    // Preserve independent project workflows as named central templates.
    for(const p of db.prepare('SELECT p.id,p.name,w.config FROM projects p JOIN project_workflows w ON w.project_id=p.id WHERE p.workflow_template_id IS NULL').all()){
      const config=JSON.parse(p.config);config.rules=[];
      const id=db.prepare('INSERT INTO workflow_templates(name,config,is_default) VALUES(?,?,0)').run(`Mapa projektu ${p.name} (${p.id})`,JSON.stringify(config)).lastInsertRowid;
      db.prepare('UPDATE projects SET workflow_template_id=? WHERE id=?').run(id,p.id);
    }
    // Old bot identities remain as disabled-password accounts; no identities/history are deleted.
    db.exec("UPDATE users SET account_kind='human' WHERE account_kind='service'; PRAGMA user_version=7;");
  });
}
