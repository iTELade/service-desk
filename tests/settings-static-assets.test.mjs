import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('2.0.1 index references only served canonical assets',()=>{
  for(const [url,file] of [['/app.css','app.css'],['/design-system.css','design-system.css'],['/i18n.js','i18n.js'],['/security.js','security.js'],['/app.js','app.js'],['/settings-center.js','settings-center.js'],['/release-1.1.2.js','release-1.1.2.js'],['/product-shell.js','product-shell.js']]){
    assert.ok(index.includes(url+'?v=2.0.1'),'index must reference '+url);
    assert.ok(server.includes("['"+url+"', ['"+file+"',"),'server must serve '+url);
  }
  assert.doesNotMatch(index,/<style\b/i);assert.doesNotMatch(index,/<script(?![^>]*\bsrc=)[^>]*>/i);
  for(const retired of ['/release-1.1.2.css','/agent-experience-1.6.css','/release-1.2.0.js','/agent-experience-1.6.js','/settings.css','/settings-nav-complete.js'])assert.ok(!index.includes(retired+'?v='),'retired presentation must not be active: '+retired);
});
