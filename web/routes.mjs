import { majorInterval } from './plan.mjs';

const number = value => typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
const text = (value, max = 160) => typeof value === 'string' ? value.slice(0, max) : '';
export function routeID(value) {
  const id = String(value ?? '');
  if (!/^\d{1,20}$/.test(id)) throw new Error('路书编号无效。');
  return id;
}
export function routeSummary(value) {
  if (!value || typeof value !== 'object') throw new Error('路书格式无效。');
  const distanceMeters = number(value.distance ?? value.totalDistance), ascent = number(value.totalAscent);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || distanceMeters > 1e9) throw new Error('路书没有有效的距离。');
  return { source: 'igpsport-cn', id: routeID(value.roadBookId ?? value.id), title: text(value.title) || '未命名路书',
    author: text(value.nickName, 80), region: text(value.cityName ?? value.region, 80), distanceMeters,
    ascentMeters: Number.isFinite(ascent) && ascent >= 0 ? ascent : null };
}
function point(value) {
  if (!value || typeof value !== 'object') throw new Error('路书坐标格式无效。');
  const latitude = number(value.latitude), longitude = number(value.longitude ?? value.longitute), elevation = number(value.elevationMeters ?? value.alt);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('路书含有无效坐标，暂不能使用。');
  return { latitude, longitude, elevationMeters: Number.isFinite(elevation) ? elevation : null };
}
function separation(a, b) {
  const rad = Math.PI / 180, lat = (b.latitude - a.latitude) * rad, lon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function routePoints(values) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 100000) throw new Error('路书轨迹为空或过大，暂不能使用。');
  let distance = 0, previous;
  const points = values.map(value => {
    const next = point(value);
    if (previous) distance += separation(previous, next);
    previous = next;
    return { ...next, distanceMeters: Math.round(distance * 10) / 10 };
  });
  if (distance < 1) throw new Error('路书没有可用的骑行轨迹。');
  return points;
}
export function routeDetail(id, value) {
  if (!value || typeof value !== 'object') throw new Error('路书详情格式无效。');
  return { ...routeSummary({ ...value.summary, id }), points: routePoints(value.routeInfo?.tracks) };
}
export function validateRoute(value) {
  if (value?.source !== 'igpsport-cn') throw new Error('路书来源无效。');
  return { ...routeSummary({ id: value.id, title: value.title, nickName: value.author, region: value.region, distance: value.distanceMeters, totalAscent: value.ascentMeters }),
    points: routePoints(value.points) };
}
// A local outline, not a navigation map. Retain every point in storage; thin only the drawing.
export function previewLines(points, totalDistanceMeters = points.at(-1).distanceMeters) {
  const stride = Math.max(1, Math.ceil(points.length / 700));
  const sample = points.filter((_, i) => i % stride === 0 || i === points.length - 1);
  const lat = sample.reduce((sum, p) => sum + p.latitude, 0) / sample.length * Math.PI / 180;
  const xy = sample.map(p => [p.longitude * Math.cos(lat), -p.latitude]);
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
  const scale = Math.min(280 / (width || 1e-9), 120 / (height || 1e-9));
  const outline = xy.map(([x, y]) => `${(160 + (x - minX - width / 2) * scale).toFixed(1)},${(76 + (y - minY - height / 2) * scale).toFixed(1)}`).join(' ');
  return { outline, ...elevationProfile(points, totalDistanceMeters) };
}

// Build each view from full-resolution points, not the previous drawing's downsample.
export function elevationProfile(points, totalDistanceMeters, start = 0, end = totalDistanceMeters) {
  if (points.some(p => p.elevationMeters === null)) return { elevation: null };
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > totalDistanceMeters || end <= start) throw new Error('海拔图可见距离无效。');
  const trackLength = points.at(-1).distanceMeters, ratio = totalDistanceMeters / trackLength;
  function indexAt(distance) {
    let low = 0, high = points.length - 1;
    while (low < high) { const mid = (low + high) >>> 1; if (points[mid].distanceMeters * ratio < distance) low = mid + 1; else high = mid; }
    return low;
  }
  function boundary(distance, index) {
    const right = points[index], left = points[Math.max(0, index - 1)];
    const span = (right.distanceMeters - left.distanceMeters) * ratio;
    const fraction = span ? (distance - left.distanceMeters * ratio) / span : 0;
    return { distanceMeters: distance, elevationMeters: left.elevationMeters + (right.elevationMeters - left.elevationMeters) * fraction };
  }
  const first = indexAt(start), last = indexAt(end);
  const visible = [boundary(start, first), ...points.slice(first, last).map(p => ({ distanceMeters: p.distanceMeters * ratio, elevationMeters: p.elevationMeters })), boundary(end, last)];
  const low = visible.reduce((min, p) => Math.min(min, p.elevationMeters), Infinity);
  const high = visible.reduce((max, p) => Math.max(max, p.elevationMeters), -Infinity);
  const step = majorInterval(Math.max(20, high - low));
  let bottom = Math.floor(low / step) * step, top = Math.ceil(high / step) * step;
  if (bottom === top) { bottom -= step; top += step; }
  const x = meters => 42 + (meters - start) / (end - start) * 262;
  const y = altitude => 78 - (altitude - bottom) / (top - bottom) * 60;
  const sample = [visible[0]], stride = Math.max(1, Math.ceil(visible.length / 350));
  for (let i = 1; i < visible.length - 1; i += stride) {
    const bucket = visible.slice(i, Math.min(i + stride, visible.length - 1));
    const min = bucket.reduce((a, b) => a.elevationMeters < b.elevationMeters ? a : b);
    const max = bucket.reduce((a, b) => a.elevationMeters > b.elevationMeters ? a : b);
    sample.push(...(min.distanceMeters <= max.distanceMeters ? [min, max] : [max, min]));
  }
  sample.push(visible.at(-1));
  const elevation = sample.map(p => `${x(p.distanceMeters).toFixed(1)},${y(p.elevationMeters).toFixed(1)}`).join(' ');
  const yTicks = [];
  for (let value = bottom; value <= top; value += step) yTicks.push({ y: y(value), label: String(value) });
  const interval = majorInterval(end - start), distances = [start];
  for (let value = Math.ceil(start / interval) * interval; value < end; value += interval) {
    if (value - start >= interval * .45 && end - value >= interval * .45) distances.push(value);
  }
  distances.push(end);
  const xTicks = distances.map(value => ({ x: x(value), label: end - start >= 1000 ? `${Number((value / 1000).toFixed(1))} km` : `${Number(value.toFixed(1))} m` }));
  return { elevation, xTicks, yTicks };
}
