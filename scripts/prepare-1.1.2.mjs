import {readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';

function replaceExact(path,from,to,count=1){
  let text=readFileSync(path,'utf8'),n=0;
  while(n<count){const i=text.indexOf(from);if(i<0)throw new Error(`${path}: marker not found (${n+1}/${count})`);text=text.slice(0,i)+to+text.slice(i+from.length);n++;}
  writeFileSync(path,text);
}

// package-lock keeps the package version in the root object and root package entry.
replaceExact('package-lock.json','"version": "1.1.1"','"version": "1.1.2"',2);

// Inbound IMAP attachments are persisted in the same protected attachment store as web uploads.
replaceExact('lib/mail.mjs',
  "import {emailHtml,replyLine} from './mail-template.mjs';",
  "import {emailHtml,replyLine} from './mail-template.mjs';\nimport {storeInboundAttachments} from './release-112.mjs';");
replaceExact('lib/mail.mjs',
  "      if(t){if(t.deleted_at||t.archived_at){result.detail='Sprawa usunięta lub zarchiwizowana.';return receipt();}",
  "      let attachmentCommentId=null;\n      if(t){if(t.deleted_at||t.archived_at){result.detail='Sprawa usunięta lub zarchiwizowana.';return receipt();}");
replaceExact('lib/mail.mjs',
  "        db.prepare(\"INSERT INTO comments(ticket_id,author_id,actual_actor_id,body,internal,created_at,origin) VALUES(?,?,?,?,0,?,'email')\").run(t.id,user.id,user.id,body,now());",
  "        attachmentCommentId=Number(db.prepare(\"INSERT INTO comments(ticket_id,author_id,actual_actor_id,body,internal,created_at,origin) VALUES(?,?,?,?,0,?,'email')\").run(t.id,user.id,user.id,body,now()).lastInsertRowid);");
replaceExact('lib/mail.mjs',
  "      if(message.messageId)db.prepare('INSERT OR IGNORE INTO mail_threads VALUES(?,?,?)').run(message.messageId,t.id,channel.id);result={status:'processed',ticket_id:t.id,detail:message.attachments?.length?'Przetworzono tekst; wiadomość zawiera załączniki, które pozostają w skrzynce IMAP.':'Przetworzono.'};return receipt();",
  "      if(message.messageId)db.prepare('INSERT OR IGNORE INTO mail_threads VALUES(?,?,?)').run(message.messageId,t.id,channel.id);const imported=storeInboundAttachments(db,t.id,attachmentCommentId,message.attachments||[],user.id);result={status:'processed',ticket_id:t.id,detail:(imported.stored||imported.rejected)?`Przetworzono; załączniki: ${imported.stored}, odrzucono: ${imported.rejected}.`:'Przetworzono.'};return receipt();");

// Queue configuration is staff-only and the persisted column order follows drag-and-drop order.
replaceExact('public/release-1.1.2.js',
  "    const {route,query}=hashParts();if(route!=='#/queue')return;const anchor=document.querySelector('#main .tabs');if(!anchor||document.querySelector('[data-r112-queue-tools]'))return;",
  "    const {route,query}=hashParts();if(route!=='#/queue')return;const current=(await session()).user||await session();if(current?.role==='customer')return;const anchor=document.querySelector('#main .tabs');if(!anchor||document.querySelector('[data-r112-queue-tools]'))return;");
replaceExact('public/release-1.1.2.js',
  "    box.querySelector('[data-r112-save-prefs]').addEventListener('click',async()=>{const columns=[...box.querySelectorAll('.r112-column-toggles input:checked')].map(x=>x.value);if(!columns.includes('issue'))columns.unshift('issue');const data={project_id:project,columns,sort_primary:box.querySelector('[data-r112-sort1]').value,sort_secondary:box.querySelector('[data-r112-sort2]').value,quick_filter:box.querySelector('[data-r112-quick]').value};",
  "    box.querySelector('[data-r112-save-prefs]').addEventListener('click',async()=>{const checked=new Set([...box.querySelectorAll('.r112-column-toggles input:checked')].map(x=>x.value)),dragOrder=[...box.querySelectorAll('.r112-columns [data-column]')].map(x=>x.dataset.column),columns=[...dragOrder.filter(x=>checked.has(x)),...Object.keys(headers).filter(x=>checked.has(x)&&!dragOrder.includes(x))];if(!columns.includes('issue'))columns.unshift('issue');const data={project_id:project,columns,sort_primary:box.querySelector('[data-r112-sort1]').value,sort_secondary:box.querySelector('[data-r112-sort2]').value,quick_filter:box.querySelector('[data-r112-quick]').value};");

if(existsSync('MODULES.md')){
  const m=readFileSync('MODULES.md','utf8').replace(/^# Konfiguracja modułów Service Desk 0\.6\.0/m,'# Konfiguracja modułów Service Desk 1.1.2');
  writeFileSync('MODULES.md',m);
}
for(const p of ['branch_marker.tmp','branch_marker2.tmp'])if(existsSync(p))rmSync(p);
console.log('1.1.2 preparation complete');
