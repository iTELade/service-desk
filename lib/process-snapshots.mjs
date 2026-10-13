// Snapshot only process rules; live authorization and plugin grants are always rechecked.
const keys = ['versioned_process','transition_conditions','plugin_conditions'];
const select = settings => Object.fromEntries(keys.filter(k => settings[k] !== undefined).map(k => [k, settings[k]]));
export function initializeProcessSnapshots(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS process_settings_snapshots(ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),settings TEXT NOT NULL);
    INSERT OR IGNORE INTO process_settings_snapshots SELECT t.id,json_object('versioned_process',COALESCE(json_extract(p.settings,'$.versioned_process'),0),'transition_conditions',COALESCE(json_extract(p.settings,'$.transition_conditions'),json('{}')),'plugin_conditions',COALESCE(json_extract(p.settings,'$.plugin_conditions'),json('{}'))) FROM tickets t JOIN projects p ON p.id=t.project_id;
    CREATE TRIGGER IF NOT EXISTS process_settings_snapshot22 AFTER INSERT ON tickets BEGIN INSERT INTO process_settings_snapshots(ticket_id,settings) SELECT new.id,json_object('versioned_process',COALESCE(json_extract(settings,'$.versioned_process'),0),'transition_conditions',COALESCE(json_extract(settings,'$.transition_conditions'),json('{}')),'plugin_conditions',COALESCE(json_extract(settings,'$.plugin_conditions'),json('{}'))) FROM projects WHERE id=new.project_id; END;`);
}
export function processSettings(db, t, projects) {
  const live = JSON.parse(projects.project(t.project_id)?.settings || '{}');
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='process_settings_snapshots'").get()) return live;
  const row = db.prepare('SELECT settings FROM process_settings_snapshots WHERE ticket_id=?').get(t.id), snapshot = row && JSON.parse(row.settings);
  if (snapshot && (snapshot.versioned_process === true || snapshot.versioned_process === 1 || live.versioned_process === true)) return { ...snapshot, versioned_process: true };
  return live;
}
export function migrateProcessSettings(db, t, projects) {
  db.prepare('INSERT INTO process_settings_snapshots(ticket_id,settings) VALUES(?,?) ON CONFLICT(ticket_id) DO UPDATE SET settings=excluded.settings').run(t.id, JSON.stringify(select(JSON.parse(projects.project(t.project_id).settings || '{}'))));
}
