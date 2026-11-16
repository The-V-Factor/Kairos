import test from 'node:test';
import assert from 'node:assert/strict';
import { routeDetail, routePoints, routeSummary, validateRoute, previewLines } from '../routes.mjs';
import { loadLibrary, activeEntry, setRoute, createPlan, duplicatePlan, selectPlan, recordExport, updateDetails, storeLibrary } from '../library.mjs';
import { encodeWorkout } from '../workout.mjs';
import { qrSVG } from '../qr.mjs';

const route = () => routeDetail('123', { summary: { title: '松山湖', distance: 75000, totalAscent: 430, nickName: '骑友', region: '东莞' }, routeInfo: {
  tracks: [{ latitude: 23, longitute: 113, alt: 10 }, { latitude: 23.01, longitute: 113.02, alt: 60 }, { latitude: 23.02, longitute: 113.03, alt: 20 }],
} });
function storage() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; }

test('normalizes API spelling, numeric units and missing elevation without inventing terrain', () => {
  const value = route();
  assert.equal(value.points[0].longitude, 113); assert.equal(value.points[1].elevationMeters, 60);
  assert.equal(value.points[0].distanceMeters, 0); assert.ok(value.points[2].distanceMeters > value.points[1].distanceMeters);
  assert.equal(value.distanceMeters, 75000); assert.equal(value.ascentMeters, 430);
  assert.deepEqual(validateRoute(value), value);
  const points = routePoints([{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }]);
  assert.ok(Math.abs(points[1].distanceMeters - 111194.9) < .2);
  assert.equal(points[0].elevationMeters, null); assert.equal(previewLines(points).elevation, null);
  assert.equal(routeSummary({ id: 1, distance: '1000' }).ascentMeters, null);
});

test('rejects absent, out-of-range, oversized, empty and stationary tracks', () => {
  for (const values of [null, [], [{ latitude: 0, longitude: 1 }], Array(100001).fill({ latitude: 1, longitude: 1 }), [null, {}], [{ latitude: 91, longitude: 0 }, {}], [{ latitude: false, longitude: 0 }, {}], [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }]]) assert.throws(() => routePoints(values));
  for (const distance of [0, -1, '', null, 'infinite', Infinity]) assert.throws(() => routeSummary({ id: 1, distance }));
  assert.throws(() => routeDetail(1, null));
  assert.throws(() => validateRoute({ ...route(), source: 'unknown' }));
});

test('preview is derived from the actual track, stays within bounds and handles flat or partial heights', () => {
  const first = route(), second = route(); second.points[1].longitude += .5;
  const a = previewLines(first.points), b = previewLines(second.points);
  assert.notEqual(a.outline, b.outline); assert.ok(a.elevation);
  for (const pair of a.outline.split(' ')) { const [x, y] = pair.split(',').map(Number); assert.ok(x >= 20 && x <= 300 && y >= 16 && y <= 136); }
  assert.ok(!previewLines(first.points.map(p => ({ ...p, elevationMeters: 50 }))).elevation.includes('NaN'));
  first.points[1].elevationMeters = null; assert.equal(previewLines(first.points).elevation, null);
});

test('elevation axes use route distance and actual altitude, not cumulative ascent', () => {
  const value = route(), chart = previewLines(value.points, 75000);
  assert.deepEqual(chart.xTicks.map(tick => tick.label), ['0 km', '20 km', '40 km', '60 km', '75 km']);
  assert.equal(chart.xTicks[0].x, 42); assert.equal(chart.xTicks.at(-1).x, 304);
  assert.ok(chart.yTicks.some(tick => Number(tick.label) <= 10));
  assert.ok(chart.yTicks.some(tick => Number(tick.label) >= 60));
  assert.ok(chart.yTicks.every(tick => Number(tick.label) < value.ascentMeters));
  const plotted = chart.elevation.split(' ').map(pair => pair.split(',').map(Number));
  assert.equal(plotted[0][0], 42); assert.equal(plotted.at(-1)[0], 304);
});

test('axes include the exact final route distance and stay finite for flat or below-sea-level tracks', () => {
  const points = route().points;
  assert.equal(previewLines(points, 136800).xTicks.at(-1).label, '136.8 km');
  assert.equal(previewLines(points, 750).xTicks.at(-1).label, '750 m');
  for (const elevationMeters of [-3, 0, 100]) {
    const chart = previewLines(points.map(point => ({ ...point, elevationMeters })), 80000);
    assert.ok(chart.yTicks.length >= 2);
    assert.ok(Number(chart.yTicks[0].label) < elevationMeters);
    assert.ok(Number(chart.yTicks.at(-1).label) > elevationMeters);
    assert.ok(!/NaN|Infinity/.test(chart.elevation));
  }
});

test('axis range includes extrema outside the thinned drawing sample', () => {
  const points = Array.from({ length: 1500 }, (_, index) => ({ latitude: 23 + index * .0001, longitude: 113, distanceMeters: index * 10, elevationMeters: index === 1 ? 310 : 100 }));
  const chart = previewLines(points, 15000);
  assert.ok(Number(chart.yTicks.at(-1).label) >= 310);
});

test('selecting, reloading, copying and removing a route retain fixed nutrition points and isolate plans', () => {
  const db = storage(); let library = loadLibrary(db).library;
  const original = structuredClone(activeEntry(library)), beforeBytes = encodeWorkout(original.plan);
  library = setRoute(library, original.plan.id, route());
  assert.deepEqual(activeEntry(library).plan.stops, original.plan.stops);
  assert.deepEqual(encodeWorkout(activeEntry(library).plan), beforeBytes);
  assert.equal(storeLibrary(db, library), ''); library = loadLibrary(db).library;
  assert.deepEqual(activeEntry(library).route, route());
  library = recordExport(library, activeEntry(library), 'download'); const history = structuredClone(library.history[0]);
  library = duplicatePlan(library, activeEntry(library), { name: '副本', rideDate: original.rideDate });
  const copy = structuredClone(activeEntry(library)); assert.deepEqual(copy.route, route());
  library = setRoute(library, copy.plan.id, null);
  assert.equal(activeEntry(library).route, undefined); assert.equal(activeEntry(library).plan.totalDistanceMeters, copy.plan.totalDistanceMeters);
  assert.deepEqual(library.plans[0].route, route()); assert.deepEqual(library.history[0], history);
  library = selectPlan(library, original.plan.id);
  library = updateDetails(library, original.plan.id, { name: original.name, rideDate: original.rideDate, totalDistanceMeters: 80000 });
  assert.equal(activeEntry(library).plan.totalDistanceMeters, 80000); assert.equal(activeEntry(library).route.distanceMeters, 75000);
});

test('shorter routes and stale target IDs cannot move or remove existing stops', () => {
  const db = storage(); let library = loadLibrary(db).library;
  const before = structuredClone(library), id = library.activePlanID;
  assert.throws(() => setRoute(library, id, { ...route(), distanceMeters: 1000 }), /路线短于/);
  assert.deepEqual(library, before);
  library = createPlan(library, { name: '另一份', rideDate: '2026-11-16', totalDistanceMeters: 1000 });
  assert.throws(() => setRoute(library, id, route()), /已切换/);
});

test('QR SVG has an integer grid and quiet zone, and never embeds the challenge as executable text', () => {
  const svg = qrSVG('oauthKey=example&platform=web&type=analyzeWebLogin&deviceId=example');
  assert.ok(svg.includes('shape-rendering="crispEdges"')); assert.ok(svg.includes('fill="white"'));
  assert.match(svg, /M4,4h1v1h-1z/); assert.ok(!svg.includes('oauthKey='));
  const hostile = qrSVG('<script>alert(1)</script>');
  assert.ok(!hostile.includes('<script>')); assert.ok(!hostile.includes('alert(1)'));
});
