export function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function editionLanguageGroup(edition) {
  const languages = Array.isArray(edition.languages) ? edition.languages : [];
  if (languages.some(language => ['fre', 'fra', 'fr'].includes(language))) return 'fr';
  return languages.length ? 'other' : 'unknown';
}
export function coverURL(book, size = 'M') {
  if (!['S', 'M', 'L'].includes(size)) return null;
  if (/^\/books\/OL[0-9]+M$/.test(book.editionKey || '')) {
    return `https://covers.openlibrary.org/b/olid/${book.editionKey.slice(7)}-${size}.jpg?default=false`;
  }
  if (Number.isInteger(book.coverId) && book.coverId > 0 && book.coverId <= 2147483647) {
    return `https://covers.openlibrary.org/b/id/${book.coverId}-${size}.jpg?default=false`;
  }
  return null;
}
export function sortedBooks(books) { return [...books].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)); }
export function bookRows(books, columns) { const list = sortedBooks(books), rows = []; for (let i = 0; i < list.length; i += columns) rows.push(list.slice(i, i + columns)); return rows; }
export function dateLabel(value) { return new Date(value + 'T12:00:00').toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'}); }
export function parisToday() { const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return ['year','month','day'].map(type => parts.find(p => p.type === type).value).join('-'); }
export function validDate(value, today) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > today) return false; const d = new Date(value + 'T12:00:00Z'); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === value; }
export function makeId() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join(''); }
export function fallbackColors(title) { const colors = [['#f1e8db','#325c69'],['#e3acbf','#5c223f'],['#e4e8c8','#3e6558'],['#df8a59','#432640']]; let hash = 0; for (const ch of title) hash = (hash * 31 + ch.codePointAt(0)) >>> 0; return colors[hash % colors.length]; }
