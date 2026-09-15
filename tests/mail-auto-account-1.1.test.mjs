import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('1.1 email intake defaults new-sender account provisioning on and keeps one-time invite flow',()=>{const src=readFileSync(new URL('../lib/mail.mjs',import.meta.url),'utf8');assert.match(src,/allow_new_senders:boolean\(c\.allow_new_senders\?\?true/);assert.match(src,/pending_email/);assert.match(src,/identity_tokens VALUES\(\?,\?,'invite'/);assert.match(src,/\/#\/invite\//);});
