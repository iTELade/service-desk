import { fail, text, choice } from './core.mjs';
import { parseExpression, normalizeQueryAST, formatExpression, compileExpression } from './query-v22.mjs';
export function mapQueryValues(input,mapper){
 if(['and','or'].includes(input.kind))return {...input,children:input.children.map(n=>mapQueryValues(n,mapper))};
 return input.kind==='in'?{...input,values:input.values.map(v=>mapper(input.field,v))}:input.kind==='comparison'?{...input,value:mapper(input.field,input.value)}:{...input};
}
export function queueAccountIds(queues=[]){
 const ids=new Set();for(const q of queues){if(q.filters?.assignee&&!['me','unassigned'].includes(q.filters.assignee))ids.add(Number(q.filters.assignee));if(q.filters?.expression)mapQueryValues(parseExpression(q.filters.expression),(field,v)=>{if(field==='assignee'&&typeof v!=='object'&&Number.isSafeInteger(Number(v)))ids.add(Number(v));return v;});}return [...ids];
}
export function portableQueues(p,forms,teams,roles){
 if(!Array.isArray(p.queues||[])||(p.queues||[]).length>100)fail(400,'Nieprawidłowe kolejki szablonu.');
 const aliases={form:new Map(p.forms.map((f,i)=>[String(f.id),forms[i].alias])),team:new Map((p.teams||[]).map((t,i)=>[String(t.id),teams[i].alias])),assignee:new Map((p.roles||[]).map((r,i)=>[String(r.id),roles[i].alias]))},known={form:forms.map(f=>f.alias),team:teams.map(t=>t.alias),assignee:roles.map(r=>r.alias)};
 return (p.queues||[]).map(q=>{
  if(q.filters?.project&&String(q.filters.project)!==String(p.id))fail(400,'Kolejka wskazuje inny projekt; wymagane mapowanie.');
  const filters=Object.fromEntries(Object.entries(q.filters||{}).filter(([key])=>['status','priority','type','sort','queue','scope','q','archived','created_from','created_to'].includes(key))),conditions=[];
  let ast=q.query_ast|| (q.filters?.expression?parseExpression(q.filters.expression):null);
  if(ast)conditions.push(ast);
  if(q.filters?.assignee){const v=q.filters.assignee;conditions.push(v==='unassigned'?{kind:'empty',field:'assignee',not:false}:{kind:'comparison',field:'assignee',operator:'=',value:v==='me'?{function:'currentUser'}:String(v)});}
  if(q.filters?.state){const states=String(q.filters.state).split(',').map(v=>{const [project,state]=v.split(':');if(String(p.id)!==project)fail(400,'Kolejka wymaga jawnego mapowania innego projektu.');return state;});conditions.push({kind:'in',field:'state',values:states});}
  ast=conditions.length>1?{kind:'and',children:conditions}:conditions[0];
  if(ast)ast=normalizeQueryAST(mapQueryValues(ast,(field,v)=>{
   if(v&&typeof v==='object')return v;
   if(field==='project'){if(v==='@self'||String(v)===String(p.id)||String(v).toLowerCase()===String(p.key||'').toLowerCase())return '@self';fail(400,'Kolejka wymaga mapowania projektu poza szablonem.');}
   if(Object.hasOwn(aliases,field)){if(String(v).startsWith('@'+field+'/')){if(!known[field].includes(String(v).slice(field.length+2)))fail(400,'Nieznane mapowanie kolejki.');return v;}const alias=aliases[field].get(String(v));if(!alias)fail(400,'Kolejka wymaga mapowania '+field);return '@'+field+'/'+alias;}
   if(field.startsWith('custom.')&&!forms.some(f=>f.fields.some(x=>x.key===field.slice(7))))fail(400,'Nieznane pole kolejki.');return v;
  }));
  if(q.columns&&(!Array.isArray(q.columns)||!q.columns.includes('issue')||new Set(q.columns).size!==q.columns.length||q.columns.some(c=>!['issue','status','priority','assignee','sla','updated'].includes(c))))fail(400,'Nieprawidłowe kolumny kolejki.');
  return {name:text(q.name,'Nazwa kolejki',2,100),filters,...(ast?{query_ast:ast}:{}),...(q.columns?{columns:q.columns}:{}),sort_key:choice(q.sort_key||'updated_at',['updated_at','created_at','priority'],'Sortowanie'),sort_dir:choice(q.sort_dir||'desc',['asc','desc'],'Kierunek'),density:choice(q.density||'comfortable',['comfortable','compact'],'Gęstość')};
 });
}
export function instantiateQueue(q,{projectId,formIds,teamIds,roles,user,projects,allowedFields}){
 if(!q.query_ast)return q.filters;
 const ast=mapQueryValues(q.query_ast,(field,v)=>{if(field==='project'&&v==='@self')return projectId;if(typeof v==='string'&&['form','team','assignee'].includes(field)&&v.startsWith('@'+field+'/')){const id=({form:formIds,team:teamIds,assignee:roles})[field][v.slice(field.length+2)];if(!id)fail(400,'Mapowanie kolejki niedostępne.');return id;}return v;});
 const expression=formatExpression(ast);compileExpression(expression,{user,projects,allowedFields});return {...q.filters,expression};
}
