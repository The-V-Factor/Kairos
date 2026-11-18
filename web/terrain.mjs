import { majorInterval } from './plan.mjs';

// A profile describes cumulative route distance, never cumulative ascent.
export function validateTerrain(value) {
  if (value?.version !== 1 || !['route', 'simulation'].includes(value.source)
    || !Number.isFinite(value.distanceMeters) || value.distanceMeters <= 0 || value.distanceMeters > 1e9
    || !Array.isArray(value.points) || value.points.length < 2 || value.points.length > 100000) throw new Error('计划海拔数据无效。');
  const points = value.points.map(({ distanceMeters, elevationMeters } = {}) => {
    if (!Number.isFinite(distanceMeters) || !Number.isFinite(elevationMeters)
      || distanceMeters < 0 || distanceMeters > value.distanceMeters + .00001
      || Math.abs(elevationMeters) > 20000) throw new Error('计划海拔点无效。');
    return { distanceMeters, elevationMeters };
  });
  if (points[0].distanceMeters !== 0 || Math.abs(points.at(-1).distanceMeters - value.distanceMeters) > .00001
    || points.some((p, i) => i && p.distanceMeters <= points[i - 1].distanceMeters)) throw new Error('计划海拔里程顺序无效。');
  return { version: 1, source: value.source, distanceMeters: value.distanceMeters, points };
}
function unique(points) {
  const result = [];
  for (const point of points) {
    if (result.at(-1)?.distanceMeters === point.distanceMeters) result[result.length - 1] = point;
    else result.push(point);
  }
  return result;
}
export function routeTerrain(route) {
  if (!route || route.points.length < 2 || route.points.some(p => !Number.isFinite(p.elevationMeters) || Math.abs(p.elevationMeters) > 20000)) return null;
  const length = route.points.at(-1).distanceMeters;
  if (!(length > 0)) return null;
  // Provider distance and GPS geometry can differ; normalize to the route, not the plan.
  return validateTerrain({ version: 1, source: 'route', distanceMeters: route.distanceMeters,
    points: unique(route.points.map(p => ({ distanceMeters: p.distanceMeters / length * route.distanceMeters, elevationMeters: p.elevationMeters }))) });
}
export function rideTerrain(ride, route = null) {
  if (route) return routeTerrain(route);
  return validateTerrain({ version: 1, source: 'simulation', distanceMeters: ride.totalDistanceMeters,
    points: unique(ride.segments.flatMap(s => [{ distanceMeters: s.startMeters, elevationMeters: s.startElevation },
      { distanceMeters: s.endMeters, elevationMeters: s.endElevation }])) });
}
export function entryTerrain(entry) { return entry?.route ? routeTerrain(entry.route) : entry?.terrain ?? null; }
function indexAt(points, distance) {
  let low = 0, high = points.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (points[mid].distanceMeters < distance) low = mid + 1; else high = mid;
  }
  return low;
}
export function elevationAt(profile, distance) {
  if (!profile || distance < 0 || distance > profile.distanceMeters) return null;
  const right = profile.points[indexAt(profile.points, distance)];
  const left = profile.points[Math.max(0, indexAt(profile.points, distance) - 1)];
  const span = right.distanceMeters - left.distanceMeters;
  return span ? left.elevationMeters + (right.elevationMeters - left.elevationMeters) * (distance - left.distanceMeters) / span : right.elevationMeters;
}
export function terrainDomain(profile) {
  if (!profile) return null;
  const { low, high } = profile.points.reduce((range, p) => ({ low: Math.min(range.low, p.elevationMeters), high: Math.max(range.high, p.elevationMeters) }), { low: Infinity, high: -Infinity });
  const step = majorInterval(Math.max(20, high - low));
  let bottom = Math.floor(low / step) * step, top = Math.ceil(high / step) * step;
  if (bottom === top) { bottom -= step; top += step; }
  return { bottom, top };
}
// Retain extrema plus every marker/cursor anchor, so decimation cannot float a pin off the line.
export function visibleTerrain(profile, start, end, anchors = [], buckets = 180) {
  if (!profile || start > profile.distanceMeters || end < 0 || end <= start) return [];
  start = Math.max(0, start); end = Math.min(profile.distanceMeters, end);
  if (end <= start) return [];
  const first = indexAt(profile.points, start), last = indexAt(profile.points, end);
  const visible = profile.points.slice(first, last), result = [{ distanceMeters: start, elevationMeters: elevationAt(profile, start) }];
  const stride = Math.max(1, Math.ceil(visible.length / buckets));
  for (let i = 0; i < visible.length; i += stride) {
    const bucket = visible.slice(i, i + stride);
    const min = bucket.reduce((a, b) => a.elevationMeters <= b.elevationMeters ? a : b);
    const max = bucket.reduce((a, b) => a.elevationMeters >= b.elevationMeters ? a : b);
    result.push(min, max);
  }
  for (const distanceMeters of anchors) if (distanceMeters >= start && distanceMeters <= end) result.push({ distanceMeters, elevationMeters: elevationAt(profile, distanceMeters) });
  result.push({ distanceMeters: end, elevationMeters: elevationAt(profile, end) });
  return unique(result.sort((a, b) => a.distanceMeters - b.distanceMeters));
}
