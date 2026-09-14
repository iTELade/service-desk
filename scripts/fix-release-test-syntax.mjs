import {readFileSync,writeFileSync} from 'node:fs';
const p='tests/release-1.0.1.test.mjs';
let s=readFileSync(p,'utf8');
const old="assert.match(ticket.description,/https://github.com/acme/widget/issues/7/);";
if(!s.includes(old))throw new Error('Expected URL assertion not found');
s=s.replace(old,"assert.ok(ticket.description.includes('https://github.com/acme/widget/issues/7')); ");
writeFileSync(p,s);
