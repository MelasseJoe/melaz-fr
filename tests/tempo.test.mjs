import test from 'node:test';
import assert from 'node:assert/strict';
import { dateWindow, calendarWindow, countSportDays, bridgeDays, seriesSummary, validDate, iso } from '../projets/tempo/core.mjs';
import { TempoStore } from '../projets/tempo/store.mjs';

test('13 mois glissants, passage d’année et février bissextile', () => {
  const window = dateWindow('2026-10-14');
  assert.equal(iso(window.start), '2025-10-01');
  assert.equal(iso(window.yearEnd), '2026-10-31');
  assert.equal(window.days.length, 396);
  assert.equal(iso(dateWindow('2024-02-29').yearEnd), '2024-02-29');
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
});

test('le total suit la période sélectionnée et compte uniquement les jours de sport', () => {
  const dates=['2025-09-30','2025-10-01','2025-12-31','2026-01-01','2026-10-14','2026-10-15','2025-10-01'];
  assert.equal(countSportDays(dates,calendarWindow('2026-10-14')),4);
  assert.equal(countSportDays(dates,calendarWindow('2026-10-14','2025')),3);
  assert.equal(countSportDays(dates,calendarWindow('2026-10-14','2024')),0);
  assert.equal(calendarWindow('2026-10-14','2024').days.length,366);
  assert.throws(()=>calendarWindow('2026-10-14','2027'),/Année invalide/);
});

test('trois jours quelconques valident la semaine, même avec quatre repos entre séances', () => {
  const dates = ['2026-01-05', '2026-01-10', '2026-01-11'];
  const result = seriesSummary(dates, '2026-01-11');
  assert.deepEqual(result.current, dates);
  assert.equal(result.currentWeeks, 1);
  assert.equal(result.currentDuration, 7);
  assert.deepEqual([...bridgeDays(dates, '2026-01-11')], ['2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']);
  assert.equal(bridgeDays(dates.slice(0, 2), '2026-01-11').size, 0);
});

test('les semaines sont civiles et la série traverse le changement d’année', () => {
  const dates = ['2025-12-29','2025-12-31','2026-01-04','2026-01-05','2026-01-09','2026-01-11'];
  const result = seriesSummary(dates, '2026-01-11');
  assert.equal(result.recordWeeks, 2);
  assert.equal(result.record.length, 6);
  assert.equal(result.recordDuration, 14);
  assert.equal(result.recordStart, '2025-12-29');
  assert.equal(result.recordEnd, '2026-01-11');
  assert.equal(seriesSummary(['2026-01-04','2026-01-05','2026-01-06'], '2026-01-06').recordWeeks, 0);
});

test('la semaine en cours laisse le temps de valider, une semaine ratée coupe le fil', () => {
  const dates = ['2026-01-05','2026-01-07','2026-01-09','2026-01-12','2026-01-18'];
  assert.equal(seriesSummary(dates, '2026-01-12').currentWeeks, 1);
  assert.equal(seriesSummary(dates, '2026-01-18').currentWeeks, 1);
  assert.equal(seriesSummary(dates, '2026-01-19').currentWeeks, 0);
  assert.equal(seriesSummary(dates, '2026-01-19').recordWeeks, 1);
  const resumed = seriesSummary([...dates,'2026-01-19','2026-01-21','2026-01-23'], '2026-01-25');
  assert.equal(resumed.currentWeeks, 1);
  assert.equal(resumed.recordWeeks, 1);
});

test('validation immédiate au troisième jour, aucun repos futur teinté', () => {
  const dates = ['2026-01-05','2026-01-06','2026-01-07'];
  const result = seriesSummary(dates, '2026-01-07');
  assert.equal(result.currentWeeks, 1);
  assert.equal(result.currentDuration, 3);
  assert.equal(result.recordEnd, '2026-01-07');
  assert.equal(bridgeDays(dates, '2026-01-07').size, 0);
  assert.equal(bridgeDays(dates, '2026-01-09').has('2026-01-08'), true);
  assert.equal(bridgeDays(dates, '2026-01-09').has('2026-01-10'), false);
});

test('le record privilégie les semaines puis les séances et reste disponible hors de la fenêtre', () => {
  const old = ['2023-01-02','2023-01-04','2023-01-08','2023-01-09','2023-01-11','2023-01-15'];
  const busyWeek = ['2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09','2026-01-10','2026-01-11'];
  const result = seriesSummary([...busyWeek,...old], '2026-10-15');
  assert.deepEqual(result.record, old);
  assert.equal(result.recordDuration, 14);
  const tied = seriesSummary([...old.slice(0,3), ...busyWeek], '2026-10-15');
  assert.deepEqual(tied.record, busyWeek);
});

test('dates futures, doublons et dates impossibles ne valident pas une semaine', () => {
  const result = seriesSummary(['2026-01-05','2026-01-05','2026-01-07','2026-01-09','2026-02-30'], '2026-01-07');
  assert.equal(result.currentWeeks, 0);
  assert.deepEqual(result.record, []);
  assert.deepEqual(seriesSummary([], '2026-01-07').record, []);
});

test('la sauvegarde utilise la session serveur et attend une confirmation exacte', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => options.method === 'POST'
      ? { date: '2026-10-14', active: true }
      : { days: [], today: '2026-10-14', csrf: 'test-token' } };
  };
  try {
    const store = new TempoStore();
    await store.load();
    await store.setDay('2026-10-14', true);
    assert.equal(calls[1].options.headers['X-Tempo-CSRF'], 'test-token');
    assert.equal(calls[1].options.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(calls[1].options.body), { date: '2026-10-14', active: true });
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ date: '2026-10-13', active: true }) });
    await assert.rejects(store.setDay('2026-10-14', true), /confirmé/);
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: 'Base indisponible' }) });
    await assert.rejects(store.load(), /Base indisponible/);
  } finally { globalThis.fetch = original; }
});
