import {readFileSync,writeFileSync} from 'node:fs';

function replace(path,from,to,label){
  let s=readFileSync(path,'utf8');
  if(!s.includes(from))throw new Error('Missing '+label);
  s=s.replace(from,to);
  writeFileSync(path,s);
}

let app=readFileSync('public/app.js','utf8');
app=app.replace("      case 'settings':content=await settingsView();break;","      case 'settings':location.replace('/v8.html#overview');return;\n      case 'admin-settings':content=await legacySettingsView();break;");
const cardsStart=app.indexOf('function administrationCards(){');
const cardsEnd=app.indexOf('\nasync function extraAdmin(',cardsStart);
if(cardsStart<0||cardsEnd<0)throw new Error('administrationCards block not found');
app=app.slice(0,cardsStart)+app.slice(cardsEnd+1);
app=app.replace('async function settingsView(){','async function legacySettingsView(){');
app=app.replace("+administrationCards()+`<div class=\"settings-grid\">","+`<div class=\"settings-grid\">");
const legacyPos=app.indexOf('async function legacySettingsView(){');
if(legacyPos<0)throw new Error('legacy settings function not found');
app=app.slice(0,legacyPos)+"async function settingsView(){location.replace('/v8.html#overview');return '<div class=\"loading\">Opening Administration Center…</div>';}\n"+app.slice(legacyPos);
writeFileSync('public/app.js',app);

let ui=readFileSync('public/v8.js','utf8');
ui=ui.replace("link:'/v8.html#identity'},\n        {title:'SSO / OIDC'","link:'/#/directory'},\n        {title:'SSO / OIDC'");
ui=ui.replace("link:'/v8.html#identity'},\n        {title:'Role model'","link:'/#/admin/sso'},\n        {title:'Role model'");
ui=ui.replace("link:'/v8.html#identity'},\n        {title:'Saved queues'","link:'/#/admin/templates'},\n        {title:'Saved queues'");
ui=ui.replace("{title:'Global SMTP',text:smtp.configured?`${smtp.host||''}:${smtp.port||''}`:'Configure a default outbound mail server.',status:status(Boolean(smtp.configured))},","{title:'Global SMTP',text:smtp.configured?`${smtp.host||''}:${smtp.port||''}`:'Configure a default outbound mail server.',status:status(Boolean(smtp.configured)),link:'/#/admin-settings'},");
ui=ui.replace("{title:'Mail queue',text:`${queued} queued, ${failed} failed.`,status:status(!failed,'Healthy','Failures')},","{title:'Mail queue',text:`${queued} queued, ${failed} failed.`,status:status(!failed,'Healthy','Failures'),link:'/#/admin-settings'},");
ui=ui.replace("{title:'Team mailboxes',text:`${mail.length} configured IMAP/SMTP channel(s).`,status:status(mail.some(x=>x.enabled),'Active','No active channel')},","{title:'Team mailboxes',text:`${mail.length} configured IMAP/SMTP channel(s).`,status:status(mail.some(x=>x.enabled),'Active','No active channel'),link:'/#/admin/mail'},");
ui=ui.replace("{title:'Notifications',text:'In-app and email notifications with project rules.',status:status(true,'Available')}","{title:'Notifications',text:'In-app and email notifications with project rules.',status:status(true,'Available'),link:'/#/admin/mail-templates'}");
ui=ui.replace("{title:'Update agent',text:u.agent_online===false?'Updater agent is offline.':'Updater state available.',status:status(u.agent_online!==false,'Online','Offline')},","{title:'Update agent',text:u.agent_online===false?'Updater agent is offline.':'Updater state available.',status:status(u.agent_online!==false,'Online','Offline'),link:'/#/admin/updates'},");
ui=ui.replace("{title:'Failed module events',text:`${events.length} failed event(s).`,status:status(!events.length,'Healthy','Needs attention')}","{title:'Failed module events',text:`${events.length} failed event(s).`,status:status(!events.length,'Healthy','Needs attention'),link:'/#/admin/events'},{title:'Brand, SMTP, queue & factory reset',text:'Advanced configuration retained from earlier Settings screens.',status:status(true,'Available'),link:'/#/admin-settings'}");
ui=ui.replace("</textarea></label><button class=\"primary\">Save global settings</button><input type=\"hidden\" name=\"version\" value=\"${s.version}\"></form>`);return;","</textarea></label><button class=\"primary\">Save global settings</button><input type=\"hidden\" name=\"version\" value=\"${s.version}\"></form><p><a class=\"button\" href=\"/#/admin-settings\">Brand logo and advanced settings</a></p>`);return;");
writeFileSync('public/v8.js',ui);

let test=readFileSync('tests/release-1.0.1.test.mjs','utf8');
const old="test('settings entry point and Administration categories are 1.0.1',()=>{const index=source('public/index.html'),admin=source('public/v8.html');assert.ok(index.includes(\"location.replace('/v8.html#overview')\"));for(const name of ['General','Identity & access','Service management','Communication','Integrations','Assets / CMDB','System'])assert.match(admin,new RegExp(name.replace('/','\\\\/'),'i'));assert.doesNotMatch(admin,/0\\.8 Control Center/i);});";
const next="test('settings entry point and Administration categories are 1.0.1',()=>{const index=source('public/index.html'),admin=source('public/v8.html'),app=source('public/app.js'),ui=source('public/v8.js');assert.ok(index.includes(\"location.replace('/v8.html#overview')\"));assert.ok(app.includes(\"case 'settings':location.replace('/v8.html#overview');return;\"));for(const name of ['General','Identity & access','Service management','Communication','Integrations','Assets / CMDB','System'])assert.match(admin,new RegExp(name.replace('/','\\\\/'),'i'));for(const active of [admin,app,ui]){assert.doesNotMatch(active,/0\\.8 Control Center/i);assert.doesNotMatch(active,/\\bRBAC\\b/i);}assert.match(ui,/\\/#\\/directory/);assert.match(ui,/\\/#\\/admin\\/sso/);assert.match(ui,/\\/#\\/admin-settings/);});";
if(!test.includes(old))throw new Error('settings regression test not found');
test=test.replace(old,next);
writeFileSync('tests/release-1.0.1.test.mjs',test);
