import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('public/release-1.2.0.js');
const index=read('public/index.html');
const version=read('lib/version.mjs');
test('1.2.1 updater shows live progress and survives service restart',()=>{
  assert.match(ui,/1\.2\.1 updater UX hotfix/);
  assert.match(ui,/updatePhaseMeta/);
  assert.match(ui,/role="progressbar"/);
  assert.match(ui,/backing_up:\{label:'Kopia danych',progress:48\}/);
  assert.match(ui,/cache:'no-store'/);
  assert.match(ui,/update-progress-offline/);
});
test('1.2.1 updater reloads the page exactly once after terminal success or rollback',()=>{
  assert.match(ui,/\['done','rolled_back'\]\.includes\(job\.phase\)/);
  assert.match(ui,/sessionStorage\.getItem\(marker\)===job\.id/);
  assert.match(ui,/setTimeout\(\(\)=>location\.reload\(\),1200\)/);
});
test('1.3.2 keeps updater behavior while aligning release and cache keys',()=>{
  assert.match(version,/VERSION='1\.3\.2'/);
  assert.match(index,/app\.js\?v=1\.3\.2/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.3\.2/);
  assert.doesNotMatch(index,/\?v=1\.3\.1/);
});
