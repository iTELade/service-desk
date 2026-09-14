import {txFor} from './core.mjs';

export function migrateV8(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version===8)return;
  if(version!==7)throw new Error('Migracja v8 wymaga bazy v7.');
  txFor(db)(()=>{
    db.exec(`
      CREATE TABLE v8_roles(
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        permissions TEXT NOT NULL DEFAULT '[]',
        protected INTEGER NOT NULL DEFAULT 0 CHECK(protected IN (0,1)),
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE v8_user_roles(
        user_id INTEGER NOT NULL REFERENCES users(id),
        role_id INTEGER NOT NULL REFERENCES v8_roles(id) ON DELETE CASCADE,
        PRIMARY KEY(user_id,role_id)
      );
      CREATE TABLE v8_group_roles(
        group_dn TEXT NOT NULL COLLATE NOCASE,
        role_id INTEGER NOT NULL REFERENCES v8_roles(id) ON DELETE CASCADE,
        PRIMARY KEY(group_dn,role_id)
      );
      CREATE TABLE v8_user_directory_groups(
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_dn TEXT NOT NULL COLLATE NOCASE,
        PRIMARY KEY(user_id,group_dn)
      );

      CREATE TABLE v8_saved_views(
        id INTEGER PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        project_id INTEGER REFERENCES projects(id),
        filters TEXT NOT NULL DEFAULT '{}',
        shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN (0,1)),
        is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_v8_saved_views_owner ON v8_saved_views(owner_id,id);

      CREATE TABLE v8_approval_schemes(
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        request_type_id INTEGER REFERENCES request_types(id),
        name TEXT NOT NULL,
        stages TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_v8_approval_schemes_project ON v8_approval_schemes(project_id,enabled);
      CREATE TABLE v8_approval_instances(
        id INTEGER PRIMARY KEY,
        scheme_id INTEGER NOT NULL REFERENCES v8_approval_schemes(id),
        ticket_id INTEGER NOT NULL REFERENCES tickets(id),
        stage_index INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','cancelled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(scheme_id,ticket_id)
      );
      CREATE TABLE v8_approval_decisions(
        id INTEGER PRIMARY KEY,
        instance_id INTEGER NOT NULL REFERENCES v8_approval_instances(id) ON DELETE CASCADE,
        stage_index INTEGER NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id),
        decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE(instance_id,stage_index,user_id)
      );

      CREATE TABLE v8_org_domains(
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        domain TEXT NOT NULL COLLATE NOCASE,
        verified INTEGER NOT NULL DEFAULT 1 CHECK(verified IN (0,1)),
        PRIMARY KEY(organization_id,domain)
      );
      CREATE TABLE v8_org_contacts(
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        notify INTEGER NOT NULL DEFAULT 1 CHECK(notify IN (0,1)),
        PRIMARY KEY(organization_id,user_id)
      );
      CREATE TABLE v8_org_auto_members(
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        domain TEXT NOT NULL COLLATE NOCASE,
        PRIMARY KEY(organization_id,user_id)
      );

      CREATE TABLE v8_asset_meta(
        asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
        lifecycle TEXT NOT NULL DEFAULT 'in_stock',
        purchase_date TEXT,
        warranty_until TEXT,
        replacement_date TEXT,
        vendor TEXT NOT NULL DEFAULT '',
        purchase_ref TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE v8_asset_relationships(
        id INTEGER PRIMARY KEY,
        parent_asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        child_asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(parent_asset_id,child_asset_id,kind),
        CHECK(parent_asset_id<>child_asset_id)
      );
      CREATE TABLE v8_asset_history(
        id INTEGER PRIMARY KEY,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES users(id),
        event TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_v8_asset_history_asset ON v8_asset_history(asset_id,id DESC);

      CREATE TABLE v8_security_keys(
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        credential_id TEXT NOT NULL UNIQUE,
        public_x TEXT NOT NULL,
        public_y TEXT NOT NULL,
        sign_count INTEGER NOT NULL DEFAULT 0,
        transports TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );
      CREATE INDEX idx_v8_security_keys_user ON v8_security_keys(user_id,id);
      CREATE TABLE v8_webauthn_challenges(
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK(purpose IN ('register','login')),
        challenge TEXT NOT NULL,
        login_token_hash TEXT,
        expires INTEGER NOT NULL
      );
      CREATE INDEX idx_v8_webauthn_challenges_user ON v8_webauthn_challenges(user_id,purpose);

      CREATE TABLE v8_github_integrations(
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        request_type_id INTEGER NOT NULL REFERENCES request_types(id),
        reporter_id INTEGER NOT NULL REFERENCES users(id),
        token_secret TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
        auto_close INTEGER NOT NULL DEFAULT 1 CHECK(auto_close IN (0,1)),
        comment_template TEXT NOT NULL,
        label_priority TEXT NOT NULL DEFAULT '{}',
        poll_minutes INTEGER NOT NULL DEFAULT 5,
        last_poll INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(owner,repo)
      );
      CREATE TABLE v8_github_links(
        id INTEGER PRIMARY KEY,
        integration_id INTEGER NOT NULL REFERENCES v8_github_integrations(id) ON DELETE CASCADE,
        issue_id INTEGER NOT NULL,
        issue_number INTEGER NOT NULL,
        issue_url TEXT NOT NULL,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id),
        status TEXT NOT NULL DEFAULT 'ticket_created',
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(integration_id,issue_id)
      );
      CREATE TABLE v8_github_runs(
        id INTEGER PRIMARY KEY,
        integration_id INTEGER REFERENCES v8_github_integrations(id) ON DELETE SET NULL,
        status TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      INSERT INTO v8_roles(name,permissions,protected,created_at,updated_at)
      VALUES
        ('Service Desk Administrator','["*"]',1,datetime('now'),datetime('now')),
        ('Operations Manager','["projects.read","projects.manage","queues.manage","approvals.manage","assets.manage","audit.read","reports.read"]',1,datetime('now'),datetime('now')),
        ('Integration Manager','["integrations.manage","audit.read"]',1,datetime('now'),datetime('now'));

      PRAGMA user_version=8;
      PRAGMA optimize;
    `);
  });
}
