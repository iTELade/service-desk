import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {once} from 'node:events';
import {BerReader,BerWriter,Attribute} from 'ldapts';
import {fixture} from './fixture.mjs';
import {createDirectory,directoryDefaults} from '../lib/directory.mjs';
function message(id,op,body){const w=new BerWriter();w.startSequence();w.writeInt(id);w.startSequence(op);body(w);w.endSequence();w.endSequence();return w.buffer;}
const status=(id,op,code=0)=>message(id,op,w=>{w.writeEnumeration(code);w.writeString('');w.writeString('');});
async function setup({startTLS=false,ipSAN=true}={}){
  const f=fixture(),keyPath=join(f.dataDir,'test-key.pem'),certPath=join(f.dataDir,'test-cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'+(ipSAN?',IP:127.0.0.1':'')],{stdio:'ignore'});
  const key=readFileSync(keyPath),cert=readFileSync(certPath),sockets=new Set(),state={plainBinds:0,secureBinds:0,errors:[]};
  const userDn='CN=Network User,OU=ITELADE,DC=ad,DC=itelade,DC=pl';
  const attrs={objectGUID:Buffer.from('00112233445566778899aabbccddeeff','hex'),sAMAccountName:'network-user',mail:'network@example.test',displayName:'Network User',memberOf:[],userAccountControl:'512',accountExpires:'0'};
  function attach(socket,secure){
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});let buffer=Buffer.alloc(0),bound=false;
    function receive(chunk){
      buffer=Buffer.concat([buffer,chunk]);
      while(buffer.length>=2){
        const n=buffer[1]&0x80?buffer[1]&0x7f:0;if(buffer.length<2+n)return;
        const length=n?buffer.readUIntBE(2,n):buffer[1],total=2+n+length;if(buffer.length<total)return;
        const packet=buffer.subarray(0,total);buffer=buffer.subarray(total);
        try{
          const r=new BerReader(packet);r.readSequence();const id=r.readInt(),op=r.peek();
          if(op===0x77&&startTLS&&!secure){
            socket.write(status(id,0x78));socket.removeListener('data',receive);
            const wrapped=new tls.TLSSocket(socket,{isServer:true,secureContext:tls.createSecureContext({key,cert})});attach(wrapped,true);return;
          }
          if(op===0x60){
            if(secure)state.secureBinds++;else state.plainBinds++;
            r.readSequence(0x60);r.readInt();const dn=r.readString(),pw=r.readString(0x80);bound=secure&&((dn==='read@example.test'&&pw==='test-service-password')||(dn===userDn&&pw==='test-user-password'));
            socket.write(status(id,0x61,bound?0:49));
          }else if(op===0x63){
            if(!bound){socket.write(status(id,0x65,50));continue;}
            socket.write(message(id,0x64,w=>{w.writeString(userDn);w.startSequence();for(const [type,value] of Object.entries(attrs))new Attribute({type,values:Array.isArray(value)?value:[value]}).write(w);w.endSequence();}));socket.write(status(id,0x65));
          }else if(op===0x42)socket.end();
          else throw new Error('Nieobsługiwana operacja testowego serwera: '+op);
        }catch(e){state.errors.push(e);socket.destroy();}
      }
    }
    socket.on('data',receive);
  }
  const server=startTLS?net.createServer(s=>attach(s,false)):tls.createServer({key,cert},s=>attach(s,true));server.on('tlsClientError',()=>{});server.listen(0,'127.0.0.1');await once(server,'listening');
  const directory=createDirectory(f.db,f.projects,{dataDir:f.dataDir});
  const config={...directoryDefaults,enabled:true,url:`${startTLS?'ldap':'ldaps'}://127.0.0.1:${server.address().port}`,bind_dn:'read@example.test',ca_pem:cert.toString()};
  directory.save({version:0,config,bind_password:'test-service-password'},f.admin);
  return {...f,directory,state,async close(){directory.stop();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));f.close();}};
}
test('Rzeczywisty protokół LDAPS: TLS, bind, wyszukiwanie stronicowane, GUID i hasło użytkownika',async()=>{
  const f=await setup();try{
    const p=await f.directory.getPreview(f.admin);assert.equal(p.created,1);f.directory.apply({preview_id:p.preview_id},f.admin);
    const u=f.db.prepare("SELECT * FROM users WHERE auth_source='ldap'").get();assert.equal(u.ldap_uid,'bin:00112233445566778899aabbccddeeff');assert.equal(await f.directory.authenticate(u,'test-user-password'),true);assert.equal(await f.directory.authenticate(u,'wrong-password'),false);assert.equal(f.state.plainBinds,0);assert.ok(f.state.secureBinds>=5);assert.deepEqual(f.state.errors,[]);
  }finally{await f.close();}
});
test('Rzeczywisty STARTTLS: połączenie LDAP jest podnoszone do TLS przed wysłaniem hasła',async()=>{
  const f=await setup({startTLS:true});try{const p=await f.directory.getPreview(f.admin);assert.equal(p.created,1);f.directory.apply({preview_id:p.preview_id},f.admin);const u=f.db.prepare("SELECT * FROM users WHERE auth_source='ldap'").get();assert.equal(await f.directory.authenticate(u,'test-user-password'),true);assert.equal(f.state.plainBinds,0);assert.ok(f.state.secureBinds>=3);assert.deepEqual(f.state.errors,[]);}finally{await f.close();}
});
test('LDAPS odrzuca niezaufany certyfikat, zanim prześle hasło',async()=>{
  const f=await setup();try{f.directory.save({version:1,config:{ca_pem:''}},f.admin);await assert.rejects(f.directory.getPreview(f.admin),/certyfikatu/);assert.equal(f.state.secureBinds,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM users WHERE account_kind=CHAR(104,117,109,97,110) AND username NOT IN (CHAR(100,101,115,107,46,98,111,116),CHAR(105,116,101,108,97,100,101,46,98,111,116))').get().n,1);}finally{await f.close();}
});
test('STARTTLS sprawdza zgodność nazwy serwera z certyfikatem',async()=>{
  const f=await setup({startTLS:true,ipSAN:false});try{await assert.rejects(f.directory.getPreview(f.admin),/certyfikatu/);assert.equal(f.state.secureBinds,0);assert.equal(f.state.plainBinds,0);}finally{await f.close();}
});
