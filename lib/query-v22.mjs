import { fail, text } from './core.mjs';
const operators=['=','!=','>','<','>=','<='];
const fields={project:'t.project_id',status:'t.status',state:'t.workflow_status',priority:'t.priority',assignee:'t.assignee_id',type:'t.type',created:'t.created_at',updated:'t.updated_at',form:'t.request_type_id',team:'(SELECT team_id FROM ticket_context WHERE ticket_id=t.id)'};
const validField=field=>Object.hasOwn(fields,field)||/^custom\.[a-z][a-z0-9_]{0,39}$/.test(field);
export function normalizeQueryAST(input){
 let nodes=0;
 const visit=(node,depth=0)=>{
  if(++nodes>150||depth>20||!node||typeof node!=='object'||Array.isArray(node))fail(400,'Zapytanie jest zbyt złożone lub nieprawidłowe.');
  if(['and','or'].includes(node.kind)){if(!Array.isArray(node.children)||node.children.length<2||node.children.length>50)fail(400,'Grupa wymaga co najmniej dwóch warunków.');return {kind:node.kind,children:node.children.map(n=>visit(n,depth+1))};}
  const field=text(node.field,'Pole filtra',1,47).toLowerCase();if(!validField(field))fail(400,'Nieznane pole filtra.');
  const value=v=>{if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&v.function==='currentUser'&&field==='assignee')return {function:'currentUser'};if(!['string','number'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||typeof v==='string'&&v.length>1000)fail(400,'Nieprawidłowa wartość filtra.');return v;};
  if(node.kind==='empty'){if(typeof node.not!=='boolean')fail(400,'Nieprawidłowy warunek pustej wartości.');return {kind:'empty',field,not:node.not};}
  if(node.kind==='in'){if(!Array.isArray(node.values)||!node.values.length||node.values.length>50)fail(400,'Nieprawidłowa lista IN.');return {kind:'in',field,values:node.values.map(value)};}
  if(node.kind!=='comparison'||!operators.includes(node.operator))fail(400,'Nieprawidłowy operator.');return {kind:'comparison',field,operator:node.operator,value:value(node.value)};
 };
 return visit(input);
}
export function parseExpression(expression){
 const input=text(expression,'Zapytanie',1,2000),tokens=input.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|>=|<=|!=|[=><(),]|[A-Za-z0-9_.:@/-]+/g)||[];
 if(tokens.join('').replace(/\s/g,'')!==input.replace(/\s/g,'')||tokens.length>300)fail(400,'Nieprawidłowe zapytanie.');
 let i=0,depth=0;const next=()=>tokens[i++],peek=()=>tokens[i]?.toUpperCase();
 const value=field=>{const token=next();if(!token||['AND','OR',')',','].includes(token.toUpperCase()))fail(400,'Brak wartości.');if(token.toLowerCase()==='currentuser'&&field==='assignee'){if(next()!=='('||next()!==')')fail(400,'Użyj currentUser().');return {function:'currentUser'};}if(token.startsWith('"')){try{return JSON.parse(token);}catch{fail(400,'Nieprawidłowa wartość tekstowa.');}}if(token.startsWith("'"))return token.slice(1,-1).replace(/\\(['\\])/g,'$1');return /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(token)?Number(token):token;};
 function primary(){if(++depth>20)fail(400,'Zapytanie jest zbyt złożone.');let node;
  if(peek()==='('){next();node=or();if(next()!==')')fail(400,'Brak zamknięcia nawiasu.');}
  else{const field=String(next()||'').toLowerCase(),op=next()?.toUpperCase();if(op==='IS'){const not=peek()==='NOT';if(not)next();if(!['EMPTY','NULL'].includes(peek()))fail(400,'Użyj IS EMPTY.');next();node={kind:'empty',field,not};}
   else if(op==='IN'){if(next()!=='(')fail(400,'IN wymaga listy.');const values=[];do{values.push(value(field));if(peek()!==',')break;next();}while(values.length<50);if(next()!==')')fail(400,'Nieprawidłowa lista IN.');node={kind:'in',field,values};}
   else node={kind:'comparison',field,operator:op,value:value(field)};
  }depth--;return node;
 }
 function and(){let node=primary();while(peek()==='AND'){next();node={kind:'and',children:[node,primary()]};}return node;}
 function or(){let node=and();while(peek()==='OR'){next();node={kind:'or',children:[node,and()]};}return node;}
 const ast=or();if(i!==tokens.length)fail(400,'Nieoczekiwana część zapytania.');return normalizeQueryAST(ast);
}
export function formatExpression(input){
 const ast=normalizeQueryAST(input),value=v=>typeof v==='object'?'currentUser()':typeof v==='number'?String(v):JSON.stringify(v);
 const render=n=>['and','or'].includes(n.kind)?'('+n.children.map(render).join(' '+n.kind.toUpperCase()+' ')+')':n.kind==='empty'?n.field+' IS '+(n.not?'NOT ':'')+'EMPTY':n.kind==='in'?n.field+' IN ('+n.values.map(value).join(',')+')':n.field+' '+n.operator+' '+value(n.value);
 return text(render(ast),'Zapytanie',1,2000);
}
export function compileExpression(expression,{user,projects,allowedFields=[]}){
 const ast=parseExpression(expression),values=[],visible=projects.list(user);
 const value=(field,v)=>{
  if(field==='project'){const p=visible.find(p=>p.key.toLowerCase()===String(v).toLowerCase()||String(p.id)===String(v));if(!p)fail(404,'Projekt niedostępny.');return p.id;}
  if(['assignee','form','team'].includes(field)){const id=v?.function==='currentUser'?user.id:Number(v);if(!Number.isSafeInteger(id)||id<1)fail(400,'Nieprawidłowy identyfikator filtra.');return id;}return v;
 };
 const compile=n=>{if(['and','or'].includes(n.kind))return '('+n.children.map(compile).join(' '+n.kind.toUpperCase()+' ')+')';let column=fields[n.field];if(n.field.startsWith('custom.')){const key=n.field.slice(7);if(!allowedFields.includes(key))fail(403,'Pole niedostępne w filtrze.');column="json_extract(t.custom_values,'$."+key+"')";}
  if(n.kind==='empty')return column+(n.not?' IS NOT NULL':' IS NULL');if(n.kind==='in'){values.push(...n.values.map(v=>value(n.field,v)));return column+' IN ('+n.values.map(()=>'?').join(',')+')';}values.push(value(n.field,n.value));return column+' '+n.operator+' ?';
 };
 return {sql:compile(ast),values,ast};
}
