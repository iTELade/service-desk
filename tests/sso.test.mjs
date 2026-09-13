import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {generateKeyPairSync,sign} from 'node:crypto';
import {once} from 'node:events';
import {fixture} from './fixture.mjs';
import {createSso} from '../lib/sso.mjs';

test('SSO OIDC: PKCE, nonce, state związany z przeglądarką, jednorazowość i brak łączenia po samym e-mailu',async()=>{
 const f=fixture(),{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};let issuer,nonce,sub='first',mail='oidc@example.test',badNonce=false;
 const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/issuer/.well-known/openid-configuration')return res.end(JSON.stringify({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post'],code_challenge_methods_supported:['S256']}));if(req.url==='/issuer/jwks')return res.end(JSON.stringify({keys:[jwk]}));if(req.url==='/issuer/token'){let body='';for await(const part of req)body+=part;assert.ok(new URLSearchParams(body).get('code_verifier'));const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),payload={iss:issuer,sub,aud:'desk-client',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,nonce:badNonce?'bad':nonce,email:mail,email_verified:true,name:'Adam OIDC'},input=encode({alg:'RS256',kid:'test-key'})+'.'+encode(payload),token=input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');return res.end(JSON.stringify({access_token:'access',token_type:'Bearer',expires_in:300,id_token:token}));}res.statusCode=404;res.end('{}');});
 server.listen(0,'127.0.0.1');await once(server,'listening');issuer='http://127.0.0.1:'+server.address().port+'/issuer';const sso=createSso(f.db,f.projects,{origin:'https://help.example.test',dataDir:f.dataDir,allowTestHttp:true});
 try{const provider=sso.save(null,{name:'Test OIDC',issuer,client_id:'desk-client',client_secret:'test-secret',enabled:true,config:{auto_create:true,allowed_domains:['example.test']}},f.admin);
  async function begin(){const start=await sso.begin(provider.id),url=new URL(start.url);nonce=url.searchParams.get('nonce');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('code_challenge'));return {...start,callback:new URL('https://help.example.test/api/sso/callback?state='+url.searchParams.get('state')+'&code=test-code')};}
  let start=await begin();await assert.rejects(()=>sso.callback(start.callback,'wrong-browser'),e=>e.status===403);const user=await sso.callback(start.callback,start.browser);assert.equal(user.email,mail);assert.equal(user.role,'customer');assert.equal(user.sso_only,1);await assert.rejects(()=>sso.callback(start.callback,start.browser),e=>e.status===400);
  start=await begin();assert.equal((await sso.callback(start.callback,start.browser)).id,user.id);
  sub='second';start=await begin();await assert.rejects(()=>sso.callback(start.callback,start.browser),e=>e.status===403);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM users WHERE email='oidc@example.test'").get().n,1);
  sub='third';mail='new@example.test';badNonce=true;start=await begin();await assert.rejects(()=>sso.callback(start.callback,start.browser));assert.equal(f.db.prepare("SELECT COUNT(*) n FROM users WHERE email='new@example.test'").get().n,0);badNonce=false;
  sso.mapping(provider.id,{subject:'third',user_id:f.admin.id},f.admin);start=await begin();assert.equal((await sso.callback(start.callback,start.browser)).id,f.admin.id);
  f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(f.admin.id);start=await begin();await assert.rejects(()=>sso.callback(start.callback,start.browser),e=>e.status===403);
 }finally{await new Promise(resolve=>server.close(resolve));f.close();}
});
