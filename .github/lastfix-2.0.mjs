import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const write=(p,s)=>writeFileSync(p,s);
const edit=(p,fn)=>write(p,fn(read(p)));
const currentRegex=s=>s.replaceAll("1\\.6\\.2","2\\.0\\.0");

for(const p of ['tests/queue-refresh-1.4.2.test.mjs','tests/release-trigger-1.6.2.test.mjs','tests/update-progress-1.2.1.test.mjs','tests/settings-route-regression.test.mjs'])edit(p,currentRegex);

edit('tests/customer-portal-1.4.3.test.mjs',s=>s.replace(/test\('2\.0\.0 keeps schema 8[\s\S]*?\n\}\);/,`test('2.0.0 uses schema 9 and the unified application/cache boundary',()=>{
  assert.match(version,/VERSION='2\\.0\\.0'/); assert.match(version,/SCHEMA_VERSION=9/);
  for(const asset of ['app.css','design-system.css','i18n.js','security.js','app.js','settings-center.js','release-1.1.2.js','product-shell.js'])assert.ok(index.includes('/'+asset+'?v=2.0.0'),\`missing 2.0.0 cache key for \${asset}\`);
  for(const retired of ['release-1.1.2.css','release-1.2.0.js','agent-experience-1.6.css','agent-experience-1.6.js'])assert.ok(!index.includes('/'+retired+'?v='),\`retired active layer: \${retired}\`);
});`));

edit('tests/hotfix-1.5.1.test.mjs',s=>s.replace(/test\('2\.0\.0 version and cache boundary are aligned'[\s\S]*?\n\}\);/,`test('2.0.0 version, schema and cache boundary are aligned',()=>{
  assert.match(version,/VERSION='2\\.0\\.0'/); assert.match(version,/SCHEMA_VERSION=9/);
  for(const asset of ['app.css','design-system.css','i18n.js','security.js','app.js','settings-center.js','release-1.1.2.js','product-shell.js'])assert.ok(index.includes(asset+'?v=2.0.0'),\`missing 2.0.0 cache key for \${asset}\`);
});`));

edit('tests/hotfix-1.6.1.test.mjs',s=>{
  s=s.replace(/test\('2\.0\.0 uses CSP-safe served assets[\s\S]*?\n\}\);/,`test('2.0.0 uses CSP-safe unified served assets without inline script/style blocks',()=>{
  assert.match(index,/design-system\\.css\\?v=2\\.0\\.0/); assert.match(index,/product-shell\\.js\\?v=2\\.0\\.0/); assert.doesNotMatch(index,/release-1\\.1\\.2\\.css\\?v=/);
  assert.ok(index.indexOf('/security.js?v=2.0.0')<index.indexOf('/app.js?v=2.0.0')); assert.doesNotMatch(index,/<style\\b/i); assert.doesNotMatch(index,/<script(?![^>]*\\bsrc=)[^>]*>/i);
  assert.match(css,/\\.comment-avatar\\{[^}]*width:32px!important[^}]*height:32px!important/); assert.match(bootstrap,/queueRefreshGuard=VERSION/);
});`);
  s=s.replace(/test\('2\.0\.0 version and validation documentation are current'[\s\S]*?\n\}\);/,`test('2.0.0 version and migration validation documentation are current',()=>{
  assert.match(version,/VERSION='2\\.0\\.0'/); assert.match(version,/SCHEMA_VERSION=9/); assert.match(validation,/Service Desk 2.0/); assert.match(validation,/schema 8 -> 9 migration/i);
});`);
  return s;
});

edit('tests/settings-center-race.test.mjs',s=>s.replaceAll('2.0.0','1.6.2'));
edit('tests/settings-route-regression.test.mjs',s=>s.replace("assert.match(ui, /const VERSION='2\\.0\\.0';/);","assert.match(ui, /const VERSION='1\\.6\\.2';/);"));

edit('tests/ui-1.6.0-agent-experience.test.mjs',s=>s.replace(/test\('2\.0\.0 release metadata and assets are wired and served'[\s\S]*?\n\n/,`test('2.0.0 release metadata wires the unified assets while retaining 1.6 snapshots for rollback',()=>{
  assert.equal(pkg.version,'2.0.0');assert.match(version,/VERSION='2\\.0\\.0'/);assert.match(version,/SCHEMA_VERSION=9/);
  assert.match(index,/design-system\\.css\\?v=2\\.0\\.0/);assert.match(index,/product-shell\\.js\\?v=2\\.0\\.0/);assert.match(index,/app\\.css\\?v=2\\.0\\.0/);assert.match(index,/app\\.js\\?v=2\\.0\\.0/);
  assert.doesNotMatch(index,/agent-experience-1\\.6\\.(?:css|js)\\?v=/);assert.ok(server.includes("['/agent-experience-1.6.css', ['agent-experience-1.6.css',"));assert.ok(server.includes("['/agent-experience-1.6.js', ['agent-experience-1.6.js',"));
});

`));

edit('tests/ui-2.0.test.mjs',s=>s.replace("assert.match(index,/product-shell.js?v=2.0.0/)","assert.ok(index.includes('/product-shell.js?v=2.0.0'))"));
edit('tests/update-progress-1.2.1.test.mjs',s=>s.replace("assert.match(index,/release-1\\.2\\.0\\.js\\?v=2\\.0\\.0/);assert.match(index,/agent-experience-1\\.6\\.js\\?v=2\\.0\\.0/);","assert.match(index,/product-shell\\.js\\?v=2\\.0\\.0/);assert.doesNotMatch(index,/release-1\\.2\\.0\\.js\\?v=/);assert.doesNotMatch(index,/agent-experience-1\\.6\\.js\\?v=/);"));

console.log('Final legacy/current boundary fixes applied.');
