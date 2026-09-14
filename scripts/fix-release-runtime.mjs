import {readFileSync,writeFileSync} from 'node:fs';
const patch=(p,from,to,label)=>{let s=readFileSync(p,'utf8');if(!s.includes(from))throw new Error('Missing '+label);s=s.replace(from,to);writeFileSync(p,s);};

patch('tests/release-1.0.1.test.mjs',
`const legacyRole=Number(f.db.prepare("INSERT INTO v8_roles(name,permissions,created_at,updated_at) VALUES('Legacy elevated','["*"]',datetime('now'),datetime('now'))").run().lastInsertRowid);`,
`const legacyRole=Number(f.db.prepare("INSERT INTO v8_roles(name,permissions,created_at,updated_at) VALUES(?,?,datetime('now'),datetime('now'))").run('Legacy elevated','["*" ]').lastInsertRowid);`,
'legacy role fixture');

patch('tests/release-1.0.1.test.mjs',
`let link=f.db.prepare('SELECT * FROM v8_github_links WHERE integration_id=? AND issue_id=?').get(integration.id,101);assert.equal(link.status,'done');`,
`let link=f.db.prepare('SELECT * FROM v8_github_links WHERE integration_id=? AND issue_id=?').get(integration.id,101);assert.ok(link,f.db.prepare('SELECT detail FROM v8_github_runs ORDER BY id DESC LIMIT 1').get()?.detail);assert.equal(link.status,'done');`,
'GitHub success diagnostic');

patch('tests/release-1.0.1.test.mjs',
`let link=f.db.prepare('SELECT * FROM v8_github_links WHERE integration_id=?').get(integration.id);assert.equal(link.status,'ticket_created');`,
`let link=f.db.prepare('SELECT * FROM v8_github_links WHERE integration_id=?').get(integration.id);assert.ok(link,f.db.prepare('SELECT detail FROM v8_github_runs ORDER BY id DESC LIMIT 1').get()?.detail);assert.equal(link.status,'ticket_created');`,
'GitHub failure diagnostic');

patch('lib/v8.mjs',
`const run=Number(db.prepare('INSERT INTO v8_github_runs(integration_id,status,detail,created_at) VALUES(?,?,?,?)').run(c.id,'running','Polling '+c.owner+'/'+c.repo,now()).lastInsertRowid);let imported=0,completed=0,pending=0;`,
`const run=Number(db.prepare('INSERT INTO v8_github_runs(integration_id,status,detail,created_at) VALUES(?,?,?,?)').run(c.id,'running','Polling '+c.owner+'/'+c.repo,now()).lastInsertRowid);let imported=0,completed=0,pending=0,errors=[];`,
'run counters');
patch('lib/v8.mjs',
`for(const link of db.prepare("SELECT * FROM v8_github_links WHERE integration_id=? AND status<>'done' ORDER BY id LIMIT 20").all(c.id)){try{await finalizeGithub(c,link);completed++;}catch(e){pending++;db.prepare("UPDATE v8_github_links SET last_error=?,updated_at=? WHERE id=?").run(String(e.message).slice(0,500),now(),link.id);}}`,
`for(const link of db.prepare("SELECT * FROM v8_github_links WHERE integration_id=? AND status<>'done' ORDER BY id LIMIT 20").all(c.id)){try{await finalizeGithub(c,link);completed++;}catch(e){pending++;errors.push('Retry #'+link.issue_number+': '+String(e.message));db.prepare("UPDATE v8_github_links SET last_error=?,updated_at=? WHERE id=?").run(String(e.message).slice(0,500),now(),link.id);}}`,
'pending link errors');
patch('lib/v8.mjs',
`let t;try{t=createGithubTicket(c,issue);}catch(e){pending++;continue;}`,
`let t;try{t=createGithubTicket(c,issue);}catch(e){pending++;errors.push('Ticket #'+issue.number+': '+String(e.message));continue;}`,
'create failure errors');
patch('lib/v8.mjs',
`try{await finalizeGithub(c,db.prepare('SELECT * FROM v8_github_links WHERE id=?').get(id));completed++;}catch(e){pending++;db.prepare('UPDATE v8_github_links SET last_error=?,updated_at=? WHERE id=?').run(String(e.message).slice(0,500),now(),id);}`,
`try{await finalizeGithub(c,db.prepare('SELECT * FROM v8_github_links WHERE id=?').get(id));completed++;}catch(e){pending++;errors.push('Finalize #'+issue.number+': '+String(e.message));db.prepare('UPDATE v8_github_links SET last_error=?,updated_at=? WHERE id=?').run(String(e.message).slice(0,500),now(),id);}`,
'finalize errors');
patch('lib/v8.mjs',
`const detail=\`Imported \${imported}; completed \${completed}; pending \${pending}\`;db.prepare('UPDATE v8_github_integrations SET last_poll=?,last_error=? WHERE id=?').run(Date.now(),pending?'One or more transfers require retry.':null,c.id);db.prepare('UPDATE v8_github_runs SET status=?,detail=? WHERE id=?').run(pending?'partial':'success',detail,run);`,
`const detail=\`Imported \${imported}; completed \${completed}; pending \${pending}\`+(errors.length?'; '+errors.join(' | ').slice(0,1200):'');db.prepare('UPDATE v8_github_integrations SET last_poll=?,last_error=? WHERE id=?').run(Date.now(),pending?(errors[0]||'One or more transfers require retry.').slice(0,500):null,c.id);db.prepare('UPDATE v8_github_runs SET status=?,detail=? WHERE id=?').run(pending?'partial':'success',detail,run);`,
'run detail');
