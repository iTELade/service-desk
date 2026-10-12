export function installPasskeyUI({ api, e, notify, showModal }) {
  const decode = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
  const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const options = p => ({ ...p, challenge: decode(p.challenge), ...(p.user ? { user: { ...p.user, id: decode(p.user.id) } } : {}), ...(p.allowCredentials ? { allowCredentials: p.allowCredentials.map(c => ({ ...c, id: decode(c.id) })) } : {}), ...(p.excludeCredentials ? { excludeCredentials: p.excludeCredentials.map(c => ({ ...c, id: decode(c.id) })) } : {}) });
  const credential = c => ({ id: c.id, rawId: encode(c.rawId), type: c.type, authenticatorAttachment: c.authenticatorAttachment, clientExtensionResults: c.getClientExtensionResults(), response: Object.fromEntries(['clientDataJSON', 'attestationObject', 'authenticatorData', 'signature', 'userHandle'].filter(k => c.response[k]).map(k => [k, encode(c.response[k])]).concat(c.response.getTransports ? [['transports', c.response.getTransports()]] : [])) });
  const post = (path, data = {}) => api('/passkeys/' + path, { method: 'POST', data });
  async function dialog() {
    const keys = await api('/passkeys');
    showModal(`<h2>Klucze dostępu — passkeys</h2><p>Użyj iPhone’a, urządzenia z biometrią lub zgodnego klucza FIDO2. Dla kont lokalnych; konta LDAP/SSO korzystają z firmowej metody logowania.</p><p>Przed zmianą kluczy potwierdź hasło albo istniejący passkey.</p><form data-passkey-reauth><label>Hasło<input type="password" name="password" autocomplete="current-password" required></label><button type="submit">Potwierdź hasło</button></form><button data-passkey="reauth">Potwierdź kluczem</button><button data-passkey="add" class="primary">Dodaj klucz dostępu</button>${keys.map(k => `<section class="panel"><strong>${e(k.name)}</strong><p>Utworzono: ${e(k.created_at)} · Ostatnio: ${e(k.last_used_at || 'Jeszcze nie użyto')}</p><button data-passkey="remove" data-id="${k.id}">Odwołaj</button></section>`).join('')}`);
  }
  document.addEventListener('submit', async ev => {
    if (!ev.target.matches('[data-passkey-reauth]')) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    try { await post('reauth', { password: new FormData(ev.target).get('password') }); ev.target.reset(); notify('Tożsamość potwierdzona na 5 minut.'); } catch (err) { notify(err.message, true); }
  }, true);
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-passkey]'); if (!b) return;
    ev.preventDefault(); b.disabled = true;
    try {
      if (!window.PublicKeyCredential || !navigator.credentials || !window.isSecureContext) throw Error('Passkeys wymagają zgodnej przeglądarki i HTTPS.');
      const action = b.dataset.passkey;
      if (action === 'manage') return await dialog();
      if (action === 'remove') { if (confirm('Odwołać ten klucz dostępu?')) { await post('remove', { id: Number(b.dataset.id) }); await dialog(); } return; }
      if (action === 'add') {
        const name = prompt('Nazwa klucza dostępu:', 'Mój iPhone'); if (!name) return;
        const p = await post('register-options');
        const c = await navigator.credentials.create({ publicKey: options(p.publicKey) });
        if (!c) throw Error('Anulowano rejestrację.');
        await post('register', { token: p.token, name, credential: credential(c) }); await dialog(); notify('Dodano klucz dostępu.'); return;
      }
      const reauth = action === 'reauth', p = await post(reauth ? 'reauth-options' : 'options');
      const c = await navigator.credentials.get({ publicKey: options(p.publicKey) });
      if (!c) throw Error('Anulowano potwierdzenie.');
      await post(reauth ? 'reauth-verify' : 'login', { token: p.token, credential: credential(c) });
      if (reauth) notify('Tożsamość potwierdzona na 5 minut.'); else { location.hash = '#/queue'; location.reload(); }
    } catch (err) { notify(err.name === 'NotAllowedError' ? 'Anulowano operację lub przekroczono czas.' : err.message, true); }
    finally { b.disabled = false; }
  });
}
