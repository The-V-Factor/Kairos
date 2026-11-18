import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTerrain, routeTerrain, rideTerrain, entryTerrain, elevationAt, terrainDomain, visibleTerrain } from '../terrain.mjs';
import { defaults, examples, estimateRide } from '../fueling-model.mjs';

const route = { distanceMeters: 20000, points: [{ distanceMeters: 0, elevationMeters: 100 }, { distanceMeters: 1000, elevationMeters: 500 }, { distanceMeters: 2000, elevationMeters: 200 }] };
test('route elevation is interpolated at cumulative distance, normalized only to provider route distance', () => {
  const before = structuredClone(route), profile = routeTerrain(route);
  assert.equal(elevationAt(profile, 0), 100); assert.equal(elevationAt(profile, 5000), 300);
  assert.equal(elevationAt(profile, 20000), 200); assert.equal(elevationAt(profile, 20001), null);
  assert.equal(elevationAt(null, 100), null); assert.deepEqual(route, before);
  assert.equal(entryTerrain({ route, plan: { totalDistanceMeters: 10000 } }).distanceMeters, 20000);
  assert.equal(elevationAt(entryTerrain({ route }), 10000), 500);
});
test('unknown elevation stays unknown and zero-distance GPS duplicates are normalized', () => {
  assert.equal(routeTerrain({ ...route, points: [{ distanceMeters: 0, elevationMeters: null }, ...route.points.slice(1)] }), null);
  assert.equal(routeTerrain({ ...route, points: [{ distanceMeters: 0, elevationMeters: 32768 }, ...route.points.slice(1)] }), null);
  const repeated = routeTerrain({ ...route, points: [route.points[0], { distanceMeters: 0, elevationMeters: 110 }, ...route.points.slice(1)] });
  assert.equal(repeated.points.length, 3); assert.equal(elevationAt(repeated, 0), 110);
});
test('full-size supported routes retain their terrain without argument-count overflow', () => {
  const profile = routeTerrain({ distanceMeters: 200000, points: Array.from({ length: 100000 }, (_, i) => ({ distanceMeters: i, elevationMeters: i % 1000 })) });
  assert.equal(profile.points.length, 100000);
  assert.equal(terrainDomain(profile).top, 1000);
  assert.ok(visibleTerrain(profile, 0, 200000).length < 400);
});
test('profile serialization rejects bad order, versions, missing endpoints and non-finite values', () => {
  const valid = routeTerrain(route); assert.deepEqual(validateTerrain(JSON.parse(JSON.stringify(valid))), valid);
  for (const invalid of [{ ...valid, version: 2 }, { ...valid, source: 'other' }, { ...valid, distanceMeters: NaN },
    { ...valid, points: [...valid.points].reverse() }, { ...valid, points: valid.points.slice(1) },
    { ...valid, points: [{ ...valid.points[0], elevationMeters: null }, ...valid.points.slice(1)] }]) assert.throws(() => validateTerrain(invalid));
});
test('decimation preserves narrow peaks and every arbitrary marker/cursor anchor exactly', () => {
  const profile = validateTerrain({ version: 1, source: 'simulation', distanceMeters: 9999,
    points: Array.from({ length: 10000 }, (_, i) => ({ distanceMeters: i, elevationMeters: i === 4431 ? 1200 : i % 43 })) });
  const anchors = [100.5, 4431.2, 9000.1], points = visibleTerrain(profile, 100, 9500, anchors);
  assert.ok(points.length < 400); assert.ok(points.some(p => p.elevationMeters === 1200));
  for (const distance of anchors) assert.equal(points.find(p => p.distanceMeters === distance)?.elevationMeters, elevationAt(profile, distance));
  assert.equal(points[0].distanceMeters, 100); assert.equal(points.at(-1).distanceMeters, 9500);
  assert.deepEqual(terrainDomain(profile), { bottom: 0, top: 1500 });
  assert.ok(visibleTerrain(profile, 100, 200).every(p => p.elevationMeters < 1200));
  assert.equal(terrainDomain(profile).top, 1500);
  assert.deepEqual(visibleTerrain(profile, 10000, 12000), []);
});
test('simulation snapshots use the same normalized geometry after saving; real route display is not the model smoothing', () => {
  const ride = estimateRide(defaults, { mode: 'simulation', ...examples.climb });
  const profile = rideTerrain(ride);
  assert.equal(profile.source, 'simulation'); assert.equal(profile.distanceMeters, ride.totalDistanceMeters);
  assert.deepEqual(entryTerrain({ terrain: profile }), validateTerrain(profile));
  assert.deepEqual(rideTerrain(ride, route), routeTerrain(route));
  assert.ok(terrainDomain(rideTerrain(estimateRide(defaults, { mode: 'simulation', ...examples.flat }))).top > 0);
});
