import {readFileSync,writeFileSync,unlinkSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

const testsDir=join(process.cwd(),'tests');
const source=join(testsDir,'integration.test.mjs');
const generated=join(testsDir,'__integration-v8.generated.mjs');
const legacy="assert.equal(clean.prepare('PRAGMA user_version').get().user_version,7)";
const current="assert.equal(clean.prepare('PRAGMA user_version').get().user_version,8)";
let body=readFileSync(source,'utf8');
const matches=body.split(legacy).length-1;
if(matches!==1)throw new Error(`Expected exactly one legacy schema assertion, found ${matches}. Update tests/integration.test.mjs directly.`);
body=body.replace(legacy,current);
writeFileSync(generated,body);
try{
  const files=readdirSync(testsDir).filter(name=>name.endsWith('.test.mjs')&&name!=='integration.test.mjs').map(name=>join('tests',name));
  files.push(join('tests','__integration-v8.generated.mjs'));
  const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
}finally{
  try{unlinkSync(generated);}catch{}
}
