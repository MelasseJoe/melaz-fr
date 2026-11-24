export const priorities = ['high', 'normal', 'low'];
export const names = {high:'Priorité haute', normal:'Priorité normale', low:'Priorité basse'};
export const icons = {high:'rocket', normal:'send', low:'snail'};
export const defaultList = {id:'rappels', name:'Rappels'};
export const allLists = 'all';
export function cleanTitle(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('Saisis une tâche sur une seule ligne.');
  const title = value.trim();
  if (!title || Array.from(title).length > 160) throw new Error('Saisis une tâche de 160 caractères maximum.');
  return title;
}
export function taskFromReply(task) {
  if (!task || !/^[a-f0-9]{32}$/.test(task.id) || !priorities.includes(task.priority) || typeof task.done !== 'boolean' || !Number.isSafeInteger(task.revision) || task.revision < 1 || typeof task.createdAt !== 'string') throw new Error('Les tâches n’ont pas pu être lues. Réessaie dans un instant.');
  const listId = task.listId ?? null;
  if (listId !== null && (typeof listId !== 'string' || !/^[a-f0-9]{32}$/.test(listId))) throw new Error('La liste de cette tâche est invalide.');
  return {...task, listId, title:cleanTitle(task.title)};
}
export function tasksFromReply(reply) {
  if (!reply || !Array.isArray(reply.tasks)) throw new Error('Les tâches n’ont pas pu être lues. Réessaie dans un instant.');
  const tasks = reply.tasks.map(taskFromReply);
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('La liste reçue est incohérente. Recharge tes tâches.');
  return ordered(tasks);
}
export function ordered(tasks) { return [...tasks].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)); }
export function byPriority(tasks) {
  return ordered(tasks).sort((a, b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority));
}
export function listFromReply(list) {
  if (!list || typeof list.id !== 'string' || (list.id !== defaultList.id && !/^[a-f0-9]{32}$/.test(list.id)) || typeof list.name !== 'string' || !list.name.trim() || Array.from(list.name).length > 42) {
    throw new Error('Les listes n’ont pas pu être lues. Réessaie dans un instant.');
  }
  return {id:list.id, name:list.name};
}
export function notebookFromReply(reply) {
  const tasks = tasksFromReply(reply);
  if (!Array.isArray(reply.lists)) throw new Error('Les listes n’ont pas pu être lues. Réessaie dans un instant.');
  const lists = reply.lists.map(listFromReply);
  const ids = new Set(lists.map(list => list.id));
  if (ids.has(defaultList.id) || ids.size !== lists.length || tasks.some(task => task.listId !== null && !ids.has(task.listId))) {
    throw new Error('Le carnet reçu est incohérent. Recharge tes tâches.');
  }
  const reminders = listFromReply({id:defaultList.id, name:reply.defaultListName ?? defaultList.name});
  return {tasks, lists:[reminders, ...lists]};
}
export function tasksInList(tasks, view) {
  return view === allLists ? tasks : tasks.filter(task => (task.listId ?? defaultList.id) === view);
}
export function newId() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join(''); }
