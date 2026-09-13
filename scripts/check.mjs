import {readdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const files=['server.mjs'];
for(const dir of ['public','lib','scripts','tests','updater'])if(existsSync(resolve(root,dir)))for(const name of readdirSync(resolve(root,dir)))if(/\.(?:mjs|js)$/.test(name))files.push(dir+'/'+name);
for(const file of files)execFileSync(process.execPath,['--check',file],{cwd:root,stdio:'inherit'});
console.log(`Sprawdzono składnię ${files.length} plików JavaScript.`);
