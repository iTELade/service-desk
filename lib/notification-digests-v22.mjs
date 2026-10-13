import {txFor} from './core.mjs';

// Opt-in, user-local digest scheduler. Mail stays in the existing encrypted outbox.
// The cursor is advanced in the same SQLite transaction as the queued message.
export function createNotificationDigests(db,{projects,mail,clock=Date.now}) {
  db.exec("CREATE TABLE IF NOT EXISTS notification_digest_cursors(user_id INTEGER NOT NULL REFERENCES users(id),project_id INTEGER NOT NULL REFERENCES projects(id),last_id INTEGER NOT NULL DEFAULT 0,last_period TEXT NOT NULL DEFAULT '',PRIMARY KEY(user_id,project_id))");
  const tx=txFor(db);
  const localTime=(time,zone)=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone||'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return {day:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour),minute:Number(parts.minute)};
  };
  function due(config,time){
    if(config.digest!==true||!config.channels?.includes('email'))return null;
    const at=localTime(time,config.timezone||'UTC');
    const minute=String(at.hour).padStart(2,'0')+':'+String(at.minute).padStart(2,'0');
    if(config.quiet_start&&config.quiet_end){
      const a=config.quiet_start,b=config.quiet_end;
      if(a!==b&&(a<b?(minute>=a&&minute<b):(minute>=a||minute<b)))return null;
    }
    const frequency=config.digest_frequency||'daily',hour=Number(config.digest_hour??8);
    if(frequency==='daily'&&at.hour<hour)return null;
    return frequency==='hourly'?at.day+'T'+String(at.hour).padStart(2,'0'):at.day;
  }
  function dispatch(){
    const time=clock(),stamp=new Date(time).toISOString();
    if(!Number.isFinite(time))throw new TypeError('Invalid clock');
    const users=db.prepare("SELECT u.*,n.config FROM notification_preferences n JOIN users u ON u.id=n.user_id WHERE u.active=1 AND u.directory_active=1 AND u.registration_state='active' AND u.account_kind='human' AND u.role IN ('admin','agent') ORDER BY u.id LIMIT 500").all();
    let queued=0,skipped=0;
    for(const user of users){
      let cfg;try{cfg=JSON.parse(user.config);}catch{continue;}
      let period;try{period=due(cfg,time);}catch{continue;}
      if(!period)continue;
      const allProjects=db.prepare("SELECT DISTINCT t.project_id FROM notifications n JOIN tickets t ON t.id=n.ticket_id WHERE n.user_id=? AND n.seen=0 AND t.deleted_at IS NULL ORDER BY t.project_id LIMIT 100").all(user.id);
      for(const {project_id:projectId} of allProjects){
        if(projects.project(projectId)?.archived)continue;
        const last=db.prepare('SELECT last_id,last_period FROM notification_digest_cursors WHERE user_id=? AND project_id=?').get(user.id,projectId)||{last_id:0,last_period:''};
        if(last.last_period===period)continue;
        const rows=db.prepare("SELECT n.id,n.ticket_id,t.key FROM notifications n JOIN tickets t ON t.id=n.ticket_id WHERE n.user_id=? AND t.project_id=? AND n.id>? AND n.seen=0 AND t.deleted_at IS NULL ORDER BY n.id LIMIT 500").all(user.id,projectId,last.last_id);
        if(!rows.length)continue;
        const byTicket=new Map();
        for(const row of rows){
          const ticket=db.prepare('SELECT * FROM tickets WHERE id=?').get(row.ticket_id);
          if(!ticket||!projects.canWork(user,projects.project(ticket.project_id))||!projects.canRead(user,projects.project(ticket.project_id),ticket))continue;
          const count=byTicket.get(row.ticket_id)||{key:row.key,n:0};
          count.n++;byTicket.set(row.ticket_id,count);
        }
        if(!byTicket.size){skipped++;continue;}
        const channel=db.prepare('SELECT * FROM email_channels WHERE project_id=? AND enabled=1 ORDER BY id LIMIT 1').get(projectId);
        if(!channel||!user.email||String(user.email).endsWith('.invalid')){skipped++;continue;}
        const ids=[...byTicket.keys()],entries=[...byTicket.values()];
        const subject='Service Desk — podsumowanie '+entries.length+' zgłoszeń';
        const body=['Podsumowanie zdarzeń w dostępnych zgłoszeniach projektu.','',...entries.map(x=>x.key+': '+x.n+' nowych powiadomień'),'','Zaloguj się do Service Desk, aby przeczytać szczegóły.'].join('\n');
        tx(()=>{
          const latest=db.prepare('SELECT last_id,last_period FROM notification_digest_cursors WHERE user_id=? AND project_id=?').get(user.id,projectId);
          if(latest?.last_period===period)return;
          mail.enqueue(channel,user.email,subject,body,ids[0],true,ids);
          db.prepare("INSERT INTO notification_digest_cursors(user_id,project_id,last_id,last_period) VALUES(?,?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET last_id=excluded.last_id,last_period=excluded.last_period").run(user.id,projectId,rows.at(-1).id,period);
          queued++;
        });
      }
    }
    return {queued,skipped,at:stamp};
  }
  return {dispatch,due};
}
