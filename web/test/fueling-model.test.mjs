import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, parameters, examples, estimateRide, routeSegments, distanceAtTime, scheduleFuel, recommendCarbs } from '../fueling-model.mjs';

const scenario = (key = 'climb') => ({ mode: 'simulation', ...structuredClone(examples[key]) });
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test('physics regression: 175 W, 80 kg, flat/uphill/flat has the independently calculated speeds and time', () => {
  const ride = estimateRide(defaults, scenario());
  near(ride.segments[0].speedMps * 3.6, 32.5729, .01);
  near(ride.segments[1].speedMps * 3.6, 13.6261, .01);
  near(ride.elapsedSeconds / 60, 80.87, .01);
  near(ride.calories, 922.5, 1);
  near(distanceAtTime(ride, 1800), 12630, 30);
  near(distanceAtTime(ride, 3600), 19440, 30);
  assert.deepEqual(ride, estimateRide(defaults, scenario()));
});
test('speed solves the physical power balance; power, load, drag and rolling resistance change time in the expected direction', () => {
  const ride = estimateRide(defaults, scenario('flat')), s = ride.segments[0], v = s.speedMps;
  near((80 * 9.81 * .004 + .5 * 1.2 * .32 * v ** 2) * v, 175 * .975, .00001);
  assert.ok(estimateRide({ ...defaults, ftpWatts: 300 }, scenario('flat')).elapsedSeconds < ride.elapsedSeconds);
  assert.ok(estimateRide({ ...defaults, cda: .5 }, scenario('flat')).elapsedSeconds > ride.elapsedSeconds);
  assert.ok(estimateRide({ ...defaults, crr: .01 }, scenario('flat')).elapsedSeconds > ride.elapsedSeconds);
  assert.ok(estimateRide({ ...defaults, weightKg: 90 }, scenario()).elapsedSeconds > estimateRide(defaults, scenario()).elapsedSeconds);
});
test('downhill obeys a speed limit, permits coasting and never subtracts negative calories', () => {
  const ride = estimateRide({ ...defaults, maxSpeedKph: 40 }, scenario('descent'));
  near(ride.averageKph, 40, .001);
  assert.equal(ride.segments[0].coasting, true);
  assert.equal(ride.mechanicalKJ, 0);
  assert.equal(ride.calories, 0);
  assert.ok(ride.warnings.some(value => value.includes('滑行')));
});
test('each segment length affects time; ascent distribution is not replaced by average ascent', () => {
  const short = estimateRide(defaults, { mode: 'simulation', segments: [{ distanceMeters: 10000, gradePercent: 0 }] });
  const long = estimateRide(defaults, { mode: 'simulation', segments: [{ distanceMeters: 20000, gradePercent: 0 }] });
  near(long.elapsedSeconds, 2 * short.elapsedSeconds, .0001);
  const forward = estimateRide(defaults, scenario()), reverse = estimateRide(defaults, { mode: 'simulation', segments: [examples.climb.segments[1], { distanceMeters: 20000, gradePercent: 0 }] });
  near(forward.elapsedSeconds, reverse.elapsedSeconds, .0001);
  assert.ok(Math.abs(distanceAtTime(forward, 1800) - distanceAtTime(reverse, 1800)) > 4000);
});
test('bad parameters and malformed simulations are explained rather than silently defaulted', () => {
  for (const input of [{ ftpWatts: NaN }, { effort: 0 }, { crr: 0 }, { bodyEfficiency: 2 }, { carbsPerHour: 100 }, { weightKg: '' }]) assert.throws(() => parameters(input));
  assert.throws(() => estimateRide(defaults, { mode: 'simulation', segments: [] }), /路段/);
  assert.throws(() => estimateRide(defaults, { mode: 'simulation', segments: [{ distanceMeters: 0, gradePercent: 0 }] }), /距离/);
});
test('route distance is normalised to the provider total, noise is smoothed and source is immutable', () => {
  const route = { title: '合成路书', distanceMeters: 20000, points: Array.from({ length: 101 }, (_, i) => ({ distanceMeters: i * 100, elevationMeters: i + (i % 2 ? 1 : -1) })) };
  const before = structuredClone(route), segments = routeSegments(route);
  assert.equal(segments.at(-1).endMeters, 20000);
  assert.ok(segments.length <= 10000);
  assert.deepEqual(route, before);
  const ride = estimateRide(defaults, { mode: 'route', route });
  assert.equal(ride.totalDistanceMeters, 20000);
  assert.equal(ride.routeTitle, '合成路书');
});
test('missing or spurious elevation and decreasing cumulative distances are not treated as flat road', () => {
  for (const points of [
    [{ distanceMeters: 0, elevationMeters: null }, { distanceMeters: 100, elevationMeters: 1 }],
    [{ distanceMeters: 0, elevationMeters: 0 }, { distanceMeters: 100, elevationMeters: 1000 }],
    [{ distanceMeters: 0, elevationMeters: 0 }, { distanceMeters: 100, elevationMeters: 1 }, { distanceMeters: 90, elevationMeters: 1 }],
  ]) assert.throws(() => routeSegments({ distanceMeters: 100, points }));
});
test('time-to-distance mapping is bounded and uses each segment speed instead of mean speed', () => {
  const ride = estimateRide(defaults, scenario());
  assert.equal(distanceAtTime(ride, -1), 0);
  near(distanceAtTime(ride, 1e9), 30000, .0001);
  assert.ok(Math.abs(distanceAtTime(ride, 1800) - ride.averageKph / 3.6 * 1800) > 1000);
});
test('fuel schedule uses carbohydrate grams and time; identical energy does not dictate gel count', () => {
  const ride = estimateRide({ ...defaults, carbsPerHour: 50 }, scenario()), schedule = scheduleFuel(ride);
  assert.equal(schedule.gelCount, 3);
  assert.equal(schedule.plannedCarbsGrams, 75);
  const changedEfficiency = estimateRide({ ...defaults, carbsPerHour: 50, bodyEfficiency: .18 }, scenario());
  assert.notEqual(changedEfficiency.calories, ride.calories);
  assert.deepEqual(scheduleFuel(changedEfficiency), schedule);
  assert.ok(scheduleFuel(estimateRide({ ...defaults, carbsPerHour: 25 }, scenario())).gelCount < schedule.gelCount);
  assert.deepEqual(schedule, scheduleFuel(ride));
});
test('colliding reminders merge after rounding and preserve gel quantity and water', () => {
  const ride = estimateRide({ ...defaults, carbsPerHour: 50, waterIntervalMinutes: 15 }, scenario());
  const schedule = scheduleFuel(ride);
  assert.ok(schedule.stops.some(stop => stop.reminder.includes('吃胶') && stop.reminder.includes('喝水')));
  assert.equal(new Set(schedule.stops.map(stop => stop.distanceMeters)).size, schedule.stops.length);
  assert.equal(schedule.stops.reduce((sum, stop) => sum + stop.gels, 0), schedule.gelCount);
  assert.ok(schedule.stops.every(stop => stop.distanceMeters >= 0 && stop.distanceMeters <= ride.totalDistanceMeters));
});
test('short rides and disabled reminders do not invent a required supplement', () => {
  const ride = estimateRide({ ...defaults, waterIntervalMinutes: 0 }, { mode: 'simulation', segments: [{ distanceMeters: 1000, gradePercent: 0 }] });
  assert.equal(ride.carbsPerHour, 0);
  assert.equal(scheduleFuel(ride).stops.length, 0);
  assert.equal(recommendCarbs(2, .6), 30);
  assert.equal(recommendCarbs(2, .7), 50);
  assert.equal(recommendCarbs(2, .8), 60);
  assert.equal(recommendCarbs(4, .7), 60);
});
test('extreme reminders are bounded and never silently truncated', () => {
  const ride = estimateRide({ ...defaults, waterIntervalMinutes: .01 }, scenario());
  assert.throws(() => scheduleFuel(ride), /过多/);
});
