import { defaults, examples, modelVersion } from './fueling-model.mjs';
import { loadLibrary, activeEntry } from './library.mjs';
import { loadProfile } from './profile.mjs';
import { loadTheme } from './themes.mjs';
import { initialRecipe, calculateRecipe, readTransfer, writeTransfer, revision } from './generation.mjs';
import { duration, drawRide, notice } from './fueling-view.mjs';
import { distanceLabel } from './workout.mjs';
import './focus.mjs';
import { renderGelSelect } from './gel-editor.mjs';

const $ = id => document.getElementById(id);
const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
const session = { getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value) };
const loaded = loadLibrary(storage);
const transferred = new URL(location.href).searchParams.get('from') === 'generator' ? readTransfer(session) : null;
const entry = transferred ? loaded.library.plans.find(item => revision(item) === transferred.sourceRevision) ?? null : loaded.needsSave ? null : activeEntry(loaded.library);
let recipe = transferred ?? { ...initialRecipe(entry, {}), parameters: { ...defaults, gelCarbsGrams: entry?.gel?.carbsGrams ?? defaults.gelCarbsGrams }, mode: entry?.route ? 'route' : 'simulation', ...structuredClone(examples.climb) };
let result = null, chartMode = 'elevation', group = 'rider', frame = null;
document.documentElement.dataset.theme = loadTheme(storage);
$('calc-model-version').textContent = `模型 ${modelVersion} · 本机计算，不上传参数`;
const fields = [
  { key: 'ftpWatts', title: 'FTP', unit: 'W', min: 1, max: 2500, step: 1, slider: true, group: 'rider' },
  { key: 'weightKg', title: '体重', unit: 'kg', min: 1, max: 500, step: .1, slider: true, group: 'rider' },
  { key: 'effort', title: '强度', unit: '%', min: 10, max: 150, step: 1, factor: 100, slider: true, group: 'rider' },
  { key: 'bikeKg', title: '车与装备', unit: 'kg', min: 0, max: 150, step: .1, group: 'equipment' },
  { key: 'crr', title: '滚阻 Crr', unit: '', min: .0001, max: .1, step: .0001, group: 'equipment' },
  { key: 'cda', title: '风阻 CdA', unit: 'm²', min: .05, max: 2, step: .01, group: 'equipment' },
  { key: 'airDensity', title: '空气密度', unit: 'kg/m³', min: .3, max: 2, step: .01, group: 'equipment' },
  { key: 'driveEfficiency', title: '传动效率', unit: '%', min: 50, max: 100, step: .1, factor: 100, group: 'equipment' },
  { key: 'bodyEfficiency', title: '人体效率', unit: '%', min: 10, max: 35, step: .1, factor: 100, group: 'equipment' },
  { key: 'maxSpeedKph', title: '下坡限速', unit: 'km/h', min: 5, max: 100, step: 1, group: 'equipment' },
  { key: 'carbsPerHour', title: '碳水目标', unit: 'g/h', min: 0, max: 90, step: 1, group: 'fuel' },
  { key: 'gelCarbsGrams', title: '每支碳水', unit: 'g', min: 5, max: 100, step: .1, group: 'fuel' },
  { key: 'waterIntervalMinutes', title: '喝水间隔', unit: '分', min: 0, max: 180, step: 1, group: 'fuel' },
];
for (const field of fields) {
  const wrap = document.createElement('div'); wrap.className = 'calc-control';
  const label = document.createElement('label'); label.htmlFor = `calc-${field.key}`; label.textContent = field.title;
  const line = document.createElement('div'); line.className = 'calc-input-line';
  const box = document.createElement('span'); box.className = 'calc-value';
  const number = document.createElement('input'); number.id = label.htmlFor; number.type = 'number'; number.inputMode = 'decimal';
  number.dataset.input = field.key; number.min = field.min; number.max = field.max; number.step = field.step;
  const unit = document.createElement('small'); unit.textContent = field.unit; box.append(number, unit);
  if (field.slider) {
    const range = document.createElement('input'); range.type = 'range'; range.min = field.min; range.max = field.key === 'ftpWatts' ? 600 : field.key === 'weightKg' ? 160 : field.max; range.step = field.step;
    range.setAttribute('aria-label', `${field.title}滑杆`); range.dataset.range = field.key;
    range.addEventListener('input', () => { number.value = range.value; rangePosition(range); queueCalculation(); });
    number.addEventListener('input', () => { range.value = number.value; rangePosition(range); });
    line.append(range);
  }
  number.addEventListener('input', queueCalculation); line.append(box); wrap.append(label, line);
  $(`calc-${field.group}-fields`).append(wrap);
}
function rangePosition(range) { range.style.setProperty('--range-position', `${(Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min)) * 100}%`); }
function fillParameters() {
  readCalculatorGel = renderGelSelect($('calc-gel-select'), storage, recipe.gel, '试算：手动填写含量');
  for (const field of fields) {
    const value = recipe.parameters[field.key], number = $(`calc-${field.key}`);
    number.value = value == null ? '' : String(+(value * (field.factor ?? 1)).toFixed(5));
    if (field.key === 'gelCarbsGrams') number.readOnly = !!recipe.gel;
    const range = document.querySelector(`[data-range="${field.key}"]`); if (range) { range.value = number.value; rangePosition(range); }
  }
  $('calc-auto-carbs').checked = recipe.parameters.carbsPerHour === null;
  $('calc-carbsPerHour').disabled = $('calc-auto-carbs').checked;
}
function readParameters() {
  return Object.fromEntries(fields.map(field => {
    const value = $(`calc-${field.key}`).value.trim();
    return [field.key, field.key === 'carbsPerHour' && $('calc-auto-carbs').checked ? null : value === '' ? NaN : Number(value) / (field.factor ?? 1)];
  }));
}
function renderRoute() {
  const real = recipe.mode === 'route';
  const selectedRoute = Object.hasOwn(recipe, 'route') ? recipe.route : entry?.route;
  $('calc-use-route').disabled = !selectedRoute;
  $('calc-use-route').setAttribute('aria-pressed', String(real)); $('calc-use-simulation').setAttribute('aria-pressed', String(!real));
  $('calc-route-name').textContent = real ? selectedRoute?.title ?? '没有可用路书' : recipe.title || '模拟路线';
  $('calc-simulation').hidden = real;
  $('calc-segments').replaceChildren();
  for (const [index, segment] of recipe.segments.entries()) {
    const row = document.createElement('div'); row.className = 'calc-segment-row';
    const position = document.createElement('span'); position.textContent = String(index + 1).padStart(2, '0');
    const distance = document.createElement('input'); distance.type = 'number'; distance.min = .001; distance.step = .1;
    distance.value = segment.distanceMeters / 1000; distance.inputMode = 'decimal'; distance.dataset.segmentDistance = index;
    distance.setAttribute('aria-label', `路段 ${index + 1} 距离，公里`);
    const grade = document.createElement('input'); grade.type = 'number'; grade.min = -100; grade.max = 100; grade.step = .1;
    grade.value = segment.gradePercent; grade.inputMode = 'decimal'; grade.dataset.segmentGrade = index;
    grade.setAttribute('aria-label', `路段 ${index + 1} 坡度，百分比`);
    for (const input of [distance, grade]) input.addEventListener('input', () => { recipe.title = '自定义分段'; markExample(null); queueCalculation(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '−'; remove.disabled = recipe.segments.length === 1;
    remove.setAttribute('aria-label', `删除模拟路段 ${index + 1}`);
    remove.addEventListener('click', () => { readSegments(); recipe.segments.splice(index, 1); recipe.title = '自定义分段'; markExample(null); renderRoute(); calculate(); });
    row.append(position, distance, grade, remove); $('calc-segments').append(row);
  }
  $('calc-add-segment').disabled = recipe.segments.length >= 30;
}
function readSegments() {
  if (recipe.mode === 'route') return;
  recipe.segments = [...$('calc-segments').children].map(row => {
    const distance = row.querySelector('[data-segment-distance]').value.trim(), grade = row.querySelector('[data-segment-grade]').value.trim();
    return { distanceMeters: distance ? Number(distance) * 1000 : NaN, gradePercent: grade ? Number(grade) : NaN };
  });
}
function markExample(key) { for (const button of document.querySelectorAll('[data-example]')) button.setAttribute('aria-pressed', String(button.dataset.example === key)); }
function selectGroup(value) {
  group = value; document.body.dataset.group = group;
  for (const button of document.querySelectorAll('[data-group]')) { const selected = button.dataset.group === group; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }
  for (const panel of document.querySelectorAll('[data-panel]')) panel.classList.toggle('active', panel.dataset.panel === group);
  redraw();
}
function redraw() {
  if (result && chartMode !== 'details') drawRide($('calc-chart'), result.ride, result.schedule, chartMode);
}
function calculate() {
  try {
    recipe.parameters = readParameters(); readSegments();
    result = calculateRecipe(recipe, entry);
    const { ride, schedule } = result;
    $('calc-duration').textContent = duration(ride.elapsedSeconds); $('calc-speed').textContent = `${ride.averageKph.toFixed(1)} km/h`;
    $('calc-energy').textContent = `约${Math.round(ride.calories)} kcal`; $('calc-gels').textContent = `${schedule.gelCount}支`;
    $('calc-power').textContent = `目标功率 ${Math.round(ride.parameters.ftpWatts * ride.parameters.effort)} W（${ride.parameters.ftpWatts} W × ${Math.round(ride.parameters.effort * 100)}%）`;
    $('calc-route-totals').textContent = `合计 ${distanceLabel(ride.totalDistanceMeters)} · 爬升 ${Math.round(ride.ascentMeters)} m`;
    $('calc-route-summary').textContent = `${recipe.mode === 'route' ? '路书' : '模拟路线'} · ${ride.routeTitle} · ${distanceLabel(ride.totalDistanceMeters)} / ${Math.round(ride.ascentMeters)} m　编辑 ›`;
    if ($('calc-auto-carbs').checked) $('calc-carbsPerHour').value = ride.carbsPerHour;
    const body = $('calc-segment-results'); body.replaceChildren();
    const detailCount = chartMode === 'details' ? 120 : 8;
    const position = value => value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(2)} km`;
    for (const segment of ride.segments.slice(0, detailCount)) {
      const row = document.createElement('tr');
      for (const value of [`${position(segment.startMeters)}–${position(segment.endMeters)}`, `${(Math.tan(segment.theta) * 100).toFixed(1)}%`, `${(segment.speedMps * 3.6).toFixed(1)} km/h${segment.coasting ? ' · 滑行' : ''}`, `${(segment.seconds / 60).toFixed(1)}分`]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      body.append(row);
    }
    $('calc-nutrition').textContent = `纯胶 · 目标 ${ride.carbsPerHour} g/h · ${schedule.gelCount} 支，共 ${schedule.plannedCarbsGrams}g碳水，计划平均约 ${schedule.actualCarbsPerHour.toFixed(0)} g/h。${ride.segments.length > detailCount ? `共 ${ride.segments.length} 段，显示前 ${detailCount} 段；复制包含完整结果。` : ''}`;
    notice($('calc-warning'), ride.warnings.join(' ')); notice($('calc-error'));
    $('calc-visuals').hidden = false; $('calc-preview').disabled = false; $('calc-copy').disabled = false; redraw();
  } catch (error) {
    result = null; notice($('calc-error'), error.message);
    for (const id of ['calc-duration', 'calc-speed', 'calc-energy', 'calc-gels']) $(id).textContent = '—';
    $('calc-visuals').hidden = true; $('calc-preview').disabled = true; $('calc-copy').disabled = true; $('calc-warning').textContent = '';
  }
}
function queueCalculation() { if (frame === null) frame = requestAnimationFrame(() => { frame = null; calculate(); }); }
function tabKeys(button, selector) {
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const items = [...document.querySelectorAll(selector)], index = items.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[next].click(); items[next].focus();
  });
}
for (const button of document.querySelectorAll('[data-group]')) { button.addEventListener('click', () => selectGroup(button.dataset.group)); tabKeys(button, '[data-group]'); }
for (const button of document.querySelectorAll('[data-chart]')) {
  button.addEventListener('click', () => {
    chartMode = button.dataset.chart; document.body.dataset.chart = chartMode;
    for (const item of document.querySelectorAll('[data-chart]')) { const selected = item === button; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; }
    $('calc-plot').hidden = chartMode === 'details'; calculate();
  });
  tabKeys(button, '[data-chart]');
}
for (const button of document.querySelectorAll('[data-example]')) button.addEventListener('click', () => {
  recipe.mode = 'simulation'; Object.assign(recipe, structuredClone(examples[button.dataset.example]));
  markExample(button.dataset.example); renderRoute(); calculate();
});
$('calc-reset').addEventListener('click', () => {
  const details = recipe.details, gel = recipe.gel;
  recipe = { ...initialRecipe(entry, {}), parameters: { ...defaults }, mode: 'simulation', ...structuredClone(examples.climb) };
  if (details) recipe.details = details;
  recipe.gel = gel ?? null;
  if (gel) recipe.parameters.gelCarbsGrams = gel.carbsGrams;
  fillParameters(); markExample('climb'); renderRoute(); notice($('calc-context'), '已恢复示例参数：FTP 250 W、体重 70 kg。个人档案没有变化。'); calculate();
});
$('calc-reset-top').addEventListener('click', () => $('calc-reset').click());
$('calc-profile').addEventListener('click', () => {
  const profile = loadProfile(storage);
  for (const key of ['ftpWatts', 'weightKg']) if (profile.profile[key] !== null) {
    recipe.parameters[key] = profile.profile[key]; $(`calc-${key}`).value = profile.profile[key];
    const range = document.querySelector(`[data-range="${key}"]`); range.value = profile.profile[key]; rangePosition(range);
  }
  notice($('calc-context'), profile.message || (profile.profile.ftpWatts === null || profile.profile.weightKg === null ? '档案有未填写项，只带入已有值；其余参数仍是当前试算值。' : '已从个人档案带入 FTP 和体重；此页修改不会回写档案。')); calculate();
});
$('calc-use-route').addEventListener('click', () => { readSegments(); recipe.mode = 'route'; markExample(null); renderRoute(); calculate(); });
$('calc-use-simulation').addEventListener('click', () => { recipe.mode = 'simulation'; renderRoute(); calculate(); });
$('calc-add-segment').addEventListener('click', () => { readSegments(); recipe.segments.push({ distanceMeters: 10000, gradePercent: 0 }); recipe.title = '自定义分段'; markExample(null); renderRoute(); calculate(); });
$('calc-route-summary').addEventListener('click', () => { selectGroup('route'); $('calc-use-simulation').focus({ preventScroll: true }); });
$('calc-auto-carbs').addEventListener('change', () => { $('calc-carbsPerHour').disabled = $('calc-auto-carbs').checked; calculate(); });
let readCalculatorGel = () => null;
$('calc-gel-select').addEventListener('change', () => {
  recipe.gel = readCalculatorGel($('calc-gel-select').value);
  if (recipe.gel) recipe.parameters.gelCarbsGrams = recipe.gel.carbsGrams;
  fillParameters(); calculate();
});
$('calc-copy').addEventListener('click', async () => {
  calculate(); if (!result) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify({ modelVersion, recipe, result }, null, 2));
    notice($('calc-action-status'), '参数与结果已复制，可用于复现这次计算。');
  } catch { notice($('calc-action-status'), '未能复制，请允许剪贴板权限后重试。'); }
});
$('calc-preview').addEventListener('click', () => {
  calculate(); if (!result) return;
  try { writeTransfer(session, recipe); location.href = './?generate=preview'; }
  catch (error) { notice($('calc-action-status'), error.message); }
});
if (transferred && (recipe.parameters.ftpWatts === null || recipe.parameters.weightKg === null)) {
  recipe.parameters = { ...recipe.parameters, ftpWatts: recipe.parameters.ftpWatts ?? defaults.ftpWatts, weightKg: recipe.parameters.weightKg ?? defaults.weightKg };
  notice($('calc-context'), '档案缺少 FTP 或体重，缺项暂用示例 250 W／70 kg；请调整后再生成。');
} else if (!transferred) notice($('calc-context'), '示例 250 W／70 kg；可带入档案，调整不回写。');
fillParameters(); renderRoute(); markExample(recipe.mode === 'simulation' ? 'climb' : null); selectGroup('rider'); calculate();
new ResizeObserver(redraw).observe($('calc-chart'));
