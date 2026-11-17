import test from 'node:test';
import assert from 'node:assert/strict';
import { gelsKey, validateGel, loadGels, storeGels, gelChoices } from '../gels.mjs';
import { loadLibrary, activeEntry, createPlan, duplicatePlan, recordExport, validateLibrary, updatePlan } from '../library.mjs';
import { initialRecipe, calculateRecipe, generatedLibrary } from '../generation.mjs';
import { defaults, examples } from '../fueling-model.mjs';
import { newID } from '../plan.mjs';

test('personal gels store several actual products with no fabricated defaults', () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(loadGels(storage).catalog.items, []);
  const items = [30, 40, 45].map(carbsGrams => validateGel({ id: newID(), name: `胶${carbsGrams}`, carbsGrams }));
  assert.equal(storeGels(storage, { version: 1, items }), '');
  assert.deepEqual(loadGels(storage).catalog.items, items);
  assert.deepEqual([...data.keys()], [gelsKey]);
  for (const carbsGrams of [0, 1, 4.9, -1, NaN, Infinity, 101, 25.55, '45']) assert.throws(() => validateGel({ ...items[0], carbsGrams }));
  assert.throws(() => validateGel({ ...items[0], name: ' ' }));
});
test('damaged and unavailable gel storage stays protected; failed writes do not report success', () => {
  for (const raw of ['{bad', '{"version":2,"items":[]}', '{"version":1,"items":[{}]}']) {
    assert.equal(loadGels({ getItem: () => raw }).writable, false);
  }
  assert.equal(loadGels({ getItem: () => { throw Error('denied'); } }).writable, false);
  assert.notEqual(storeGels({ setItem: () => { throw Error('quota'); } }, { version: 1, items: [] }), '');
});
test('editing or deleting a personal product leaves plan and export snapshots intact', () => {
  let library = loadLibrary({ getItem: () => null }).library;
  const gel = validateGel({ id: newID(), name: '我的胶', carbsGrams: 30 });
  library = createPlan(library, { name: '周末骑', rideDate: '2026-11-21', totalDistanceMeters: 10000, gel });
  library = updatePlan(library, { ...activeEntry(library).plan, stops: [{ id: newID(), kind: 'gel', name: '', reminder: '吃胶', distanceMeters: 5000 }] });
  const source = activeEntry(library);
  const copied = duplicatePlan(library, source, { name: '副本', rideDate: '2026-11-22' });
  assert.deepEqual(activeEntry(copied).gel, gel);
  const exported = recordExport(library, source, 'download');
  assert.deepEqual(exported.history[0].gel, gel);
  const changed = { ...gel, name: '改名', carbsGrams: 45 };
  assert.equal(gelChoices([changed], gel).selected, 'snapshot');
  assert.deepEqual(gelChoices([], gel).choices[0].gel, gel);
  assert.deepEqual(validateLibrary(JSON.parse(JSON.stringify(exported))).history[0].gel, gel);
  assert.deepEqual(source.gel, gel);
});
test('the selected product governs gel count even when stale numeric parameters disagree', () => {
  const gel = validateGel({ id: newID(), name: '30g胶', carbsGrams: 30 });
  const library = loadLibrary({ getItem: () => null }).library;
  const recipe = { ...initialRecipe(activeEntry(library), defaults), mode: 'simulation', ...examples.climb,
    gel, parameters: { ...defaults, carbsPerHour: 60, gelCarbsGrams: 45 } };
  const result = calculateRecipe(recipe, activeEntry(library));
  assert.equal(result.ride.parameters.gelCarbsGrams, 30);
  assert.equal(result.schedule.plannedCarbsGrams, result.schedule.gelCount * 30);
  const saved = activeEntry(generatedLibrary(library, recipe));
  assert.deepEqual(saved.gel, gel);
  assert.deepEqual(saved.plan.stops.map(stop => stop.distanceMeters), result.schedule.stops.map(stop => stop.distanceMeters));
});
