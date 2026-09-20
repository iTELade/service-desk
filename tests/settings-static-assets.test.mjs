import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('1.6 index references only served canonical and Agent Experience assets',()=>{
  for(const [url,file] of [['/app.css','app.css'],['/agent-experience-1.6.css','agent-experience-1.6.css'],['/app.js','app.js'],['/settings-center.js','settings-center.js'],['/security.js','security.js'],['/release-1.1.2.js','release-1.1.2.js'],['/release-1.2.0.js','release-1.2.0.js'],['/agent-experience-1.6.js','agent-experience-1.6.js']]){
    assert.ok(index.includes(url+'?v=1.6.0'),'index must reference '+url);
    assert.ok(server.includes("['"+url+"', ['"+file+"',"),'server must serve '+url);
  }
  assert.match(index,/data-sd151-live-guard/);
  assert.match(index,/data-sd151-hotfix/);
  for(const retired of ['/settings.css','/settings-nav-complete.js','/release-1.1.2.css','/release-1.1.4.css','/release-1.1.4-layout.css','/release-1.2.0.css','/release-1.2.0-nav.css']) assert.ok(!index.includes(retired+'?v='),`retired style must not be active: ${retired}`);
  assert.doesNotMatch(index,/data-sd143-customer-style|data-sd143-customer-ui/);
});
