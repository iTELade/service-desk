import {readFileSync,writeFileSync} from 'node:fs';
const path='scripts/run-tests.mjs';
let source=readFileSync(path,'utf8');
source=source.replace("const current=\"assert.equal(clean.prepare('PRAGMA user_version').get().user_version,8)\";","const current=\"assert.equal(clean.prepare('PRAGMA user_version').get().user_version,9)\";");
source=source.replace("const updateFixture=/version:'\\d+\\.\\d+\\.\\d+',schema:8,minimum_schema:6,tag:'v\\d+\\.\\d+\\.\\d+'/;","const updateFixture=/version:'\\d+\\.\\d+\\.\\d+',schema:\\d+,minimum_schema:6,tag:'v\\d+\\.\\d+\\.\\d+'/;");
source=source.replace("v6Body=v6Body.replace(updateFixture,`version:'${futureVersion}',schema:8,minimum_schema:6,tag:'v${futureVersion}'`);","v6Body=v6Body.replace(updateFixture,`version:'${futureVersion}',schema:9,minimum_schema:6,tag:'v${futureVersion}'`);");
source=source.replaceAll('__integration-v8.generated.mjs','__integration-v9.generated.mjs');
writeFileSync(path,source);
