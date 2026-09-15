from pathlib import Path
import re

def replace(path, old, new, expected=1):
    p=Path(path)
    s=p.read_text()
    n=s.count(old)
    if n != expected:
        raise SystemExit(f"{path}: expected {expected}, found {n}")
    p.write_text(s.replace(old,new))

ui=Path('public/settings-center.js')
s=ui.read_text()
pattern=r"(async function renderGithub\(\)\{.*?const editing=.*?;const projects=).*?(;const projectId=)"
s,n=re.subn(pattern,r"\1state.meta.projects.filter(p=>!p.archived)\2",s,count=1)
if n!=1:
    raise SystemExit(f'GitHub project filter anchor changed: {n}')
ui.write_text(s)

v8=Path('lib/v8.mjs')
s=v8.read_text()
pattern=r"  function githubOptions\(u,projectId\)\{\n    admin\(u\);const p=projects\.requireProject\(integer\(Number\(projectId\),'Project'\),u,true\);\n    return \{request_types:db\.prepare\('SELECT id,name,version FROM request_types WHERE project_id=\? AND enabled=1 ORDER BY name'\)\.all\(p\.id\),reporters:.*?\};\n  \}\n"
replacement="""  function githubReporters(){
    return db.prepare(\"SELECT id,name,email,role,account_kind FROM users WHERE active=1 AND COALESCE(directory_active,1)=1 AND COALESCE(registration_state,'active')='active' AND COALESCE(account_kind,'human') IN ('human','service') ORDER BY CASE WHEN account_kind='service' THEN 0 ELSE 1 END,name,email\").all();
  }
  function githubOptions(u,projectId){
    admin(u);const p=projects.requireProject(integer(Number(projectId),'Project'),u,true);
    return {request_types:db.prepare('SELECT id,name,version FROM request_types WHERE project_id=? AND enabled=1 ORDER BY name').all(p.id),reporters:githubReporters()};
  }
"""
s,n=re.subn(pattern,replacement,s,count=1)
if n!=1:
    raise SystemExit(f'githubOptions anchor changed: {n}')
pattern2=r"reporter=db\.prepare\(\"SELECT \* FROM users WHERE id=\? AND active=1 AND role IN \('admin','agent'\)\"\)\.get\(integer\(Number\(b\.reporter_id\),'Reporter'\)\)"
s,n=re.subn(pattern2,"reporter=githubReporters().find(x=>x.id===integer(Number(b.reporter_id),'Reporter'))",s,count=1)
if n!=1:
    raise SystemExit(f'reporter validation anchor changed: {n}')
v8.write_text(s)

replace('lib/version.mjs',"export const VERSION='1.0.7';","export const VERSION='1.0.8';")
replace('package.json','"version": "1.0.7"','"version": "1.0.8"')
for path in ['public/index.html','public/settings-center.js','public/settings-nav-complete.js','tests/settings-center-race.test.mjs','tests/settings-route-regression.test.mjs','tests/settings-static-assets.test.mjs']:
    p=Path(path)
    t=p.read_text()
    p.write_text(t.replace('1.0.7','1.0.8').replace('1\\.0\\.7','1\\.0\\.8'))

test=Path('tests/release-1.0.1.test.mjs')
t=test.read_text()
oldtest="const opts=await f.call('GET','/api/desk/v8/github-options',f.admin,{},'project_id='+f.project.id);assert.ok(opts.request_types.some(x=>x.id===f.requestType.id&&x.name===f.requestType.name));assert.ok(opts.reporters.some(x=>x.id===f.admin.id));const created=await f.call('POST','/api/desk/v8/github',f.admin,f.integrationBody());"
newtest="const customer=user(f,'github-customer@example.test','customer'),service=user(f,'github-service@example.test','agent'),disabledUser=user(f,'github-disabled@example.test','customer');f.db.prepare(\"UPDATE users SET account_kind='service' WHERE id=?\").run(service.id);f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(disabledUser.id);const opts=await f.call('GET','/api/desk/v8/github-options',f.admin,{},'project_id='+f.project.id);assert.ok(opts.request_types.some(x=>x.id===f.requestType.id&&x.name===f.requestType.name));assert.ok(opts.reporters.some(x=>x.id===f.admin.id));assert.ok(opts.reporters.some(x=>x.id===customer.id));assert.ok(opts.reporters.some(x=>x.id===service.id&&x.account_kind==='service'));assert.ok(!opts.reporters.some(x=>x.id===disabledUser.id));const created=await f.call('POST','/api/desk/v8/github',f.admin,f.integrationBody({reporter_id:customer.id}));assert.equal(created.reporter_id,customer.id);"
if t.count(oldtest)!=1:
    raise SystemExit('GitHub functional test anchor changed')
t=t.replace(oldtest,newtest,1)
marker="test('GitHub Administration provides named dropdowns, CRUD controls and readable history',()=>{"
extra="test('GitHub integration UI exposes every active project instead of hiding project types',()=>{const ui=source('public/settings-center.js');assert.match(ui,/state\\.meta\\.projects\\.filter\\(p=>!p\\.archived\\)/);const github=ui.slice(ui.indexOf('async function renderGithub'),ui.indexOf('async function renderPlugins'));assert.doesNotMatch(github,/project_type!=='assets'/);assert.doesNotMatch(github,/p\\.can_manage/);});\n\n"
if marker not in t:
    raise SystemExit('GitHub UI test marker missing')
test.write_text(t.replace(marker,extra+marker,1))

Path('RELEASE_NOTES_1.0.8.md').write_text("""# Service Desk 1.0.8

## GitHub Issues integration choices

- Show every active Service Desk project visible to the Global Administrator in the GitHub Issues project selector, including project types previously hidden by the UI.
- Allow every active human or service account to be selected as Reporter / service account.
- Exclude inactive, directory-disabled and pending accounts.
- Validate saved reporters with the same eligibility rules as the dropdown.
- Add functional and UI regression tests for these choices.

Database schema remains **8**. No migration is required.
""")
