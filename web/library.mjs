import { loadDraft, newID, samplePlan, validateDraft } from './plan.mjs';
import { validatePlan, roundedMeters } from './workout.mjs';
import { validateGel } from './gels.mjs';
import { validateRoute } from './routes.mjs';

export const libraryKey = 'kairos.web.library.v1';
export function today(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) throw new Error('请选择骑行日期。');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('骑行日期无效。');
  return value;
}
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) throw new Error('请填写 1 至 60 字的计划名称。');
  return value.trim();
}
function timestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('计划时间格式无效。');
  return value;
}
function entry(value) {
  return { name: name(value.name), rideDate: validateDate(value.rideDate), updatedAt: timestamp(value.updatedAt), plan: validateDraft(value.plan), ...(value.route ? { route: validateRoute(value.route) } : {}), ...(value.gel ? { gel: validateGel(value.gel) } : {}) };
}
export function validateLibrary(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.plans) || !Array.isArray(value.history)) throw new Error('本机计划库格式无法识别。');
  const plans = value.plans.map(entry), ids = new Set(plans.map(item => item.plan.id));
  const activePlanID = typeof value.activePlanID === 'string' ? value.activePlanID.toUpperCase() : value.activePlanID;
  if (ids.size !== plans.length || (plans.length ? !ids.has(activePlanID) : activePlanID !== null)) throw new Error('本机计划库索引无效。');
  const historyIDs = new Set();
  const history = value.history.map(item => {
    if (typeof item.id !== 'string' || !item.id || historyIDs.has(item.id) || !['download', 'share'].includes(item.method)) throw new Error('导出历史格式无效。');
    historyIDs.add(item.id); validatePlan(item.plan);
    return { id: item.id, name: name(item.name), rideDate: validateDate(item.rideDate), exportedAt: timestamp(item.exportedAt), method: item.method, plan: validateDraft(item.plan), ...(item.route ? { route: validateRoute(item.route) } : {}), ...(item.gel ? { gel: validateGel(item.gel) } : {}) };
  });
  return { version: 1, activePlanID, plans, history };
}
export function activeEntry(library) { return library.plans.find(item => item.plan.id === library.activePlanID) ?? null; }
function initial(plan, date, now) {
  return validateLibrary({ version: 1, activePlanID: plan.id, plans: [{ name: '骑行补给', rideDate: date, updatedAt: now, plan }], history: [] });
}
export function loadLibrary(storage, date = today(), now = new Date().toISOString()) {
  try {
    const raw = storage.getItem(libraryKey);
    if (raw !== null) {
      try { return { library: validateLibrary(JSON.parse(raw)), writable: true, needsSave: false, message: '' }; }
      catch { return { library: initial(samplePlan(), date, now), writable: false, needsSave: false, message: '本机计划库无法读取，原内容未被覆盖。当前可临时编辑和下载；下次打开不会保留这些改动。' }; }
    }
    const old = loadDraft(storage);
    return { library: initial(old.plan ?? samplePlan(), date, now), writable: old.writable, needsSave: old.writable,
      message: old.writable ? '' : '旧草稿无法读取，原内容未被覆盖。当前可临时编辑和下载。' };
  } catch {
    return { library: initial(samplePlan(), date, now), writable: false, needsSave: false, message: '浏览器不允许读取本机计划。当前可临时编辑和下载，下次打开不会保留改动。' };
  }
}
export function storeLibrary(storage, library) {
  try { storage.setItem(libraryKey, JSON.stringify(validateLibrary(library))); return ''; }
  catch { return '未能保存到浏览器。当前改动仍可下载；关闭页面后可能丢失。'; }
}
export function createPlan(library, details, now = new Date().toISOString()) {
  const plan = { id: newID(), totalDistanceMeters: details.totalDistanceMeters, stops: [] };
  return validateLibrary({ ...library, activePlanID: plan.id, plans: [...library.plans, { ...details, plan, updatedAt: now }] });
}
export function updatePlan(library, plan, now = new Date().toISOString()) {
  if (plan.id !== library.activePlanID) throw new Error('当前计划已切换，请重新打开编辑。');
  return validateLibrary({ ...library, plans: library.plans.map(item => item.plan.id === plan.id ? { ...item, plan, updatedAt: now } : item) });
}
export function updateDetails(library, id, details, now = new Date().toISOString()) {
  if (!library.plans.some(item => item.plan.id === id)) throw new Error('这份计划已不存在。');
  return validateLibrary({ ...library, plans: library.plans.map(item => item.plan.id === id ? { ...item, name: details.name, rideDate: details.rideDate, plan: { ...item.plan, totalDistanceMeters: details.totalDistanceMeters ?? item.plan.totalDistanceMeters }, updatedAt: now } : item) });
}
export function selectPlan(library, id) { return validateLibrary({ ...library, activePlanID: id }); }
export function setRoute(library, id, value, now = new Date().toISOString()) {
  if (id !== library.activePlanID) throw new Error('当前计划已切换，请重新选择路线。');
  const route = value ? validateRoute(value) : null;
  const totalDistanceMeters = route ? roundedMeters(route.distanceMeters) : activeEntry(library).plan.totalDistanceMeters;
  if (activeEntry(library).plan.stops.some(stop => stop.distanceMeters > totalDistanceMeters)) throw new Error('路线短于已有补给点。请先调整超出终点的补给，其他点不会自动移动。');
  return validateLibrary({ ...library, plans: library.plans.map(item => {
    if (item.plan.id !== id) return item;
    const rest = { ...item }; delete rest.route;
    return { ...rest, ...(route ? { route } : {}), plan: { ...item.plan, totalDistanceMeters }, updatedAt: now };
  }) });
}
export function duplicatePlan(library, source, details, now = new Date().toISOString()) {
  const plan = { ...validateDraft(source.plan), id: newID(), totalDistanceMeters: details.totalDistanceMeters ?? source.plan.totalDistanceMeters, stops: source.plan.stops.map(stop => ({ ...stop, id: newID() })) };
  return validateLibrary({ ...library, activePlanID: plan.id, plans: [...library.plans, { ...details, plan, updatedAt: now, ...(source.route ? { route: source.route } : {}), ...(source.gel ? { gel: source.gel } : {}) }] });
}
export function deletePlan(library, id) {
  const plans = library.plans.filter(item => item.plan.id !== id);
  return validateLibrary({ ...library, plans, activePlanID: library.activePlanID === id ? plans[0]?.plan.id ?? null : library.activePlanID });
}
export function restorePlan(library, removed) {
  return validateLibrary({ ...library, activePlanID: removed.plan.id, plans: [...library.plans, removed] });
}
export function recordExport(library, snapshot, method, now = new Date().toISOString()) {
  const signature = item => JSON.stringify({ name: item.name, rideDate: item.rideDate, plan: item.plan, route: item.route, gel: item.gel });
  const previous = library.history.find(item => signature(item) === signature(snapshot));
  const item = { id: previous?.id ?? newID(), name: snapshot.name, rideDate: snapshot.rideDate, exportedAt: now, method, plan: snapshot.plan, ...(snapshot.route ? { route: snapshot.route } : {}), ...(snapshot.gel ? { gel: snapshot.gel } : {}) };
  return validateLibrary({ ...library, history: [item, ...library.history.filter(old => old.id !== item.id)] });
}
