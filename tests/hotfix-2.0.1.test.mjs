import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('public/product-shell.js'),css=read('public/design-system.css'),legacy=read('public/release-1.1.2.js'),version=read('lib/version.mjs'),index=read('public/index.html');
test('2.0.1 version and cache boundary are aligned',()=>{assert.match(version,/VERSION='2\.0\.1'/);assert.match(version,/SCHEMA_VERSION=9/);for(const asset of ['app.css','design-system.css','i18n.js','security.js','app.js','settings-center.js','release-1.1.2.js','product-shell.js'])assert.match(index,new RegExp(asset.replaceAll('.','\\.')+'\\?v=2\\.0\\.1'));});
test('2.0.1 suppresses unauthenticated queue decoration races',()=>{assert.match(legacy,/queueToolsPromise/);assert.match(legacy,/document\.querySelector\('.auth-layout'\)/);assert.match(legacy,/r\.status===401/);});
test('2.0.1 project workspace is project scoped',()=>{assert.match(shell,/function currentProject/);assert.match(shell,/function projectContext/);assert.match(shell,/#\/queue\?project=/);assert.match(shell,/#\/board\?project=/);assert.match(shell,/Project settings/);});
test('2.0.1 queue board users and settings redesign primitives exist',()=>{assert.match(shell,/cleanupQueueTools/);assert.match(shell,/wrapBoardFilters/);assert.match(shell,/sd201-users/);assert.match(shell,/sd201-settings-content/);assert.match(css,/\.sd201-queue-tools/);assert.match(css,/\.sd201-kanban/);assert.match(css,/\.sd201-users \.comment-avatar/);assert.match(css,/\.sd201-settings-content/);assert.match(css,/@media \(max-width:820px\)/);});
