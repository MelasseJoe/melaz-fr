(() => {
  'use strict';
  const base = new URL('../../', document.currentScript.src);
  const endpoint = new URL('auth/api.php', base);
  let identity = null, csrf = null, settings = {}, checking = false;
  const login = () => { location.replace(new URL('login.php?next=' + encodeURIComponent(location.pathname), base)); };
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('melaz-session') : null;
  channel?.addEventListener('message', event => { if (event.data === 'logout') login(); });
  async function request(action, body) {
    const url = new URL(endpoint); url.searchParams.set('action', action);
    const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(15000), keepalive: !!body, headers: body ? { 'Content-Type': 'application/json', 'X-Hub-CSRF': csrf || '' } : { Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (response.status === 401 && action !== 'me') { login(); throw new Error('Connecte-toi pour continuer.'); }
    if (!response.ok) throw new Error(data.error || 'Le compte est momentanément indisponible.');
    return data;
  }
  function renderAccount(user) {
    const target = document.querySelector('[data-hub-account]'); if (!target) return;
    const name = document.createElement('span'); name.className = 'account-name'; name.textContent = user.displayName;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Déconnexion'; button.className = 'account-logout';
    const notice = document.createElement('span'); notice.className = 'account-notice'; notice.setAttribute('role', 'status');
    button.addEventListener('click', async () => {
      button.disabled = true; notice.textContent = '';
      try { await request('logout', {}); channel?.postMessage('logout'); login(); }
      catch (error) { notice.textContent = error.message; button.disabled = false; }
    });
    target.append(name, button, notice);
  }
  const ready = request('me').then(data => {
    if (!data.user) { login(); throw new Error('Connexion requise.'); }
    identity = data.user; csrf = data.csrf; settings = data.settings || {}; renderAccount(identity);
    return { user: identity, settings };
  });
  ready.catch(error => {
    const target = document.querySelector('[data-hub-account]');
    if (target && !target.textContent) target.textContent = error.message;
  });
  window.HubSession = {
    ready, base: base.href,
    get csrf() { return csrf; },
    get user() { return identity; },
    async saveSetting(namespace, value) {
      await ready;
      const data = await request('settings', { namespace, settings: value });
      settings[namespace] = data.settings; return data.settings;
    },
  };
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !identity || checking) return;
    checking = true;
    try { const data = await request('me'); if (!data.user) login(); else if (data.user.id !== identity.id) location.reload(); }
    catch { /* Les prochains appels affichent leurs propres erreurs réseau. */ }
    finally { checking = false; }
  });
})();
