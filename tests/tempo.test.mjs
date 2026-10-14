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

test('une ou deux pauses relient les séances, trois coupent entièrement le fil', () => {
  assert.deepEqual([...bridgeDays(['2026-01-01', '2026-01-03'])], ['2026-01-02']);
  assert.deepEqual([...bridgeDays(['2026-01-01', '2026-01-04'])], ['2026-01-02', '2026-01-03']);
  assert.equal(bridgeDays(['2026-01-01', '2026-01-05']).size, 0);
  assert.deepEqual([...bridgeDays(['2025-12-31', '2026-01-03'])], ['2026-01-01', '2026-01-02']);
});

test('nombre de jours de sport et durée inclusive de chaque série', () => {
  const dates = ['2026-01-01', '2026-01-03', '2026-01-06', '2026-01-10'];
  const result = seriesSummary(dates, '2026-01-10');
  assert.deepEqual(result.record, dates.slice(0, 3));
  assert.equal(result.recordDuration, 6);
  assert.deepEqual(result.current, ['2026-01-10']);
  assert.equal(result.currentDuration, 1);
  assert.equal(seriesSummary(dates, '2026-01-12').current.length, 1);
  assert.equal(seriesSummary(dates, '2026-01-13').current.length, 0);
});

test('record conservé hors de la fenêtre, égalité départagée par durée', () => {
  const result = seriesSummary(['2023-01-01', '2023-01-02', '2023-01-05', '2023-01-08'], '2026-10-14');
  assert.equal(result.record.length, 4);
  assert.equal(result.recordDuration, 8);
  const tied = seriesSummary(['2026-01-01', '2026-01-02', '2026-01-10', '2026-01-13'], '2026-01-13');
  assert.deepEqual(tied.record, ['2026-01-10', '2026-01-13']);
});

test('dates futures, doublons et dates impossibles ignorés dans les séries', () => {
  const result = seriesSummary(['2026-01-01', '2026-01-01', '2026-01-10', '2026-02-30'], '2026-01-02');
  assert.deepEqual(result.record, ['2026-01-01']);
  assert.equal(result.recordDuration, 1);
  assert.deepEqual(seriesSummary([], '2026-01-02').record, []);
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
