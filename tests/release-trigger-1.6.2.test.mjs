import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('2.0.0 publish trigger keeps package and runtime version aligned',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');
  assert.equal(pkg.version,'2.0.0');
  assert.match(version,/VERSION='2\.0\.0'/);
});
