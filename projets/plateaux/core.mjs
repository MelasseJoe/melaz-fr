export const priorities = ['high', 'normal', 'low'];
export const names = {high:'Priorité haute', normal:'Priorité normale', low:'Priorité basse'};
export const icons = {high:'rocket', normal:'send', low:'snail'};
export function cleanTitle(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('Saisis une tâche sur une seule ligne.');
  const title = value.trim();
  if (!title || Array.from(title).length > 160) throw new Error('Saisis une tâche de 160 caractères maximum.');
  return title;
}
export function taskFromReply(task) {
  if (!task || !/^[a-f0-9]{32}$/.test(task.id) || !priorities.includes(task.priority) || typeof task.done !== 'boolean' || !Number.isSafeInteger(task.revision) || task.revision < 1 || typeof task.createdAt !== 'string') throw new Error('Les tâches n’ont pas pu être lues. Réessaie dans un instant.');
  return {...task, title:cleanTitle(task.title)};
}
export function tasksFromReply(reply) {
  if (!reply || !Array.isArray(reply.tasks)) throw new Error('Les tâches n’ont pas pu être lues. Réessaie dans un instant.');
  const tasks = reply.tasks.map(taskFromReply);
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('La liste reçue est incohérente. Recharge tes tâches.');
  return ordered(tasks);
}
export function ordered(tasks) { return [...tasks].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)); }
export function groups(tasks) { return Object.fromEntries(priorities.map(key => [key,tasks.filter(task => !task.done && task.priority === key)])); }
export function newId() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join(''); }
