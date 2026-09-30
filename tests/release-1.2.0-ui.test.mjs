import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const r=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const i=r("public/index.html"),s=r("server.mjs"),legacy=r("public/release-1.2.0.js"),features=r("public/release-1.1.2.js"),design=r("public/design-system.css"),shell=r("public/product-shell.js"),security=r("public/security.js");
test("2.0 canonical UI assets are wired",()=>{
  for(const f of ["app.css","design-system.css","product-shell.js"]){assert.ok(i.includes("/"+f+"?v=2.0.0"));assert.ok(s.includes("['/"+f)||f==='design-system.css'||f==='product-shell.js');}
  assert.ok(i.includes('/release-1.1.2.js?v=2.0.0'),'feature behavior module remains active');
  for(const retired of ['/release-1.1.2.css','/release-1.2.0.js','/agent-experience-1.6.css','/agent-experience-1.6.js'])assert.ok(!i.includes(retired+'?v='),retired+' must not be active');
  assert.ok(i.indexOf('/security.js?v=2.0.0')<i.indexOf('/app.js?v=2.0.0'),'refresh guard loads before app');
  assert.match(security,/queueRefreshGuard=VERSION/);
});
test("2.0 shell covers the new product surfaces while preserving 1.x behavior compatibility",()=>{
  for(const token of ['sd20-shell','sd20-queue-workspace','sd20-ticket-workspace','sd20-settings-center','sd20-customer-portal'])assert.ok(shell.includes(token),token);
  for(const token of ['--sd20-sidebar-width','.sd20-queue-table','.sd20-ticket-layout','.sd20-settings-center'])assert.ok(design.includes(token),token);
  assert.match(features,/installGlobalSearch/);assert.match(features,/installQueueTools/);assert.match(features,/installAttachments/);
  assert.match(legacy,/rebuildQueue/);assert.match(legacy,/rebuildTicket/);
});
