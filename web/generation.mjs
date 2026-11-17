import { newID } from './plan.mjs';
import { activeEntry, createPlan, updatePlan, today } from './library.mjs';
import { defaults, parameters, estimateRide, scheduleFuel } from './fueling-model.mjs';

export const transferKey = 'kairos.web.generation.v1';
export function revision(entry) {
  return entry ? JSON.stringify({ id: entry.plan.id, updatedAt: entry.updatedAt, name: entry.name, date: entry.rideDate,
    plan: entry.plan, route: entry.route ? [entry.route.id, entry.route.distanceMeters, entry.route.points.length] : null }) : null;
}
export function initialRecipe(entry, profile) {
  return { version: 1, sourceRevision: revision(entry), mode: entry?.route ? 'route' : 'simulation',
    parameters: { ...defaults, ftpWatts: profile?.ftpWatts ?? null, weightKg: profile?.weightKg ?? null },
    title: '平路模拟', segments: [{ distanceMeters: entry?.plan.totalDistanceMeters ?? 30000, gradePercent: 0 }] };
}
export function calculateRecipe(recipe, entry) {
  if (recipe?.version !== 1) throw new Error('计算参数版本无法识别，请重新打开生成。');
  if (recipe.sourceRevision !== revision(entry)) throw new Error('原计划或路线已更改，请重新打开生成，避免使用过期参数。');
  if (recipe.parameters?.ftpWatts == null || recipe.parameters?.weightKg == null) throw new Error('请先填写 FTP 和体重，或进入计算器使用明确的示例参数。');
  const p = parameters(recipe.parameters);
  const selectedRoute = Object.hasOwn(recipe, 'route') ? recipe.route : entry?.route;
  const route = recipe.mode === 'route' ? { mode: 'route', route: selectedRoute } : { mode: 'simulation', title: recipe.title, segments: recipe.segments };
  const ride = estimateRide(p, route);
  return { ride, schedule: scheduleFuel(ride) };
}
export function readTransfer(storage) {
  try {
    const raw = storage.getItem(transferKey);
    if (!raw) return null;
    const recipe = JSON.parse(raw);
    const valid = recipe?.version === 1 && ['route', 'simulation'].includes(recipe.mode)
      && (recipe.sourceRevision === null || typeof recipe.sourceRevision === 'string')
      && recipe.parameters && typeof recipe.parameters === 'object' && !Array.isArray(recipe.parameters)
      && Array.isArray(recipe.segments) && recipe.segments.length > 0 && recipe.segments.length <= 30
      && recipe.segments.every(segment => segment && typeof segment === 'object');
    return valid ? recipe : null;
  } catch { return null; }
}
export function writeTransfer(storage, recipe) {
  if (Object.values(recipe.parameters).some(value => value !== null && (typeof value !== 'number' || !Number.isFinite(value)))) throw new Error('请先修正无效的计算参数，再进入预览或计算器。');
  try { storage.setItem(transferKey, JSON.stringify(recipe)); }
  catch { throw new Error('浏览器未能保留本次参数，请允许会话存储后重试；原计划没有变化。'); }
}
export function generatedLibrary(library, recipe, now = new Date().toISOString()) {
  const source = recipe.sourceRevision === null ? null : library.plans.find(entry => revision(entry) === recipe.sourceRevision), { ride, schedule } = calculateRecipe(recipe, source);
  const selectedRoute = Object.hasOwn(recipe, 'route') ? recipe.route : source?.route;
  let next = createPlan(library, { name: `${(source?.name ?? ride.routeTitle).slice(0, 52)} · 自动补给`, rideDate: source?.rideDate ?? today(new Date(now)),
    totalDistanceMeters: ride.totalDistanceMeters, ...(recipe.mode === 'route' && selectedRoute ? { route: selectedRoute } : {}) }, now);
  const plan = { ...activeEntry(next).plan, stops: schedule.stops.map(stop => ({ id: newID(), distanceMeters: stop.distanceMeters, kind: stop.kind, name: stop.name, reminder: stop.reminder })) };
  next = updatePlan(next, plan, now);
  return next;
}
