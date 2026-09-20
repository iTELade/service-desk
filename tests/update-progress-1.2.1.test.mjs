import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('public/release-1.2.0.js');
const index=read('public/index.html');
const version=read('lib/version.mjs');

test('updater still shows live progress and survives service restart in 1.5',()=>{
  assert.match(ui,/updatePhaseMeta/);
  assert.match(ui,/role="progressbar"/);
  assert.match(ui,/backing_up:\{label:'Kopia danych',progress:48\}/);
  assert.match(ui,/cache:'no-store'/);
  assert.match(ui,/update-progress-offline/);
});

test('updater reloads exactly once after terminal success or rollback',()=>{
  assert.match(ui,/\['done','rolled_back'\]\.includes\(job\.phase\)/);
  assert.match(ui,/sessionStorage\.getItem\(marker\)===job\.id/);
  assert.match(ui,/setTimeout\(\(\)=>location\.reload\(\),1200\)/);
});

test('1.5.1 aligns updater release version and browser cache keys',()=>{
  assert.match(version,/VERSION='1\.5\.1'/);
  assert.match(index,/app\.js\?v=1\.5\.1/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.5\.1/);
  assert.doesNotMatch(index,/\?v=1\.4\.3/);
});
