import { defaults, examples, modelVersion } from './fueling-model.mjs';
import { loadProfile } from './profile.mjs';
import { initialRecipe, calculateRecipe } from './generation.mjs';
import { duration, drawRide, notice, previewRulerPlan } from './fueling-view.mjs';
import { distanceLabel } from './workout.mjs';
import { renderGelSelect } from './gel-editor.mjs';
import { DistanceRuler } from './ruler.mjs';
import { rideTerrain } from './terrain.mjs';

const $ = id => document.getElementById(id);
export function setupCalculator({ storage, draft, manageGels, onPreview }) {
  const terrainRuler = new DistanceRuler($('calc-terrain'));
  let entry = null, chartMode = 'elevation', group = 'rider', frame = null, active = false;
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
  ];
  for (const field of fields) {
    const wrap = document.createElement('div'); wrap.className = 'calc-control';
    const label = document.createElement('label'); label.htmlFor = `calc-${field.key}`; label.textContent = field.title;
    const line = document.createElement('div'); line.className = 'calc-input-line';
    const box = document.createElement('span'); box.className = 'calc-value ui-value';
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
    readCalculatorGel = renderGelSelect($('calc-gel-select'), storage, draft.recipe.gel, '试算：手动填写含量');
    for (const field of fields) {
      const value = draft.recipe.parameters[field.key], number = $(`calc-${field.key}`);
      number.value = value == null ? '' : String(+(value * (field.factor ?? 1)).toFixed(5));
      if (field.key === 'gelCarbsGrams') number.readOnly = !!draft.recipe.gel;
      const range = document.querySelector(`[data-range="${field.key}"]`); if (range) { range.value = number.value; rangePosition(range); }
    }
    $('calc-auto-carbs').checked = draft.recipe.parameters.carbsPerHour === null;
    $('calc-carbsPerHour').disabled = $('calc-auto-carbs').checked;
  }
  function readParameters() {
    return Object.fromEntries(fields.map(field => {
      const value = $(`calc-${field.key}`).value.trim();
      return [field.key, field.key === 'carbsPerHour' && $('calc-auto-carbs').checked ? null : value === '' ? NaN : Number(value) / (field.factor ?? 1)];
    }));
  }
  function renderRoute() {
    const real = draft.recipe.mode === 'route';
    const selectedRoute = Object.hasOwn(draft.recipe, 'route') ? draft.recipe.route : entry?.route;
    $('calc-use-route').disabled = !selectedRoute;
    $('calc-use-route').setAttribute('aria-pressed', String(real)); $('calc-use-simulation').setAttribute('aria-pressed', String(!real));
    $('calc-route-name').textContent = real ? selectedRoute?.title ?? '没有可用路书' : draft.recipe.title || '模拟路线';
    $('calc-simulation').hidden = real;
    $('calc-segments').replaceChildren();
    for (const [index, segment] of draft.recipe.segments.entries()) {
      const row = document.createElement('div'); row.className = 'calc-segment-row';
      const position = document.createElement('span'); position.textContent = String(index + 1).padStart(2, '0');
      const distance = document.createElement('input'); distance.type = 'number'; distance.className = 'ui-input ui-input--compact'; distance.min = .001; distance.step = .1;
      distance.value = segment.distanceMeters / 1000; distance.inputMode = 'decimal'; distance.dataset.segmentDistance = index;
      distance.setAttribute('aria-label', `路段 ${index + 1} 距离，公里`);
      const grade = document.createElement('input'); grade.type = 'number'; grade.className = 'ui-input ui-input--compact'; grade.min = -100; grade.max = 100; grade.step = .1;
      grade.value = segment.gradePercent; grade.inputMode = 'decimal'; grade.dataset.segmentGrade = index;
      grade.setAttribute('aria-label', `路段 ${index + 1} 坡度，百分比`);
      for (const input of [distance, grade]) input.addEventListener('input', () => { draft.recipe.title = '自定义分段'; markExample(null); queueCalculation(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '−'; remove.disabled = draft.recipe.segments.length === 1;
      remove.setAttribute('aria-label', `删除模拟路段 ${index + 1}`);
      remove.addEventListener('click', () => { readSegments(); draft.recipe.segments.splice(index, 1); draft.recipe.title = '自定义分段'; markExample(null); renderRoute(); calculate(); });
      row.append(position, distance, grade, remove); $('calc-segments').append(row);
    }
    $('calc-add-segment').disabled = draft.recipe.segments.length >= 30;
  }
  function readSegments() {
    if (draft.recipe.mode === 'route') return;
    draft.recipe.segments = [...$('calc-segments').children].map(row => {
      const distance = row.querySelector('[data-segment-distance]').value.trim(), grade = row.querySelector('[data-segment-grade]').value.trim();
      return { distanceMeters: distance ? Number(distance) * 1000 : NaN, gradePercent: grade ? Number(grade) : NaN };
    });
  }
  function markExample(key) { for (const button of document.querySelectorAll('[data-example]')) button.setAttribute('aria-pressed', String(button.dataset.example === key)); }
  function selectGroup(value) {
    group = value; document.body.dataset.group = group;
    for (const button of document.querySelectorAll('button[data-group]')) { const selected = button.dataset.group === group; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }
    for (const panel of document.querySelectorAll('[data-panel]')) panel.classList.toggle('active', panel.dataset.panel === group);
    redraw();
  }
  function redraw() {
    $('calc-terrain').hidden = chartMode !== 'elevation';
    $('calc-chart').hidden = chartMode !== 'speed';
    terrainRuler.setActive(active && !!draft.result && chartMode === 'elevation' && !['equipment', 'fuel'].includes(group));
    if (!active || !draft.result || !$('calc-visuals').getClientRects().length) return;
    if (chartMode === 'speed') drawRide($('calc-chart'), draft.result.ride, draft.result.schedule, 'speed');
    else if (chartMode === 'elevation') {
      const route = draft.recipe.mode === 'route' ? (Object.hasOwn(draft.recipe, 'route') ? draft.recipe.route : entry?.route) : null;
      terrainRuler.update(previewRulerPlan(draft.result.ride, draft.result.schedule), rideTerrain(draft.result.ride, route));
    }
  }
  function calculate() {
    try {
      draft.recipe.parameters = readParameters(); readSegments();
      draft.result = calculateRecipe(draft.recipe, entry);
      const { ride, schedule } = draft.result;
      $('calc-duration').textContent = duration(ride.elapsedSeconds); $('calc-speed').textContent = `${ride.averageKph.toFixed(1)} km/h`;
      $('calc-energy').textContent = `约${Math.round(ride.calories)} kcal`; $('calc-gels').textContent = `${schedule.gelCount}支`;
      $('calc-power').textContent = `目标功率 ${Math.round(ride.parameters.ftpWatts * ride.parameters.effort)} W（${ride.parameters.ftpWatts} W × ${Math.round(ride.parameters.effort * 100)}%）`;
      $('calc-route-totals').textContent = `合计 ${distanceLabel(ride.totalDistanceMeters)} · 爬升 ${Math.round(ride.ascentMeters)} m`;
      $('calc-route-summary').textContent = `${draft.recipe.mode === 'route' ? '路书' : '模拟路线'} · ${ride.routeTitle} · ${distanceLabel(ride.totalDistanceMeters)} / ${Math.round(ride.ascentMeters)} m　编辑 ›`;
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
      draft.result = null; terrainRuler.setActive(false); notice($('calc-error'), error.message);
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
  for (const button of document.querySelectorAll('button[data-group]')) { button.addEventListener('click', () => selectGroup(button.dataset.group)); tabKeys(button, 'button[data-group]'); }
  for (const button of document.querySelectorAll('button[data-chart]')) {
    button.addEventListener('click', () => {
      chartMode = button.dataset.chart; document.body.dataset.chart = chartMode;
      for (const item of document.querySelectorAll('button[data-chart]')) { const selected = item === button; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; }
      $('calc-plot').hidden = chartMode === 'details'; calculate();
    });
    tabKeys(button, 'button[data-chart]');
  }
  for (const button of document.querySelectorAll('[data-example]')) button.addEventListener('click', () => {
    draft.recipe.mode = 'simulation'; Object.assign(draft.recipe, structuredClone(examples[button.dataset.example]));
    markExample(button.dataset.example); renderRoute(); calculate();
  });
  $('calc-reset').addEventListener('click', () => {
    const details = draft.recipe.details, gel = draft.recipe.gel;
    draft.recipe = { ...initialRecipe(entry, {}), parameters: { ...defaults }, mode: 'simulation', ...structuredClone(examples.climb) };
    if (details) draft.recipe.details = details;
    draft.recipe.gel = gel ?? null;
    if (gel) draft.recipe.parameters.gelCarbsGrams = gel.carbsGrams;
    fillParameters(); markExample('climb'); renderRoute(); notice($('calc-context'), '已恢复示例参数：FTP 250 W、体重 70 kg。个人档案没有变化。'); calculate();
  });
  $('calc-reset-top').addEventListener('click', () => $('calc-reset').click());
  $('calc-profile').addEventListener('click', () => {
    const profile = loadProfile(storage);
    for (const key of ['ftpWatts', 'weightKg']) if (profile.profile[key] !== null) {
      draft.recipe.parameters[key] = profile.profile[key]; $(`calc-${key}`).value = profile.profile[key];
      const range = document.querySelector(`[data-range="${key}"]`); range.value = profile.profile[key]; rangePosition(range);
    }
    notice($('calc-context'), profile.message || (profile.profile.ftpWatts === null || profile.profile.weightKg === null ? '档案有未填写项，只带入已有值；其余参数仍是当前试算值。' : '已从个人档案带入 FTP 和体重；此页修改不会回写档案。')); calculate();
  });
  $('calc-use-route').addEventListener('click', () => { readSegments(); draft.recipe.mode = 'route'; markExample(null); renderRoute(); calculate(); });
  $('calc-use-simulation').addEventListener('click', () => { draft.recipe.mode = 'simulation'; renderRoute(); calculate(); });
  $('calc-add-segment').addEventListener('click', () => { readSegments(); draft.recipe.segments.push({ distanceMeters: 10000, gradePercent: 0 }); draft.recipe.title = '自定义分段'; markExample(null); renderRoute(); calculate(); });
  $('calc-route-summary').addEventListener('click', () => { selectGroup('route'); $('calc-use-simulation').focus({ preventScroll: true }); });
  $('calc-auto-carbs').addEventListener('change', () => { $('calc-carbsPerHour').disabled = $('calc-auto-carbs').checked; calculate(); });
  let readCalculatorGel = () => null;
  $('calc-gel-select').addEventListener('change', () => {
    draft.recipe.gel = readCalculatorGel($('calc-gel-select').value);
    if (draft.recipe.gel) draft.recipe.parameters.gelCarbsGrams = draft.recipe.gel.carbsGrams;
    fillParameters(); calculate();
  });
  $('calc-manage-gels').addEventListener('click', async () => {
    const editing = draft.recipe;
    await manageGels();
    if (active && editing === draft.recipe) { fillParameters(); calculate(); }
  });
  $('calc-copy').addEventListener('click', async () => {
    calculate(); if (!draft.result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ modelVersion, recipe: draft.recipe, result: draft.result }, null, 2));
      notice($('calc-action-status'), '参数与结果已复制，可用于复现这次计算。');
    } catch { notice($('calc-action-status'), '未能复制，请允许剪贴板权限后重试。'); }
  });
  function flush() {
    if (frame !== null) { cancelAnimationFrame(frame); frame = null; calculate(); }
  }
  $('calc-preview').addEventListener('click', () => {
    flush();
    if (draft.result) onPreview();
  });
  function start(source, transferred, restored) {
    active = true; entry = source; draft.result = null;
    draft.recipe = transferred ?? { ...initialRecipe(entry, {}), parameters: { ...defaults, gelCarbsGrams: entry?.gel?.carbsGrams ?? defaults.gelCarbsGrams }, mode: entry?.route ? 'route' : 'simulation', ...structuredClone(examples.climb) };
    chartMode = 'elevation'; document.body.dataset.chart = chartMode;
    for (const button of document.querySelectorAll('button[data-chart]')) {
      const selected = button.dataset.chart === chartMode;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    }
    $('calc-plot').hidden = false; notice($('calc-context')); notice($('calc-action-status'));
    if (transferred && !restored && (draft.recipe.parameters.ftpWatts === null || draft.recipe.parameters.weightKg === null)) {
      draft.recipe.parameters = { ...draft.recipe.parameters, ftpWatts: draft.recipe.parameters.ftpWatts ?? defaults.ftpWatts, weightKg: draft.recipe.parameters.weightKg ?? defaults.weightKg };
      notice($('calc-context'), '档案缺少 FTP 或体重，缺项暂用示例 250 W／70 kg；请调整后再生成。');
    } else if (!transferred) notice($('calc-context'), '示例 250 W／70 kg；可带入档案，调整不回写。');
    fillParameters(); renderRoute(); markExample(draft.recipe.mode === 'simulation' ? 'climb' : null); selectGroup(restored?.group ?? 'rider'); calculate();
    if (['speed', 'details'].includes(restored?.chartMode)) document.querySelector(`button[data-chart="${restored.chartMode}"]`).click();
  }
  const observer = new ResizeObserver(() => { if (active) redraw(); });
  return { start, flush, tabs: () => ({ group, chartMode }), activate(value) {
    active = value;
    if (active) { observer.observe($('calc-chart')); redraw(); }
    else { flush(); observer.disconnect(); terrainRuler.setActive(false); }
  } };
}
