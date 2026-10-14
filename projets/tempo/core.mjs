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

// Une semaine civile (lundi–dimanche) est validée à partir de trois jours de sport.
export function sportWeeks(sessions, today) {
  if (!validDate(today)) throw new Error('Date invalide');
  const weeks = new Map();
  for (const key of [...new Set(sessions)].filter(key => validDate(key) && key <= today).sort()) {
    const monday = iso(mondayFor(utcDate(key)));
    if (!weeks.has(monday)) weeks.set(monday, []);
    weeks.get(monday).push(key);
  }
  return weeks;
}

export function seriesSummary(sessions, today) {
  const weeks = sportWeeks(sessions, today);
  const thisMonday = iso(mondayFor(utcDate(today)));
  const previousMonday = iso(new Date(+utcDate(thisMonday) - 7 * DAY_MS));
  const groups = [];
  for (const [monday, days] of weeks) {
    if (days.length < 3) continue;
    const last = groups.at(-1);
    if (!last || +utcDate(monday) - +utcDate(last.at(-1).monday) !== 7 * DAY_MS) groups.push([]);
    groups.at(-1).push({ monday, days });
  }
  const last = groups.at(-1) || [];
  // Une semaine encore en cours ne rompt pas une série déjà validée.
  const currentGroup = last.length && [thisMonday, previousMonday].includes(last.at(-1).monday) ? last : [];
  const count = group => group.reduce((sum, week) => sum + week.days.length, 0);
  const recordGroup = groups.reduce((winner, group) => group.length > winner.length
    || (group.length === winner.length && count(group) > count(winner)) ? group : winner, []);
  const period = group => {
    if (!group.length) return { days: [], start: null, end: null, duration: 0 };
    const start = group[0].monday;
    const end = iso(new Date(Math.min(+utcDate(today), +utcDate(group.at(-1).monday) + 6 * DAY_MS)));
    return { days: group.flatMap(week => week.days), start, end, duration: (+utcDate(end) - +utcDate(start)) / DAY_MS + 1 };
  };
  const current = period(currentGroup), record = period(recordGroup);
  return { current: current.days, record: record.days,
    currentDuration: current.duration, recordDuration: record.duration,
    currentWeeks: currentGroup.length, recordWeeks: recordGroup.length,
    currentStart: current.start, currentEnd: current.end, recordStart: record.start, recordEnd: record.end,
    thisWeekCount: (weeks.get(thisMonday) || []).length };
}

export function bridgeDays(sessions, today) {
  const ordered = [...new Set(sessions)].filter(validDate).sort();
  const end = today || ordered.at(-1);
  if (!end) return new Set();
  const active = new Set(ordered);
  const bridges = new Set();
  for (const [monday, days] of sportWeeks(ordered, end)) {
    if (days.length < 3) continue;
    for (let i = 0; i < 7; i++) {
      const key = iso(new Date(+utcDate(monday) + i * DAY_MS));
      if (key <= end && !active.has(key)) bridges.add(key);
    }
  }
  return bridges;
}
