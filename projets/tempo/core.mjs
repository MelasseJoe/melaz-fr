export const DAY_MS = 86400000;
export const iso = date => date.toISOString().slice(0, 10);
export const utcDate = key => new Date(`${key}T00:00:00Z`);

export function validDate(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)
    && Number.isFinite(+utcDate(key)) && iso(utcDate(key)) === key;
}

export function dateWindow(today) {
  if (!validDate(today)) throw new Error('Date invalide');
  const end = utcDate(today);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, 1));
  const yearEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0));
  const days = Array.from({ length: (yearEnd - start) / DAY_MS + 1 }, (_, i) => new Date(+start + i * DAY_MS));
  return { end, start, yearEnd, days };
}

export function mondayFor(date) {
  return new Date(+date - (date.getUTCDay() + 6) % 7 * DAY_MS);
}

export function calendarWindow(today, selection = 'recent') {
  const current = dateWindow(today);
  if (selection === 'recent') return current;
  const year = Number(selection);
  if (!/^\d{4}$/.test(String(selection)) || year < 2000 || year > current.end.getUTCFullYear()) {
    throw new Error('Année invalide');
  }
  const start = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const days = Array.from({ length: (yearEnd - start) / DAY_MS + 1 }, (_, i) => new Date(+start + i * DAY_MS));
  return { end: current.end, start, yearEnd, days };
}

export function countSportDays(sessions, window) {
  const first = iso(window.start), last = iso(window.yearEnd), today = iso(window.end);
  return [...new Set(sessions)].filter(key => validDate(key) && key >= first && key <= last && key <= today).length;
}

export function seriesDuration(series) {
  return series.length ? (utcDate(series.at(-1)) - utcDate(series[0])) / DAY_MS + 1 : 0;
}

export function seriesSummary(sessions, today) {
  const ordered = [...new Set(sessions)].filter(key => validDate(key) && key <= today).sort();
  const groups = [];
  for (const key of ordered) {
    const previous = groups.at(-1);
    if (!previous || (utcDate(key) - utcDate(previous.at(-1))) / DAY_MS > 3) groups.push([key]);
    else previous.push(key);
  }
  const last = groups.at(-1) || [];
  const current = last.length && (utcDate(today) - utcDate(last.at(-1))) / DAY_MS <= 2 ? last : [];
  const record = groups.reduce((winner, group) => group.length > winner.length
    || (group.length === winner.length && seriesDuration(group) > seriesDuration(winner)) ? group : winner, []);
  return { current, record, currentDuration: seriesDuration(current), recordDuration: seriesDuration(record) };
}

export function bridgeDays(sessions) {
  const ordered = [...new Set(sessions)].filter(validDate).sort();
  const bridges = new Set();
  for (let i = 1; i < ordered.length; i++) {
    const before = utcDate(ordered[i - 1]);
    const pause = (utcDate(ordered[i]) - before) / DAY_MS - 1;
    if (pause >= 1 && pause <= 2) {
      for (let j = 1; j <= pause; j++) bridges.add(iso(new Date(+before + j * DAY_MS)));
    }
  }
  return bridges;
}
