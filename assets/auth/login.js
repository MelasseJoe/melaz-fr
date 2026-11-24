(() => {
  'use strict';
  const form = document.getElementById('login-form');
  const heading = document.getElementById('login-title');
  const loginHeading = [...heading.childNodes];
  const pageTitle = document.title;
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const toggle = document.getElementById('toggle-password');
  const button = document.getElementById('login-submit');
  const buttonLabel = button.firstElementChild;
  const arrow = button.lastElementChild;
  const switchMode = document.getElementById('switch-auth-mode');
  const error = document.getElementById('login-error');
  let registering = false;
  let token = null;
  let tokenRequest = null;
  const api = new URL('../../auth/api.php', document.currentScript.src);
  const next = new URL(location.href).searchParams.get('next');

  const renew = async () => {
    const url = new URL(api); url.searchParams.set('action', 'me');
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'La connexion est indisponible.');
    token = data.csrf;
  };
  const ensureToken = () => tokenRequest ??= renew().finally(() => { tokenRequest = null; });

  function showPassword(show) {
    password.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show)); toggle.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    toggle.querySelector('.eye-open').hidden = show; toggle.querySelector('.eye-closed').hidden = !show;
  }
  toggle.addEventListener('click', () => showPassword(password.type === 'password'));

  switchMode.addEventListener('click', () => {
    registering = !registering;
    if (registering) heading.textContent = 'Créer un compte';
    else heading.replaceChildren(...loginHeading);
    document.title = registering ? 'Créer un compte — Melaz' : pageTitle;
    username.labels[0].textContent = registering ? 'Pseudo' : 'Identifiant';
    username.placeholder = registering ? 'Votre pseudo' : 'Votre identifiant';
    password.autocomplete = registering ? 'new-password' : 'current-password';
    password.value = '';
    showPassword(false);
    buttonLabel.textContent = registering ? 'Créer mon compte' : 'Ouvrir mon espace';
    arrow.hidden = registering;
    switchMode.textContent = registering ? 'Retour à la connexion' : 'Créer un compte';
    error.textContent = '';
    username.focus();
  });
  switchMode.hidden = false;

  form.addEventListener('submit', async event => {
    event.preventDefault(); if (button.disabled) return;
    const url = new URL(api);
    url.searchParams.set('action', registering ? 'register' : 'login');
    const body = JSON.stringify({ username: username.value, password: password.value, next });
    button.disabled = switchMode.disabled = true;
    error.textContent = ''; form.setAttribute('aria-busy', 'true');
    try {
      if (!token) await ensureToken();
      const response = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Hub-CSRF': token }, body });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 403) token = null;
        throw new Error(data.error || (registering ? 'Création du compte impossible.' : 'Connexion impossible.'));
      }
      password.value = ''; location.replace(data.next);
    } catch (problem) { error.textContent = ['TimeoutError', 'AbortError'].includes(problem.name) ? 'Le serveur met trop de temps à répondre. Réessaie.' : problem instanceof TypeError ? 'Connexion interrompue. Réessaie dans un instant.' : problem.message; }
    finally { button.disabled = switchMode.disabled = false; form.removeAttribute('aria-busy'); }
  });
  ensureToken().catch(problem => { error.textContent = problem.message; });
})();
