import test from 'node:test';
import assert from 'node:assert/strict';
import { elevationProfile } from '../routes.mjs';
import { visibleDistance } from '../elevation-chart.mjs';

const points = [
  { distanceMeters: 0, elevationMeters: 0 },
  { distanceMeters: 100, elevationMeters: 100 },
  { distanceMeters: 200, elevationMeters: 0 },
  { distanceMeters: 300, elevationMeters: 50 },
];
test('zoom and pan domains remain within the route, including floating-point boundary drift', () => {
  assert.deepEqual(visibleDistance({ k: 1, x: 0 }, 80000), [0, 80000]);
  assert.deepEqual(visibleDistance({ k: 2, x: -173 }, 80000), [20000, 60000]);
  assert.deepEqual(visibleDistance({ k: 2, x: 100000 }, 80000), [0, 40000]);
  assert.deepEqual(visibleDistance({ k: 2, x: -100000 }, 80000), [40000, 80000]);
  const range = visibleDistance({ k: 1.000000000000001, x: -.0000000001 }, 80000);
  assert.ok(range[0] >= 0 && range[1] <= 80000);
});
test('zoom interpolates exact window edges and rescales altitude using the visible segment', () => {
  const chart = elevationProfile(points, 3000, 500, 1500);
  assert.equal(chart.xTicks[0].label, '0.5 km'); assert.equal(chart.xTicks.at(-1).label, '1.5 km');
  const plot = chart.elevation.split(' ').map(pair => pair.split(',').map(Number));
  assert.equal(plot[0][0], 42); assert.equal(plot.at(-1)[0], 304);
  assert.equal(plot[0][1], plot.at(-1)[1]);
  assert.ok(Math.min(...plot.map(point => point[1])) < plot[0][1]);
  const flatter = elevationProfile(points, 3000, 2100, 2500);
  assert.ok(Number(flatter.yTicks.at(-1).label) < 100);
});
test('full-track min/max sampling preserves a one-point summit and zoom retrieves its original detail', () => {
  const dense = Array.from({ length: 10000 }, (_, i) => ({ distanceMeters: i, elevationMeters: i === 5001 ? 500 : 0 }));
  const full = elevationProfile(dense, 9999);
  assert.ok(full.elevation.split(' ').some(pair => pair.endsWith(',18.0')));
  const detail = elevationProfile(dense, 9999, 5000, 5002);
  const ys = detail.elevation.split(' ').map(pair => Number(pair.split(',')[1]));
  assert.ok(ys.includes(18)); assert.ok(ys.includes(78));
});
test('reset yields the same overview, flat tracks stay finite, and absent elevation stays unavailable', () => {
  const before = elevationProfile(points, 3000);
  elevationProfile(points, 3000, 1000, 2000);
  assert.deepEqual(elevationProfile(points, 3000), before);
  const flat = elevationProfile(points.map(point => ({ ...point, elevationMeters: -3 })), 3000, 500, 1500);
  assert.ok(!/NaN|Infinity/.test(flat.elevation));
  assert.equal(elevationProfile([{ ...points[0], elevationMeters: null }, points[1]], 1000).elevation, null);
  for (const range of [[-1, 100], [0, 4000], [100, 100], [NaN, 100]]) assert.throws(() => elevationProfile(points, 3000, ...range));
});
