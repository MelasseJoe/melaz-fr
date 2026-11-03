import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFavorites, prioritizeDisruptions } from '../projets/en-route/favorites.js';
const favorite = n => ({ line: `line:IDFM:C9990${n}`, stop: `stop_area:IDFM:${n}` });
test('trois favoris au maximum, lignes uniques, arrêts obligatoires', () => {
  assert.deepEqual(validateFavorites(null), []);
  assert.deepEqual(validateFavorites([favorite(1), favorite(1), favorite(2), favorite(3), favorite(4)]), [favorite(1), favorite(2), favorite(3)]);
  assert.deepEqual(validateFavorites([{ line: 'a' }, null, { line: 'b', stop: '' }]), []);
});
test('les perturbations favorites passent devant, ordre réseau conservé dans chaque groupe', () => {
  const disruptions = [1, 2, 3, 4].map(n => ({ id: n, lines: [{ id: favorite(n).line }] }));
  assert.deepEqual(prioritizeDisruptions(disruptions, [favorite(4), favorite(2)]).map(item => item.id), [2, 4, 1, 3]);
  assert.deepEqual(disruptions.map(item => item.id), [1, 2, 3, 4]);
  assert.deepEqual(prioritizeDisruptions(disruptions, []).map(item => item.id), [1, 2, 3, 4]);
});
test('perturbation multi-lignes affichée une fois et prioritaire dès qu’une ligne est favorite', () => {
  const multi = { id: 'multi', lines: [{ id: favorite(1).line }, { id: favorite(3).line }] };
  const general = { id: 'general', lines: [] };
  assert.deepEqual(prioritizeDisruptions([general, multi], [favorite(3)]), [multi, general]);
});
