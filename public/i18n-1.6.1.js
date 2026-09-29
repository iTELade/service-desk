(()=>{
  'use strict';
  const VERSION='1.6.1';
  const extras=new Map([
    ['Kolejki zgłoszeń','Ticket queues'],['Zgłoszenie','Request'],['Zgłoszenia','Requests'],['Opis','Description'],['Rozmowa','Conversation'],['Komentarze','Comments'],['Załączniki','Attachments'],['Powiązania','Related'],['Historia','History'],['Historia zmian','Change history'],
    ['Widok zapisany','Saved view'],['Zapisz bieżący widok','Save current view'],['Szybki filtr','Quick filter'],['Brak','None'],['Otwarte','Open'],['Przypisane do mnie','Assigned to me'],['Bez opiekuna','Unassigned'],['Najdłużej oczekujące','Waiting longest'],['SLA zagrożone','SLA at risk'],['Sortowanie 1','Primary sort'],['Sortowanie 2','Secondary sort'],['Ostatnio zmienione','Recently updated'],['Aktualizacja','Updated'],['Kolumny kolejki','Queue columns'],['Zapisz układ','Save layout'],
    ['Brak wyników.','No results.'],['Nazwa widoku','View name'],['Widok zapisany.','View saved.'],['Układ kolejki zapisany.','Queue layout saved.'],['Pobierz','Download'],['Wewnętrzny','Internal'],['wewnętrzny','internal'],['Dodaj','Add'],['Brak załączników.','No attachments.'],['Dodano załącznik','Attachment added'],
    ['Aktywność zgłoszenia','Ticket activity'],['Brak ustawień pasujących do wyszukiwania.','No settings match your search.'],['Szukaj ustawień…','Search settings…'],['Szukaj ustawień','Search settings'],['Wersja','Version'],['Wniosek o usługę','Service request']
  ]);
  function translateExact(value){if(window.DeskLocale?.locale!=='en')return value;const raw=String(value??''),lead=raw.match(/^\s*/)?.[0]||'',tail=raw.match(/\s*$/)?.[0]||'',body=raw.slice(lead.length,raw.length-tail.length);return extras.has(body)?lead+extras.get(body)+tail:raw;}
  function translateNode(node){if(window.DeskLocale?.locale!=='en')return;if(node.nodeType===Node.TEXT_NODE){const p=node.parentElement;if(!p||['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName))return;const next=translateExact(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;return;}if(node.nodeType!==Node.ELEMENT_NODE)return;for(const attr of ['placeholder','title','aria-label'])if(node.hasAttribute(attr)){const next=translateExact(node.getAttribute(attr));if(next!==node.getAttribute(attr))node.setAttribute(attr,next);}for(const child of node.childNodes)translateNode(child);}
  function apply(){if(window.DeskLocale?.locale==='en')translateNode(document.body);const product=document.querySelector('.jsm-product-title b');if(product&&product.textContent!==VERSION)product.textContent=VERSION;}
  const previous=window.DeskLocale?.t;if(window.DeskLocale&&typeof previous==='function')window.DeskLocale.t=value=>translateExact(previous(value));
  const observer=new MutationObserver(()=>queueMicrotask(apply));
  const start=()=>{observer.observe(document.documentElement,{childList:true,subtree:true});apply();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
