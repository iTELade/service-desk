import { createHash } from 'node:crypto';
import { fail, text, integer, choice, now, txFor } from './core.mjs';

const fingerprint = (t, c) => createHash('sha256').update(JSON.stringify([t.title, t.description, t.custom_values, t.reporter_id, c.subject_id||null])).digest('hex');
export function createProcesses(db, { projects, desk, workflows }) {
  const tx = txFor(db), user = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const active = u => u?.active && u.directory_active && u.registration_state === 'active';
  const ticket = (id, u, work = false) => { const t = desk.ticket(integer(Number(id), 'Zgłoszenie')); if (!t || !projects.canRead(u, projects.project(t.project_id), t) || (work && !projects.canWork(u, projects.project(t.project_id)))) fail(404, 'Sprawa niedostępna.'); if (work && (t.deleted_at || t.archived_at || t.status==='closed' || projects.project(t.project_id).archived)) fail(409, 'Sprawa nie przyjmuje zmian.'); return t; };
  const context = t => db.prepare('SELECT * FROM ticket_context WHERE ticket_id=?').get(t.id) || { ticket_id: t.id, version: 0, handover: '{}' };
  function teams(u, project) { const p = projects.requireProject(project, u); return db.prepare('SELECT * FROM teams WHERE project_id=? AND deleted_at IS NULL ORDER BY name').all(p.id).map(t => ({ ...t, members: db.prepare('SELECT user_id FROM team_members WHERE team_id=?').all(t.id).map(r => r.user_id) })); }
  function saveTeam(id, b, u) {
    const p = projects.requireProject(integer(b.project_id, 'Projekt'), u, true);
    if (!Array.isArray(b.members) || b.members.length > 1000) fail(400, 'Nieprawidłowi członkowie.');
    for (const uid of b.members) if (!active(user(integer(uid, 'Osoba'))) || !projects.canWork(user(uid), p)) fail(400, 'Członek zespołu musi mieć dostęp do projektu.');
    return tx(() => { if (id) { const old = db.prepare('SELECT * FROM teams WHERE id=? AND project_id=? AND deleted_at IS NULL').get(id, p.id); if (!old || old.version !== b.version) fail(409, 'Zespół zmienił się.'); db.prepare('UPDATE teams SET name=?,version=version+1 WHERE id=?').run(text(b.name, 'Nazwa', 2, 100), id); } else id = Number(db.prepare('INSERT INTO teams(name,project_id) VALUES(?,?)').run(text(b.name, 'Nazwa', 2, 100), p.id).lastInsertRowid); db.prepare('DELETE FROM team_members WHERE team_id=?').run(id); for (const uid of new Set(b.members)) db.prepare('INSERT INTO team_members VALUES(?,?)').run(id, uid); projects.audit(p.id, u, 'team.saved', { team_id: id }); return teams(u, p.id); });
  }
  function personAttributes(id,b,u){if(u.role!=='admin')fail(403,'Atrybuty osoby zmienia administrator.');const target=user(integer(id,'Osoba'));if(!active(target))fail(400,'Osoba niedostępna.');const old=db.prepare('SELECT * FROM people_attributes WHERE user_id=?').get(id);if((old?.version||0)!==b.version)fail(409,'Atrybuty zmieniły się.');const config={department:text(b.department||'','Dział',0,100),location:text(b.location||'','Lokalizacja',0,100)};db.prepare('INSERT INTO people_attributes VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET config=excluded.config,version=people_attributes.version+1').run(id,JSON.stringify(config));return {ok:true};}
  function rules(project,u){projects.requireProject(project,u,true);return db.prepare('SELECT * FROM responsibility_rules WHERE project_id=? ORDER BY id').all(project).map(r=>({...r,approvers:JSON.parse(r.approvers)}));}
  function saveRule(id,b,u){const p=projects.requireProject(b.project_id,u,true);if(!db.prepare('SELECT 1 FROM teams WHERE id=? AND project_id=? AND deleted_at IS NULL').get(integer(b.team_id,'Zespół'),p.id))fail(400,'Wybierz zespół projektu.');if(!Array.isArray(b.approvers)||b.approvers.length>100)fail(400,'Nieprawidłowi akceptujący.');for(const uid of b.approvers)if(!active(user(uid))||!projects.canWork(user(uid),p))fail(400,'Akceptujący musi mieć dostęp.');const values=[text(b.name,'Nazwa reguły',2,100),text(b.department||'','Dział',0,100)||null,text(b.location||'','Lokalizacja',0,100)||null,b.organization_id||null,b.team_id,JSON.stringify([...new Set(b.approvers)])];if(id){const old=db.prepare('SELECT * FROM responsibility_rules WHERE id=? AND project_id=?').get(id,p.id);if(!old||old.version!==b.version)fail(409,'Reguła zmieniła się.');db.prepare('UPDATE responsibility_rules SET name=?,department=?,location=?,organization_id=?,team_id=?,approvers=?,version=version+1 WHERE id=?').run(...values,id);}else id=Number(db.prepare('INSERT INTO responsibility_rules(name,department,location,organization_id,team_id,approvers,project_id) VALUES(?,?,?,?,?,?,?)').run(...values,p.id).lastInsertRowid);projects.audit(p.id,u,'responsibility.saved',{rule_id:id});return {id};}
  function resolveResponsibility(t,subject){const attrs=JSON.parse(db.prepare('SELECT config FROM people_attributes WHERE user_id=?').get(subject)?.config||'{}');const matches=db.prepare('SELECT * FROM responsibility_rules WHERE project_id=?').all(t.project_id).filter(r=>(!r.department||r.department===attrs.department)&&(!r.location||r.location===attrs.location)&&(!r.organization_id||db.prepare('SELECT 1 FROM organization_members WHERE organization_id=? AND user_id=?').get(r.organization_id,subject)));if(matches.length!==1)return {matched:false,reason:matches.length?'Kilka reguł pasuje; wymagane ręczne przypisanie.':'Brak reguły; wymagane ręczne przypisanie.'};const r=matches[0];if(!db.prepare('SELECT 1 FROM teams WHERE id=? AND deleted_at IS NULL').get(r.team_id))return {matched:false,reason:'Zespół reguły został usunięty.'};return {matched:true,team_id:r.team_id,approvers:JSON.parse(r.approvers),rule_id:r.id};}
  function metadata(id, b, u) {
    const t = ticket(id, u, true), old = context(t); if (old.version !== b.version) fail(409, 'Kontekst zmienił się.');
    const subject = b.subject_id || null, resolved=subject?resolveResponsibility(t,subject):null, team = b.team_id || (resolved?.matched?resolved.team_id:null), parent = b.parent_id || null;
    if (subject && !active(user(integer(subject, 'Osoba')))) fail(400, 'Wybierz aktywną osobę.');
    if (team && !db.prepare('SELECT 1 FROM teams WHERE id=? AND project_id=? AND deleted_at IS NULL').get(integer(team, 'Zespół'), t.project_id)) fail(400, 'Zespół nie należy do projektu.');
    if (parent) { const target = ticket(parent, u, true); if (target.project_id !== t.project_id || target.id === t.id) fail(400, 'Nieprawidłowa sprawa nadrzędna.'); let cursor = target.id; for (let n = 0; cursor && n < 1000; n++) { if (cursor === t.id) fail(400, 'Cykl podzadań.'); cursor = db.prepare('SELECT parent_id FROM ticket_context WHERE ticket_id=?').get(cursor)?.parent_id; }if(cursor)fail(400,'Hierarchia podzadań jest zbyt głęboka.'); }
    const handover = b.handover ? { reason: text(b.handover.reason || '', 'Powód', 0, 2000), done: text(b.handover.done || '', 'Wykonano', 0, 4000), next: text(b.handover.next || '', 'Następny krok', 0, 2000), blocker: text(b.handover.blocker || '', 'Blokada', 0, 2000), due_at: b.handover.due_at || null, acknowledged_by: null } : JSON.parse(old.handover);
    if (handover.due_at && !Number.isFinite(Date.parse(handover.due_at))) fail(400, 'Nieprawidłowy termin.');
    return tx(()=>{
    db.prepare('INSERT INTO ticket_context VALUES(?,?,?,?,?,?,1) ON CONFLICT(ticket_id) DO UPDATE SET subject_id=excluded.subject_id,team_id=excluded.team_id,parent_id=excluded.parent_id,required=excluded.required,handover=excluded.handover,version=ticket_context.version+1').run(t.id, subject, team, parent, Number(b.required === true), JSON.stringify(handover));
    if((old.subject_id||null)!==subject){db.prepare("UPDATE approval_runs SET state='cancelled',version=version+1 WHERE ticket_id=? AND state IN ('pending','approved')").run(t.id);db.prepare('UPDATE tickets SET version=version+1,updated_at=?,last_actor_id=? WHERE id=?').run(now(),u.id,t.id);db.prepare("UPDATE platform_jobs SET state='paused',version=version+1 WHERE ticket_id=? AND state='queued' AND plugin_id IS NOT NULL").run(t.id);}
    projects.audit(t.project_id, u, 'ticket.context', { ticket_id: t.id, subject_id: subject, team_id: team }); return context(t);
    });
  }
  function acknowledge(id, b, u) { const t = ticket(id, u, true), old = context(t); if (b.version !== old.version || (old.team_id && !db.prepare('SELECT 1 FROM team_members WHERE team_id=? AND user_id=?').get(old.team_id, u.id) && u.role !== 'admin')) fail(409, 'Nie możesz przejąć tej sprawy.'); const h = JSON.parse(old.handover); h.acknowledged_by = u.id; h.acknowledged_at = now(); db.prepare('UPDATE ticket_context SET handover=?,version=version+1 WHERE ticket_id=?').run(JSON.stringify(h), t.id); projects.audit(t.project_id, u, 'handover.accepted', { ticket_id: t.id }); return context(t); }
  function dependency(id, b, u) {
    const t = ticket(id, u, true), other = ticket(b.blocked_by, u, true); if (t.id === other.id) fail(400, 'Cykl zależności.');
    if (b.remove) db.prepare('DELETE FROM ticket_dependencies WHERE ticket_id=? AND blocked_by=?').run(t.id, other.id);
    else {
      const cycle = db.prepare('WITH RECURSIVE d(id) AS (SELECT blocked_by FROM ticket_dependencies WHERE ticket_id=? UNION SELECT x.blocked_by FROM ticket_dependencies x JOIN d ON x.ticket_id=d.id) SELECT 1 FROM d WHERE id=?').get(other.id, t.id); if (cycle) fail(400, 'Zależność tworzy cykl.');
      db.prepare('INSERT INTO ticket_dependencies VALUES(?,?,?,?,?) ON CONFLICT(ticket_id,blocked_by) DO UPDATE SET required=excluded.required').run(t.id, other.id, Number(b.required !== false), u.id, now());
    }
    projects.audit(t.project_id, u, 'dependency.changed', { ticket_id: id, blocked_by: other.id, remove: Boolean(b.remove) }); return { ok: true };
  }
  function delegation(id, b, u) {
    const target = integer(b.user_id, 'Osoba'), delegate = integer(b.delegate_id, 'Zastępca');
    if (u.role !== 'admin' && u.id !== target) fail(403, 'Zastępstwo konfiguruje osoba lub administrator.');
    const p = b.project_id ? projects.requireProject(b.project_id, u) : null;
    if (target === delegate || !active(user(target)) || !active(user(delegate)) || (p && (!projects.canWork(user(target), p) || !projects.canWork(user(delegate), p)))) fail(400, 'Nieprawidłowy zastępca.');
    if (!Number.isFinite(Date.parse(b.starts_at)) || !Number.isFinite(Date.parse(b.ends_at)) || b.starts_at >= b.ends_at) fail(400, 'Nieprawidłowy zakres zastępstwa.');
    if (id) { const old = db.prepare('SELECT * FROM user_delegations WHERE id=?').get(id); if (!old || old.user_id !== target || b.version !== old.version) fail(409, 'Zastępstwo zmieniło się.'); db.prepare('UPDATE user_delegations SET delegate_id=?,project_id=?,starts_at=?,ends_at=?,version=version+1 WHERE id=?').run(delegate, p?.id || null, b.starts_at, b.ends_at, id); }
    else id = Number(db.prepare('INSERT INTO user_delegations(user_id,delegate_id,project_id,starts_at,ends_at) VALUES(?,?,?,?,?)').run(target, delegate, p?.id || null, b.starts_at, b.ends_at).lastInsertRowid);
    return { id };
  }
  function approval(id, b, u) {
    const t = ticket(id, u, true); if (!projects.canManage(u, projects.project(t.project_id))) fail(403, 'Akceptacje uruchamia kierownik.');
    if (!Array.isArray(b.stages) || !b.stages.length || b.stages.length > 20) fail(400, 'Podaj etapy akceptacji.');
    const stages = b.stages.map(s => { if (!Array.isArray(s.users) || !s.users.length || s.users.length > 100) fail(400, 'Podaj akceptujących.'); const users = [...new Set(s.users.map(id => integer(id, 'Akceptujący')))]; for (const id of users) if (!active(user(id)) || !projects.canWork(user(id), projects.project(t.project_id))) fail(400, 'Akceptujący musi mieć dostęp do projektu.'); if (s.due_at && !Number.isFinite(Date.parse(s.due_at))) fail(400, 'Nieprawidłowy termin.'); return { name: text(s.name, 'Nazwa etapu', 2, 100), users, mode: choice(s.mode || 'all', ['any', 'all'], 'Tryb'), due_at: s.due_at || null }; });
    const runId = tx(() => { db.prepare("UPDATE approval_runs SET state='cancelled',version=version+1 WHERE ticket_id=? AND state='pending'").run(id); return Number(db.prepare('INSERT INTO approval_runs(ticket_id,config,fingerprint,created_at) VALUES(?,?,?,?)').run(t.id, JSON.stringify(stages), fingerprint(t, context(t)), now()).lastInsertRowid); });
    projects.audit(t.project_id, u, 'approval.started', { ticket_id: id, run_id: runId }); return { id: runId };
  }
  function decide(id, b, u) {
    return tx(() => {
      const r = db.prepare('SELECT * FROM approval_runs WHERE id=?').get(integer(id, 'Akceptacja')); if (!r) fail(404, 'Akceptacja niedostępna.'); const t = ticket(r.ticket_id, u, true);
      if (r.state !== 'pending' || r.version !== b.version || r.fingerprint !== fingerprint(t, context(t))) fail(409, 'Akceptacja zmieniła się lub dane sprawy wymagają ponownej akceptacji.');
      const stage = JSON.parse(r.config)[r.stage_index];
      const approver = stage.users.find(id => id === u.id || db.prepare('SELECT 1 FROM user_delegations WHERE user_id=? AND delegate_id=? AND (project_id IS NULL OR project_id=?) AND starts_at<=? AND ends_at>?').get(id, u.id, t.project_id, now(), now())); if (!approver || !active(user(approver))) fail(403, 'Nie jesteś akceptującym tego etapu.');
      const decision = choice(b.decision, ['approved', 'rejected'], 'Decyzja'), reason = text(b.reason || '', 'Powód', decision === 'rejected' ? 1 : 0, 2000);
      if (db.prepare('SELECT 1 FROM approval_votes WHERE run_id=? AND stage=? AND approver_id=?').get(r.id, r.stage_index, approver)) fail(409, 'Decyzja została już zapisana.');
      db.prepare('INSERT INTO approval_votes VALUES(?,?,?,?,?,?,?)').run(r.id, r.stage_index, approver, u.id, decision, reason, now());
      const votes = db.prepare("SELECT approver_id FROM approval_votes WHERE run_id=? AND stage=? AND decision='approved'").all(r.id, r.stage_index).map(x => x.approver_id);
      const complete = stage.mode === 'any' ? votes.length > 0 : stage.users.every(id => votes.includes(id));
      const next = complete ? r.stage_index + 1 : r.stage_index;
      db.prepare('UPDATE approval_runs SET stage_index=?,state=?,version=version+1 WHERE id=?').run(next, decision === 'rejected' ? 'rejected' : next === JSON.parse(r.config).length ? 'approved' : 'pending', r.id);
      projects.audit(t.project_id, u, 'approval.vote', { ticket_id: t.id, run_id: r.id, stage: r.stage_index, approver_id: approver, decision }); return { ok: true };
    });
  }
  function runs(t) { return db.prepare('SELECT * FROM approval_runs WHERE ticket_id=? ORDER BY id DESC').all(t.id).map(r => ({ ...Object.fromEntries(Object.entries(r).filter(([key])=>key!=='fingerprint')), config: JSON.parse(r.config), stale: r.fingerprint !== fingerprint(t, context(t)), votes: db.prepare('SELECT * FROM approval_votes WHERE run_id=?').all(r.id) })); }
  function blockers(t) {
    const out = [];
    for (const d of db.prepare('SELECT t.id,t.key,t.project_id,t.status,t.deleted_at FROM ticket_dependencies d JOIN tickets t ON t.id=d.blocked_by WHERE d.ticket_id=? AND d.required=1').all(t.id)) if (d.deleted_at || !['resolved', 'closed'].includes(d.status)) out.push({ kind: 'dependency', id: d.id, project_id: d.project_id, key: d.key, message: 'Wymagana sprawa nie jest zakończona.' });
    for (const c of db.prepare('SELECT t.id,t.key,t.project_id,t.status,t.deleted_at FROM ticket_context c JOIN tickets t ON t.id=c.ticket_id WHERE c.parent_id=? AND c.required=1').all(t.id)) if (c.deleted_at || !['resolved', 'closed'].includes(c.status)) out.push({ kind: 'child', id: c.id, project_id: c.project_id, key: c.key, message: 'Wymagane podzadanie nie jest zakończone.' });
    const latest = runs(t)[0]; if (latest && (latest.state !== 'approved' || latest.stale)) out.push({ kind: 'approval', message: latest.stale ? 'Dane zmieniły się; wymagana ponowna akceptacja.' : 'Akceptacja nie jest zakończona.' });
    return out;
  }
  function guard(t, target, u) {
    if (['resolved', 'closed'].includes(target.category)) { const blocked = blockers(t); if (blocked.length) fail(409, blocked.map(x => x.message).join(' ')); }
    const p = projects.project(t.project_id), cfg = JSON.parse(p.settings || '{}').transition_conditions || {}, rule = cfg[target.key]; if (!rule) return;
    if (rule.manager && !projects.canManage(u, p)) fail(403, 'Przejście wymaga kierownika.');
    const values = JSON.parse(t.custom_values || '{}'); if ((rule.fields || []).some(k => values[k] === undefined || values[k] === '')) fail(400, 'Uzupełnij wymagane pola przejścia.');
    if (rule.checklist && db.prepare('SELECT 1 FROM ticket_checklist WHERE ticket_id=? AND done=0').get(t.id)) fail(409, 'Wykonaj kroki checklisty.');
  }
  function extras(id, u) {
    const t = ticket(id, u), staff = projects.canWork(u, projects.project(t.project_id)), c = context(t), approvals = staff ? runs(t) : [];
    const blocked = blockers(t).map(b => { if (!b.id || !projects.canRead(u, projects.project(b.project_id), desk.ticket(b.id))) return { kind: b.kind, message: 'Wymagany krok procesu oczekuje.' }; return b; });
    let next = { waiting_for: 'team', action: 'Realizacja zgłoszenia', due_at: null };
    if (['resolved', 'closed'].includes(t.status)) next = { waiting_for: null, action: 'Sprawa zakończona', due_at: null };
    else if (t.status === 'waiting') next = { waiting_for: 'customer', action: 'Odpowiedź klienta', due_at: null };
    else if (blocked.length) next = { waiting_for: 'process', action: 'Zakończenie wymaganych kroków', blockers: blocked, due_at: null };
    if (staff && approvals[0]?.state === 'pending' && !approvals[0].stale) { const stage = approvals[0].config[approvals[0].stage_index]; next = { waiting_for: 'approvers', action: stage.name, users: stage.users, due_at: stage.due_at }; }
    const scope = projects.ticketScope(u);
    const history = staff ? db.prepare(`SELECT t.id,t.key,t.title,t.updated_at FROM tickets t WHERE ${scope.sql} AND t.deleted_at IS NULL AND t.reporter_id=? AND t.id<>? ORDER BY t.updated_at DESC LIMIT 20`).all(...scope.values, t.reporter_id, t.id).map(x => ({ ...x, comments: db.prepare('SELECT c.body,c.created_at,u.name author_name FROM comments c JOIN users u ON u.id=c.author_id WHERE c.ticket_id=? AND c.internal=0 ORDER BY c.id DESC LIMIT 2').all(x.id) })) : [];
    return { next, blockers: blocked, customer_layout: JSON.parse(projects.project(t.project_id).settings || '{}').customer_layout || null, ...(staff ? { context: { ...c, handover: JSON.parse(c.handover),responsibility:c.subject_id?resolveResponsibility(t,c.subject_id):null }, approvals, customer_history: history, dependencies: db.prepare('SELECT blocked_by,required FROM ticket_dependencies WHERE ticket_id=?').all(t.id).filter(x => projects.canRead(u, projects.project(desk.ticket(x.blocked_by).project_id), desk.ticket(x.blocked_by))), children: db.prepare('SELECT t.id,t.key,t.title,t.status FROM ticket_context c JOIN tickets t ON t.id=c.ticket_id WHERE c.parent_id=? AND t.deleted_at IS NULL').all(t.id).filter(x => projects.canRead(u, projects.project(desk.ticket(x.id).project_id), desk.ticket(x.id))) } : {}) };
  }
  return {personAttributes,rules,saveRule,resolveResponsibility, teams, saveTeam, metadata, acknowledge, dependency, delegation, approval, decide, extras, guard, blockers };
}
