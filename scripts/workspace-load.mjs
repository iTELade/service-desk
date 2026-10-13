// Synthetic, isolated dataset; no production data or external integrations.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
const dataDir = mkdtempSync(join(tmpdir(), 'desk21-load-')),
  probe = createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['server.mjs'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    APP_URL: base,
    HOST: '127.0.0.1',
    PORT: String(port),
    DATA_DIR: dataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '',
  cookie = '',
  csrf = '',
  db;
const timings = {};
server.stderr.on('data', (c) => (logs += c));
async function api(path, data) {
  const r = await fetch(base + path, {
    method: data ? 'POST' : 'GET',
    headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  const value = await r.json();
  assert.ok(r.ok, path + ': ' + JSON.stringify(value));
  return value;
}
const timed = async (name, fn) => {
  const start = performance.now(),
    value = await fn();
  timings[name] = Math.round(performance.now() - start);
  return value;
};
try {
  await new Promise((r, j) => {
    server.stdout.on('data', (c) => String(c).includes('porcie') && r());
    server.once('exit', () => j(Error(logs)));
    setTimeout(() => j(Error('Startup ' + logs)), 15000).unref();
  });
  await api('/api/setup', {
    token: readFileSync(join(dataDir, 'setup-token'), 'utf8').trim(),
    company_name: 'Load QA',
    brand_name: 'Load QA',
    first_name: 'QA',
    last_name: 'Admin',
    email: 'load@x.test',
    password: 'Synthetic-load-password-2026',
  });
  const login = await api('/api/login', { email: 'load@x.test', password: 'Synthetic-load-password-2026' });
  csrf = login.csrf;
  const p = await api('/api/projects', {
      key: 'LD',
      name: 'Synthetic load project',
      project_type: 'external',
      portal_access: 'authenticated',
    }),
    seed = await api('/api/tickets', {
      project_id: p.id,
      title: 'Synthetic load seed',
      description: 'Isolated performance fixture',
      priority: 'P3',
      type: 'incident',
    });
  db = new DatabaseSync(join(dataDir, 'desk.sqlite'));
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');
  const original = db.prepare('SELECT * FROM tickets WHERE key=?').get(seed.key),
    insert = db.prepare(
      'INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
  db.exec('BEGIN IMMEDIATE');
  for (let n = 2; n <= 10000; n++) {
    const stamp = new Date(Date.now() - (n % 30) * 86400000).toISOString();
    insert.run(
      p.id,
      'LD-' + n,
      n,
      'Synthetic ticket ' + n,
      'Dataset for pagination and SLA radar',
      'incident',
      'P3',
      'open',
      'open',
      login.user.id,
      login.user.id,
      stamp,
      stamp,
      original.request_type_id,
      original.form_snapshot,
      original.custom_values,
    );
  }
  db.prepare('UPDATE projects SET next_number=10001 WHERE id=?').run(p.id);
  db.exec('COMMIT');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tickets WHERE project_id=?').get(p.id).n, 10000);
  const first = await timed('queue_page_1_ms', () =>
      api('/api/desk/v21/queue?project=' + p.id + '&limit=25&sort=created_asc'),
    ),
    last = await timed('queue_page_400_ms', () =>
      api('/api/desk/v21/queue?project=' + p.id + '&limit=25&page=400&sort=created_asc'),
    );
  assert.equal(first.total, 10000);
  assert.equal(first.tickets.length, 25);
  assert.equal(last.tickets.length, 25);
  assert.equal(new Set([...first.tickets, ...last.tickets].map((t) => t.key)).size, 50);
  assert.equal((await api('/api/desk/v21/queue?project=' + p.id + '&limit=25&page=401')).tickets.length, 0);
  const report = await timed('reports_with_500_sla_candidates_ms', () =>
    api('/api/desk/v21/reports?project=' + p.id),
  );
  assert.equal(report.totals.total, 10000);
  assert.equal(report.radar_examined, 500);
  assert.equal(report.daily.length, 30);
  const items = (await api('/api/desk/v21/queue?project=' + p.id + '&limit=50')).tickets.map((t) => ({
      key: t.key,
      version: t.version,
    })),
    payload = { items, action: 'priority', value: 'P2', request_key: randomUUID() },
    bulk = await timed('bulk_50_ms', () => api('/api/desk/v21/bulk', payload));
  assert.equal(bulk.results.length, 50);
  assert.ok(bulk.results.every((x) => x.ok));
  assert.deepEqual(await api('/api/desk/v21/bulk', payload), bulk);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM tickets WHERE priority='P2'").get().n, 50);
  // Separate authenticated agents concurrently exercise HTTP reads/writes and core automation.
  const password='Synthetic-agent-load-password-2026',clients=[];
  for(let n=0;n<8;n++){
    const user=(await api('/api/users',{first_name:'Load',last_name:'Agent '+n,email:'load-agent-'+n+'@x.test',role:'agent',password})).user;
    await api('/api/projects/'+p.id+'/members',{user_id:user.id,role:'agent'});
    const response=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password})}),session=await response.json();assert.ok(response.ok);
    const agentCookie=response.headers.get('set-cookie').split(';')[0];
    clients.push(async(path,data,method=data?'POST':'GET',expected=[200,201])=>{
      const start=performance.now(),r=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:agentCookie,'X-CSRF-Token':session.csrf},...(data?{body:JSON.stringify(data)}:{})}),value=await r.json();const duration=performance.now()-start;samples.push(duration);const operation=method==='PATCH'?'write_conflict':path.endsWith('/comments')?'comment':path==='/api/tickets'?'create':path.includes('/queue?')?'queue':'detail';(buckets[operation]??=[]).push(duration);assert.ok(expected.includes(r.status),path+': '+JSON.stringify(value));return {status:r.status,value};
    });
  }
  const workflow=await api('/api/projects/'+p.id+'/workflow');
  const savedWorkflow=await fetch(base+'/api/projects/'+p.id+'/workflow',{method:'PATCH',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf},body:JSON.stringify({version:workflow.version,rules:[{name:'Concurrent fixture receipt',enabled:true,event:'ticket_created',from:'*',conditions:[],actions:[{type:'comment',body:'Synthetic automation receipt',internal:true,bot_id:login.user.id}]}]})});assert.ok(savedWorkflow.ok,await savedWorkflow.text());
  const samples=[],buckets={},created=[],started=performance.now();
  await Promise.all(clients.map(async(client,lane)=>{
    for(let n=0;n<10;n++){
      const ticket=(await client('/api/tickets',{project_id:p.id,title:'Concurrent lane '+lane+' request '+n,description:'Isolated HTTP and automation benchmark',type:'incident',priority:'P3'})).value;
      await client('/api/desk/v21/queue?project='+p.id+'&limit=25&page='+(lane+1));
      const current=(await client('/api/tickets/'+ticket.key)).value.ticket;
      created.push({...ticket,id:current.id});
      const comment={body:'Concurrent agent response '+lane+'-'+n,version:current.version,request_key:randomUUID()};
      const first=(await client('/api/desk/v21/tickets/'+ticket.key+'/comments',comment)).value;
      assert.deepEqual((await client('/api/desk/v21/tickets/'+ticket.key+'/comments',comment)).value,first);
    }
  }));
  const raceTicket=created[0],current=(await api('/api/tickets/'+raceTicket.key)).ticket;
  const race=await Promise.all(clients.map((client,n)=>client('/api/tickets/'+raceTicket.key,{version:current.version,priority:n%2?'P1':'P4'},'PATCH',[200,409])));
  assert.equal(race.filter(r=>r.status===200).length,1);assert.equal(race.filter(r=>r.status===409).length,7);
  const elapsed=performance.now()-started,sorted=samples.sort((a,b)=>a-b),percentile=q=>Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)]);
  timings.concurrent={agents:clients.length,requests:samples.length,elapsed_ms:Math.round(elapsed),requests_per_second:Math.round(samples.length*1000/elapsed),p50_ms:percentile(.5),p95_ms:percentile(.95),p99_ms:percentile(.99),conflicts:7,by_operation:Object.fromEntries(Object.entries(buckets).map(([name,values])=>{values.sort((a,b)=>a-b);return [name,{requests:values.length,p50_ms:Math.round(values[Math.ceil(values.length*.5)-1]),p95_ms:Math.round(values[Math.ceil(values.length*.95)-1]),max_ms:Math.round(values.at(-1))}];}))};
  assert.equal(created.length,80);assert.equal(new Set(created.map(t=>t.key)).size,80);assert.equal(db.prepare('SELECT COUNT(*) n FROM tickets WHERE project_id=?').get(p.id).n,10080);
  for(const ticket of created){assert.equal(db.prepare("SELECT COUNT(*) n FROM comments WHERE ticket_id=? AND origin='automation'").get(ticket.id).n,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM comments WHERE ticket_id=? AND body LIKE 'Concurrent agent response %'").get(ticket.id).n,1);}
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  console.log('Synthetic 10,000-ticket load passed: ' + JSON.stringify(timings));
} finally {
  db?.close();
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
}
