import { fail, choice } from './core.mjs';
export const customerSections=['description','fields','conversation','attachments','next'];
export function customerLayouts(input={},forms=[]){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>50)fail(400,'Nieprawidłowe widoki formularzy klienta.');
  return Object.fromEntries(Object.entries(input).map(([key,value])=>{
    const form=forms.find(f=>String(f.id??f.alias)===key);if(!form)fail(400,'Nieznany formularz widoku klienta.');
    if(!value||!Array.isArray(value.sections)||value.sections.length>5||new Set(value.sections).size!==value.sections.length||value.sections.some(s=>!customerSections.includes(s)))fail(400,'Nieprawidłowe sekcje widoku klienta.');
    const fields=new Set(form.fields.filter(f=>f.visibility!=='internal'&&!f.allowed_team_ids?.length&&!f.allowed_team_aliases?.length).map(f=>f.key)),order=value.field_order??[];
    if(!Array.isArray(order)||order.length>30||new Set(order).size!==order.length||order.some(k=>!fields.has(k)))fail(400,'Kolejność klienta wymaga dostępnych publicznych pól formularza.');
    return [key,{mode:choice(value.mode??'sections',['sections','tabs'],'Sposób wyświetlania'),sections:[...value.sections],field_order:[...order]}];
  }));
}
export function portableCustomerLayouts(input={},forms=[]){
  const aliased=forms.map((f,i)=>({...f,alias:f.alias||'form_'+(i+1)}));
  const remapped=Object.fromEntries(Object.entries(input).map(([key,value])=>{const form=aliased.find(f=>String(f.id)===key||f.alias===key);if(!form)fail(400,'Widok klienta wymaga mapowania formularza.');return [form.alias,value];}));
  return customerLayouts(remapped,aliased.map(({id,...f})=>f));
}
