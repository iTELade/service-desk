import test from 'node:test';
import assert from 'node:assert/strict';
import {directoryDefaults,normalizeEntry} from '../lib/directory.mjs';

test('LDAP administrator can be granted by explicit group DN',()=>{
  const cfg={...directoryDefaults,mappings:[],global_admin_group_dns:['CN=GG_SERVICE_DESK_ADMINS,OU=Group,DC=example,DC=test'],global_admin_users:[]};
  const row=normalizeEntry({dn:'CN=Adam,OU=Users,DC=example,DC=test',objectGUID:'x1',sAMAccountName:'adam',mail:'adam@example.test',displayName:'Adam',memberOf:['CN=GG_SERVICE_DESK_ADMINS,OU=Group,DC=example,DC=test'],userAccountControl:512},cfg);
  assert.equal(row.role,'admin');
  assert.ok(row.groups.length===1);
});
test('LDAP administrator can be granted by login',()=>{
  const cfg={...directoryDefaults,mappings:[],global_admin_group_dns:[],global_admin_users:['adam']};
  const row=normalizeEntry({dn:'CN=Adam,OU=Users,DC=example,DC=test',objectGUID:'x2',sAMAccountName:'adam',mail:'adam@example.test',displayName:'Adam',memberOf:[],userAccountControl:512},cfg);
  assert.equal(row.role,'admin');
});
