import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWorkout, validatePlan, workoutSteps } from '../workout.mjs';
import { sharePrepared, shareSupport } from '../share.mjs';

const plan = {
  id: '00000000-0000-4000-8000-000000000004', totalDistanceMeters: 1000,
  stops: [
    { distanceMeters: 0, reminder: '出发前喝水' },
    { distanceMeters: 200, reminder: '喝水' },
    { distanceMeters: 400, reminder: '吃胶' },
    { distanceMeters: 1000, reminder: '吃巧克力' },
  ],
};

test('absolute positions become distance differences; reminders begin at the requested position', () => {
  assert.deepEqual(workoutSteps(plan), [
    { distanceMeters: 200, name: '0.0m 出发前喝水' },
    { distanceMeters: 200, name: '200.0m 喝水' },
    { distanceMeters: 600, name: '400.0m 吃胶' },
    { distanceMeters: null, name: '1.0km 吃巧克力 · 计划完成，继续骑行' },
  ]);
});
test('deleting the middle point leaves the endpoint at its original position', () => {
  const changed = { ...plan, stops: plan.stops.filter(stop => stop.distanceMeters !== 400) };
  assert.deepEqual(workoutSteps(changed).map(step => step.distanceMeters), [200, 800, null]);
  assert.equal(changed.stops.at(-1).distanceMeters, 1000);
});
test('departure-only and endpoint-only plans have no zero distance intervals', () => {
  for (const stop of [plan.stops[0], plan.stops.at(-1)]) {
    assert.deepEqual(workoutSteps({ ...plan, stops: [stop] }).map(step => step.distanceMeters), [1000, null]);
  }
});
test('a tail reaches the total before the final open step', () => {
  assert.deepEqual(workoutSteps({ ...plan, stops: [plan.stops[1]] }), [
    { distanceMeters: 200, name: '骑行' },
    { distanceMeters: 800, name: '200.0m 喝水' },
    { distanceMeters: null, name: '1.0km 计划完成，继续骑行' },
  ]);
});
test('normalizes precision, sorts points and keeps the caller input unchanged', () => {
  const input = { ...plan, totalDistanceMeters: 75001, stops: [{ distanceMeters: 25001, reminder: ' 吃胶 ' }, plan.stops[0]] };
  const normalized = validatePlan(input);
  assert.equal(normalized.totalDistanceMeters, 75000);
  assert.deepEqual(normalized.stops.map(stop => stop.distanceMeters), [0, 25000]);
  assert.equal(input.stops[0].distanceMeters, 25001);
});
test('invalid distances, bounds, blank names, duplicate rounded positions and malformed ids are rejected', () => {
  for (const value of [-1, NaN, Infinity, '1000', 0, 1e12]) {
    assert.throws(() => encodeWorkout({ ...plan, totalDistanceMeters: value }));
  }
  for (const stops of [[], [{ distanceMeters: 1200, reminder: '喝水' }],
    [{ distanceMeters: 0, reminder: ' ' }],
    [{ distanceMeters: 1000, reminder: '喝水' }, { distanceMeters: 1001, reminder: '吃胶' }]]) {
    assert.throws(() => encodeWorkout({ ...plan, stops }));
  }
  assert.throws(() => encodeWorkout({ ...plan, id: 'invalid' }));
  assert.throws(() => encodeWorkout({ ...plan, stops: [{ distanceMeters: 0, reminder: '水'.repeat(214) }] }));
});
test('file is binary, deterministic for the same plan and includes UTF-8 reminders', () => {
  const bytes = encodeWorkout(plan);
  assert.equal(bytes[0], 74); // WorkoutPlan UUID is protobuf field 9, wire type 2.
  assert.deepEqual(bytes, encodeWorkout(plan));
  assert.ok(new TextDecoder().decode(bytes).includes('喝水'));
  assert.equal(bytes[0] === '{'.charCodeAt(0), false);
});

test('share sends the prepared file synchronously before yielding, without URL or text', async () => {
  const file = new File([encodeWorkout(plan)], 'Kairos.workout', { type: 'application/octet-stream' });
  let shared;
  let finish;
  const nav = { canShare: () => true, share(data) { shared = data; return new Promise(resolve => { finish = resolve; }); } };
  const pending = sharePrepared(file, nav, true);
  assert.deepEqual(shared, { files: [file] });
  finish();
  assert.equal((await pending).state, 'handed-off');
});
test('unsupported type, insecure context and missing API never call share', async () => {
  let calls = 0;
  const nav = { canShare: () => false, share() { calls++; } };
  assert.equal((await sharePrepared({}, nav, true)).state, 'unsupported');
  assert.equal(shareSupport({}, { ...nav, canShare: () => true }, false).ok, false);
  assert.equal(shareSupport({}, {}, true).ok, false);
  assert.equal(calls, 0);
});
test('cancel and permission failure do not become import success', async () => {
  for (const [name, state] of [['AbortError', 'cancelled'], ['NotAllowedError', 'failed']]) {
    const nav = { canShare: () => true, async share() { throw new DOMException('test', name); } };
    assert.equal((await sharePrepared({}, nav, true)).state, state);
  }
});
