import {priorities,names,icons,cleanTitle,taskFromReply,tasksFromReply,ordered,newId} from './core.mjs';

const app = document.getElementById('plateaux');
const main = app.querySelector('main');
const form = app.querySelector('.p-composer');
const message = app.querySelector('.p-message');
const retryButton = app.querySelector('.p-retry');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('melaz-plateaux') : null;
let tasks = [], ready = false, busy = false, refreshing = false, epoch = 0, pendingCreate = null, lastRefresh = 0;
app.dataset.input = 'pointer';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setText = (element, value) => { if (element.textContent !== String(value)) element.textContent = value; };
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24"><use href="assets/icons.svg#${name}"></use></svg>`;
const menu = document.createElement('div');
menu.id = 'task-actions'; menu.className = 'p-task-menu'; menu.hidden = true;
menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Priorité et actions');
menu.innerHTML = priorities.map(key => `<button type="button" data-menu-priority="${key}" aria-pressed="false">${icon(icons[key])}<span>${names[key]}</span></button>`).join('') + `<button type="button" class="p-task-delete" data-menu-delete>${icon('trash-2')}<span>Supprimer la tâche</span></button>`;
app.append(menu);
let menuTaskId = null, menuTrigger = null;
function closeMenu(focus = false) {
  const trigger = menuTrigger;
  menu.hidden = true; menuTaskId = null; menuTrigger = null;
  trigger?.setAttribute('aria-expanded', 'false');
  if (focus && trigger?.isConnected) trigger.focus({preventScroll:true});
}
function openMenu(trigger) {
  const composing = trigger.hasAttribute('data-compose-menu');
  const task = composing ? null : tasks.find(task => task.id === trigger.closest('.p-row').dataset.task);
  if ((!composing && !task) || busy || !ready) return;
  if (menuTrigger === trigger) { closeMenu(true); return; }
  closeMenu(); menuTaskId = task?.id ?? null; menuTrigger = trigger;
  menu.querySelector('[data-menu-delete]').hidden = composing;
  menu.setAttribute('aria-label', composing ? 'Priorité de la nouvelle tâche' : 'Priorité et actions');
  const priority = composing ? form.elements.priority.value : task.priority;
  trigger.setAttribute('aria-expanded', 'true');
  menu.querySelectorAll('[data-menu-priority]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.menuPriority === priority)));
  menu.hidden = false;
  const bounds = trigger.getBoundingClientRect(), base = app.getBoundingClientRect();
  const left = Math.max(8, Math.min(bounds.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8));
  const above = bounds.bottom + 6 + menu.offsetHeight > window.innerHeight && bounds.top >= menu.offsetHeight + 6;
  menu.style.left = `${left - base.left}px`;
  menu.style.top = `${(above ? bounds.top - menu.offsetHeight - 6 : bounds.bottom + 6) - base.top}px`;
  menu.querySelector('[aria-pressed="true"]').focus({preventScroll:true});
}
menu.addEventListener('click', async event => {
  const button = event.target.closest('button');
  const task = tasks.find(task => task.id === menuTaskId);
  if (!button || busy) return;
  if (menuTrigger?.hasAttribute('data-compose-menu')) {
    const priority = button.dataset.menuPriority;
    if (!priorities.includes(priority)) return;
    form.elements.priority.value = priority;
    const picker = menuTrigger;
    picker.title = names[priority] + ' — modifier';
    picker.setAttribute('aria-label', 'Priorité de la nouvelle tâche : ' + names[priority]);
    picker.querySelector('.p-priority-symbol').innerHTML = icon(icons[priority]);
    closeMenu(true);
    return;
  }
  if (!task) return;
  const priority = button.dataset.menuPriority, remove = button.hasAttribute('data-menu-delete');
  closeMenu(true);
  if (remove) await mutate('delete', {id:task.id,revision:task.revision});
  else if (priority !== task.priority) await mutate('update', {id:task.id,revision:task.revision,priority});
});
menu.addEventListener('keydown', event => {
  const buttons = [...menu.querySelectorAll('button:not([hidden])')], current = buttons.indexOf(document.activeElement);
  const index = {ArrowDown:(current+1)%buttons.length,ArrowUp:(current+buttons.length-1)%buttons.length,Home:0,End:buttons.length-1}[event.key];
  if (index !== undefined) { event.preventDefault(); buttons[index].focus({preventScroll:true}); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); closeMenu(true); }
});
document.addEventListener('pointerdown', event => {
  if (!menu.hidden && !menu.contains(event.target) && !menuTrigger?.contains(event.target)) closeMenu();
});
document.addEventListener('focusin', event => {
  if (!menu.hidden && !menu.contains(event.target) && !menuTrigger?.contains(event.target)) closeMenu();
});
window.addEventListener('resize', () => closeMenu());


async function request(action, body) {
  await window.HubSession.ready;
  const url = new URL('api.php', location.href); url.searchParams.set('action', action);
  let response;
  try {
    response = await fetch(url, {method:body ? 'POST' : 'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:body ? {'Content-Type':'application/json','X-Hub-CSRF':window.HubSession.csrf} : {Accept:'application/json'},body:body ? JSON.stringify(body) : undefined});
  } catch {
    throw new Error('La connexion a été interrompue. Réessaie lorsque tu es à nouveau en ligne.');
  }
  if (response.status === 401) {
    location.replace(new URL('login.php?next=' + encodeURIComponent(location.pathname), window.HubSession.base));
    throw new Error('Connecte-toi pour continuer.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('La réponse du serveur n’a pas pu être lue. Réessaie dans un instant.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Les tâches sont momentanément indisponibles.');
    error.status = response.status; error.code = data.code; throw error;
  }
  return data;
}
function feedback(text, error = false, retry = false) {
  message.textContent = text;
  message.dataset.error = String(error);
  message.setAttribute('role', error ? 'alert' : 'status');
  retryButton.hidden = !retry;
}
function row(task) {
  const el = document.createElement('div'); el.className = 'p-row'; el.dataset.task = task.id;
  const id = 'task-' + task.id;
  el.innerHTML = `<label class="p-check"><input type="checkbox" id="${id}" aria-label="Terminer : ${escape(task.title)}"><span class="p-check-face">${icon('check')}</span></label><label class="p-label" for="${id}"><span class="p-label-text">${escape(task.title)}</span></label><button type="button" class="p-priority-picker" data-task-menu aria-label="Priorité et actions de ${escape(task.title)}" aria-haspopup="dialog" aria-controls="task-actions" aria-expanded="false"><span class="p-priority-symbol" aria-hidden="true"></span></button>`;
  return el;
}
function sync() {
  if (busy || (menuTaskId && !tasks.some(task => task.id === menuTaskId))) closeMenu();
  const visible = new Set(tasks.map(task => task.id));
  app.querySelectorAll('.p-row:not(.p-ghost)').forEach(el => { if (!visible.has(el.dataset.task)) el.remove(); });
  const cursors = new Map();
  for (const task of ordered(tasks)) {
    const el = app.querySelector(`.p-row[data-task="${task.id}"]:not(.p-ghost)`) || row(task);
    el.dataset.done = String(task.done);
    const check = el.querySelector('input'); check.checked = task.done; check.disabled = busy || !ready;
    check.setAttribute('aria-label', (task.done ? 'Rétablir : ' : 'Terminer : ') + task.title);
    const picker = el.querySelector('.p-priority-picker'); picker.disabled = busy || !ready; picker.title = names[task.priority] + ' — priorité et actions';
    if (picker.dataset.priority !== task.priority) {
      picker.querySelector('.p-priority-symbol').innerHTML = icon(icons[task.priority]);
      picker.dataset.priority = task.priority;
    }
    const target = task.done ? app.querySelector('.p-done-list') : app.querySelector(`[data-list="${task.priority}"]`);
    // Garder les lignes déjà en place : les déplacer toutes réinitialise le focus
    // et donne un effet de rafraîchissement, même quand rien n'a changé.
    const next = cursors.has(target) ? cursors.get(target).nextElementSibling : target.firstElementChild;
    if (el !== next) target.insertBefore(el, next);
    cursors.set(target, el);
  }
  for (const key of priorities) {
    const count = tasks.filter(task => !task.done && task.priority === key).length;
    setText(app.querySelector(`[data-count="${key}"]`), count);
    app.querySelector(`[data-priority="${key}"] .p-empty`).hidden = !ready || count > 0;
  }
  const done = tasks.filter(task => task.done).length, open = tasks.length - done;
  setText(app.querySelector('.p-open'), ready ? `${open} tâche${open === 1 ? '' : 's'} ouverte${open === 1 ? '' : 's'}` : '');
  setText(app.querySelector('[data-done-count]'), done);
  setText(app.querySelector('[data-progress]'), `${done} / ${tasks.length} terminée${done === 1 ? '' : 's'}`);
  app.querySelector('.p-fill').style.transform = `scaleX(${tasks.length ? done / tasks.length : 0})`;
  form.elements.task.disabled = !ready;
  form.elements.priority.disabled = busy || !ready;
  form.querySelector('.p-add').disabled = busy || !ready;
  form.querySelector('[data-compose-menu]').disabled = busy || !ready;
  main.setAttribute('aria-busy', String(busy || !ready));
  retryButton.disabled = busy || refreshing;
}
function positions() { return new Map([...app.querySelectorAll('.p-row:not(.p-ghost)')].filter(el => el.getClientRects().length).map(el => [el,el.getBoundingClientRect()])); }
function moves() { return !reduce.matches && app.dataset.input !== 'keyboard'; }
function flip(before) {
  for (const el of app.querySelectorAll('.p-row:not(.p-ghost)')) {
    const old = before.get(el); el.getAnimations().forEach(animation => animation.cancel());
    if (!moves() || !old || !el.getClientRects().length) continue;
    const now = el.getBoundingClientRect(), x = old.left - now.left, y = old.top - now.top;
    if (Math.abs(x) + Math.abs(y) < .5) continue;
    el.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:240,easing:'cubic-bezier(.23,1,.32,1)'}).finished.catch(() => {});
  }
}
function leaving(id) {
  const el = app.querySelector(`.p-row[data-task="${id}"]`);
  if (!moves() || !el?.getClientRects().length) return;
  const bounds = el.getBoundingClientRect(), base = app.getBoundingClientRect(), copy = el.cloneNode(true);
  copy.classList.add('p-ghost'); copy.removeAttribute('data-task'); copy.setAttribute('aria-hidden','true'); copy.inert = true;
  copy.querySelectorAll('input,select').forEach(input => { input.removeAttribute('id'); input.disabled = true; });
  copy.querySelectorAll('label').forEach(label => label.removeAttribute('for'));
  copy.style.cssText = `left:${bounds.left-base.left}px;top:${bounds.top-base.top}px;width:${bounds.width}px;height:${bounds.height}px`;
  app.append(copy);
  copy.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate(16px,-2px) scale(.97)',opacity:0}],{duration:200,easing:'cubic-bezier(.23,1,.32,1)'}).finished.catch(() => {}).finally(() => copy.remove());
}
async function refresh(announce = false) {
  if (busy || refreshing) return;
  refreshing = true; retryButton.disabled = true; const generation = epoch;
  if (announce) feedback('Ouverture de tes tâches…');
  try {
    const latest = tasksFromReply(await request('list'));
    if (generation !== epoch) return;
    tasks = latest; ready = true; lastRefresh = Date.now(); sync();
    if (announce) feedback('');
  } catch (error) { if (generation === epoch) feedback(error.message, true, true); }
  finally { refreshing = false; retryButton.disabled = busy; }
}
async function mutate(action, input) {
  if (busy || !ready) return null;
  const focused = document.activeElement;
  busy = true; epoch++;
  const original = tasks.map(task => ({...task}));
  const previous = tasks.find(task => task.id === input.id), before = positions();
  if (action === 'create' && !tasks.some(task => task.id === input.id)) tasks.push({...input,done:false,revision:1,createdAt:new Date().toISOString()});
  if (action === 'update') { if (input.done && !previous.done) leaving(input.id); tasks = tasks.map(task => task.id === input.id ? {...task,...input} : task); }
  if (action === 'delete') { leaving(input.id); tasks = tasks.filter(task => task.id !== input.id); }
  sync(); flip(before); feedback('');
  try {
    const saved = taskFromReply((await request(action, input)).task);
    if (saved.id !== input.id) throw new Error('La tâche renvoyée est invalide. Recharge tes tâches.');
    tasks = tasks.filter(task => task.id !== saved.id);
    if (action !== 'delete') tasks.push(saved);
    channel?.postMessage('changed');
    return saved;
  } catch (error) {
    tasks = original;
    // Une coupure peut arriver après la validation côté serveur : relire avant de proposer une nouvelle action.
    if (!error.status || error.status === 409 || error.status >= 500) {
      try { tasks = tasksFromReply(await request('list')); } catch { /* L'erreur reste visible et la saisie est conservée. */ }
    }
    feedback(error.message, true, !error.status || error.status >= 500);
    return null;
  } finally {
    busy = false; sync();
    if (app.dataset.input === 'keyboard' && document.activeElement === document.body) {
      const target = focused?.isConnected && !focused.disabled ? focused : app.querySelector('.p-group input:not(:disabled)');
      target?.focus({preventScroll:true});
    }
  }
}
app.addEventListener('pointerdown', () => { app.dataset.input = 'pointer'; });
app.addEventListener('keydown', () => { app.dataset.input = 'keyboard'; });
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !ready) return;
  let title;
  try { title = cleanTitle(form.elements.task.value); } catch (error) { feedback(error.message, true); return; }
  const priority = form.elements.priority.value, typed = form.elements.task.value;
  if (!pendingCreate || pendingCreate.title !== title || pendingCreate.priority !== priority) pendingCreate = {id:newId(),title,priority};
  const saved = await mutate('create', pendingCreate);
  if (saved) { pendingCreate = null; if (form.elements.task.value === typed) form.elements.task.value = ''; form.elements.task.focus({preventScroll:true}); }
});
app.addEventListener('change', async event => {
  const el = event.target.closest('.p-row:not(.p-ghost)'); if (!el || busy) return;
  const task = tasks.find(task => task.id === el.dataset.task); if (!task) return;
  const update = {id:task.id,revision:task.revision};
  if (event.target.type === 'checkbox') { update.done = event.target.checked; }
  else return;
  await mutate('update', update);
});
app.addEventListener('click', event => {
  const trigger = event.target.closest('[data-task-menu], [data-compose-menu]');
  if (trigger && !trigger.closest('.p-ghost')) openMenu(trigger);
});
retryButton.addEventListener('click', () => refresh(true));
const refreshWhenVisible = () => { if (!document.hidden && ready && Date.now() - lastRefresh > 15000) refresh(); };
document.addEventListener('visibilitychange', refreshWhenVisible);
window.addEventListener('focus', refreshWhenVisible);
channel?.addEventListener('message', event => { if (event.data === 'changed') refresh(); });
await refresh(true);
