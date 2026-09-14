(() => {
  const $=(s,e=document)=>e.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let csrf=null;
  const jsonHeaders=()=>({'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})});
  async function session(){if(csrf)return csrf;const r=await fetch('/api/me',{credentials:'same-origin'});if(!r.ok)throw new Error('Session expired.');const v=await r.json();csrf=v.csrf;return csrf;}
  async function call(path,{method='GET',data,auth=true}={}){
    if(auth&&method!=='GET')await session();
    const r=await fetch('/api'+path,{method,credentials:'same-origin',headers:jsonHeaders(),...(data===undefined?{}:{body:JSON.stringify(data)})});
    const v=await r.json().catch(()=>({error:'Invalid server response.'}));if(!r.ok)throw new Error(v.error||'Request failed.');return v;
  }
  function modal(html){const m=$('#modal');m.classList.remove('wide-modal');m.innerHTML=`<button class="modal-close" aria-label="Close" data-security-close>×</button>${html}`;if(!m.open)m.showModal();return m;}
  function status(msg,bad=false){let n=$('#notices');if(!n)return;const el=document.createElement('div');el.className='notice'+(bad?' bad':'');el.textContent=msg;n.append(el);setTimeout(()=>el.remove(),7000);}
  const toBytes=s=>Uint8Array.from(atob(String(s).replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((String(s).length+3)%4)),c=>c.charCodeAt(0));
  const fromBytes=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  function credentialJSON(c){
    const r=c.response;
    return {id:c.id,type:c.type,rawId:fromBytes(c.rawId),response:{
      clientDataJSON:fromBytes(r.clientDataJSON),
      ...(r.attestationObject?{attestationObject:fromBytes(r.attestationObject),transports:r.getTransports?.()||[]}:{authenticatorData:fromBytes(r.authenticatorData),signature:fromBytes(r.signature),userHandle:r.userHandle?fromBytes(r.userHandle):null})
    },clientExtensionResults:c.getClientExtensionResults?.()||{}};
  }
  function publicKeyOptions(v){
    const p=structuredClone(v);p.challenge=toBytes(p.challenge);
    if(p.user?.id)p.user.id=toBytes(p.user.id);
    for(const x of p.excludeCredentials||[])x.id=toBytes(x.id);
    for(const x of p.allowCredentials||[])x.id=toBytes(x.id);
    return p;
  }
  async function showMfa(){
    const s=await call('/mfa/status');
    const keys=s.security_keys||[];
    modal(`<h2>Two-step verification</h2>
      <p>${s.totp_enabled?'Authenticator app is enabled.':'Authenticator app is not configured.'} ${keys.length?`Registered security keys: ${keys.length}.`:''}</p>
      <section class="panel detail-panel"><h3>Authenticator app (TOTP)</h3>
      ${s.totp_enabled?`<p>Recovery codes remaining: <strong>${s.recovery_remaining}</strong></p><form data-security="totp-disable"><label>2FA or recovery code<input name="code" required autocomplete="one-time-code" maxlength="40"></label><div class="form-actions"><button class="danger-text" type="submit">Disable authenticator app</button></div></form>`:`<button class="primary" data-security-action="totp-setup">Configure authenticator app</button>`}</section>
      <section class="panel detail-panel"><div class="section-heading"><div><h3>Hardware security keys</h3><p class="hint">FIDO2 / WebAuthn keys such as YubiKey, Feitian or compatible platform authenticators.</p></div><button class="primary" data-security-action="key-add">Add security key</button></div>
      ${keys.map(k=>`<div class="button-row" style="justify-content:space-between"><span><strong>${esc(k.name)}</strong><small class="row-meta">${k.last_used_at?'Last used '+esc(k.last_used_at):'Never used'}</small></span><button class="danger-text" data-security-action="key-remove" data-id="${k.id}">Remove</button></div>`).join('')||'<p class="hint">No hardware key is registered.</p>'}</section>`);
  }
  async function setupTotp(){
    const s=await call('/mfa/setup',{method:'POST',data:{}});
    modal(`<h2>Add authenticator app</h2><p>Scan the QR code with Microsoft Authenticator, Google Authenticator, 1Password, Bitwarden or another TOTP app.</p>
      <div class="mfa-qr" style="display:flex;justify-content:center;background:#fff;padding:12px;border-radius:12px;max-width:320px">${s.qr_svg}</div>
      <details><summary>Enter the key manually</summary><code class="mfa-secret">${esc(s.secret)}</code><p class="hint">TOTP · 6 digits · 30 seconds · SHA-1</p></details>
      <form data-security="totp-enable"><label>Code from authenticator<input name="code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" autofocus></label><div class="form-actions"><button class="primary" type="submit">Enable 2FA</button></div></form>`);
  }
  async function addKey(){
    if(!window.PublicKeyCredential||!navigator.credentials)throw new Error('This browser does not support WebAuthn security keys.');
    const options=await call('/mfa/security-key/register-options',{method:'POST',data:{}});
    const cred=await navigator.credentials.create({publicKey:publicKeyOptions(options.publicKey)});
    if(!cred)throw new Error('Security-key registration was cancelled.');
    const name=prompt('Name this security key:', 'Security key')||'Security key';
    await call('/mfa/security-key/register',{method:'POST',data:{token:options.token,name,credential:credentialJSON(cred)}});
    status('Security key added.');await showMfa();
  }
  async function useKey(){
    if(!window.PublicKeyCredential||!navigator.credentials)throw new Error('This browser does not support WebAuthn security keys.');
    const loginChallenge=document.querySelector('[data-security-action="key-login"]')?.dataset.challenge||(location.hash.match(/^#\/mfa\/([^/?]+)/)||[])[1];
    if(!loginChallenge)throw new Error('Login challenge is missing.');
    const options=await call('/mfa/security-key/options',{method:'POST',auth:false,data:{challenge:loginChallenge}});
    const cred=await navigator.credentials.get({publicKey:publicKeyOptions(options.publicKey)});
    if(!cred)throw new Error('Security-key verification was cancelled.');
    await call('/mfa/security-key/verify',{method:'POST',auth:false,data:{challenge:loginChallenge,token:options.token,credential:credentialJSON(cred)}});
    location.hash='#/queue';location.reload();
  }
  function enhanceMfaLogin(){
    const card=$('.auth-card');if(!card||!card.querySelector('form[data-v7="mfa-login"]')||card.querySelector('[data-security-action="key-login"]'))return;
    const link=card.querySelector('a[href="#/login"]'),btn=document.createElement('button');btn.type='button';btn.className='button full';btn.dataset.securityAction='key-login';btn.textContent='Use a hardware security key';link?.before(btn);
  }
  document.addEventListener('click',async ev=>{
    const legacy=ev.target.closest('[data-v7-action="mfa"],[data-v7-action="mfa-setup"]');
    const b=ev.target.closest('[data-security-action],[data-security-close]');
    if(!legacy&&!b)return;
    if(legacy){ev.preventDefault();ev.stopImmediatePropagation();}
    if(b?.hasAttribute('data-security-close')){ev.preventDefault();$('#modal')?.close();return;}
    const action=legacy?.dataset.v7Action==='mfa'?'mfa-open':legacy?.dataset.v7Action==='mfa-setup'?'totp-setup':b?.dataset.securityAction;
    try{
      if(action==='mfa-open')await showMfa();
      if(action==='totp-setup')await setupTotp();
      if(action==='key-add')await addKey();
      if(action==='key-remove'){if(confirm('Remove this security key?')){await call('/mfa/security-key/remove',{method:'POST',data:{id:Number(b.dataset.id)}});status('Security key removed.');await showMfa();}}
      if(action==='key-login')await useKey();
    }catch(err){status(err.message,true);}
  },true);
  document.addEventListener('submit',async ev=>{
    const f=ev.target.closest('[data-security]');if(!f)return;ev.preventDefault();ev.stopImmediatePropagation();
    const data=Object.fromEntries(new FormData(f)),submit=f.querySelector('[type=submit]');if(submit)submit.disabled=true;
    try{
      if(f.dataset.security==='totp-enable'){const r=await call('/mfa/enable',{method:'POST',data:{code:data.code}});modal(`<h2>2FA is active</h2><p>Store these recovery codes in a safe place. Each code can be used once.</p><pre>${esc(r.recovery_codes.join('\n'))}</pre><div class="form-actions"><button data-security-close>Close</button></div>`);}
      if(f.dataset.security==='totp-disable'){await call('/mfa/disable',{method:'POST',data:{code:data.code}});status('Authenticator app disabled.');await showMfa();}
    }catch(err){status(err.message,true);}finally{if(submit)submit.disabled=false;}
  },true);
  new MutationObserver(enhanceMfaLogin).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',enhanceMfaLogin);addEventListener('DOMContentLoaded',enhanceMfaLogin);
})();
