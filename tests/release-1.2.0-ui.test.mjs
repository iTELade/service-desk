import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const r=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const i=r("public/index.html"),s=r("server.mjs"),u=r("public/release-1.2.0.js"),c=r("public/app.css");

test("1.5.1 canonical UI assets are wired",()=>{
  for(const f of ["app.css","release-1.2.0.js"]){
    assert.ok(i.includes("/"+f+"?v=1.5.1"));
    assert.ok(s.includes("['/"+f));
  }
  assert.ok(i.includes('/release-1.1.2.js?v=1.5.1'),'feature module remains active');
  assert.ok(i.includes('/queue-refresh-1.5.1.js?v=1.5.1'),'non-destructive queue refresh is active');
});

test("1.5 controller covers auth portal agent queue ticket projects users and settings",()=>{
  for(const token of ['jsm-surface-auth','jsm-surface-portal','jsm-surface-agent','rebuildQueue','rebuildTicket','decorateProjects','decorateUsers','completeSettingsNavigation'])assert.match(u,new RegExp(token));
  for(const token of ['.auth-layout{','.portal-workspace{','.jsm-queue-workspace{','.jsm-ticket-header{','.settings-shell,.settings-center{','.project-grid,'])assert.ok(c.includes(token),`missing CSS surface ${token}`);
});
