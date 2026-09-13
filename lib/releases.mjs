import {fail,text} from './core.mjs';

export function repository(value){const clean=text(value,'Repozytorium GitHub',3,210).replace(/^https:\/\/github\.com\//i,'').replace(/\.git\/?$/,'').replace(/\/$/,'');if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(clean))fail(400,'Podaj repozytorium jako właściciel/nazwa.');return clean;}
export function versionParts(value){if(typeof value!=='string'||!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value))fail(400,'Wydanie wymaga wersji stabilnej X.Y.Z.');return value.split('.').map(Number);}
export function newer(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
export function manifest(value,repo,tag){const version=String(tag).replace(/^v/,'');versionParts(version);if(!value||value.format!==1||value.version!==version||value.project!=='service-desk')fail(400,'Wydanie nie zawiera zgodnego manifestu Service Desk.');const image=String(value.image||''),expected='ghcr.io/'+repository(repo).toLowerCase()+'@sha256:';if(!image.startsWith(expected)||!/^[a-f0-9]{64}$/.test(image.slice(expected.length)))fail(400,'Obraz musi być przypięty do SHA256 w GHCR tego repozytorium.');if(!Number.isInteger(value.schema)||!Number.isInteger(value.minimum_schema)||value.minimum_schema<1||value.schema<value.minimum_schema||value.schema>10000)fail(400,'Nieprawidłowy zakres migracji wydania.');return {format:1,project:'service-desk',version,image,schema:value.schema,minimum_schema:value.minimum_schema};}
async function bounded(response,max){const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>max)fail(502,'Odpowiedź GitHub przekracza limit.');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
export async function githubRelease(repo,{tag,token='',fetcher=fetch}={}){
  repo=repository(repo);if(tag)versionParts(String(tag).replace(/^v/,''));
  const headers={'User-Agent':'Service-Desk-Updater','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:'Bearer '+token}:{})};
  const response=await fetcher('https://api.github.com/repos/'+repo+'/releases/'+(tag?'tags/'+encodeURIComponent(tag):'latest'),{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)fail(502,'GitHub HTTP '+response.status+'. Sprawdź repozytorium, opublikowane wydanie i uprawnienia tokenu.');
  const release=JSON.parse(await bounded(response,2*1024*1024));if(release.draft||release.prerelease)fail(400,'Aktualizator przyjmuje wyłącznie opublikowane stabilne wydania.');
  const asset=release.assets?.find(a=>a.name==='desk-release.json');if(!asset||!Number.isSafeInteger(asset.id)||asset.size>64000)fail(400,'Do wydania dołącz plik desk-release.json wygenerowany przez workflow publikacji.');
  let url='https://api.github.com/repos/'+repo+'/releases/assets/'+asset.id,assetResponse;
  for(let attempt=0;attempt<5;attempt++){
    const address=new URL(url);if(address.protocol!=='https:'||address.username||address.password||!(['api.github.com','github.com'].includes(address.hostname)||address.hostname.endsWith('.githubusercontent.com')))fail(502,'Niedozwolone przekierowanie pliku wydania.');
    assetResponse=await fetcher(url,{headers:address.hostname==='api.github.com'?{...headers,Accept:'application/octet-stream'}:{'User-Agent':'Service-Desk-Updater'},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if([301,302,303,307,308].includes(assetResponse.status)){url=new URL(assetResponse.headers.get('location'),url).href;continue;}break;
  }
  if(!assetResponse?.ok)fail(502,'Nie udało się pobrać manifestu wydania.');
  const m=manifest(JSON.parse(await bounded(assetResponse,64000)),repo,release.tag_name);
  return {...m,tag:release.tag_name,release_id:release.id,repo,notes:String(release.body||'').slice(0,30000),url:'https://github.com/'+repo+'/releases/tag/'+encodeURIComponent(release.tag_name)};
}
