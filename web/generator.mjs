import { visitSheet } from './sheets.mjs';
import { loadProfile } from './profile.mjs';
import { initialRecipe, calculateRecipe, readTransfer, writeTransfer } from './generation.mjs';
import { duration, renderStops, notice, previewRulerPlan } from './fueling-view.mjs';
import { distanceLabel } from './workout.mjs';
import { icon } from './artwork.mjs';
import { today } from './library.mjs';
import { renderGelSelect } from './gel-editor.mjs';
import { DistanceRuler } from './ruler.mjs';
import { rideTerrain } from './terrain.mjs';

export function setupGenerator({ draft, openCalculator, closeCalculatorPreview, finishGenerator, storage, current, openSheet, save, chooseRoute, manageGels, editProfile, returnToPlan, available = () => true }) {
  const $ = id => document.getElementById(id), dialog = $('generation-dialog');
  const session = { getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value) };
  let preview = false, needsRoute = false, fromCalculator = false, saved = false;
  let readGel = () => null;
  const previewRuler = new DistanceRuler($('fuel-chart'), () => {}, id => {
    const row = $('fuel-preview-stops').children[Number(id)];
    for (const item of $('fuel-preview-stops').children) item.classList.toggle('focused-stop', item === row);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  previewRuler.setActive(false);
  const source = () => draft.recipe?.sourceRevision === null ? null : current(draft.recipe);
  const selectedRoute = () => Object.hasOwn(draft.recipe, 'route') ? draft.recipe.route : source()?.route;
  const number = input => input.value.trim() ? Number(input.value) : NaN;
  function settings() {
    draft.recipe.parameters.carbsPerHour = $('fuel-auto-carbs').checked ? null : number($('fuel-carbs'));
    draft.recipe.gel = readGel($('fuel-gel').value);
    if (draft.recipe.gel) draft.recipe.parameters.gelCarbsGrams = draft.recipe.gel.carbsGrams;
    draft.recipe.details = { name: $('fuel-plan-name').value.trim(), rideDate: draft.recipe.details?.rideDate ?? source()?.rideDate ?? today() };
  }
  function fill() {
    $('fuel-auto-carbs').checked = draft.recipe.parameters.carbsPerHour === null;
    $('fuel-carbs').disabled = $('fuel-auto-carbs').checked;
    $('fuel-carbs').value = draft.recipe.parameters.carbsPerHour ?? '';
    readGel = renderGelSelect($('fuel-gel'), storage, draft.recipe.gel);
    $('fuel-plan-name').value = draft.recipe.details?.name ?? `${(source()?.name ?? selectedRoute()?.title ?? draft.recipe.title ?? '骑行').replace(/(?: · 自动补给)+$/, '').slice(0, 52)} · 自动补给`;
    $('fuel-route-name').textContent = draft.recipe.mode === 'route' ? selectedRoute()?.title ?? '尚未选择路线' : draft.recipe.title || '模拟路线';
    $('fuel-route-summary').textContent = '';
    $('fuel-choose-route').hidden = false;
    $('fuel-choose-route').textContent = selectedRoute() ? '更换 ›' : '选择路线 ›';
    $('fuel-profile-summary').textContent = `FTP ${draft.recipe.parameters.ftpWatts ?? '未填写'}${draft.recipe.parameters.ftpWatts == null ? '' : ' W'} · 体重 ${draft.recipe.parameters.weightKg ?? '未填写'}${draft.recipe.parameters.weightKg == null ? '' : ' kg'}`;
    $('fuel-power').textContent = draft.recipe.parameters.ftpWatts == null ? '' : `目标功率 ${Math.round(draft.recipe.parameters.ftpWatts * draft.recipe.parameters.effort)} W`;
    for (const button of dialog.querySelectorAll('[data-effort]')) button.setAttribute('aria-pressed', String(Number(button.dataset.effort) === draft.recipe.parameters.effort));
  }
  function calculate() {
    try {
      if (needsRoute) throw new Error('请先选择路书；也可以进入计算器，明确设置模拟路线。');
      settings();
      if (!draft.recipe.gel) throw new Error('请选择自己的能量胶；还没配置时，点“管理”添加名称与每支碳水。');
      draft.result = calculateRecipe(draft.recipe, source());
      $('fuel-duration').textContent = `约 ${duration(draft.result.ride.elapsedSeconds)}`;
      $('fuel-route-summary').textContent = `${distanceLabel(draft.result.ride.totalDistanceMeters)} · 爬升 ${Math.round(draft.result.ride.ascentMeters)} m${draft.recipe.mode === 'simulation' ? ' · 模拟路线' : ''}`;
      if ($('fuel-auto-carbs').checked) $('fuel-carbs').value = draft.result.ride.carbsPerHour;
      $('fuel-preview-button').disabled = false; $('fuel-save').disabled = false; notice($('fuel-notice'));
      notice($('fuel-warnings'), draft.result.ride.warnings.join(' ')); return true;
    } catch (error) {
      draft.result = null; $('fuel-duration').textContent = '—'; $('fuel-preview-button').disabled = true; $('fuel-save').disabled = true;
      notice($('fuel-notice'), error.message); notice($('fuel-warnings')); return false;
    }
  }
  function view(value) {
    preview = value; dialog.classList.toggle('showing-preview', preview);
    dialog.querySelector('.fuel-source').hidden = preview;
    previewRuler.setActive(preview); $('fuel-settings').hidden = preview; $('fuel-preview').hidden = !preview;
    $('fuel-preview-button').hidden = preview; $('fuel-save').hidden = !preview;
    $('fuel-title').textContent = preview ? '补给预览' : '生成补给';
    $('fuel-back').setAttribute('aria-label', preview ? (fromCalculator ? '返回计算器' : '返回生成设置') : '关闭生成补给');
    $('fuel-back').innerHTML = preview ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>' : icon('close');
    if (preview && draft.result) {
      const { ride, schedule } = draft.result;
      $('fuel-preview-summary').textContent = `${draft.recipe.gel?.name ?? '试算用胶'} · ${draft.recipe.parameters.gelCarbsGrams}g/支 · ${schedule.gelCount} 支 · 约${duration(ride.elapsedSeconds)}`;
      $('fuel-preview-summary').title = `目标 ${ride.carbsPerHour} g/h，共 ${schedule.plannedCarbsGrams}g，计划平均 ${schedule.actualCarbsPerHour.toFixed(0)} g/h`;
      renderStops($('fuel-preview-stops'), schedule); $('fuel-preview-empty').hidden = schedule.stops.length > 0;
      if (dialog.open) drawPreview();
    }
    dialog.scrollTop = 0;
  }
  function drawPreview() {
    const { ride, schedule } = draft.result;
    previewRuler.update(previewRulerPlan(ride, schedule), rideTerrain(ride, draft.recipe.mode === 'route' ? selectedRoute() : null));
  }
  function openView(showPreview) {
    view(showPreview); openSheet(dialog);
    if (showPreview) drawPreview();
  }
  function open(transferred = null, showPreview = false, missingRoute = false) {
    if (!available()) return;
    fromCalculator = false;
    const loaded = loadProfile(storage);
    draft.recipe = transferred ?? initialRecipe(current(), loaded.profile); needsRoute = missingRoute || !transferred && !current()?.route;
    fill();
    if (needsRoute) $('fuel-route-name').textContent = '尚未选择路线';
    openView(calculate() && showPreview);
    if (loaded.message) notice($('fuel-notice'), loaded.message);
  }
  $('fuel-profile').addEventListener('click', () => {
    settings();
    const before = loadProfile(storage).profile;
    visitSheet(dialog, editProfile, () => {
      const after = loadProfile(storage).profile;
      for (const key of ['ftpWatts', 'weightKg']) if (after[key] !== before[key]) draft.recipe.parameters[key] = after[key];
      open(draft.recipe, false, needsRoute);
    });
  });
  $('fuel-gel-manage').addEventListener('click', () => {
    settings();
    visitSheet(dialog, manageGels, () => open(draft.recipe, false, needsRoute));
  });
  $('fuel-choose-route').addEventListener('click', () => {
    settings();
    visitSheet(dialog, () => chooseRoute(selectedRoute()), selected => {
      if (selected !== undefined) { draft.recipe.route = selected; draft.recipe.mode = selected ? 'route' : 'simulation'; }
      open(draft.recipe, false, selected === undefined ? needsRoute : !selected);
    });
  });
  $('fuel-back').addEventListener('click', () => preview && !fromCalculator ? view(false) : dialog.close());
  for (const button of dialog.querySelectorAll('[data-effort]')) button.addEventListener('click', () => {
    settings(); draft.recipe.parameters.effort = Number(button.dataset.effort); fill(); calculate();
  });
  $('fuel-auto-carbs').addEventListener('change', () => { $('fuel-carbs').disabled = $('fuel-auto-carbs').checked; calculate(); });
  $('fuel-carbs').addEventListener('input', calculate);
  $('fuel-gel').addEventListener('change', calculate);
  $('fuel-preview-button').addEventListener('click', () => { if (draft.result) view(true); });
  $('fuel-save').addEventListener('click', () => {
    try { if (!dialog.open || saved || !draft.result) return; settings(); save(draft.recipe); saved = true; dialog.close(); }
    catch (error) { notice($('fuel-notice'), error.message); }
  });
  dialog.addEventListener('close', () => {
    previewRuler.setActive(false);
    if (fromCalculator) { rememberName(); closeCalculatorPreview(saved); }
    else {
      if (!saved) returnToPlan(draft.recipe);
      finishGenerator();
    }
    saved = false;
  });
  function advanced(event) {
    if (event.button > 1) return;
    settings();
    if (event.button === 1 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      try { writeTransfer(session, draft.recipe); }
      catch (error) { event.preventDefault(); notice($('fuel-notice'), error.message); }
      return;
    }
    event.preventDefault(); openCalculator();
  }
  $('fuel-calculator').addEventListener('click', advanced);
  $('fuel-calculator').addEventListener('auxclick', advanced);
  if (new URL(location.href).searchParams.get('generate') === 'preview') {
    const transferred = readTransfer(session);
    const url = new URL(location.href); url.searchParams.delete('generate'); history.replaceState(null, '', url);
    if (transferred) open(transferred, true); else open();
    delete document.documentElement.dataset.loadingPreview;
  }
  function calculatorPreview() {
    fromCalculator = true; needsRoute = false;
    fill();
    notice($('fuel-notice'), draft.recipe.gel ? '' : '手填含量仅供试算。返回计算器选择自己的胶后即可保存。');
    notice($('fuel-warnings'), draft.result.ride.warnings.join(' '));
    $('fuel-save').disabled = !draft.recipe.gel; openView(true);
  }
  function rememberName() {
    if (preview) draft.recipe.details = { name: $('fuel-plan-name').value.trim(), rideDate: draft.recipe.details?.rideDate ?? source()?.rideDate ?? today() };
  }
  return { open, calculatorPreview, rememberName, pause() { previewRuler.setActive(false); } };

}
