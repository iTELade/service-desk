import http from 'node:http';
export class Docker {
  constructor(socketPath='/var/run/docker.sock'){this.socketPath=socketPath;}
  call(method,path,body,headers={}){return new Promise((resolve,reject)=>{
    const data=body===undefined?null:Buffer.from(JSON.stringify(body));const req=http.request({socketPath:this.socketPath,path,method,headers:{...headers,...(data?{'Content-Type':'application/json','Content-Length':data.length}:{})}},res=>{let chunks=[],size=0;res.on('data',c=>{size+=c.length;if(size>16*1024*1024){req.destroy(new Error('Docker response too large'));return;}chunks.push(c);});res.on('end',()=>{const raw=Buffer.concat(chunks).toString();if(res.statusCode>=300){const e=new Error('Docker '+method+' '+path.split('?')[0]+' HTTP '+res.statusCode);e.status=res.statusCode;return reject(e);}try{resolve(raw?JSON.parse(raw):null);}catch{const events=raw.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));if(events.some(x=>x.error))reject(new Error('Docker image pull failed'));else resolve(events);}});});req.setTimeout(15*60*1000,()=>req.destroy(new Error('Docker timeout')));req.on('error',reject);req.end(data);
  });}
  inspect(id){return this.call('GET','/containers/'+encodeURIComponent(id)+'/json');}
  stop(id){return this.call('POST','/containers/'+encodeURIComponent(id)+'/stop?t=30');}
  start(id){return this.call('POST','/containers/'+encodeURIComponent(id)+'/start');}
  rename(id,name){return this.call('POST','/containers/'+encodeURIComponent(id)+'/rename?name='+encodeURIComponent(name));}
  remove(id){return this.call('DELETE','/containers/'+encodeURIComponent(id));}
  pull(image,token,owner){const headers=token?{'X-Registry-Auth':Buffer.from(JSON.stringify({username:owner,password:token,serveraddress:'ghcr.io'})).toString('base64')} : {};return this.call('POST','/images/create?fromImage='+encodeURIComponent(image),undefined,headers);}
  tag(image,alias){const at=alias.lastIndexOf(':');return this.call('POST','/images/'+encodeURIComponent(image)+'/tag?repo='+encodeURIComponent(alias.slice(0,at))+'&tag='+encodeURIComponent(alias.slice(at+1)));}
  create(name,old,image){
    const networks=Object.fromEntries(Object.entries(old.NetworkSettings.Networks).map(([name,n])=>[name,{Aliases:(n.Aliases||[]).filter(a=>a!==old.Id.slice(0,12))}]));
    const host={...old.HostConfig};delete host.ContainerIDFile;delete host.Links;delete host.VolumesFrom;
    return this.call('POST','/containers/create?name='+encodeURIComponent(name),{...old.Config,Image:image,Hostname:name,HostConfig:host,NetworkingConfig:{EndpointsConfig:networks}});
  }
}
