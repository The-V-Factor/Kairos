import { roundedMeters, validatePlan } from './workout.mjs';

export const draftKey = 'kairos.web.plan.v1';
export const kinds = { water: { title: '水', reminder: '喝水' }, gel: { title: '能量胶', reminder: '吃胶' }, custom: { title: '自定义', reminder: '' } };

export function newID() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function samplePlan() {
  return { id: newID(), totalDistanceMeters: 75000, stops: [
    { id: newID(), distanceMeters: 14500, kind: 'water', name: '', reminder: '喝水' },
    { id: newID(), distanceMeters: 31600, kind: 'gel', name: '', reminder: '吃胶' },
    { id: newID(), distanceMeters: 51100, kind: 'gel', name: '', reminder: '吃胶' },
  ] };
}

export function parseDistance(text, unit) {
  if (!/^\d+(\.\d+)?$/.test(text.trim())) throw new Error('距离请填写数字，不包含单位或千位分隔符。');
  const value = Number(text) * (unit === 'km' ? 1000 : 1);
  if (!Number.isFinite(value) || value > 1e9) throw new Error('请输入有效的数字距离。');
  return roundedMeters(value);
}

// Empty drafts are editable; exporting still requires at least one stop.
export function validateDraft(input) {
  if (!input || !Array.isArray(input.stops) || input.stops.length > 100) throw new Error('计划格式无效。');
  const plan = validatePlan({ ...input, stops: input.stops.length ? input.stops : [{ distanceMeters: 0, reminder: '草稿' }] });
  const ids = new Set();
  const stops = input.stops.map(stop => {
    if (typeof stop.id !== 'string' || !stop.id || ids.has(stop.id) || !Object.hasOwn(kinds, stop.kind)) throw new Error('补给点格式无效。');
    ids.add(stop.id);
    if (typeof stop.name !== 'string' || stop.name.length > 80 || (stop.kind === 'custom' && !stop.name.trim())) throw new Error('请填写自定义补给名称。');
    return { id: stop.id, distanceMeters: roundedMeters(stop.distanceMeters), kind: stop.kind, name: stop.name.trim(), reminder: stop.reminder.trim() };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);
  return { id: plan.id, totalDistanceMeters: plan.totalDistanceMeters, stops };
}

export function saveStop(plan, stop) {
  return validateDraft({ ...plan, stops: [...plan.stops.filter(item => item.id !== stop.id), stop] });
}

export function loadDraft(storage) {
  try {
    const raw = storage.getItem(draftKey);
    if (raw === null) return { plan: null, writable: true, message: '' };
    const data = JSON.parse(raw);
    if (data.version !== 1) throw new Error('版本不支持');
    return { plan: validateDraft(data.plan), writable: true, message: '' };
  } catch {
    return { plan: null, writable: false, message: '本机草稿无法读取，原内容未被覆盖。当前修改仍可分享或下载。' };
  }
}

export function storeDraft(storage, plan) {
  try {
    storage.setItem(draftKey, JSON.stringify({ version: 1, plan: validateDraft(plan) }));
    return '';
  } catch { return '未能保存到本机，请保留页面并先分享或下载计划。'; }
}

export function majorInterval(visibleMeters) {
  const target = Math.max(1, visibleMeters / 4);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const fraction = target / magnitude;
  return (fraction < 1.5 ? 1 : fraction < 2.5 ? 2 : fraction < 7.5 ? 5 : 10) * magnitude;
}
