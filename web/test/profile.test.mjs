import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProfile, profileKey, validateProfile, loadProfile, storeProfile, ageFromBirthDate, profileFromIGPSPORT, profileChanges, mergeProfile } from '../profile.mjs';
import { loadLibrary, storeLibrary, activeEntry } from '../library.mjs';
import { encodeWorkout } from '../workout.mjs';

const manual = { sex: 'male', ageYears: 29, heightCm: 178, weightKg: 70, ftpWatts: null };
const now = new Date(2026, 10, 16, 12);
test('manual profile allows blanks and strips unrelated fields without inventing defaults', () => {
  assert.deepEqual(validateProfile({}), emptyProfile());
  assert.deepEqual(validateProfile({ ...manual, ageYears: '29', heightCm: '178', weightKg: '70.0', phone: 'not-retained' }), manual);
  for (const value of [{ sex: 'unknown' }, { ageYears: -1 }, { ageYears: 151 }, { ageYears: 29.5 }, { heightCm: 0 }, { weightKg: '1,000' }, { weightKg: true }, { weightKg: Infinity }, { ftpWatts: 0 }, { ftpWatts: 235.5 }]) assert.throws(() => validateProfile(value));
});
test('birthday age respects the birthday, leap years, invalid and future dates', () => {
  assert.equal(ageFromBirthDate('1997-11-16', now), 29);
  assert.equal(ageFromBirthDate('1997-11-17T00:00:00', now), 28);
  assert.equal(ageFromBirthDate('2000-02-29', new Date(2026, 1, 28, 12)), 25);
  assert.equal(ageFromBirthDate('2000-02-29', new Date(2026, 2, 1, 12)), 26);
  for (const value of ['', null, '2025-02-29', '2026-13-01', '2027-01-01', '0001-01-01', '1997-11-16junk']) assert.equal(ageFromBirthDate(value, now), null);
});
test('import maps documented metric fields, ignores unknowns and never retains the raw birthday or account data', () => {
  const imported = profileFromIGPSPORT({ sex: 2, height: 178, weight: 68.5, birthDate: '1997-11-16', ftp: 235, phone: 'not-retained', nickName: 'not-retained', unitWeight: 1 }, now);
  assert.deepEqual(imported, { sex: 'female', heightCm: 178, weightKg: 68.5, ageYears: 29, ftpWatts: 235 });
  assert.deepEqual(profileFromIGPSPORT({ sex: 0, height: 0, weight: null, birthDate: '0001-01-01', ftp: -1 }, now), emptyProfile());
  assert.throws(() => profileFromIGPSPORT({ changedSchema: 1 }), /可识别/);
});
test('review only merges selected nonmissing fields and leaves manual values intact', () => {
  const imported = { ...manual, weightKg: 68.5, ftpWatts: 235 };
  assert.deepEqual(profileChanges(manual, imported).filter(field => !field.same && field.value !== null).map(field => field.key), ['weightKg', 'ftpWatts']);
  assert.deepEqual(mergeProfile(manual, imported, ['ftpWatts']), { ...manual, ftpWatts: 235 });
  assert.deepEqual(mergeProfile(manual, emptyProfile(), ['weightKg', 'sex']), manual);
  assert.deepEqual(mergeProfile(manual, imported, []), manual);
  assert.equal(manual.weightKg, 70);
});
test('one browser profile persists separately from every plan and exported workout', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const { library } = loadLibrary(storage); storeLibrary(storage, library);
  const libraryBefore = [...values], workoutBefore = encodeWorkout(activeEntry(library).plan);
  assert.equal(storeProfile(storage, { ...manual, phone: 'not-retained' }), '');
  assert.deepEqual(loadProfile(storage).profile, manual);
  assert.deepEqual([...values].filter(([key]) => key !== profileKey), libraryBefore);
  assert.deepEqual(encodeWorkout(activeEntry(library).plan), workoutBefore);
  assert.deepEqual(Object.keys(JSON.parse(values.get(profileKey))).sort(), ['version', ...Object.keys(manual)].sort());
});
test('corrupt, future-version and unavailable storage are visible and never overwritten on load', () => {
  for (const raw of ['{', 'null', '{"version":2}', '{"version":1,"ageYears":-1}']) {
    let writes = 0; const storage = { getItem: () => raw, setItem() { writes++; } };
    const loaded = loadProfile(storage); assert.equal(loaded.writable, false); assert.ok(loaded.message); assert.equal(writes, 0);
  }
  const denied = { getItem() { throw Error('Denied'); }, setItem() { throw Error('Quota'); } };
  assert.equal(loadProfile(denied).writable, false); assert.ok(storeProfile(denied, manual));
});
