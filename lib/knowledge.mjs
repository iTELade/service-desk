import {fail,text,boolean} from './core.mjs';
// Contract only. No remote content is fetched or embedded in this release.
export function createKnowledge(db,projects){
  function status(u){if(u.role!=='admin')fail(403,'Integrację konfiguruje administrator.');const r=db.prepare('SELECT * FROM knowledge_settings WHERE id=1').get();return {...JSON.parse(r.config),version:r.version,contract_version:1};}
  function save(b,u){const old=status(u);if(old.version!==b.version)fail(409,'Konfiguracja zmieniła się.');const enabled=boolean(b.enabled??false,'Aktywna'),base_url=text(b.base_url||'','Adres bazy wiedzy',enabled?1:0,500);if(base_url){let url;try{url=new URL(base_url);}catch{fail(400,'Nieprawidłowy URL.');}if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)fail(400,'Podaj adres HTTPS bez danych logowania, zapytania i fragmentu.');}db.prepare('UPDATE knowledge_settings SET config=?,version=version+1 WHERE id=1').run(JSON.stringify({enabled,base_url}));projects.audit(null,u,'knowledge.configured',{enabled});return status(u);}
  return {status,save};
}
