import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Settings Center files referenced by index are served by the HTTP static asset map',()=>{for(const [url,file] of [['/settings.css','settings.css'],['/settings-center.js','settings-center.js'],['/settings-nav-complete.js','settings-nav-complete.js'],['/release-1.1.2.css','release-1.1.2.css'],['/release-1.1.2.js','release-1.1.2.js']]){assert.ok(index.includes(url+'?v=1.1.2'),'index must reference '+url);assert.ok(server.includes("['"+url+"', ['"+file+"',"),'server must serve '+url);}});
