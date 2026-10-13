import test from 'node:test';
import assert from 'node:assert/strict';
import { redactConfiguration } from '../lib/config-redaction.mjs';

test('configuration revision previews mask nested secrets without mutating the restorable snapshot', () => {
  const original = {
    smtp: { password: 'smtp-private', user: 'service@example.test' },
    integrations: [{ accessToken: 'oauth-secret', client_secret: 'client-private', enabled: true }],
    webhook: { authorization: 'Bearer private', api_key: 'api-private' },
    workflow: { status_key: 'waiting', project_key: 'ITSM' },
    form: [{ key: 'department', visibility: 'internal' }],
  };
  const publicSnapshot = redactConfiguration(original);
  assert.equal(publicSnapshot.smtp.password, '[REDACTED]');
  assert.equal(publicSnapshot.integrations[0].accessToken, '[REDACTED]');
  assert.equal(publicSnapshot.integrations[0].client_secret, '[REDACTED]');
  assert.equal(publicSnapshot.webhook.authorization, '[REDACTED]');
  assert.equal(publicSnapshot.webhook.api_key, '[REDACTED]');
  assert.equal(publicSnapshot.workflow.status_key, 'waiting');
  assert.equal(publicSnapshot.workflow.project_key, 'ITSM');
  assert.equal(publicSnapshot.form[0].key, 'department');
  assert.equal(original.smtp.password, 'smtp-private');
  assert.notStrictEqual(publicSnapshot, original);
});

test('configuration history API redacts secrets but keeps original database revision restorable', async () => {
  const { setup } = await import('./v6-fixture.mjs');
  const { migrateV8 } = await import('../lib/migration-v8.mjs');
  const { migrateV9 } = await import('../lib/migration-v9.mjs');
  const { migrateV10 } = await import('../lib/migration-v10.mjs');
  const { migrateV11 } = await import('../lib/migration-v11.mjs');
  const { migrateV12 } = await import('../lib/migration-v12.mjs');
  const { createGovernance } = await import('../lib/governance-v22.mjs');
  const f = setup();
  try {
    for (const migration of [migrateV8, migrateV9, migrateV10, migrateV11, migrateV12]) migration(f.db);
    const governance = createGovernance(f.db, { projects: f.projects, desk: f.desk, workflows: f.workflows, catalog: f.catalog });
    const p = f.project('REDACT');
    f.db.prepare('UPDATE projects SET settings=? WHERE id=?').run(JSON.stringify({ connector: { access_token: 'never-expose', apiKey: 'also-secret' }, version: 1 }), p.id);
    f.db.prepare('UPDATE projects SET settings=? WHERE id=?').run(JSON.stringify({ version: 2 }), p.id);
    const versions = governance.revisions(p.id, f.admin).filter(r => r.kind === 'settings');
    assert.ok(versions.length > 0);
    const withSecret = versions.find(r => r.config.settings?.connector);
    assert.equal(withSecret.config.settings.connector.access_token, '[REDACTED]');
    assert.equal(withSecret.config.settings.connector.apiKey, '[REDACTED]');
    assert.equal(withSecret.config.settings.version, 1);
    const source = f.db.prepare('SELECT config FROM configuration_revisions WHERE id=?').get(withSecret.id);
    assert.equal(JSON.parse(source.config).settings.connector.access_token, 'never-expose');
  } finally {
    f.close();
  }
});
