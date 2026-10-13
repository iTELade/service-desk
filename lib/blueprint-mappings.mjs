import { fail, text, choice, boolean } from './core.mjs';
import { validateFields } from './catalog.mjs';
import { validateSlaConfig } from './sla.mjs';
import { validPluginVersion } from './plugin-versions.mjs';
const alias = (value, fallback) => { const key=text(value||fallback,'Identyfikator mapowania',2,40);if(!/^[a-z][a-z0-9_]*$/.test(key))fail(400,'Nieprawidłowy identyfikator mapowania.');return key; };
export function portableProjectMappings(p, statuses) {
  if(!Array.isArray(p.teams||[])||(p.teams||[]).length>100)fail(400,'Nieprawidłowe zespoły szablonu.');
  const teamIds=new Map(),teamKeys=new Set(),teams=(p.teams||[]).map((t,i)=>{const key=alias(t.alias,'team_'+(i+1));if(teamKeys.has(key))fail(400,'Powtórzony zespół szablonu.');teamKeys.add(key);if(t.id)teamIds.set(t.id,key);return {alias:key,name:text(t.name,'Nazwa zespołu',2,100),project_role:choice(t.project_role||'agent',['agent','manager'],'Rola zespołu')};});
  if(p.forms.some(f=>!f||typeof f!=='object'||!Array.isArray(f.fields||[])))fail(400,'Nieprawidłowy formularz szablonu.');
  const formIds=new Map(),formKeys=new Set();p.forms.forEach((f,i)=>{const key=alias(f.alias,'form_'+(i+1));if(formKeys.has(key))fail(400,'Powtórzony formularz szablonu.');formKeys.add(key);if(f.id)formIds.set(f.id,key);});
  const forms=p.forms.map((f,i)=>{
    const fields=validateFields((f.fields||[]).map(field=>({...field,allowed_team_ids:[]}))).map((field,index)=>{
      const raw=f.fields[index],refs=raw.allowed_team_aliases||(raw.allowed_team_ids||[]).map(id=>teamIds.get(id));if(!Array.isArray(refs)||refs.some(key=>!teamKeys.has(key)))fail(400,'Pole wymaga mapowania zespołu.');delete field.allowed_team_ids;
      if(refs.length){field.allowed_team_aliases=[...new Set(refs)];field.visibility='internal';}return field;
    });
    const base_fields={};for(const key of ['title','description']){const raw=f.base_fields?.[key]||{};base_fields[key]={hidden:boolean(raw.hidden??false,'Ukryte pole'),value:text(raw.value||'','Stała wartość',0,key==='title'?200:20000)};if(base_fields[key].hidden&&base_fields[key].value.length<3)fail(400,'Ukryte pole wymaga stałej wartości.');}
    return {alias:alias(f.alias,'form_'+(i+1)),name:text(f.name,'Nazwa formularza',2,120),description:text(f.description||'','Opis',0,2000),base_type:choice(f.base_type||'request',['request','incident','task','bug','story'],'Typ formularza'),fields,base_fields,group_name:text(f.group_name||'','Grupa',0,80),icon:choice(f.icon||'queue',['queue','plus','users','projects','portal','board'],'Ikona'),default_priority:choice(f.default_priority||'P3',['P1','P2','P3','P4'],'Priorytet'),portal_priority:boolean(f.portal_priority??false,'Priorytet klienta'),portal_visible:p.project_type==='external'&&f.portal_visible!==false,enabled:f.enabled!==false};
  });
  let sla=null;if(p.sla){
    if(!Array.isArray(p.sla.rules))fail(400,'Nieprawidłowe reguły SLA.');
    const refs=p.sla.rules.map(rule=>{const keys=rule.request_type_aliases||(rule.request_type_ids||[]).map(id=>formIds.get(id));if(!Array.isArray(keys)||keys.some(key=>!formKeys.has(key)))fail(400,'SLA wymaga mapowania formularza.');return [...new Set(keys)];});
    sla=validateSlaConfig({...p.sla,rules:p.sla.rules.map(rule=>({...rule,request_type_ids:[]}))},statuses);sla.rules=sla.rules.map((rule,i)=>{delete rule.request_type_ids;return {...rule,request_type_aliases:refs[i]};});
  }
  return {teams,forms,sla};
}
export function portablePluginRequirements(input=[]) {
  if(!Array.isArray(input)||input.length>30)fail(400,'Nieprawidłowe zależności pluginów szablonu.');
  const ids=new Set();return input.map(p=>{if(!p||typeof p.id!=='string'||!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(p.id)||ids.has(p.id)||!validPluginVersion(p.minimum))fail(400,'Nieprawidłowa zależność pluginu.');ids.add(p.id);return {id:p.id,minimum:p.minimum,required:boolean(p.required??true,'Wymagana zależność')};});
}
