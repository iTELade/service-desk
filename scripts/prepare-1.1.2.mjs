import {readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';

function replaceOnce(path,from,to){
  let text=readFileSync(path,'utf8');
  if(text.includes(to))return;
  const i=text.indexOf(from);if(i<0)throw new Error(`${path}: marker not found`);
  text=text.slice(0,i)+to+text.slice(i+from.length);writeFileSync(path,text);
}
function replaceCount(path,from,to,count){
  let text=readFileSync(path,'utf8');
  const current=text.split(from).length-1;if(current===0)return;
  if(current!==count)throw new Error(`${path}: expected ${count} markers, found ${current}`);
  writeFileSync(path,text.split(from).join(to));
}

replaceCount('package-lock.json','"version": "1.1.1"','"version": "1.1.2"',2);

replaceOnce('lib/mail.mjs',
  "import {emailHtml,replyLine} from './mail-template.mjs';",
  "import {emailHtml,replyLine} from './mail-template.mjs';\nimport {storeInboundAttachments} from './release-112.mjs';");
replaceOnce('lib/mail.mjs',
  "      if(t){if(t.deleted_at||t.archived_at){result.detail='Sprawa usunięta lub zarchiwizowana.';return receipt();}",
  "      let attachmentCommentId=null;\n      if(t){if(t.deleted_at||t.archived_at){result.detail='Sprawa usunięta lub zarchiwizowana.';return receipt();}");
replaceOnce('lib/mail.mjs',
  "        db.prepare(\"INSERT INTO comments(ticket_id,author_id,actual_actor_id,body,internal,created_at,origin) VALUES(?,?,?,?,0,?,'email')\").run(t.id,user.id,user.id,body,now());",
  "        attachmentCommentId=Number(db.prepare(\"INSERT INTO comments(ticket_id,author_id,actual_actor_id,body,internal,created_at,origin) VALUES(?,?,?,?,0,?,'email')\").run(t.id,user.id,user.id,body,now()).lastInsertRowid);");
replaceOnce('lib/mail.mjs',
  "      if(message.messageId)db.prepare('INSERT OR IGNORE INTO mail_threads VALUES(?,?,?)').run(message.messageId,t.id,channel.id);result={status:'processed',ticket_id:t.id,detail:message.attachments?.length?'Przetworzono tekst; wiadomość zawiera załączniki, które pozostają w skrzynce IMAP.':'Przetworzono.'};return receipt();",
  "      if(message.messageId)db.prepare('INSERT OR IGNORE INTO mail_threads VALUES(?,?,?)').run(message.messageId,t.id,channel.id);const imported=storeInboundAttachments(db,t.id,attachmentCommentId,message.attachments||[],user.id);result={status:'processed',ticket_id:t.id,detail:(imported.stored||imported.rejected)?`Przetworzono; załączniki: ${imported.stored}, odrzucono: ${imported.rejected}.`:'Przetworzono.'};return receipt();");

replaceOnce('public/release-1.1.2.js',
  "String(getter(a)).localeCompare(String(getter(b),'pl',{numeric:true})",
  "String(getter(a)).localeCompare(String(getter(b)),'pl',{numeric:true})");
replaceOnce('public/release-1.1.2.js',
  "    const {route,query}=hashParts();if(route!=='#/queue')return;const anchor=document.querySelector('#main .tabs');if(!anchor||document.querySelector('[data-r112-queue-tools]'))return;",
  "    const {route,query}=hashParts();if(route!=='#/queue')return;const current=(await session()).user||await session();if(current?.role==='customer')return;const anchor=document.querySelector('#main .tabs');if(!anchor||document.querySelector('[data-r112-queue-tools]'))return;");
replaceOnce('public/release-1.1.2.js',
  "    box.querySelector('[data-r112-save-prefs]').addEventListener('click',async()=>{const columns=[...box.querySelectorAll('.r112-column-toggles input:checked')].map(x=>x.value);if(!columns.includes('issue'))columns.unshift('issue');const data={project_id:project,columns,sort_primary:box.querySelector('[data-r112-sort1]').value,sort_secondary:box.querySelector('[data-r112-sort2]').value,quick_filter:box.querySelector('[data-r112-quick]').value};",
  "    box.querySelector('[data-r112-save-prefs]').addEventListener('click',async()=>{const checked=new Set([...box.querySelectorAll('.r112-column-toggles input:checked')].map(x=>x.value)),dragOrder=[...box.querySelectorAll('.r112-columns [data-column]')].map(x=>x.dataset.column),columns=[...dragOrder.filter(x=>checked.has(x)),...Object.keys(headers).filter(x=>checked.has(x)&&!dragOrder.includes(x))];if(!columns.includes('issue'))columns.unshift('issue');const data={project_id:project,columns,sort_primary:box.querySelector('[data-r112-sort1]').value,sort_secondary:box.querySelector('[data-r112-sort2]').value,quick_filter:box.querySelector('[data-r112-quick]').value};");

replaceOnce('server.mjs',
  "  ['/app.css', ['app.css', 'text/css; charset=utf-8']],\n  ['/settings.css', ['settings.css', 'text/css; charset=utf-8']],",
  "  ['/app.css', ['app.css', 'text/css; charset=utf-8']],\n  ['/release-1.1.2.css', ['release-1.1.2.css', 'text/css; charset=utf-8']],\n  ['/release-1.1.2.js', ['release-1.1.2.js', 'text/javascript; charset=utf-8']],\n  ['/settings.css', ['settings.css', 'text/css; charset=utf-8']],");
replaceOnce('public/settings-center.js',"const SETTINGS_VERSION='1.1.1';","const SETTINGS_VERSION='1.1.2';");
replaceOnce('public/settings-nav-complete.js',"const SETTINGS_NAV_VERSION = '1.1.1';","const SETTINGS_NAV_VERSION = '1.1.2';");
replaceOnce('tests/settings-route-regression.test.mjs',"test('Settings Center asset versions are aligned with 1.1.1', () => {\n  assert.match(center, /const SETTINGS_VERSION='1\\.1\\.1';/);\n  assert.match(nav, /const SETTINGS_NAV_VERSION = '1\\.1\\.1';/);\n});","test('Settings Center asset versions are aligned with 1.1.2', () => {\n  assert.match(center, /const SETTINGS_VERSION='1\\.1\\.2';/);\n  assert.match(nav, /const SETTINGS_NAV_VERSION = '1\\.1\\.2';/);\n});");
replaceOnce('tests/settings-static-assets.test.mjs',
  "[['/settings.css','settings.css'],['/settings-center.js','settings-center.js'],['/settings-nav-complete.js','settings-nav-complete.js']]",
  "[['/settings.css','settings.css'],['/settings-center.js','settings-center.js'],['/settings-nav-complete.js','settings-nav-complete.js'],['/release-1.1.2.css','release-1.1.2.css'],['/release-1.1.2.js','release-1.1.2.js']]");

if(existsSync('MODULES.md')){
  const text=readFileSync('MODULES.md','utf8');
  if(text.startsWith('# Konfiguracja modułów Service Desk 0.6.0'))writeFileSync('MODULES.md',text.replace('# Konfiguracja modułów Service Desk 0.6.0','# Konfiguracja modułów Service Desk 1.1.2'));
}
if(existsSync('CHANGELOG.md')){
  const text=readFileSync('CHANGELOG.md','utf8');
  if(!text.startsWith('## 1.1.2'))writeFileSync('CHANGELOG.md',`## 1.1.2 - 2026-09-15\n\n- Added configurable staff queue columns/order, quick filters, secondary sorting and saved-view access.\n- Added protected public/internal ticket attachments with inbound IMAP attachment import.\n- Added permission-aware global search for tickets, staff-visible people, organizations and Assets/CMDB, with a Knowledge Base provider slot.\n- Refreshed README and release documentation for the 1.1.x line.\n\n${text}`);
}
for(const p of ['branch_marker.tmp','branch_marker2.tmp'])if(existsSync(p))rmSync(p);
console.log('1.1.2 preparation complete');
