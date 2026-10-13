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
