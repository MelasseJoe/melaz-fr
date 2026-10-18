(() => {
  'use strict';
  const form = document.getElementById('login-form');
  const password = document.getElementById('password');
  const toggle = document.getElementById('toggle-password');
  const button = document.getElementById('login-submit');
  const error = document.getElementById('login-error');
  let token = null;
  const api = new URL('../../auth/api.php', document.currentScript.src);
  const next = new URL(location.href).searchParams.get('next');
  const renew = async () => {
    const url = new URL(api); url.searchParams.set('action', 'me');
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'La connexion est indisponible.');
    token = data.csrf;
  };
  toggle.addEventListener('click', () => {
    const show = password.type === 'password'; password.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show)); toggle.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    toggle.querySelector('.eye-open').hidden = show; toggle.querySelector('.eye-closed').hidden = !show;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (button.disabled) return;
    button.disabled = true; error.textContent = ''; form.setAttribute('aria-busy', 'true');
    try {
      if (!token) await renew();
      const url = new URL(api); url.searchParams.set('action', 'login');
      const response = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Hub-CSRF': token }, body: JSON.stringify({ username: document.getElementById('username').value, password: password.value, next }) });
      const data = await response.json();
      if (!response.ok) { if (response.status === 403) token = null; throw new Error(data.error || 'Connexion impossible.'); }
      password.value = ''; location.replace(data.next);
    } catch (problem) { error.textContent = ['TimeoutError', 'AbortError'].includes(problem.name) ? 'Le serveur met trop de temps à répondre. Réessaie.' : problem instanceof TypeError ? 'Connexion interrompue. Réessaie dans un instant.' : problem.message; }
    finally { button.disabled = false; form.removeAttribute('aria-busy'); }
  });
  renew().catch(problem => { error.textContent = problem.message; });
})();
