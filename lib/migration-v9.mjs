import {txFor} from './core.mjs';

export function migrateV9(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version===9)return;
  if(version!==8)throw new Error('Migracja v9 wymaga bazy v8.');
  txFor(db)(()=>{
    db.exec(`
      CREATE TABLE github_identity_config(
        id INTEGER PRIMARY KEY CHECK(id=1),
        client_id TEXT NOT NULL DEFAULT '',
        secret TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      INSERT INTO github_identity_config(id,updated_at) VALUES(1,datetime('now'));

      CREATE TABLE github_identities(
        github_user_id INTEGER PRIMARY KEY,
        github_login TEXT NOT NULL COLLATE NOCASE,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_github_identities_login ON github_identities(github_login COLLATE NOCASE);

      CREATE TABLE github_oauth_states(
        state TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      PRAGMA user_version=9;
      PRAGMA optimize;
    `);
  });
}
