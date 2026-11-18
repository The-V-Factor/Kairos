import { roundedMeters } from './workout.mjs';

export const modelVersion = 'steady-road-v3';
export const defaults = Object.freeze({ ftpWatts: 250, weightKg: 70, effort: .7, bikeKg: 10,
  crr: .004, cda: .32, airDensity: 1.2, driveEfficiency: .975, bodyEfficiency: .22,
  maxSpeedKph: 45, carbsPerHour: null, gelCarbsGrams: 45 });
export const examples = {
  flat: { title: '平路示例', segments: [{ distanceMeters: 30000, gradePercent: 0 }] },
  climb: { title: '三段爬坡示例', segments: [{ distanceMeters: 10000, gradePercent: 0 }, { distanceMeters: 10000, gradePercent: 5 }, { distanceMeters: 10000, gradePercent: 0 }] },
  descent: { title: '下坡示例', segments: [{ distanceMeters: 10000, gradePercent: -5 }] },
};
const ranges = {
  ftpWatts: ['FTP', 1, 2500], weightKg: ['体重', 1, 500], effort: ['强度比例', .1, 1.5], bikeKg: ['车与装备重量', 0, 150],
  crr: ['滚阻', .0001, .1], cda: ['风阻面积', .05, 2], airDensity: ['空气密度', .3, 2],
  driveEfficiency: ['传动效率', .5, 1], bodyEfficiency: ['人体效率', .1, .35], maxSpeedKph: ['下坡限速', 5, 100],
  gelCarbsGrams: ['每包碳水', 5, 100],
};
export function parameters(input) {
  const result = {};
  for (const [key, [label, min, max]] of Object.entries(ranges)) {
    const value = input?.[key] ?? defaults[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}请填写 ${min} 至 ${max} 之间的有效数字。`);
    result[key] = value;
  }
  const carbs = input?.carbsPerHour ?? null;
  if (carbs !== null && (typeof carbs !== 'number' || !Number.isFinite(carbs) || carbs < 0 || carbs > 90)) throw new Error('碳水目标请填写 0 至 90 g/h，或选择自动。');
  result.carbsPerHour = carbs;
  return result;
}
export function simulationSegments(values) {
  if (!Array.isArray(values) || !values.length || values.length > 30) throw new Error('模拟路线请设置 1 至 30 个路段。');
  let distance = 0, elevation = 0;
  return values.map(value => {
    const length = value?.distanceMeters, grade = value?.gradePercent;
    if (!Number.isFinite(length) || length < 1 || length > 1e9 || !Number.isFinite(grade) || Math.abs(grade) > 100) throw new Error('每段距离至少 1 米，坡度需在 −100% 至 100% 之间。');
    const theta = Math.atan(grade / 100), startMeters = distance, startElevation = elevation;
    distance += length; elevation += length * Math.sin(theta);
    if (distance > 1e9) throw new Error('模拟路线距离过大。');
    return { startMeters, endMeters: distance, startElevation, endElevation: elevation, theta };
  });
}
export function routeSegments(route) {
  const points = route?.points, total = route?.distanceMeters;
  if (!Array.isArray(points) || points.length < 2 || points.length > 100000 || !Number.isFinite(total) || total <= 0 || total > 1e9) throw new Error('请先选择一条有效路书。');
  let previous = -1;
  for (const point of points) {
    if (!Number.isFinite(point.distanceMeters) || point.distanceMeters < previous || !Number.isFinite(point.elevationMeters)) throw new Error('路书缺少有效海拔或距离，无法按坡度估算；可更换路书，或在计算器中使用模拟路线。');
    previous = point.distanceMeters;
  }
  const length = points.at(-1).distanceMeters;
  if (length <= 0 || points[0].distanceMeters !== 0) throw new Error('路书轨迹距离无效。');
  const count = Math.max(1, Math.min(10000, Math.ceil(total / 50))), spacing = total / count;
  let cursor = 1;
  const samples = Array.from({ length: count + 1 }, (_, index) => {
    const distance = index * spacing, trackDistance = distance / total * length;
    while (cursor < points.length - 1 && points[cursor].distanceMeters < trackDistance) cursor++;
    const left = points[cursor - 1], right = points[cursor], span = right.distanceMeters - left.distanceMeters;
    const fraction = span ? Math.max(0, Math.min(1, (trackDistance - left.distanceMeters) / span)) : 0;
    return { distance, elevation: left.elevationMeters + (right.elevationMeters - left.elevationMeters) * fraction };
  });
  // A short symmetric distance window suppresses GPS spikes before differentiating.
  const smooth = samples.map((point, index) => {
    if (index === 0 || index === count) return point.elevation;
    let sum = 0, weight = 0;
    for (let offset = -2; offset <= 2; offset++) {
      const neighbor = samples[index + offset];
      if (!neighbor) continue;
      const w = 3 - Math.abs(offset); sum += neighbor.elevation * w; weight += w;
    }
    return sum / weight;
  });
  return samples.slice(1).map((point, index) => {
    const rise = smooth[index + 1] - smooth[index], distance = point.distance - samples[index].distance;
    if (Math.abs(rise) >= distance * .71) throw new Error('路书海拔变化异常，请核对路线；不会把异常海拔当作真实陡坡。');
    return { startMeters: samples[index].distance, endMeters: point.distance, startElevation: smooth[index], endElevation: smooth[index + 1], theta: Math.asin(rise / distance) };
  });
}
function solveSegment(segment, p) {
  const mass = p.weightKg + p.bikeKg, power = p.ftpWatts * p.effort;
  const gravityAndRolling = mass * 9.81 * (Math.sin(segment.theta) + p.crr * Math.cos(segment.theta));
  const aerodynamic = .5 * p.airDensity * p.cda;
  const needed = v => (gravityAndRolling + aerodynamic * v * v) * v;
  let low = 0, high = p.maxSpeedKph / 3.6;
  const capped = needed(high) < p.driveEfficiency * power;
  if (!capped) {
    for (let iteration = 0; iteration < 50; iteration++) {
      const middle = (low + high) / 2;
      if (needed(middle) < p.driveEfficiency * power) low = middle; else high = middle;
    }
  }
  const speedMps = capped ? high : (low + high) / 2;
  const watts = capped ? Math.max(0, needed(speedMps) / p.driveEfficiency) : power;
  const seconds = (segment.endMeters - segment.startMeters) / speedMps;
  return { ...segment, speedMps, seconds, watts, capped, coasting: watts < .01 };
}
export function recommendCarbs(hours, effort) {
  if (hours < .75) return 0;
  if (hours <= 1.25) return 25;
  // Product starting points within Maurten's Long ride 30–60 g/h range,
  // not a formula prescribed by Maurten for FTP or individual requirements.
  return effort <= .65 ? 30 : effort <= .75 ? 45 : 60;
}
export function estimateRide(input, route) {
  const p = parameters(input);
  if (!route || !['route', 'simulation'].includes(route.mode)) throw new Error('请选择当前路书或模拟路线。');
  const original = route.mode === 'route' ? routeSegments(route.route) : simulationSegments(route.segments);
  const total = roundedMeters(original.at(-1).endMeters), scale = total / original.at(-1).endMeters;
  const source = original.map(segment => ({ ...segment, startMeters: segment.startMeters * scale, endMeters: segment.endMeters * scale,
    theta: Math.asin((segment.endElevation - segment.startElevation) / ((segment.endMeters - segment.startMeters) * scale)) }));
  let elapsedSeconds = 0, mechanicalJoules = 0, ascentMeters = 0;
  const segments = source.map(segment => {
    const next = solveSegment(segment, p), startSeconds = elapsedSeconds;
    elapsedSeconds += next.seconds; mechanicalJoules += next.watts * next.seconds;
    ascentMeters += Math.max(0, segment.endElevation - segment.startElevation);
    return { ...next, startSeconds, endSeconds: elapsedSeconds };
  });
  const totalDistanceMeters = segments.at(-1).endMeters;
  const carbsPerHour = p.carbsPerHour ?? recommendCarbs(elapsedSeconds / 3600, p.effort);
  const warnings = [];
  if (p.effort > .9) warnings.push('接近或超过阈值的强度通常用于短段训练；这个用时不代表你能全程维持该功率。');
  if (elapsedSeconds > 6 * 3600) warnings.push('长途估计未计入疲劳降功率与停车休息，请结合实际经验调整。');
  if (carbsPerHour > 60) warnings.push('超过 60 g/h 需考虑混合碳水来源与个人耐受，不会因 FTP 高就自动推荐。');
  if (segments.some(segment => segment.coasting)) warnings.push('部分路段按滑行或刹车估算；能耗只估算踩踏做功对应消耗。');
  return { modelVersion, parameters: p, routeTitle: route.mode === 'route' ? route.route.title : route.title || '模拟路线',
    segments, totalDistanceMeters, elapsedSeconds, ascentMeters, mechanicalKJ: mechanicalJoules / 1000,
    calories: mechanicalJoules / (p.bodyEfficiency * 4184), averageKph: totalDistanceMeters / elapsedSeconds * 3.6,
    carbsPerHour, warnings };
}
export function distanceAtTime(ride, seconds) {
  const bounded = Math.max(0, Math.min(ride.elapsedSeconds, seconds));
  const segment = ride.segments.find(segment => bounded <= segment.endSeconds) ?? ride.segments.at(-1);
  return segment.startMeters + (bounded - segment.startSeconds) * segment.speedMps;
}
export function scheduleFuel(ride) {
  const events = [], p = ride.parameters;
  const append = seconds => {
    if (events.length >= 200) throw new Error('补给提醒过多，请调整碳水目标或每支含量，计划最多支持 100 个点位。');
    events.push({ seconds, distanceMeters: roundedMeters(distanceAtTime(ride, seconds)) });
  };
  if (ride.carbsPerHour > 0) {
    const interval = p.gelCarbsGrams / ride.carbsPerHour * 3600;
    // Centre each packet in its intake window, rather than postponing the first one until its end.
    for (let seconds = interval / 2; seconds < ride.elapsedSeconds; seconds += interval) append(seconds);
  }
  const merged = new Map();
  for (const event of events.sort((a, b) => a.seconds - b.seconds)) {
    let item = merged.get(event.distanceMeters);
    if (!item) { item = { distanceMeters: event.distanceMeters, seconds: event.seconds, gels: 0 }; merged.set(event.distanceMeters, item); }
    item.gels++;
  }
  if (merged.size > 100) throw new Error('生成结果超过 100 个补给点，请延长间隔或调整补给参数。');
  const stops = [...merged.values()].map(item => {
    const reminder = `吃胶${item.gels > 1 ? ` ×${item.gels}` : ''}`;
    return { ...item, kind: item.gels > 1 ? 'custom' : 'gel', name: item.gels > 1 ? '补胶' : '', reminder };
  });
  const gelCount = events.length;
  return { stops, gelCount, plannedCarbsGrams: gelCount * p.gelCarbsGrams, actualCarbsPerHour: gelCount * p.gelCarbsGrams / (ride.elapsedSeconds / 3600) };
}
