import {readFileSync,writeFileSync} from 'node:fs';
const p='lib/v8.mjs';
let s=readFileSync(p,'utf8');
const from=`imported++;const id=Number(db.prepare('INSERT INTO v8_github_links(integration_id,issue_id,issue_number,issue_url,ticket_id,status,created_at,updated_at) VALUES(?,?,?,?,?,"ticket_created",?,?)').run(c.id,issue.id,issue.number,issue.html_url,t.id,now(),now()).lastInsertRowid);`;
const to=`imported++;const id=Number(db.prepare('INSERT INTO v8_github_links(integration_id,issue_id,issue_number,issue_url,ticket_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(c.id,issue.id,issue.number,issue.html_url,t.id,'ticket_created',now(),now()).lastInsertRowid);`;
if(!s.includes(from))throw new Error('GitHub link INSERT not found');
s=s.replace(from,to);
writeFileSync(p,s);
