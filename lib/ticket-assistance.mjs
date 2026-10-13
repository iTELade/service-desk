import { fail, integer, text, txFor } from './core.mjs';

const defaults = { similar: false, attention: false, handover: false, threshold: 35, stale_days: 3 };
const stop = new Set(
  'a i o w z ze do na od po nie jest sie się to ten ta the and for with issue problem please prosze proszę zgłoszenie zgloszenie'.split(
    ' ',
  ),
);
export function titleTokens(value) {
  return [
    ...new Set(
      String(value)
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replaceAll('ł', 'l')
        .match(/[\p{L}\p{N}]+/gu) || [],
    ),
  ]
    .filter((s) => s.length >= 2 && !stop.has(s))
    .slice(0, 50);
}
const normalized = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll('ł', 'l')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function rankSimilar(title, rows, threshold = 35, { limit = 5, allowContextOnly = false } = {}) {
  const source = titleTokens(title),
    frequency = new Map();
  const candidates = rows.map((t) => ({ t, tokens: titleTokens(t.title) }));
  for (const { tokens } of candidates)
    for (const word of tokens) frequency.set(word, (frequency.get(word) || 0) + 1);
  const weight = (word) => 1 + Math.log(1 + rows.length / (1 + (frequency.get(word) || 0)));
  return candidates
    .map(({ t, tokens }) => {
      const shared = source.filter((word) => tokens.includes(word));
      const exact = normalized(title) === normalized(t.title) && source.length > 0;
      const sum = (words) => words.reduce((n, word) => n + weight(word), 0);
      const score = exact ? 100 : Math.round((200 * sum(shared)) / (sum(source) + sum(tokens) || 1));
      return { ...t, score, shared, exact };
    })
    .filter((t) => t.score >= threshold && (allowContextOnly || t.exact || t.shared.length >= 2))
    .sort((a, b) => b.score - a.score || b.id - a.id)
    .slice(0, limit);
}

export function createTicketAssistance(db, { projects, desk, clock = Date.now }) {
  const tx = txFor(db);
  const config = (p) => ({ ...defaults, ...(JSON.parse(p.settings || '{}').ticket_assistance || {}) });
  function settings(id, b, u) {
    const p = projects.requireProject(Number(id), u, true);
    if (!b) return { project_id: p.id, version: p.version, config: config(p) };
    if (p.archived || p.module_type === 'assets') fail(409, 'Projekt nie przyjmuje ustawień zgłoszeń.');
    if (b.version !== p.version) fail(409, 'Ustawienia projektu zmieniły się. Odśwież widok.');
    const c = b.config;
    if (!c || Array.isArray(c) || typeof c !== 'object') fail(400, 'Nieprawidłowa konfiguracja.');
    for (const key of ['similar', 'attention', 'handover'])
      if (typeof c[key] !== 'boolean') fail(400, 'Opcje muszą być logiczne.');
    const next = {
      similar: c.similar,
      attention: c.attention,
      handover: c.handover,
      threshold: integer(c.threshold, 'Próg dopasowania', 20, 100),
      stale_days: integer(c.stale_days, 'Dni bez aktualizacji', 1, 30),
    };
    return tx(() => {
      const saved = JSON.parse(p.settings || '{}');
      saved.ticket_assistance = next;
      const result = db.prepare('UPDATE projects SET settings=?,version=version+1 WHERE id=? AND version=?').run(
        JSON.stringify(saved),
        p.id,
        p.version,
      );
      if (result.changes !== 1) fail(409, 'Ustawienia projektu zmieniły się. Odśwież widok.');
      projects.audit(p.id, u, 'project.ticket_assistance.updated', next);
      return { project_id: p.id, version: p.version + 1, config: next };
    });
  }
  function similar(b, u) {
    const p = projects.project(integer(b.project_id, 'Projekt'));
    if (
      !p ||
      p.archived ||
      p.module_type === 'assets' ||
      !(projects.canWork(u, p) || projects.canPortal(u, p))
    )
      fail(404, 'Nie znaleziono projektu.');
    if (!config(p).similar) return { enabled: false, matches: [] };
    const title = text(b.title, 'Temat', 3, 200);
    let exclude = 0;
    if (b.exclude_key) {
      const source = db
        .prepare(
          'SELECT * FROM tickets WHERE key=? COLLATE NOCASE OR id=(SELECT ticket_id FROM ticket_aliases WHERE key=? COLLATE NOCASE)',
        )
        .get(b.exclude_key, b.exclude_key);
      if (!source || source.project_id !== p.id || !projects.canRead(u, p, source))
        fail(404, 'Nie znaleziono zgłoszenia.');
      exclude = source.id;
    }
    const serviceIds = b.service_ids === undefined ? [] : b.service_ids;
    const assetIds = b.asset_ids === undefined ? [] : b.asset_ids;
    for (const [ids, label] of [[serviceIds, 'Usługi'], [assetIds, 'Urządzenia']]) {
      if (!Array.isArray(ids) || ids.length > 10 || new Set(ids).size !== ids.length || ids.some(x => !Number.isSafeInteger(x) || x < 1)) fail(400, label + ': maksymalnie 10 unikalnych identyfikatorów.');
    }
    if ((serviceIds.length || assetIds.length) && !projects.canWork(u, p)) fail(403, 'Podobieństwo usług i urządzeń wymaga dostępu agenta.');
    for (const id of serviceIds) {
      const item=db.prepare('SELECT project_id FROM managed_services WHERE id=?').get(id);
      if (!item || !projects.canWork(u,projects.project(item.project_id))) fail(404,'Usługa niedostępna.');
    }
    const allowedAssetProjects=desk.settings(p).asset_projects||[];
    for (const id of assetIds) {
      const item=db.prepare('SELECT project_id FROM assets WHERE id=?').get(id);
      if (!item || !allowedAssetProjects.includes(item.project_id) || !projects.canWork(u,projects.project(item.project_id))) fail(404,'Urządzenie niedostępne.');
    }
    const all = projects.canWork(u, p) || (projects.publicReadable(p) && projects.githubIdentity(u));
    const scope = projects.ticketScope(u);
    const indexed=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE name='ticket_search'").get());
    const words=titleTokens(title+' '+(b.description||'')).slice(0,15),query=words.map(w=>'"'+w.replaceAll('"','')+'"').join(' OR ');
    const rows=indexed&&query?db.prepare(`SELECT t.id,t.key,t.title,t.description,t.status,t.workflow_status,t.updated_at FROM ticket_search f JOIN tickets t ON t.id=f.rowid WHERE ticket_search MATCH ? AND t.project_id=? AND t.deleted_at IS NULL AND t.archived_at IS NULL AND t.id<>? ${all?'':'AND '+scope.sql} ORDER BY rank LIMIT 2000`).all(query,p.id,exclude,...(all?[]:scope.values)):db.prepare(`SELECT t.id,t.key,t.title,t.status,t.workflow_status,t.updated_at FROM tickets t WHERE t.project_id=? AND t.deleted_at IS NULL AND t.archived_at IS NULL AND t.id<>? ${all?'':'AND '+scope.sql} ORDER BY t.updated_at DESC,t.id DESC LIMIT 2000`).all(p.id,exclude,...(all?[]:scope.values));
    // Prioritize explicit, authorized service/asset links before text-only FTS hits.
    const byId=new Map();
    if(serviceIds.length||assetIds.length){
      const conditions=[],params=[];
      for(const [table,col,ids] of [['ticket_services','service_id',serviceIds],['ticket_assets','asset_id',assetIds]]){
        if(!ids.length)continue;
        conditions.push('t.id IN (SELECT ticket_id FROM '+table+' WHERE '+col+' IN ('+ids.map(()=>'?').join(',')+'))');
        params.push(...ids);
      }
      const others=db.prepare(`SELECT t.id,t.key,t.title,t.description,t.status,t.workflow_status,t.updated_at FROM tickets t WHERE t.project_id=? AND t.deleted_at IS NULL AND t.archived_at IS NULL AND t.id<>? AND (${conditions.join(' OR ')}) ${all?'':'AND '+scope.sql} ORDER BY t.updated_at DESC,t.id DESC LIMIT 2000`).all(p.id,exclude,...params,...(all?[]:scope.values));
      for(const row of others)if(!byId.has(row.id)&&byId.size<2000)byId.set(row.id,row);
    }
    for(const row of rows)if(!byId.has(row.id)&&byId.size<2000)byId.set(row.id,row);
    const candidates=[...byId.values()];
    const descriptionPresent=indexed&&Boolean(b.description);
    const textMatches=rankSimilar(title+(b.description?' '+b.description:''),candidates.map(row=>({...row,display_title:row.title,title:row.title+(descriptionPresent?' '+(row.description||''):'')})),0,{limit:2000,allowContextOnly:Boolean(serviceIds.length||assetIds.length)});
    let matches;
    if(serviceIds.length||assetIds.length){
      const linkedIds=textMatches.map(x=>x.id);
      const countLinks=(table,column,ids)=>{
        const counts=new Map();if(!ids.length||!linkedIds.length)return counts;
        const hits=db.prepare('SELECT ticket_id,COUNT(*) AS n FROM '+table+' WHERE '+column+' IN ('+ids.map(()=>'?').join(',')+') AND ticket_id IN ('+linkedIds.map(()=>'?').join(',')+') GROUP BY ticket_id').all(...ids,...linkedIds);
        for(const hit of hits)counts.set(hit.ticket_id,hit.n);
        return counts;
      };
      const assetCounts=countLinks('ticket_assets','asset_id',assetIds),serviceCounts=countLinks('ticket_services','service_id',serviceIds);
      matches=textMatches.map(row=>{
        const asset=assetCounts.get(row.id)||0,service=serviceCounts.get(row.id)||0;
        const score=Math.min(100,row.score+(asset?55:0)+(service?40:0));
        const reasons=[...(row.exact||row.shared.length>=2?['Podobny temat lub opis']:[]),...(service?['Powiązana usługa']:[]),...(asset?['Powiązane urządzenie']:[])];
        return {...row,score,reasons};
      }).filter(row=>row.score>=config(p).threshold&&row.reasons.length).sort((a,b)=>b.score-a.score||b.id-a.id).slice(0,5).map(({id,description,display_title,...row})=>({...row,title:display_title}));
    }else matches=textMatches.filter(row=>row.score>=config(p).threshold).slice(0,5).map(({id,description,display_title,...row})=>({...row,title:display_title}));

    return {
      enabled: true,
      matches,
      examined: rows.length,
      limit: 2000,
      definition:
        (serviceIds.length||assetIds.length?'Dopasowanie tematu/opisu i podanych powiązanych usług lub urządzeń, po kontroli dostępu. Wagi kontekstu: usługa +40, urządzenie +55; maksymalny wynik 100. ':'')+(indexed?'Indeks przeszukuje dostępne sprawy projektu.':'Tekst oceniany wśród dostępnych spraw projektu.')+' Maksymalnie 2000 kandydatów; wynik nie jest prawdopodobieństwem duplikatu.',
    };
  }
  function insights(key, u) {
    const raw = db
      .prepare(
        'SELECT * FROM tickets WHERE key=? COLLATE NOCASE OR id=(SELECT ticket_id FROM ticket_aliases WHERE key=? COLLATE NOCASE)',
      )
      .get(key, key);
    if (
      !raw ||
      !projects.canRead(u, projects.project(raw.project_id), raw) ||
      !projects.canWork(u, projects.project(raw.project_id))
    )
      fail(404, 'Nie znaleziono zgłoszenia.');
    const c = config(projects.project(raw.project_id)),
      t = desk.ticket(raw.id);
    const checklist = db
      .prepare('SELECT label,done FROM ticket_checklist WHERE ticket_id=? ORDER BY id')
      .all(t.id);
    const minutes = db
      .prepare('SELECT COALESCE(SUM(minutes),0) n FROM ticket_worklogs WHERE ticket_id=?')
      .get(t.id).n;
    const estimate =
      db.prepare('SELECT estimated_minutes FROM ticket_estimates WHERE ticket_id=?').get(t.id)
        ?.estimated_minutes || 0;
    const attention = [],
      active = !t.archived_at && !['resolved', 'closed'].includes(t.status);
    if (c.attention && active) {
      if (!t.assignee_id) attention.push({ kind: 'unassigned', label: 'Brak opiekuna' });
      const age = Math.floor((clock() - Date.parse(t.updated_at)) / 86400000);
      if (age >= c.stale_days) attention.push({ kind: 'stale', label: `${age} dni bez aktualizacji` });
      const pending = checklist.filter((x) => !x.done).length;
      if (pending) attention.push({ kind: 'checklist', label: `${pending} niewykonanych kroków` });
      if (estimate && minutes > estimate)
        attention.push({
          kind: 'estimate',
          label: `Praca przekroczyła estymację o ${minutes - estimate} min`,
        });
    }
    let handover = null;
    if (c.handover) {
      const owner = t.assignee_id
        ? db.prepare('SELECT name FROM users WHERE id=?').get(t.assignee_id)?.name
        : null;
      const comments = db
        .prepare('SELECT body FROM comments WHERE ticket_id=? AND internal=0 ORDER BY id DESC LIMIT 2')
        .all(t.id)
        .reverse();
      handover = [
        `${t.key} · ${t.title}`,
        `Status: ${t.workflow_status} · Priorytet: ${t.priority}`,
        `Opiekun: ${owner || 'Nieprzypisane'}`,
        `Opis: ${t.description.slice(0, 3000)}`,
        `Praca: ${minutes} min · Estymacja: ${estimate} min`,
        ...checklist
          .filter((x) => !x.done)
          .slice(0, 10)
          .map((x) => `Do wykonania: ${x.label}`),
        ...comments.map((x) => `Ostatnia publiczna wiadomość: ${x.body.slice(0, 1500)}`),
        ...(t.resolution_text ? [`Rozwiązanie: ${t.resolution_text.slice(0, 2000)}`] : []),
      ].join('\n\n');
    }
    return {
      config: c,
      attention,
      handover,
      definition:
        'Podsumowanie z danych zgłoszenia; bez notatek wewnętrznych i treści załączników. Przejrzyj przed udostępnieniem.',
    };
  }
  return { settings, similar, insights };
}
