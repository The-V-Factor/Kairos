export const gelsKey = 'kairos.web.gels.v1';
export function validateGel(value) {
  if (!value || typeof value.id !== 'string' || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value.id)) throw new Error('能量胶标识无效。');
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name || name.length > 60) throw new Error('请填写1至60字的能量胶名称。');
  const carbsGrams = value.carbsGrams;
  if (typeof carbsGrams !== 'number' || !Number.isFinite(carbsGrams) || carbsGrams < 5 || carbsGrams > 100 || Math.abs(carbsGrams * 10 - Math.round(carbsGrams * 10)) > 1e-8) throw new Error('每支碳水请填写5至100g的数字，最多一位小数。');
  return { id: value.id.toUpperCase(), name, carbsGrams };
}
function validateCatalog(value) {
  if (value?.version !== 1 || !Array.isArray(value.items) || value.items.length > 100) throw new Error('能量胶配置格式无法识别。');
  const items = value.items.map(validateGel);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('能量胶标识重复。');
  return { version: 1, items };
}
export function loadGels(storage) {
  try {
    const raw = storage.getItem(gelsKey);
    return { catalog: raw === null ? { version: 1, items: [] } : validateCatalog(JSON.parse(raw)), writable: true, message: '' };
  } catch { return { catalog: { version: 1, items: [] }, writable: false, message: '能量胶配置暂时无法读取，原内容不会被覆盖。' }; }
}
export function storeGels(storage, catalog) {
  try { storage.setItem(gelsKey, JSON.stringify(validateCatalog(catalog))); return ''; }
  catch { return '能量胶未能保存，请检查浏览器存储后重试。'; }
}
export function gelChoices(items, snapshot) {
  const saved = snapshot ? validateGel(snapshot) : null;
  const same = saved && items.find(item => item.id === saved.id && item.name === saved.name && item.carbsGrams === saved.carbsGrams);
  return { selected: saved ? same ? saved.id : 'snapshot' : '', choices: [
    ...(saved && !same ? [{ value: 'snapshot', label: `${saved.name} · ${saved.carbsGrams}g/支（计划快照）`, gel: saved }] : []),
    ...items.map(gel => ({ value: gel.id, label: `${gel.name} · ${gel.carbsGrams}g/支`, gel })),
  ] };
}
