import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directoryDefaults,normalizeEntry} from '../lib/directory.mjs';
import {VERSION,SCHEMA_VERSION} from '../lib/version.mjs';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('1.0.1 version and cache busting are consistent',()=>{assert.equal(VERSION,'1.0.1');assert.equal(SCHEMA_VERSION,8);const pkg=JSON.parse(source('package.json')),lock=JSON.parse(source('package-lock.json')),index=source('public/index.html'),admin=source('public/v8.html');assert.equal(pkg.version,'1.0.1');assert.equal(lock.version,'1.0.1');assert.equal(lock.packages[''].version,'1.0.1');for(const html of [index,admin]){assert.doesNotMatch(html,/\?v=(?:0\.8\.[01]|1\.0\.0)/);assert.match(html,/\?v=1\.0\.1/);}});

test('custom global role API and active permission-matrix storage are retired',()=>{const v8=source('lib/v8.mjs');assert.match(v8,/Custom global roles are not supported/);assert.doesNotMatch(v8,/SELECT role_id FROM v8_user_roles/);assert.doesNotMatch(v8,/FROM v8_group_roles/);assert.doesNotMatch(v8,/function saveRole/);assert.doesNotMatch(v8,/features:\{rbac:true/);assert.doesNotMatch(v8,/rbac\./i);});

test('fixed LDAP role model maps administrator and project membership',()=>{const c={...directoryDefaults,mappings:[{group_dn:'CN=PM,DC=example,DC=test',project_id:7,role:'manager'}],global_admin_group_dns:['CN=Admins,DC=example,DC=test']};const base={dn:'CN=Alice,DC=example,DC=test',objectGUID:'abc',sAMAccountName:'alice',mail:'alice@example.test',displayName:'Alice',memberOf:['CN=PM,DC=example,DC=test']};const pm=normalizeEntry(base,c);assert.equal(pm.role,'agent');assert.deepEqual(pm.memberships,[{project_id:7,role:'manager'}]);const admin=normalizeEntry({...base,memberOf:['CN=Admins,DC=example,DC=test']},c);assert.equal(admin.role,'admin');});

test('GitHub integration is one-way, mandatory-close and retry-safe',()=>{const v8=source('lib/v8.mjs');assert.match(v8,/auto_close=1/);assert.match(v8,/status==='ticket_created'/);assert.match(v8,/status='commented'/);assert.match(v8,/state:'closed'/);assert.match(v8,/SELECT id FROM v8_github_links WHERE integration_id=\? AND issue_id=\?/);assert.match(v8,/iTELade-Service-Desk\/\$\{VERSION\}/);assert.doesNotMatch(v8,/if\(c\.auto_close\)/);});

test('GitHub Administration provides CRUD, test connection, dropdowns and readable history',()=>{const ui=source('public/v8.js');assert.match(ui,/Request type<select/);assert.doesNotMatch(ui,/Request type ID<input/);assert.match(ui,/data-github-edit/);assert.match(ui,/data-github-test/);assert.match(ui,/data-github-toggle/);assert.match(ui,/data-github-delete/);assert.match(ui,/Transfer history/);assert.doesNotMatch(ui,/JSON\.stringify\(runs\.slice/);});

test('settings entry point and Administration categories are 1.0.1',()=>{const index=source('public/index.html'),admin=source('public/v8.html');assert.ok(index.includes("location.replace('/v8.html#overview')"));for(const name of ['General','Identity & access','Service management','Communication','Integrations','Assets / CMDB','System'])assert.match(admin,new RegExp(name.replace('/','\\/'),'i'));assert.doesNotMatch(admin,/0\.8 Control Center/i);});
