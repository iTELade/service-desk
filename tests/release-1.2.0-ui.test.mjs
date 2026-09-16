import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const r=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const i=r("public/index.html"),s=r("server.mjs"),u=r("public/release-1.2.0.js"),c=r("public/release-1.2.0.css");
test("1.2.0 full UI assets are wired",()=>{for(const f of ["release-1.2.0.css","release-1.2.0-nav.css","release-1.2.0.js"]){assert.ok(i.includes("/"+f+"?v=1.2.0"));assert.ok(s.includes("['/"+f));}});
test("1.2.0 covers auth portal and agent",()=>{assert.match(u,/v120-auth/);assert.match(u,/v120-portal/);assert.match(u,/v114-agent/);assert.match(c,/Customer portal shell/);});
