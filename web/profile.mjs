export const profileKey = 'kairos.web.profile.v1';
export const profileFields = [
  { key: 'sex', label: '性别', unit: '' },
  { key: 'ageYears', label: '年龄', unit: '岁' },
  { key: 'heightCm', label: '身高', unit: 'cm' },
  { key: 'weightKg', label: '体重', unit: 'kg' },
  { key: 'ftpWatts', label: 'FTP', unit: 'W' },
];
export const emptyProfile = () => ({ sex: null, ageYears: null, heightCm: null, weightKg: null, ftpWatts: null });

export function validateProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('个人档案格式无法识别。');
  const result = emptyProfile();
  for (const { key, label } of profileFields) {
    const input = value[key];
    if (input === null || input === undefined || input === '') continue;
    if (key === 'sex') {
      if (!['male', 'female'].includes(input)) throw new Error('请选择性别，或留空。');
      result.sex = input; continue;
    }
    const integer = key === 'ageYears' || key === 'ftpWatts';
    if ((typeof input !== 'number' && typeof input !== 'string') || !new RegExp(integer ? '^\\d+$' : '^\\d+(?:\\.\\d)?$').test(String(input))) throw new Error(`${label}请填写${integer ? '整数' : '数字，最多一位小数'}。`);
    const number = Number(input);
    if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER || (key === 'ageYears' ? number < 0 || number > 150 : number <= 0)) throw new Error(key === 'ageYears' ? '年龄请填写 0 至 150 的整数。' : `${label}请填写大于 0 的数字。`);
    result[key] = number;
  }
  return result;
}
export function profileValue(profile, key) {
  const value = profile[key];
  if (value === null) return '未填写';
  if (key === 'sex') return value === 'male' ? '男' : '女';
  const unit = profileFields.find(field => field.key === key).unit;
  return `${key === 'weightKg' ? value.toFixed(1) : value} ${unit}`;
}
export function profileChanges(current, incoming) {
  return profileFields.map(field => ({ ...field, value: incoming[field.key], same: incoming[field.key] !== null && incoming[field.key] === current[field.key] }));
}
export function mergeProfile(current, incoming, keys) {
  const merged = { ...current };
  for (const { key } of profileFields) if (keys.includes(key) && incoming[key] !== null) merged[key] = incoming[key];
  return validateProfile(merged);
}
export function loadProfile(storage) {
  try {
    const raw = storage.getItem(profileKey);
    if (raw === null) return { profile: emptyProfile(), writable: true, message: '' };
    const value = JSON.parse(raw);
    if (value.version !== 1) throw new Error('version');
    return { profile: validateProfile(value), writable: true, message: '' };
  } catch {
    return { profile: emptyProfile(), writable: false, message: '原档案暂时无法读取，不会覆盖。当前可临时填写，关闭页面后可能丢失。' };
  }
}
export function storeProfile(storage, profile) {
  try { storage.setItem(profileKey, JSON.stringify({ version: 1, ...validateProfile(profile) })); return ''; }
  catch { return '未能保存到浏览器。本次填写仍可用，关闭页面后可能丢失。'; }
}
function importedNumber(value, key) {
  try { return validateProfile({ [key]: value })[key]; } catch { return null; }
}
export function ageFromBirthDate(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number), date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  const age = now.getFullYear() - year - (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day) ? 1 : 0);
  return importedNumber(age, 'ageYears');
}
export function profileFromIGPSPORT(value, now = new Date()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['sex', 'gender', 'birthDate', 'height', 'weight', 'ftp'].some(key => key in value)) throw new Error('iGPSPORT 未返回可识别的个人档案。');
  const sex = String(value.sex ?? value.gender ?? '');
  return { sex: sex === '1' ? 'male' : sex === '2' ? 'female' : null,
    ageYears: ageFromBirthDate(value.birthDate, now), heightCm: importedNumber(value.height, 'heightCm'),
    weightKg: importedNumber(value.weight, 'weightKg'), ftpWatts: importedNumber(value.ftp, 'ftpWatts') };
}
