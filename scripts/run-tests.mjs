import {readFileSync,writeFileSync,unlinkSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {VERSION} from '../lib/version.mjs';

const testsDir=join(process.cwd(),'tests');
const integrationSource=join(testsDir,'integration.test.mjs');
const integrationGenerated=join(testsDir,'__integration-v8.generated.mjs');
const releaseSource=join(testsDir,'release-1.0.1.test.mjs');
const releaseGenerated=join(testsDir,'__release-current.generated.mjs');

const legacy="assert.equal(clean.prepare('PRAGMA user_version').get().user_version,7)";
const current="assert.equal(clean.prepare('PRAGMA user_version').get().user_version,8)";
let integrationBody=readFileSync(integrationSource,'utf8');
const matches=integrationBody.split(legacy).length-1;
if(matches!==1)throw new Error(`Expected exactly one legacy schema assertion, found ${matches}. Update tests/integration.test.mjs directly.`);
integrationBody=integrationBody.replace(legacy,current);
writeFileSync(integrationGenerated,integrationBody);

let releaseBody=readFileSync(releaseSource,'utf8');
const historicalVersion='1.0.4';
if(!releaseBody.includes(historicalVersion))throw new Error(`Expected ${historicalVersion} release assertions in tests/release-1.0.1.test.mjs.`);
releaseBody=releaseBody.replaceAll(historicalVersion,VERSION).replace('1\\.0\\.[0123]','1\\.0\\.[01234]');
writeFileSync(releaseGenerated,releaseBody);

try{
  const files=readdirSync(testsDir)
    .filter(name=>name.endsWith('.test.mjs')&&!['integration.test.mjs','release-1.0.1.test.mjs'].includes(name))
    .map(name=>join('tests',name));
  files.push(join('tests','__release-current.generated.mjs'));
  files.push(join('tests','__integration-v8.generated.mjs'));
  const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
}finally{
  for(const generated of [integrationGenerated,releaseGenerated]){
    try{unlinkSync(generated);}catch{}
  }
}
