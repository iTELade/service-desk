import {readFileSync,writeFileSync} from 'node:fs';
const path='.github/apply-2.0.mjs';
let source=readFileSync(path,'utf8');
source=source.replace("  return value.replace(/^#\\//,'').split('/')[0]||'home';","  return value.startsWith('#/')?(value.slice(2).split('/')[0]||'home'):'home';");
writeFileSync(path,source);
