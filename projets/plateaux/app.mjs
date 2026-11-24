import {
  priorities, names, icons, cleanTitle, taskFromReply, listFromReply,
  notebookFromReply, tasksInList, defaultList, allLists, byPriority, newId,
} from './core.mjs?v=20261124-renommer-1';

const app = document.getElementById('plateaux');
const find = selector => app.querySelector(selector);
const home = find('[data-home]');
const listPage = find('[data-list-page]');
const index = find('[data-index]');
const taskForm = find('#p-task-form');
const listForm = find('#p-list-form');
const renameForm = find('#p-rename-form');
const taskInput = taskForm.elements.task;
const listInput = find('#p-list-entry');
const renameInput = find('#p-rename-entry');
const destination = taskForm.elements.list;
const back = find('[data-back]');
const newTask = find('[data-new-task]');
const newList = find('[data-new-list]');
const renameButton = find('[data-rename]');
const renameSave = find('[data-save-rename]');
const openCount = find('[data-open-count]');
const feedbackPanel = find('[data-feedback]');
const retryButton = find('[data-retry]');
const donePanel = find('.p-done');
const openRows = find('[data-tasks]');
const doneRows = find('[data-done]');
const rowTemplate = find('[data-row-template]');
const editorTemplate = find('[data-editor-template]');
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('melaz-plateaux') : null;
const allLabel = 'Toutes les tâches';
const shortNames = {high:'Haute', normal:'Normale', low:'Basse'};

let tasks = [], lists = [defaultList];
let activeList = null, lastList = defaultList.id, editorId = null;
let ready = false, busy = false, refreshing = false, refreshQueued = false;
let epoch = 0, lastRefresh = 0, pendingTask = null, pendingList = null;
let renameBase = null;

const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24"><use href="assets/icons.svg#${name}"></use></svg>`;
const setText = (element, value) => {
  if (element.textContent !== String(value)) element.textContent = value;
};

function priorityControl(selected, onChange) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'p-priorities';
  fieldset.innerHTML = '<legend>Priorité</legend><div>' + priorities.map(key => `
    <label><input type="radio" name="priority" value="${key}" ${key === selected ? 'checked' : ''}>
      <span>${icon(icons[key])} ${shortNames[key]}</span>
    </label>`).join('') + '</div>';
  if (onChange) fieldset.addEventListener('change', event => onChange(event.target.value));
  return fieldset;
}
const composerPriority = priorityControl('normal');
find('[data-compose-priority]').append(composerPriority);

function listName(id) {
  if (id === allLists) return allLabel;
  return lists.find(list => list.id === (id ?? defaultList.id))?.name ?? defaultList.name;
}
function setLists(next) {
  if (next.length === lists.length && next.every((list, i) => list.id === lists[i].id && list.name === lists[i].name)) return;
  lists = next;
  destination.replaceChildren(...lists.map(list => new Option(list.name, list.id)));
  destination.value = lastList;
}
destination.append(new Option(defaultList.name, defaultList.id));
function applyNotebook(reply) {
  const notebook = notebookFromReply(reply);
  setLists(notebook.lists);
  tasks = notebook.tasks;
}

function feedback(text = '', error = false, retry = false) {
  if (activeList !== null) {
    const inForm = error && (!taskForm.hidden || !renameForm.hidden);
    const slot = find(inForm ? '[data-form-feedback]' : '[data-task-feedback]');
    if (feedbackPanel.parentElement !== slot) slot.append(feedbackPanel);
  }
  const message = feedbackPanel.querySelector('.p-message');
  message.setAttribute('role', error ? 'alert' : 'status');
  message.dataset.error = String(error);
  setText(message, text);
  retryButton.hidden = !retry;
  feedbackPanel.hidden = !text;
}

function toggleForm(form, trigger, input, open) {
  form.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
  (open ? input : trigger).focus({preventScroll:!open});
}

function showRename(open) {
  renameForm.hidden = renameSave.hidden = !open;
  renameButton.hidden = open || activeList === allLists;
  renameButton.setAttribute('aria-expanded', String(open));
}

function closeRename() {
  if (renameForm.hidden) return;
  showRename(false);
  renameBase = null;
  renameInput.value = '';
  if (feedbackPanel.parentElement === find('[data-form-feedback]')) feedback();
}

function selectList(id) {
  if (id !== null && id !== allLists && !lists.some(list => list.id === id)) return;
  const previous = activeList;
  activeList = id;
  if (id && id !== allLists) lastList = id;
  taskForm.reset();
  destination.value = lastList;
  taskForm.hidden = listForm.hidden = true;
  closeRename();
  newTask.setAttribute('aria-expanded', 'false');
  newList.setAttribute('aria-expanded', 'false');
  donePanel.open = false;
  editorId = null;
  (id === null ? find('[data-home-feedback]') : find('[data-task-feedback]')).append(feedbackPanel);
  feedback();
  sync();
  const target = id ? back : index.querySelector(`[data-list-id="${previous}"]`) ?? index.firstElementChild;
  target?.focus({preventScroll:true});
}

function renderIndex() {
  const buttons = new Map([...index.children].map(button => [button.dataset.listId, button]));
  const counts = new Map();
  let total = 0;
  for (const task of tasks) {
    if (task.done) continue;
    const id = task.listId ?? defaultList.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    total++;
  }
  let previous = null;
  for (const {id, name} of [...lists, {id:allLists, name:allLabel}]) {
    const button = buttons.get(id) ?? document.createElement('button');
    if (!buttons.has(id)) {
      button.className = 'p-list-link';
      button.type = 'button';
      button.dataset.listId = id;
      button.innerHTML = '<span class="p-list-name"></span><span class="p-list-count"></span><span class="p-list-arrow" aria-hidden="true">›</span>';
    }
    const count = id === allLists ? total : counts.get(id) ?? 0;
    setText(button.querySelector('.p-list-name'), name);
    const counter = button.querySelector('.p-list-count');
    setText(counter, ready ? count : '');
    button.setAttribute('aria-label', ready ? `${name}, ${count} tâche${count === 1 ? '' : 's'} à faire` : name);
    button.disabled = busy || !ready;
    const next = previous ? previous.nextElementSibling : index.firstElementChild;
    if (button !== next) index.insertBefore(button, next);
    previous = button;
    buttons.delete(id);
  }
  buttons.forEach(button => button.remove());
}

function actionButton(id) {
  return listPage.querySelector(`[data-task="${id}"] [data-actions]`);
}
function attachEditor(row, task) {
  const editor = editorTemplate.content.firstElementChild.cloneNode(true);
  editor.id = 'p-actions-' + task.id;
  const action = row.querySelector('[data-actions]');
  action.setAttribute('aria-controls', editor.id);
  editor.querySelector('[data-editor-priority]').append(priorityControl(task.priority, async priority => {
    if (busy || !priorities.includes(priority)) return;
    editorId = null;
    await mutate('update', {id:task.id, revision:task.revision, priority});
    actionButton(task.id)?.focus({preventScroll:true});
  }));
  const deleteButton = editor.querySelector('[data-delete]');
  deleteButton.addEventListener('click', async () => {
    if (busy) return;
    const keyboard = document.activeElement === deleteButton && deleteButton.matches(':focus-visible');
    const neighbour = row.nextElementSibling ?? row.previousElementSibling;
    editorId = null;
    const saved = await mutate('delete', {id:task.id, revision:task.revision});
    if (saved) feedback('Tâche supprimée.');
    if (keyboard) (actionButton(task.id) ?? neighbour?.querySelector('[data-actions]') ?? newTask).focus({preventScroll:true});
  });
  row.append(editor);
}
function renderRows(listTasks) {
  const rows = new Map([...listPage.querySelectorAll('.p-row')].map(row => [row.dataset.task, row]));
  const visible = new Map(listTasks.map(task => [task.id, task]));
  // Retirer d’abord les lignes déplacées ou supprimées pour laisser les voisines en place.
  for (const [id, row] of rows) {
    const task = visible.get(id);
    if (!task) {
      row.remove();
      rows.delete(id);
    } else if (row.parentElement !== (task.done ? doneRows : openRows) || row.dataset.priority !== task.priority) {
      row.remove();
    }
  }
  const cursors = new Map();
  for (const task of byPriority(listTasks)) {
    const row = rows.get(task.id) ?? rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.task = task.id;
    row.dataset.priority = task.priority;
    setText(row.querySelector('[data-task-title]'), task.title);
    const origin = row.querySelector('.p-origin');
    origin.hidden = activeList !== allLists;
    if (!origin.hidden) setText(origin, listName(task.listId));
    const check = row.querySelector('input[type=checkbox]');
    if (check.checked !== task.done) check.checked = task.done;
    const action = row.querySelector('[data-actions]');
    action.setAttribute('aria-label', names[task.priority] + ', actions de « ' + task.title + ' »');
    if (action.dataset.priority !== task.priority) {
      action.innerHTML = icon(icons[task.priority]);
      action.dataset.priority = task.priority;
    }
    const panel = row.querySelector('.p-editor');
    const editing = editorId === task.id;
    action.setAttribute('aria-expanded', String(editing));
    if (editing && (!panel || panel.dataset.revision !== String(task.revision))) {
      panel?.remove();
      attachEditor(row, task);
      row.querySelector('.p-editor').dataset.revision = task.revision;
    } else if (!editing && panel) {
      panel.remove();
      action.removeAttribute('aria-controls');
    }

    const target = task.done ? doneRows : openRows;
    const previous = cursors.get(target);
    const next = previous ? previous.nextElementSibling : target.firstElementChild;
    if (row !== next) target.insertBefore(row, next);
    cursors.set(target, row);
  }
}

function sync() {
  const atHome = activeList === null;
  home.hidden = !atHome;
  listPage.hidden = atHome;
  if (atHome) {
    renderIndex();
  } else {
    const visible = tasksInList(tasks, activeList);
    const done = visible.filter(task => task.done).length;
    const open = visible.length - done;
    const title = listName(activeList);
    setText(find('#p-list-title'), title);
    renameButton.hidden = activeList === allLists || !renameForm.hidden;
    renameButton.setAttribute('aria-label', 'Renommer « ' + title + ' »');
    setText(openCount, `${open} tâche${open === 1 ? '' : 's'} à faire`);
    setText(find('[data-done-count]'), done);
    find('[data-destination]').hidden = activeList !== allLists;
    openRows.hidden = open === 0;
    doneRows.hidden = done === 0;
    find('[data-open-empty]').hidden = open > 0;
    find('[data-done-empty]').hidden = done > 0;
    renderRows(visible);
  }
  newList.disabled = newTask.disabled = back.disabled = renameButton.disabled = busy || !ready;
  renameSave.disabled = busy || !ready;
  for (const form of [listForm, taskForm]) {
    form.querySelectorAll('button').forEach(button => { button.disabled = busy || !ready; });
  }
  listInput.readOnly = taskInput.readOnly = renameInput.readOnly = busy;
  destination.disabled = composerPriority.disabled = busy || !ready;
  retryButton.disabled = busy || refreshing;
}

async function request(action, body) {
  await window.HubSession.ready;
  const url = new URL('api.php', location.href);
  url.searchParams.set('action', action);
  let response;
  try {
    response = await fetch(url, {
      method:body ? 'POST' : 'GET',
      credentials:'same-origin',
      cache:'no-store',
      signal:AbortSignal.timeout(15000),
      headers:body ? {'Content-Type':'application/json','X-Hub-CSRF':window.HubSession.csrf} : {Accept:'application/json'},
      body:body ? JSON.stringify(body) : undefined,
    });
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
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}
function flushRefresh() {
  if (refreshQueued && !busy && !refreshing) {
    refreshQueued = false;
    void refresh();
  }
}
async function refresh(announce = false) {
  if (busy || refreshing) { refreshQueued = true; return; }
  refreshing = true;
  retryButton.disabled = true;
  const generation = epoch;
  if (announce) feedback('Ouverture de tes tâches…');
  try {
    const reply = await request('list');
    if (generation !== epoch) { refreshQueued = true; return; }
    applyNotebook(reply);
    ready = true;
    lastRefresh = Date.now();
    sync();
    if (announce) feedback();
  } catch (error) {
    if (generation === epoch) feedback(error.message, true, true);
  } finally {
    refreshing = false;
    find('main').setAttribute('aria-busy', 'false');
    retryButton.disabled = busy;
    flushRefresh();
  }
}
function startSaving() {
  busy = true;
  epoch++;
  editorId = null;
  feedback();
}
function stopSaving() {
  busy = false;
  sync();
  flushRefresh();
}
function saveError(error) {
  feedback(error.message, true, !error.status || error.status >= 500);
}
async function mutate(action, input) {
  if (busy || !ready) return null;
  const original = tasks;
  startSaving();
  if (action === 'create' && !tasks.some(task => task.id === input.id)) {
    tasks = [...tasks, {...input, done:false, revision:1, createdAt:new Date().toISOString().slice(0, 19).replace('T', ' ')}];
  }
  if (action === 'update') tasks = tasks.map(task => task.id === input.id ? {...task, ...input} : task);
  if (action === 'delete') tasks = tasks.filter(task => task.id !== input.id);
  sync();
  try {
    const saved = taskFromReply((await request(action, input)).task);
    if (saved.id !== input.id) throw new Error('La tâche renvoyée est invalide. Recharge tes tâches.');
    tasks = tasks.filter(task => task.id !== saved.id);
    if (action !== 'delete') tasks.push(saved);
    channel?.postMessage('changed');
    return saved;
  } catch (error) {
    tasks = original;
    if (!error.status || error.status === 409 || error.status >= 500) {
      try { applyNotebook(await request('list')); } catch { /* La saisie reste disponible pour réessayer. */ }
    }
    saveError(error);
    return null;
  } finally {
    stopSaving();
  }
}

index.addEventListener('click', event => {
  const button = event.target.closest('[data-list-id]');
  if (button && !busy && ready) selectList(button.dataset.listId);
});
back.addEventListener('click', () => selectList(null));
newList.addEventListener('click', () => toggleForm(listForm, newList, listInput, listForm.hidden));
newTask.addEventListener('click', () => {
  closeRename();
  toggleForm(taskForm, newTask, taskInput, taskForm.hidden);
});
renameButton.addEventListener('click', () => {
  feedback();
  taskForm.hidden = true;
  newTask.setAttribute('aria-expanded', 'false');
  renameInput.value = renameBase = listName(activeList);
  showRename(true);
  renameInput.focus({preventScroll:true});
  renameInput.select();
});
renameForm.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || busy) return;
  event.preventDefault();
  closeRename();
  renameButton.focus({preventScroll:true});
});
document.addEventListener('click', event => {
  if (busy || renameForm.hidden) return;
  if ([renameForm, renameButton, renameSave].some(control => control.contains(event.target))) return;
  closeRename();
}, {capture:true});
find('[data-cancel-list]').addEventListener('click', () => toggleForm(listForm, newList, listInput, false));
find('[data-cancel-task]').addEventListener('click', () => toggleForm(taskForm, newTask, taskInput, false));
destination.addEventListener('change', () => { lastList = destination.value; });

listForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !ready) return;
  const name = listInput.value.trim();
  if (!name || Array.from(name).length > 42) {
    feedback('Saisis un nom de liste de 42 caractères maximum.', true);
    listInput.focus();
    return;
  }
  if (pendingList?.name !== name) pendingList = {id:newId(), name};
  startSaving();
  sync();
  let saved;
  try {
    saved = listFromReply((await request('create_list', pendingList)).list);
    if (saved.id !== pendingList.id) {
      saved = null;
      throw new Error('La liste renvoyée est invalide. Recharge ton carnet.');
    }
    if (!lists.some(list => list.id === saved.id)) setLists([...lists, saved]);
    channel?.postMessage('changed');
    pendingList = null;
    listForm.reset();
  } catch (error) {
    saveError(error);
  } finally {
    stopSaving();
  }
  if (saved) selectList(saved.id);
  else listInput.focus();
});

renameForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !ready || renameBase === null) return;
  const name = renameInput.value.trim();
  if (!name || Array.from(name).length > 42) {
    feedback('Saisis un nom de liste de 42 caractères maximum.', true);
    renameInput.focus();
    return;
  }
  if (name === renameBase && name === listName(activeList)) {
    closeRename();
    feedback();
    renameButton.focus();
    return;
  }
  startSaving();
  sync();
  let success = false;
  try {
    const input = {id:activeList, name, previousName:renameBase};
    const saved = listFromReply((await request('rename_list', input)).list);
    if (saved.id !== input.id) throw new Error('La liste renvoyée est invalide. Recharge ton carnet.');
    setLists(lists.map(list => list.id === saved.id ? saved : list));
    closeRename();
    channel?.postMessage('changed');
    success = true;
  } catch (error) {
    if (error.code === 'conflict') {
      try {
        applyNotebook(await request('list'));
        renameBase = listName(activeList);
      } catch { /* Le nom saisi reste disponible pour réessayer. */ }
    }
    saveError(error);
  } finally {
    stopSaving();
  }
  if (success) feedback('Liste renommée.');
  (success ? renameButton : renameInput).focus({preventScroll:true});
});

taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !ready) return;
  let title;
  try { title = cleanTitle(taskInput.value); }
  catch (error) { feedback(error.message, true); taskInput.focus(); return; }
  const priority = taskForm.elements.priority.value;
  const selection = activeList === allLists ? destination.value : activeList;
  const listId = selection === defaultList.id ? null : selection;
  if (!pendingTask || pendingTask.title !== title || pendingTask.priority !== priority || pendingTask.listId !== listId) {
    pendingTask = {id:newId(), title, priority, listId};
  }
  toggleForm(taskForm, newTask, taskInput, false);
  if (await mutate('create', pendingTask)) {
    pendingTask = null;
    taskInput.value = '';
    feedback('Tâche ajoutée.');
  } else {
    toggleForm(taskForm, newTask, taskInput, true);
    find('[data-form-feedback]').append(feedbackPanel);
  }
});

listPage.addEventListener('click', event => {
  if (busy && event.target.closest('.p-row')) {
    event.preventDefault();
    return;
  }
  const action = event.target.closest('[data-actions]');
  if (!action || busy) return;
  const id = action.closest('.p-row').dataset.task;
  editorId = editorId === id ? null : id;
  sync();
});
listPage.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || editorId === null) return;
  const id = editorId;
  editorId = null;
  sync();
  actionButton(id)?.focus({preventScroll:true});
});
listPage.addEventListener('change', async event => {
  if (event.target.type !== 'checkbox') return;
  const check = event.target;
  const row = check.closest('.p-row');
  const task = tasks.find(task => task.id === row.dataset.task);
  if (!task) return;
  if (busy) {
    check.checked = task.done;
    return;
  }
  const keyboard = document.activeElement === check && check.matches(':focus-visible');
  const neighbour = row.nextElementSibling ?? row.previousElementSibling;
  const saved = await mutate('update', {id:task.id, revision:task.revision, done:check.checked});
  if (keyboard) {
    const next = neighbour?.querySelector('input[type=checkbox]') ?? donePanel.querySelector('summary');
    const target = !row.isConnected || (saved?.done && !donePanel.open) ? next : check;
    target.focus({preventScroll:true});
  }
});

retryButton.addEventListener('click', () => refresh(true));
const refreshWhenVisible = () => {
  if (!document.hidden && ready && Date.now() - lastRefresh > 15000) void refresh();
};
document.addEventListener('visibilitychange', refreshWhenVisible);
window.addEventListener('focus', refreshWhenVisible);
channel?.addEventListener('message', event => { if (event.data === 'changed') void refresh(); });
sync();
await refresh(true);
