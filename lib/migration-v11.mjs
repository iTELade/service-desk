export function migrateV11(db) {
  if (db.prepare('PRAGMA user_version').get().user_version >= 11) return;
  db.exec('SAVEPOINT migrate_v11');
  try {
    db.exec(`CREATE TABLE ticket_knowledge_links (
      id INTEGER PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      source_url TEXT NOT NULL,
      page_id TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE(ticket_id,source_url,page_id)
    );
    CREATE INDEX idx_ticket_knowledge ON ticket_knowledge_links(ticket_id,id);
    PRAGMA user_version=11;`);
    db.exec('RELEASE migrate_v11');
  } catch (err) {
    db.exec('ROLLBACK TO migrate_v11; RELEASE migrate_v11');
    throw err;
  }
}
