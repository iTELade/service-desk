import {now,fail,txFor,text,choice,integer,boolean,email} from './core.mjs';

export const baseTypes={incident:'Incydent',request:'Wniosek o usługę',task:'Zadanie',bug:'Błąd',story:'Historyjka'};
export const fieldTypes=['text','textarea','number','date','email','url','select','multiselect','checkbox'];
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function validateFields(input){
  if(!Array.isArray(input)||input.length>30)fail(400,'Formularz może mieć maksymalnie 30 własnych pól.');
  const used=new Set();
  const result=input.map(f=>{
    if(!object(f))fail(400,'Nieprawidłowe pole formularza.');
    const key=text(f.key,'Identyfikator pola',1,40);
    if(!/^[a-z][a-z0-9_]*$/.test(key)||['constructor','prototype','__proto__'].includes(key)||used.has(key))fail(400,'Identyfikatory pól muszą być bezpieczne i niepowtarzalne.');
    used.add(key);
    const out={key,label:text(f.label,'Nazwa pola',1,120),type:choice(f.type,fieldTypes,'typ pola'),required:boolean(f.required??false,'Wymagane pole'),visibility:choice(f.visibility??'portal',['portal','internal'],'widoczność pola'),help:text(f.help??'','Instrukcja pola',0,1000)};
    if(['select','multiselect'].includes(out.type)){
      if(!Array.isArray(f.options)||f.options.length<1||f.options.length>50)fail(400,'Lista wyboru wymaga od 1 do 50 opcji.');
      out.options=f.options.map(v=>text(v,'Opcja',1,120));
      if(new Set(out.options).size!==out.options.length)fail(400,'Opcje nie mogą się powtarzać.');
    }
    if(out.type==='number')for(const k of ['min','max'])if(f[k]!==undefined&&f[k]!==null&&f[k]!==''){
      if(typeof f[k]!=='number'||!Number.isFinite(f[k]))fail(400,'Granice pola liczbowego muszą być skończonymi liczbami.');out[k]=f[k];
    }
    if(out.min!==undefined&&out.max!==undefined&&out.min>out.max)fail(400,'Minimum nie może przekraczać maksimum.');
    if(['text','textarea'].includes(out.type))out.max_length=integer(f.max_length??(out.type==='text'?500:5000),'Limit znaków',1,10000);
    return out;
  });
  if(Buffer.byteLength(JSON.stringify(result))>96000)fail(400,'Definicja formularza jest za duża.');
  return result;
}
export function validateValues(fields,input={},internal=false,existing={}){
  if(!object(input)||Buffer.byteLength(JSON.stringify(input))>64000)fail(400,'Nieprawidłowe lub zbyt duże dane formularza.');
  const out={...existing},map=new Map(fields.map(f=>[f.key,f]));
  for(const key of Object.keys(input)){
    const f=map.get(key);if(!f)fail(400,'Formularz zawiera nieznane pole.');
    if(f.visibility==='internal'&&!internal)fail(403,'Pole jest dostępne wyłącznie zespołowi.');
    let v=input[key];
    if(v===null||v===''||v===undefined){delete out[key];continue;}
    switch(f.type){
      case 'number':if(typeof v!=='number'||!Number.isFinite(v)||(f.min!==undefined&&v<f.min)||(f.max!==undefined&&v>f.max))fail(400,`${f.label}: nieprawidłowa liczba lub zakres.`);break;
      case 'checkbox':boolean(v,f.label);break;
      case 'select':choice(v,f.options,f.label);break;
      case 'multiselect':if(!Array.isArray(v)||v.length>50||new Set(v).size!==v.length||v.some(x=>!f.options.includes(x)))fail(400,`${f.label}: wybierz dostępne opcje.`);break;
      case 'date':if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(400,`${f.label}: podaj poprawną datę.`);break;
      case 'email':v=email(v);break;
      case 'url':{
        v=text(v,f.label,1,2000);let u;try{u=new URL(v);}catch{fail(400,`${f.label}: podaj pełny adres HTTPS lub HTTP.`);}
        if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail(400,`${f.label}: dozwolony jest adres HTTP lub HTTPS bez danych logowania.`);break;
      }
      default:v=text(v,f.label,0,f.max_length||5000);
    }
    out[key]=v;
  }
  for(const f of fields){
    if(f.visibility==='internal'&&!internal)continue;
    const v=out[f.key];
    if(f.required&&(v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length)||(f.type==='checkbox'&&v!==true)))fail(400,`${f.label}: uzupełnij wymagane pole.`);
  }
  if(Buffer.byteLength(JSON.stringify(out))>64000)fail(400,'Dane formularza są za duże.');
  return out;
}
export function seedRequestTypes(db,p){
  const portal=p.project_type==='external'?JSON.parse(p.request_types):[];
  let order=0;
  for(const [key,name] of Object.entries(baseTypes))db.prepare(`INSERT INTO request_types(project_id,system_key,name,description,base_type,portal_visible,portal_priority,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?,?)`).run(p.id,key,name,key==='incident'?'Zgłoś awarię lub problem.':key==='request'?'Poproś o dostęp, zmianę lub pomoc.':'',key,Number(portal.includes(key)),order+=10,now(),now());
}
export function createCatalog(db,projects){
  const tx=txFor(db);
  const row=id=>db.prepare('SELECT * FROM request_types WHERE id=?').get(integer(Number(id),'Formularz'));
  const output=(r,internal=true)=>({...r,base_fields:JSON.parse(r.base_fields||'{}'),fields:JSON.parse(r.fields).filter(f=>internal||f.visibility!=='internal'),portal_visible:Boolean(r.portal_visible),portal_priority:Boolean(r.portal_priority),enabled:Boolean(r.enabled)});
  function access(id,user,surface='team'){
    choice(surface,['team','portal','manage'],'miejsce formularza');const p=projects.project(integer(Number(id),'Projekt'));
    if(!p||!(surface==='portal'?projects.canPortal(user,p):surface==='manage'?projects.canManage(user,p):projects.canWork(user,p)))fail(404,'Nie znaleziono formularzy projektu.');return p;
  }
  function list(id,user,surface='team'){
    const p=access(id,user,surface);
    return db.prepare('SELECT * FROM request_types WHERE project_id=? ORDER BY sort_order,id').all(p.id).filter(r=>surface==='manage'||(r.enabled&&(surface!=='portal'||r.portal_visible))).map(r=>output(r,surface!=='portal'));
  }
  function get(id,typeId,user){const p=access(id,user,'manage'),r=row(typeId);if(!r||r.project_id!==p.id)fail(404,'Formularz nie istnieje.');return output(r);}
  function config(b,old,p){
    const r={...old,...b},base={};
    for(const key of ['title','description']){const f=r.base_fields?.[key]||{};base[key]={hidden:boolean(f.hidden??false,'Ukryte pole'),value:text(f.value??'','Stała wartość',0,key==='title'?200:20000)};if(base[key].hidden&&base[key].value.length<3)fail(400,'Ukryte pole wymaga stałej wartości (co najmniej 3 znaki).');}
    return {base_fields:JSON.stringify(base),name:text(r.name,'Nazwa formularza',2,120),description:text(r.description??'','Opis formularza',0,2000),group_name:text(r.group_name??'','Grupa formularzy',0,80),icon:choice(r.icon??'queue',['queue','plus','users','projects','portal','board'],'ikona'),base_type:choice(r.base_type??'request',Object.keys(baseTypes),'klasyfikacja'),default_priority:choice(r.default_priority??'P3',['P1','P2','P3','P4'],'priorytet'),portal_priority:Number(boolean(r.portal_priority??false,'Wybór priorytetu')),portal_visible:Number(p.project_type==='external'&&boolean(r.portal_visible??false,'Publikacja w portalu')),enabled:Number(boolean(r.enabled??true,'Formularz aktywny')),sort_order:integer(r.sort_order??10,'Kolejność',0,100000),fields:JSON.stringify(validateFields(r.fields??[]))};
  }
  function save(id,typeId,b,user){
    const p=access(id,user,'manage');if(p.archived)fail(409,'Projekt jest zarchiwizowany.');
    const old=typeId?get(id,typeId,user):null;
    if(old&&old.version!==b.version)fail(409,'Formularz zmienił się. Odśwież stronę przed zapisem.');
    const c=config(b,old,p),keys=Object.keys(c);
    return tx(()=>{
      let saved=typeId;
      if(old)db.prepare(`UPDATE request_types SET ${keys.map(k=>k+'=?').join(',')},version=version+1,updated_at=? WHERE id=?`).run(...keys.map(k=>c[k]),now(),old.id);
      else saved=Number(db.prepare(`INSERT INTO request_types(project_id,${keys.join(',')},created_at,updated_at) VALUES(?,${keys.map(()=>'?').join(',')},?,?)`).run(p.id,...keys.map(k=>c[k]),now(),now()).lastInsertRowid);
      db.prepare('UPDATE projects SET version=version+1 WHERE id=?').run(p.id);
      projects.audit(p.id,user,old?'form.updated':'form.created',{form_id:Number(saved),name:c.name,fields:JSON.parse(c.fields).length,enabled:Boolean(c.enabled)});
      return output(row(saved));
    });
  }
  function clone(id,typeId,user){const source=get(id,typeId,user);return save(id,null,{...source,name:source.name.slice(0,110)+' — kopia',enabled:false,portal_visible:false},user);}
  function prepare(p,b,fromPortal){
    const r=b.request_type_id===undefined?db.prepare('SELECT * FROM request_types WHERE project_id=? AND system_key=?').get(p.id,b.type??''):row(b.request_type_id);
    if(!r||r.project_id!==p.id||!r.enabled||(fromPortal&&!r.portal_visible))fail(400,'Ten formularz nie jest dostępny w wybranym projekcie.');
    if(b.request_type_id!==undefined&&b.request_type_version!==r.version)fail(409,'Formularz zmienił się. Otwórz go ponownie, aby zobaczyć aktualne pola.');
    const fields=JSON.parse(r.fields),values=validateValues(fields,b.custom_values??{},!fromPortal);
    const base=JSON.parse(r.base_fields||'{}');
    return {title:base.title?.hidden?base.title.value:b.title,description:base.description?.hidden?base.description.value:b.description,id:r.id,type:r.base_type,priority:fromPortal&&!r.portal_priority?r.default_priority:choice(b.priority??r.default_priority,['P1','P2','P3','P4'],'priorytet'),snapshot:JSON.stringify({id:r.id,name:r.name,base_type:r.base_type,base_fields:base,fields}),values:JSON.stringify(values)};
  }
  function ticket(t,internal){
    const snapshot=JSON.parse(t.form_snapshot||'{}'),values=JSON.parse(t.custom_values||'{}');
    const fields=(snapshot.fields||[]).filter(f=>internal||f.visibility!=='internal');
    return {request_form:{...snapshot,fields},custom_values:Object.fromEntries(fields.filter(f=>Object.hasOwn(values,f.key)).map(f=>[f.key,values[f.key]]))};
  }
  const editValues=(t,b,internal)=>JSON.stringify(validateValues(JSON.parse(t.form_snapshot).fields||[],b,internal,JSON.parse(t.custom_values)));
  return {list,get,save,clone,prepare,ticket,editValues};
}
