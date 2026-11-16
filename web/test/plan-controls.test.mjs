import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDays, moveDate, kilometerOptions } from '../plan-controls.mjs';
import { activeEntry, loadLibrary, updateDetails, duplicatePlan, recordExport } from '../library.mjs';

test('calendar uses a Monday-first six-week grid with correct adjacent months', () => {
  const days = monthDays('2026-11-15');
  assert.equal(days.length, 42);
  assert.equal(days[0], '2026-10-26');
  assert.equal(days[20], '2026-11-15');
  assert.equal(days.at(-1), '2026-12-06');
  assert.equal(new Set(days).size, 42);
});

test('calendar navigation crosses leap days and year boundaries without rolling the chosen day', () => {
  assert.equal(moveDate('2028-01-31', 0, 1), '2028-02-29');
  assert.equal(moveDate('2027-01-31', 0, 1), '2027-02-28');
  assert.equal(moveDate('2028-02-29', 0, 12), '2029-02-28');
  assert.equal(moveDate('2026-12-31', 1), '2027-01-01');
  assert.equal(moveDate('2026-11-01', -1), '2026-10-31');
  assert.equal(moveDate('0001-01-01', -1), '0001-01-01');
  assert.equal(moveDate('9999-12-31', 1), '9999-12-31');
  assert.equal(monthDays('0001-01-01').filter(Boolean)[0], '0001-01-01');
  assert.equal(monthDays('9999-12-31').filter(Boolean).at(-1), '9999-12-31');
});

test('distance wheel has one kilometer steps and can recenter beyond the first window', () => {
  for (const km of [1, 75, 5000, 999999, 1000000]) {
    const options = kilometerOptions(km);
    assert.ok(options.includes(km));
    assert.ok(options.length <= 401);
    assert.ok(options.every((value, i) => value >= 1 && value <= 1e6 && (!i || value - options[i - 1] === 1)));
  }
  assert.ok(kilometerOptions(kilometerOptions(75).at(-1)).at(-1) > kilometerOptions(75).at(-1));
  for (const invalid of [0, -1, Infinity, NaN, 1000001]) assert.throws(() => kilometerOptions(invalid));
});

test('opening a wheel preserves previously saved fractional and sub-kilometer distances', () => {
  for (const km of [75.4, .5, .0001]) {
    const options = kilometerOptions(km);
    assert.equal(options.filter(value => value === km).length, 1);
    assert.equal(options.filter(value => !Number.isInteger(value)).length, 1);
    assert.ok(options.includes(Math.ceil(km)));
  }
});

test('unified editing saves name, date and total atomically without moving points or changing history', () => {
  let library = loadLibrary({ getItem: () => null }, '2026-11-13').library;
  const source = structuredClone(activeEntry(library));
  library = recordExport(library, source, 'download');
  const before = structuredClone(library);
  assert.throws(() => updateDetails(library, source.plan.id, { name: '不能保存', rideDate: '2026-11-15', totalDistanceMeters: 20000 }));
  assert.deepEqual(library, before);
  library = updateDetails(library, source.plan.id, { name: '周末河堤', rideDate: '2026-11-15', totalDistanceMeters: 100000 });
  assert.equal(activeEntry(library).name, '周末河堤');
  assert.equal(activeEntry(library).rideDate, '2026-11-15');
  assert.equal(activeEntry(library).plan.totalDistanceMeters, 100000);
  assert.deepEqual(activeEntry(library).plan.stops, source.plan.stops);
  assert.deepEqual(library.history, before.history);
  const copy = duplicatePlan(library, source, { name: '副本', rideDate: '2026-11-16', totalDistanceMeters: 90000 });
  assert.equal(activeEntry(copy).plan.totalDistanceMeters, 90000);
  assert.notEqual(activeEntry(copy).plan.id, source.plan.id);
  assert.deepEqual(copy.plans[0], library.plans[0]);
});
