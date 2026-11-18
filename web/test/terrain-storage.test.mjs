import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary, activeEntry, validateLibrary, duplicatePlan, recordExport, setRoute, updateDetails } from '../library.mjs';
import { defaults, examples } from '../fueling-model.mjs';
import { initialRecipe, generatedLibrary, calculateRecipe } from '../generation.mjs';
import { entryTerrain, rideTerrain, elevationAt } from '../terrain.mjs';
import { loadHaptics, storeHaptics, hapticsKey } from '../haptics.mjs';

test('generated simulation, reload, copy and export history retain the preview profile without changing the old plan', () => {
  const library = loadLibrary({ getItem: () => null }).library;
  const recipe = { ...initialRecipe(activeEntry(library), defaults), ...examples.climb };
  const expected = rideTerrain(calculateRecipe(recipe, activeEntry(library)).ride);
  const next = generatedLibrary(library, recipe), created = activeEntry(next);
  assert.deepEqual(created.terrain, expected); assert.deepEqual(next.plans[0], library.plans[0]);
  const reloaded = validateLibrary(JSON.parse(JSON.stringify(next)));
  const copied = duplicatePlan(reloaded, activeEntry(reloaded), { name: '复制', rideDate: '2026-11-18' });
  assert.deepEqual(activeEntry(copied).terrain, expected);
  const exported = recordExport(copied, activeEntry(copied), 'download');
  assert.deepEqual(exported.history[0].terrain, expected);
  assert.deepEqual(activeEntry(duplicatePlan(exported, exported.history[0], { name: '历史复用', rideDate: '2026-11-19' })).terrain, expected);
});
test('changing plan length clips or extends the viewing range without stretching a saved hill', () => {
  const library = loadLibrary({ getItem: () => null }).library, recipe = { ...initialRecipe(activeEntry(library), defaults), ...examples.climb };
  const generated = generatedLibrary(library, recipe), entry = activeEntry(generated);
  const edited = updateDetails(generated, entry.plan.id, { name: entry.name, rideDate: entry.rideDate, totalDistanceMeters: 60000 });
  assert.ok(Math.abs(elevationAt(entryTerrain(activeEntry(edited)), 20000) - 10000 * Math.sin(Math.atan(.05))) < 1e-7);
  assert.equal(elevationAt(entryTerrain(activeEntry(edited)), 20000), elevationAt(entryTerrain(entry), 20000));
  assert.equal(elevationAt(entryTerrain(activeEntry(edited)), 40000), null);
  const withoutRoute = setRoute(edited, entry.plan.id, null);
  assert.equal(entryTerrain(activeEntry(withoutRoute)), null);
});
test('old libraries need no migration; malformed profile snapshots do not overwrite saved data', () => {
  const library = loadLibrary({ getItem: () => null }).library;
  assert.ok(!Object.hasOwn(activeEntry(validateLibrary(library)), 'terrain'));
  const bad = { ...library, plans: library.plans.map(p => ({ ...p, terrain: { version: 2 } })) };
  const loaded = loadLibrary({ getItem: () => JSON.stringify(bad) });
  assert.equal(loaded.writable, false); assert.ok(loaded.message.includes('未被覆盖'));
});
test('haptics default on, explicit off survives reload, broken or denied preferences do not block the ruler', () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(loadHaptics(storage), true);
  assert.equal(storeHaptics(storage, false), ''); assert.equal(loadHaptics(storage), false);
  assert.equal(storeHaptics(storage, true), ''); assert.equal(loadHaptics(storage), true);
  data.set(hapticsKey, '{bad'); assert.equal(loadHaptics(storage), true);
  assert.equal(loadHaptics({ getItem: () => { throw Error('denied'); } }), true);
  assert.ok(storeHaptics({ setItem: () => { throw Error('quota'); } }, false).includes('本次有效'));
});
