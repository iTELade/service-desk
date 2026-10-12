import { fail } from './core.mjs';

export function periodReport(db, projects, user, query) {
  if (user.role === 'customer') fail(403, 'Raporty dostępne zespołowi.');
  const ids = projects.list(user).filter(p => p.can_work && (!query.get('project') || p.id === Number(query.get('project')))).map(p => p.id);
  const from = query.get('from') || '1970-01-01', to = query.get('to') || new Date().toISOString().slice(0, 10);
  for (const d of [from, to]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) fail(400, 'Nieprawidłowy okres.');
  if (from > to) fail(400, 'Nieprawidłowy zakres.');
  const start = from + 'T00:00:00.000Z', end = to + 'T23:59:59.999Z';
  const rows = db.prepare(`SELECT t.*,r.name form_name,c.team_id,g.name team_name FROM tickets t LEFT JOIN request_types r ON r.id=t.request_type_id LEFT JOIN ticket_context c ON c.ticket_id=t.id LEFT JOIN teams g ON g.id=c.team_id WHERE t.project_id IN (${ids.join(',') || 'NULL'}) AND t.deleted_at IS NULL AND t.created_at>=? AND t.created_at<=?`).all(start, end);
  const quantiles = data => {
    const sorted = data.filter(n => Number.isFinite(n) && n >= 0).sort((a,b) => a-b), n = sorted.length;
    return { sample_size: n, median_minutes: n ? (sorted[Math.floor((n-1)/2)] + sorted[Math.ceil((n-1)/2)]) / 2 : null, p90_minutes: n ? sorted[Math.ceil(n*.9)-1] : null };
  };
  const reopened = new Map(db.prepare(`WITH spans AS (SELECT s.ticket_id,s.started_at,s.category,LAG(s.category) OVER(PARTITION BY s.ticket_id ORDER BY s.id) previous FROM status_spans s JOIN tickets t ON t.id=s.ticket_id WHERE t.project_id IN (${ids.join(',') || 'NULL'}) AND t.deleted_at IS NULL AND t.created_at>=? AND t.created_at<=?) SELECT ticket_id,COUNT(*) count FROM spans WHERE previous='resolved' AND category NOT IN ('resolved','closed') AND started_at>=? AND started_at<=? GROUP BY ticket_id`).all(start, end, start, end).map(r => [r.ticket_id, r.count]));
  const groups = field => {
    const result = new Map();
    for (const t of rows) {
      const key = field === 'team' ? t.team_id || null : t.form_name || t.type;
      const item = result.get(key) || { id: key, name: field === 'team' ? t.team_name || 'Bez zespołu' : key, count: 0, open: 0, reopened_tickets: 0, reopen_events: 0 };
      item.count++; if (!['resolved','closed'].includes(t.status)) item.open++;
      if (reopened.has(t.id)) { item.reopened_tickets++; item.reopen_events += reopened.get(t.id); }
      result.set(key, item);
    }
    return [...result.values()];
  };
  const reopenEvents = [...reopened.values()].reduce((sum,n) => sum+n, 0);
  return { from, to, total: rows.length,
    response: quantiles(rows.filter(t => t.first_response_at).map(t => (Date.parse(t.first_response_at)-Date.parse(t.created_at))/60000)),
    resolution: quantiles(rows.filter(t => t.resolved_at).map(t => (Date.parse(t.resolved_at)-Date.parse(t.created_at))/60000)),
    by_form: groups('form'), by_team: groups('team'),
    reopened: { tickets: reopened.size, events: reopenEvents, rate: rows.length ? reopened.size / rows.length : null },
    aging: rows.filter(t => !['resolved','closed'].includes(t.status)).map(t => ({ key: t.key, title: t.title, days: Math.max(0,Math.floor((Date.now()-Date.parse(t.created_at))/86400000)), team_id: t.team_id })).sort((a,b) => b.days-a.days).slice(0,100),
    queue_url: '#/queue?created_from='+from+'&created_to='+to+(query.get('project') ? '&project='+encodeURIComponent(query.get('project')) : ''),
    definition: 'Zgłoszenia utworzone w okresie; zespoły według aktualnej odpowiedzialności. Ponowne otwarcia: przejścia z rozwiązanej do aktywnej w tym samym okresie. Czasy kalendarzowe; mediana (średnia środkowych wartości) i p90 metodą najbliższej rangi. Brak historii nie oznacza braku ponownych otwarć.' };
}
