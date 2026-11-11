import test from 'node:test';
import assert from 'node:assert/strict';
import { draftKey, samplePlan, parseDistance, validateDraft, saveStop, loadDraft, storeDraft, majorInterval } from '../plan.mjs';
import { encodeWorkout } from '../workout.mjs';

test('draft round trip keeps identity, custom names and exact fixed locations', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const plan = samplePlan();
  plan.stops[1] = { ...plan.stops[1], kind: 'custom', name: '巧克力', reminder: '吃巧克力' };
  assert.equal(storeDraft(storage, plan), '');
  const restored = loadDraft(storage);
  assert.deepEqual(restored.plan, validateDraft(plan));
  assert.deepEqual(encodeWorkout(restored.plan), encodeWorkout(plan));
  assert.equal(restored.writable, true);
});
test('editing a point and deleting a middle point never move other points', () => {
  const original = validateDraft(samplePlan());
  const changed = saveStop(original, { ...original.stops[1], distanceMeters: 45000, reminder: '喝电解质水' });
  assert.deepEqual(changed.stops.filter(s => s.id !== original.stops[1].id), original.stops.filter(s => s.id !== original.stops[1].id));
  const deleted = validateDraft({ ...changed, stops: changed.stops.filter(s => s.id !== original.stops[1].id) });
  assert.equal(deleted.stops[1].distanceMeters, 51100);
  assert.deepEqual(saveStop(deleted, changed.stops[1]), changed);
  assert.equal(original.stops[1].distanceMeters, 31600);
});
test('departure, endpoint and empty drafts are editable without zero distance intervals', () => {
  const plan = validateDraft(samplePlan());
  const empty = validateDraft({ ...plan, stops: [] });
  assert.deepEqual(empty.stops, []);
  assert.throws(() => encodeWorkout(empty));
  const start = { ...plan.stops[0], distanceMeters: 0 };
  const end = { ...plan.stops[1], distanceMeters: plan.totalDistanceMeters };
  assert.deepEqual(saveStop(saveStop(empty, start), end).stops.map(s => s.distanceMeters), [0, 75000]);
});
test('collisions, shrinking past a stop and incomplete custom names are rejected without mutating plan', () => {
  const plan = validateDraft(samplePlan());
  const before = structuredClone(plan);
  assert.throws(() => saveStop(plan, { ...plan.stops[1], distanceMeters: 14501 }));
  assert.throws(() => validateDraft({ ...plan, totalDistanceMeters: 50000 }));
  assert.throws(() => saveStop(plan, { ...plan.stops[0], kind: 'custom', name: ' ' }));
  assert.throws(() => validateDraft({ ...plan, stops: [plan.stops[0], { ...plan.stops[1], id: plan.stops[0].id }] }));
  assert.deepEqual(plan, before);
});
test('malformed, future-version and unavailable storage preserve the old contents', () => {
  for (const raw of ['{', JSON.stringify({ version: 2, plan: samplePlan() }), JSON.stringify({ version: 1, plan: {} })]) {
    let writes = 0;
    const storage = { getItem: () => raw, setItem: () => { writes++; } };
    assert.equal(loadDraft(storage).writable, false);
    assert.equal(writes, 0);
  }
  const unavailable = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(loadDraft(unavailable).writable, false);
  assert.ok(storeDraft(unavailable, samplePlan()).includes('未能保存'));
  assert.equal(loadDraft({ getItem: key => { assert.equal(key, draftKey); return null; } }).writable, true);
});
test('distance parsing uses the displayed one-decimal precision and rejects ambiguous input', () => {
  assert.equal(parseDistance('14.542', 'km'), 14500);
  assert.equal(parseDistance('542.15', 'm'), 542.2);
  assert.equal(parseDistance('0', 'km'), 0);
  for (const text of ['', '-1', '1,000', '1e3', '75km', 'Infinity']) assert.throws(() => parseDistance(text, 'km'));
});
test('ruler labels follow whole 1/2/5 intervals as total and zoom change', () => {
  assert.equal(majorInterval(75000), 20000);
  assert.equal(majorInterval(100000), 50000);
  assert.equal(majorInterval(75000 / 4), 5000);
  assert.equal(majorInterval(1000), 500);
  assert.equal(majorInterval(1), 1);
});
