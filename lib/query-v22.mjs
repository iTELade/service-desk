import { fail, text } from './core.mjs';
// A small, parameterized grammar. Never interpolate user-supplied identifiers or values.
export function compileExpression(expression, { user, projects, allowedFields = [] }) {
  const input = text(expression, 'Zapytanie', 1, 2000), tokens = input.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|>=|<=|!=|[=><(),]|[A-Za-z0-9_.:@/-]+/g) || [];
  if (tokens.join('').replace(/\s/g, '') !== input.replace(/\s/g, '') || tokens.length > 300) fail(400, 'Nieprawidłowe zapytanie.');
  let i = 0, depth = 0; const values = [], peek = () => tokens[i]?.toUpperCase(), next = () => tokens[i++];
  const fields = { project: 't.project_id', status: 't.status', state: 't.workflow_status', priority: 't.priority', assignee: 't.assignee_id', type: 't.type', created: 't.created_at', updated: 't.updated_at' };
  const value = (field, token) => {
    if (!token || ['AND', 'OR', ')', ','].includes(token.toUpperCase())) fail(400, 'Brak wartości.');
    let v = /^['"]/.test(token) ? token.slice(1, -1) : token;
    if (field === 'project') { const p = projects.list(user).find(p => p.key.toLowerCase() === v.toLowerCase() || String(p.id) === v); if (!p) fail(404, 'Projekt niedostępny.'); v = p.id; }
    if (field === 'assignee') { if (v.toLowerCase() === 'currentuser') { if (next() !== '(' || next() !== ')') fail(400, 'Użyj currentUser().'); v = user.id; } else { v = Number(v); if (!Number.isSafeInteger(v) || v < 1) fail(400, 'Nieprawidłowy opiekun.'); } }
    return v;
  };
  function primary() {
    if (++depth > 20) fail(400, 'Zapytanie jest zbyt złożone.');
    if (peek() === '(') { next(); const sql = or(); if (next() !== ')') fail(400, 'Brak zamknięcia nawiasu.'); depth--; return '(' + sql + ')'; }
    const field = String(next() || '').toLowerCase(); let column = fields[field];
    if (field.startsWith('custom.')) { const key = field.slice(7); if (!allowedFields.includes(key) || !/^[a-z][a-z0-9_]*$/.test(key)) fail(403, 'Pole niedostępne w filtrze.'); column = "json_extract(t.custom_values,'$." + key + "')"; }
    if (!column) fail(400, 'Nieznane pole filtra.');
    const op = next()?.toUpperCase(); let sql;
    if (op === 'IS') { const not = peek() === 'NOT' ? next() : ''; if (!['EMPTY', 'NULL'].includes(peek())) fail(400, 'Użyj IS EMPTY.'); next(); sql = column + (not ? ' IS NOT NULL' : ' IS NULL'); }
    else if (op === 'IN') { if (next() !== '(') fail(400, 'IN wymaga listy.'); const list = []; do { list.push(value(field, next())); if (peek() !== ',') break; next(); } while (list.length < 50); if (next() !== ')' || !list.length) fail(400, 'Nieprawidłowa lista IN.'); values.push(...list); sql = column + ' IN (' + list.map(() => '?').join(',') + ')'; }
    else { if (!['=', '!=', '>', '<', '>=', '<='].includes(op)) fail(400, 'Nieprawidłowy operator.'); values.push(value(field, next())); sql = column + ' ' + op + ' ?'; }
    depth--; return sql;
  }
  function and() { let sql = primary(); while (peek() === 'AND') { next(); sql = '(' + sql + ' AND ' + primary() + ')'; } return sql; }
  function or() { let sql = and(); while (peek() === 'OR') { next(); sql = '(' + sql + ' OR ' + and() + ')'; } return sql; }
  const sql = or(); if (i !== tokens.length) fail(400, 'Nieoczekiwana część zapytania.'); return { sql, values };
}
