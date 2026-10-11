import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {chromium} from 'playwright';
import {inspectTextContrast} from './visual-contrast.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'desk-visual-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
const port=probe.address().port;await new Promise(r=>probe.close(r));
const base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,NODE_ENV:'test',DATA_DIR:dataDir,APP_URL:base,HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
let serverLogs='',browser,checks=0;server.stderr.on('data',c=>serverLogs+=c);
const failures=[],errors=[];
const check=(name,condition,detail)=>{checks++;if(condition)console.log('PASS '+name);else {failures.push({name,detail});console.log('FAIL '+name+' '+JSON.stringify(detail));}};
const shots=process.env.DESK_VISUAL_SCREENSHOTS;if(shots)mkdirSync(shots,{recursive:true});
try {
  await new Promise((resolve,reject)=>{server.stdout.on('data',c=>String(c).includes('porcie')&&resolve());server.once('exit',()=>reject(Error(serverLogs)));setTimeout(()=>reject(Error('Server timeout')),15000).unref();});
  browser=await chromium.launch({headless:true,...(process.env.DESK_BROWSER_EXECUTABLE?{executablePath:process.env.DESK_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-software-rasterizer']}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const setup=await context.request.post(base+'/api/setup',{headers:{Origin:base},data:{token:readFileSync(join(dataDir,'setup-token'),'utf8').trim(),company_name:'Visual QA Company',brand_name:'Visual QA Desk',first_name:'Visual',last_name:'Admin',email:'visual@example.test',password:'Visual-regression-password-2026'}});assert.equal(setup.status(),201);
  const login=await context.request.post(base+'/api/login',{headers:{Origin:base},data:{email:'visual@example.test',password:'Visual-regression-password-2026'}});assert.equal(login.status(),200);const {csrf}=await login.json();
  const api=async(path,data,method='POST')=>{const r=await context.request.fetch(base+'/api'+path,{method:data?method:'GET',headers:{Origin:base,'X-CSRF-Token':csrf},...(data?{data}:{})});assert.ok(r.ok(),path+': '+await r.text());return r.json();};
  const settings=await api('/settings');await api('/settings',{...settings,language:'pl'},'PATCH');
  const project=await api('/projects',{key:'VIS',name:'Długi projekt testowy — obsługa infrastruktury i klientów',project_type:'external',portal_access:'authenticated'});
  await api('/projects',{key:'INT',name:'Zespół wewnętrzny',project_type:'internal'});
  await api('/users',{first_name:'Długa',last_name:'Nazwa użytkownika kontrolnego',username:'visual.agent',email:'visual-agent@example.test',role:'agent',password:'Visual-agent-password-2026'});
  const ticket=await api('/tickets',{project_id:project.id,title:'Czytelność zgłoszenia, ustawień i integracji',description:'Dłuższy opis zgłoszenia kontrolnego. '.repeat(12),priority:'P1',type:'incident'});
  await api('/tickets/'+ticket.key+'/comments',{body:'Publiczna odpowiedź z dłuższym opisem postępu prac.'});await api('/tickets/'+ticket.key+'/comments',{body:'Wewnętrzna notatka zespołu.',internal:true});
  await api('/desk/r112/attachments',{ticket_key:ticket.key,filename:'bardzo-dluga-nazwa-zalacznika-do-kontroli-wygladu.txt',mime:'text/plain',internal:false,data_base64:Buffer.from('Visual regression').toString('base64')});
  const page=await context.newPage();page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));page.on('dialog',d=>d.accept());
  const sections=['overview','general','branding','identity','service','approvals','organizations','communication','integrations','github','plugins','assets','system','audit'];
  const routes=['queue','board','portal','portal-home','projects','projects/new',`project/${project.id}`,`project/${project.id}?tab=workflow`,`project/${project.id}?tab=forms`,`project/${project.id}?tab=members`,`project/${project.id}?tab=portal`,`project/${project.id}?tab=sla`,`project/${project.id}?tab=options`,`project/${project.id}?tab=audit`,'users',`ticket/${ticket.key}`,'profile','directory','admin/sso','admin/mail','admin/mail-templates','admin/webhooks','admin/api-tokens','admin/updates','admin/templates','admin/organizations','admin/assets','admin/knowledge','admin/sync',...sections.map(s=>'settings?section='+s)];
  async function ready(){await page.waitForFunction(()=>{const main=document.querySelector('#main');return main&&main.innerText.trim().length>15&&!main.querySelector('.loading');});await page.waitForTimeout(80);}
  for(const width of (process.env.DESK_VISUAL_WIDTHS||'390,768,1280,1440').split(',').map(Number))for(const theme of ['light','dark']) {
    await api('/desk/profile/theme',{theme});await page.setViewportSize({width,height:1000});await page.goto(base+'/#/queue');await page.reload();await ready();
    for(const route of routes) {
      await page.goto(base+'/#/'+route);await ready();
      const label=width+' '+theme+' '+route;
      check('Theme '+label,await page.locator('html').getAttribute('data-theme')===theme);
      const contrast=await page.evaluate(inspectTextContrast);check('Text contrast '+label,contrast.length===0,contrast);
      const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,elements:[...document.querySelectorAll('#main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+2&&!e.closest('.table-scroll,.kanban,.tabs');}).slice(0,8).map(e=>({tag:e.tagName,classes:e.className,width:e.getBoundingClientRect().width}))}));check('Overflow '+label,overflow.width<=overflow.viewport+2,overflow);
      check('Render '+label,!(await page.locator('#main').innerText()).match(/Nie udało się (?:wczytać|otworzyć|połączyć)/));
      if(route.includes('tab=workflow')) {
        const graph=await page.locator('.workflow-canvas').evaluate(el=>({scrolls:getComputedStyle(el).overflowX==='auto',edge:getComputedStyle(el.querySelector('.workflow-edge')).stroke,fill:getComputedStyle(el.querySelector('.graph-status text')).fill,text:getComputedStyle(document.body).color}));
        check('Workflow scroll container '+label,graph.scrolls,graph);
        check('Workflow visible edges '+label,graph.edge!=='none',graph);
        check('Workflow themed labels '+label,graph.fill===graph.text,graph);
      }
      if(route==='settings?section=overview') {
        const layout=await page.locator('.settings-metrics').evaluate(el=>{const s=getComputedStyle(el);return {display:s.display,columns:s.gridTemplateColumns.split(' ').length};});
        check('Settings metrics grid '+label,layout.display==='grid'&&layout.columns===(width<=560?1:width<=1100?2:4),layout);
        check('Settings rows layout '+label,await page.locator('.settings-row').first().evaluate(el=>getComputedStyle(el).display==='flex'));
        check('Settings shortcuts layout '+label,await page.locator('.settings-shortcuts').evaluate(el=>getComputedStyle(el).display==='flex'));
      }
      if(shots&&[390,1440].includes(width)&&(['queue','portal','users','directory','settings?section=overview','settings?section=system',`ticket/${ticket.key}`,`project/${project.id}?tab=workflow`].includes(route))) {await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.screenshot({path:join(shots,`${width}-${theme}-${route.replace(/[^a-z0-9]/gi,'-')}.png`),fullPage:true});}
    }
  }
  // Public forms follow the device theme when no user preference is available.
  for(const theme of ['light','dark']) {
    const guest=await browser.newContext({viewport:{width:390,height:844},colorScheme:theme}),guestPage=await guest.newPage();guestPage.on('pageerror',e=>errors.push({url:guestPage.url(),message:e.message}));
    for(const route of ['login','register','forgot']){await guestPage.goto(base+'/#/'+route);await guestPage.waitForFunction(()=>document.querySelector('.auth-card'));await guestPage.waitForTimeout(80);const contrast=await guestPage.evaluate(inspectTextContrast);check('Public contrast '+theme+' '+route,contrast.length===0,contrast);}
    await guest.close();
  }
  check('No runtime errors',errors.length===0,errors);
  if(process.env.DESK_VISUAL_REPORT)writeFileSync(process.env.DESK_VISUAL_REPORT,JSON.stringify({checks,failures,errors},null,2)+'\n');
  console.log(`Visual regression: ${checks} checks; ${failures.length} failures.`);
  assert.equal(failures.length,0,'Visual regression failures: '+JSON.stringify(failures.slice(0,5)));
} finally {
  await browser?.close();if(server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}rmSync(dataDir,{recursive:true,force:true});
}
