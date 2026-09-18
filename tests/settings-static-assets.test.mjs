import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('1.4 index references only served canonical UI and required feature assets',()=>{
  for(const [url,file] of [['/app.css','app.css'],['/app.js','app.js'],['/settings-center.js','settings-center.js'],['/security.js','security.js'],['/release-1.1.2.js','release-1.1.2.js'],['/release-1.2.0.js','release-1.2.0.js']]){
    assert.ok(index.includes(url+'?v=1.4.0'),'index must reference '+url);
    assert.ok(server.includes("['"+url+"', ['"+file+"',"),'server must serve '+url);
  }
  for(const retired of ['/settings.css','/settings-nav-complete.js','/release-1.1.2.css','/release-1.1.4.css','/release-1.1.4-layout.css','/release-1.2.0.css','/release-1.2.0-nav.css']) assert.ok(!index.includes(retired+'?v='),`retired style must not be active: ${retired}`);
});
