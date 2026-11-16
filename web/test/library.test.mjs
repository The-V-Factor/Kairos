import test from 'node:test';
import assert from 'node:assert/strict';
import { samplePlan, draftKey, validateDraft } from '../plan.mjs';
import { libraryKey, loadLibrary, storeLibrary, activeEntry, createPlan, updatePlan, updateDetails, selectPlan, duplicatePlan, deletePlan, restorePlan, recordExport, validateLibrary, validateDate } from '../library.mjs';

const day = '2026-11-13', now = '2026-11-13T09:00:00.000Z';
function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function setup() { const db = storage(); return { db, library: loadLibrary(db, day, now).library }; }

test('migrates the single draft once, preserving IDs, distances and custom fuel data', () => {
  const db = storage(), plan = samplePlan();
  plan.stops[0] = { ...plan.stops[0], kind: 'custom', name: '巧克力', reminder: '吃巧克力' };
  const old = JSON.stringify({ version: 1, plan }); db.setItem(draftKey, old);
  const loaded = loadLibrary(db, day, now);
  assert.equal(loaded.needsSave, true);
  assert.deepEqual(activeEntry(loaded.library).plan, validateDraft(plan));
  assert.equal(activeEntry(loaded.library).rideDate, day);
  assert.equal(storeLibrary(db, loaded.library), '');
  const reloaded = loadLibrary(db, '2026-11-14', now);
  assert.equal(reloaded.needsSave, false);
  assert.equal(reloaded.library.plans.length, 1);
  assert.deepEqual(reloaded.library, loaded.library);
  assert.equal(db.getItem(draftKey), old);
});

test('creating and switching plans isolates edits and restores the active plan after reload', () => {
  let { db, library } = setup();
  const first = structuredClone(activeEntry(library));
  library = createPlan(library, { name: '河堤', rideDate: '2026-11-14', totalDistanceMeters: 100000 }, now);
  const secondID = library.activePlanID;
  assert.equal(activeEntry(library).plan.stops.length, 0);
  library = updatePlan(library, { ...activeEntry(library).plan, totalDistanceMeters: 120000 }, now);
  assert.deepEqual(library.plans.find(p => p.plan.id === first.plan.id), first);
  library = selectPlan(library, first.plan.id);
  assert.deepEqual(activeEntry(library), first);
  library = selectPlan(library, secondID);
  storeLibrary(db, library);
  assert.equal(activeEntry(loadLibrary(db, day, now).library).plan.totalDistanceMeters, 120000);
});

test('rename and date changes affect only the requested entry', () => {
  let { library } = setup(); const first = structuredClone(activeEntry(library));
  library = createPlan(library, { name: '第二趟', rideDate: day, totalDistanceMeters: 80000 }, now);
  const second = structuredClone(activeEntry(library));
  library = updateDetails(library, first.plan.id, { name: '周末骑行', rideDate: '2026-11-15' }, now);
  assert.deepEqual(activeEntry(library), second);
  assert.equal(library.plans[0].name, '周末骑行');
  assert.deepEqual(library.plans[0].plan, first.plan);
});

test('copy gets a new plan and new point IDs, without changing distances or source', () => {
  let { library } = setup(); const original = structuredClone(activeEntry(library));
  library = duplicatePlan(library, original, { name: '周日副本', rideDate: '2026-11-15' }, now);
  const copy = activeEntry(library);
  assert.notEqual(copy.plan.id, original.plan.id);
  assert.deepEqual(copy.plan.stops.map(p => p.distanceMeters), original.plan.stops.map(p => p.distanceMeters));
  assert.ok(copy.plan.stops.every((p, i) => p.id !== original.plan.stops[i].id));
  assert.deepEqual(library.plans[0], original);
});

test('history is an immutable export snapshot; renaming, editing and deleting do not rewrite it', () => {
  let { library } = setup(); const original = structuredClone(activeEntry(library));
  library = recordExport(library, original, 'download', now);
  const snapshot = structuredClone(library.history[0]);
  library = updateDetails(library, original.plan.id, { name: '已改名', rideDate: '2026-11-20' }, now);
  library = updatePlan(library, { ...activeEntry(library).plan, stops: activeEntry(library).plan.stops.slice(1) }, now);
  library = deletePlan(library, original.plan.id);
  assert.deepEqual(library.history[0], snapshot);
  assert.equal(library.activePlanID, null);
  library = duplicatePlan(library, snapshot, { name: '历史复用', rideDate: day }, now);
  assert.deepEqual(activeEntry(library).plan.stops.map(s => s.reminder), original.plan.stops.map(s => s.reminder));
  assert.notEqual(activeEntry(library).plan.id, snapshot.plan.id);
  assert.deepEqual(library.history[0], snapshot);
});

test('same export version is deduplicated but changed contents retain separate versions', () => {
  let { library } = setup();
  library = recordExport(library, activeEntry(library), 'download', now);
  const id = library.history[0].id;
  library = recordExport(library, activeEntry(library), 'share', '2026-11-13T10:00:00.000Z');
  assert.equal(library.history.length, 1);
  assert.equal(library.history[0].id, id);
  assert.equal(library.history[0].method, 'share');
  assert.equal(library.history[0].exportedAt, '2026-11-13T10:00:00.000Z');
  library = updatePlan(library, { ...activeEntry(library).plan, stops: activeEntry(library).plan.stops.slice(1) }, now);
  library = recordExport(library, activeEntry(library), 'download', now);
  assert.equal(library.history.length, 2);
});

test('deleting the active or last plan preserves history and can be undone', () => {
  let { library, db } = setup(); const original = structuredClone(activeEntry(library));
  library = createPlan(library, { name: '另一份', rideDate: day, totalDistanceMeters: 50000 }, now);
  const second = activeEntry(library);
  library = deletePlan(library, second.plan.id);
  assert.equal(library.activePlanID, original.plan.id);
  library = deletePlan(library, original.plan.id);
  assert.equal(activeEntry(library), null);
  storeLibrary(db, library);
  assert.equal(loadLibrary(db, day, now).library.plans.length, 0);
  library = restorePlan(library, original);
  assert.deepEqual(activeEntry(library), original);
  assert.throws(() => restorePlan(library, original));
});

test('invalid dates, names, duplicate IDs and missing active references are rejected', () => {
  const { library } = setup();
  assert.equal(validateDate('2028-02-29'), '2028-02-29');
  for (const date of ['2026-02-29', '2026-11-31', '2026-1-2', 'invalid']) assert.throws(() => validateDate(date));
  for (const name of ['', '  ', 'a'.repeat(61)]) assert.throws(() => createPlan(library, { name, rideDate: day, totalDistanceMeters: 1000 }, now));
  assert.throws(() => validateLibrary({ ...library, activePlanID: 'missing' }));
  assert.throws(() => validateLibrary({ ...library, plans: [...library.plans, library.plans[0]] }));
  assert.throws(() => recordExport(library, activeEntry(library), 'completed', now));
  assert.throws(() => updatePlan(library, { ...activeEntry(library).plan, id: samplePlan().id }, now));
});

test('damaged or future library data stays untouched instead of falling back and overwriting it', () => {
  for (const raw of ['{broken', JSON.stringify({ version: 99 })]) {
    const db = storage(); db.setItem(libraryKey, raw);
    const loaded = loadLibrary(db, day, now);
    assert.equal(loaded.writable, false);
    assert.equal(loaded.needsSave, false);
    assert.ok(loaded.message);
    assert.equal(db.getItem(libraryKey), raw);
  }
  const db = storage(); db.setItem(draftKey, '{broken');
  assert.equal(loadLibrary(db, day, now).writable, false);
  assert.equal(db.getItem(draftKey), '{broken');
});

test('denied storage is reported, does not claim persistence, and keeps the in-memory plan usable', () => {
  const denied = { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } };
  const loaded = loadLibrary(denied, day, now);
  assert.equal(loaded.writable, false);
  assert.ok(activeEntry(loaded.library));
  const before = structuredClone(loaded.library);
  assert.ok(storeLibrary(denied, loaded.library));
  assert.deepEqual(loaded.library, before);
});
