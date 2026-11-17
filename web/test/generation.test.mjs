import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, examples } from '../fueling-model.mjs';
import { initialRecipe, calculateRecipe, generatedLibrary, revision, writeTransfer, readTransfer, transferKey } from '../generation.mjs';
import { loadLibrary, activeEntry, validateLibrary, updateDetails, createPlan } from '../library.mjs';
import { encodeWorkout, workoutSteps, validatePlan } from '../workout.mjs';
import { routePoints } from '../routes.mjs';

function setup() {
  const library = loadLibrary({ getItem: () => null }, '2026-11-17').library;
  const recipe = { ...initialRecipe(activeEntry(library), defaults), mode: 'simulation', ...structuredClone(examples.climb), parameters: { ...defaults } };
  return { library, recipe };
}
test('generation creates a separately editable plan without changing the original, exports or rider profile', () => {
  const { library, recipe } = setup(), before = structuredClone(library);
  const next = generatedLibrary(library, recipe), created = activeEntry(next), { ride, schedule } = calculateRecipe(recipe, activeEntry(library));
  assert.deepEqual(library, before);
  assert.deepEqual(next.plans[0], before.plans[0]);
  assert.deepEqual(next.history, before.history);
  assert.notEqual(created.plan.id, before.activePlanID);
  assert.equal(created.rideDate, before.plans[0].rideDate);
  assert.equal(created.plan.totalDistanceMeters, ride.totalDistanceMeters);
  assert.deepEqual(created.plan.stops.map(s => [s.distanceMeters, s.reminder]), schedule.stops.map(s => [s.distanceMeters, s.reminder]));
  assert.deepEqual(validateLibrary(JSON.parse(JSON.stringify(next))), next);
  assert.ok(encodeWorkout(created.plan).length > 0);
  assert.deepEqual(validatePlan(created.plan).stops.map(s => s.distanceMeters), schedule.stops.map(s => s.distanceMeters));
  assert.equal(workoutSteps(created.plan).filter(s => s.distanceMeters !== null).reduce((sum, s) => sum + s.distanceMeters, 0), 30000);
});
test('stale preview cannot be saved after source details or plan changes', () => {
  const { library, recipe } = setup();
  const changed = updateDetails(library, library.activePlanID, { name: '新名字', rideDate: '2026-11-18' });
  assert.notEqual(revision(activeEntry(changed)), recipe.sourceRevision);
  assert.throws(() => generatedLibrary(changed, recipe), /更改/);
});
test('profile omissions never get silently filled with athlete sample values', () => {
  const { library } = setup(), recipe = initialRecipe(activeEntry(library), {});
  assert.equal(recipe.parameters.ftpWatts, null);
  assert.throws(() => calculateRecipe(recipe, activeEntry(library)), /FTP 和体重/);
});
test('sandbox transfer survives navigation but malformed data or unavailable storage cannot overwrite a plan', () => {
  const { recipe } = setup(), data = new Map(), storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  writeTransfer(storage, recipe); assert.deepEqual(readTransfer(storage), recipe);
  data.set(transferKey, '{bad'); assert.equal(readTransfer(storage), null);
  for (const value of [{ version: 1 }, { ...recipe, parameters: null }, { ...recipe, segments: [null] }]) {
    data.set(transferKey, JSON.stringify(value)); assert.equal(readTransfer(storage), null);
  }
  assert.throws(() => writeTransfer(storage, { ...recipe, parameters: { ...recipe.parameters, carbsPerHour: NaN } }), /无效/);
  assert.throws(() => writeTransfer({ setItem: () => { throw Error('quota'); } }, recipe), /原计划/);
});
test('model distance precision is the same as saved and exported distance', () => {
  const { library, recipe } = setup();
  recipe.segments = [{ distanceMeters: 30051, gradePercent: 0 }];
  const result = calculateRecipe(recipe, activeEntry(library));
  const created = activeEntry(generatedLibrary(library, recipe));
  assert.equal(result.ride.totalDistanceMeters, 30100);
  assert.equal(created.plan.totalDistanceMeters, 30100);
  assert.ok(created.plan.stops.every(stop => stop.distanceMeters <= 30100));
});
test('a standalone calculator preview can create a new plan without a source or saved profile', () => {
  const { library } = setup(), recipe = { ...initialRecipe(null, defaults), mode: 'simulation', ...structuredClone(examples.flat) };
  const result = calculateRecipe(recipe, null), next = generatedLibrary(library, recipe, '2026-11-17T12:00:00Z');
  assert.equal(next.plans.length, library.plans.length + 1);
  assert.equal(activeEntry(next).plan.totalDistanceMeters, result.ride.totalDistanceMeters);
  assert.deepEqual(next.plans.slice(0, -1), library.plans);
});
test('a route chosen during generation belongs only to the new plan, including when no plan exists yet', () => {
  const { library, recipe } = setup(), before = structuredClone(library);
  recipe.mode = 'route'; recipe.route = { source: 'igpsport-cn', id: '15', title: '暂存路线', author: '', region: '', distanceMeters: 20000, ascentMeters: 0,
    points: routePoints([{ latitude: 23, longitude: 113, elevationMeters: 0 }, { latitude: 23, longitude: 113.2, elevationMeters: 0 }]) };
  const next = generatedLibrary(library, recipe);
  assert.deepEqual(library, before); assert.deepEqual(next.plans[0], before.plans[0]);
  assert.equal(activeEntry(next).route.title, '暂存路线');
  assert.equal(activeEntry(next).plan.totalDistanceMeters, 20000);
  const empty = { version: 1, activePlanID: null, plans: [], history: [] };
  const first = generatedLibrary(empty, { ...recipe, sourceRevision: null });
  assert.equal(first.plans.length, 1); assert.equal(activeEntry(first).route.id, '15');
});

test('generation keeps the chosen source when another plan is active', () => {
  const { library, recipe } = setup();
  const other = createPlan(library, { name: '另一趟', rideDate: '2026-11-20', totalDistanceMeters: 40000 });
  const next = generatedLibrary(other, recipe);
  assert.equal(activeEntry(next).name, `${activeEntry(library).name} · 自动补给`);
  assert.equal(activeEntry(next).rideDate, activeEntry(library).rideDate);
  assert.deepEqual(next.plans.slice(0, -1), other.plans);
});

test('entered name and date survive calculator transfer and generation without renaming the source', () => {
  const { library, recipe } = setup(), before = structuredClone(library);
  recipe.details = { name: '南昆山周末骑', rideDate: '2026-11-21' };
  const memory = new Map(), storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  writeTransfer(storage, recipe);
  const next = generatedLibrary(library, readTransfer(storage));
  assert.equal(activeEntry(next).name, recipe.details.name);
  assert.equal(activeEntry(next).rideDate, recipe.details.rideDate);
  assert.deepEqual(library, before);
  assert.throws(() => generatedLibrary(library, { ...recipe, details: { ...recipe.details, name: ' ' } }));
});
