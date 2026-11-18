import { loadProfile } from './profile.mjs';
import { initialRecipe, calculateRecipe, readTransfer, writeTransfer } from './generation.mjs';
import { duration, renderStops, notice, previewRulerPlan } from './fueling-view.mjs';
import { distanceLabel } from './workout.mjs';
import { icon } from './artwork.mjs';
import { today } from './library.mjs';
import { renderGelSelect } from './gel-editor.mjs';
import { DistanceRuler } from './ruler.mjs';
import { rideTerrain } from './terrain.mjs';

export function setupGenerator({ storage, current, openSheet, save, chooseRoute, manageGels, returnToPlan, available = () => true }) {
  const $ = id => document.getElementById(id), dialog = $('generation-dialog');
  const session = { getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value) };
  let recipe = null, result = null, preview = false, needsRoute = false, leaving = false, saved = false;
  let readGel = () => null;
  const previewRuler = new DistanceRuler($('fuel-chart'), () => {}, id => {
    const row = $('fuel-preview-stops').children[Number(id)];
    for (const item of $('fuel-preview-stops').children) item.classList.toggle('focused-stop', item === row);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  previewRuler.setActive(false);
  const source = () => recipe?.sourceRevision === null ? null : current(recipe);
  const selectedRoute = () => Object.hasOwn(recipe, 'route') ? recipe.route : source()?.route;
  const number = input => input.value.trim() ? Number(input.value) : NaN;
  function settings() {
    recipe.parameters.carbsPerHour = $('fuel-auto-carbs').checked ? null : number($('fuel-carbs'));
    recipe.gel = readGel($('fuel-gel').value);
    if (recipe.gel) recipe.parameters.gelCarbsGrams = recipe.gel.carbsGrams;
    recipe.details = { name: $('fuel-plan-name').value.trim(), rideDate: recipe.details?.rideDate ?? source()?.rideDate ?? today() };
  }
  function fill() {
    $('fuel-auto-carbs').checked = recipe.parameters.carbsPerHour === null;
    $('fuel-carbs').disabled = $('fuel-auto-carbs').checked;
    $('fuel-carbs').value = recipe.parameters.carbsPerHour ?? '';
    readGel = renderGelSelect($('fuel-gel'), storage, recipe.gel);
    $('fuel-plan-name').value = recipe.details?.name ?? `${(source()?.name ?? selectedRoute()?.title ?? recipe.title ?? '骑行').replace(/(?: · 自动补给)+$/, '').slice(0, 52)} · 自动补给`;
    $('fuel-route-name').textContent = recipe.mode === 'route' ? selectedRoute()?.title ?? '尚未选择路线' : recipe.title || '模拟路线';
    $('fuel-route-summary').textContent = '';
    $('fuel-choose-route').hidden = false;
    $('fuel-choose-route').textContent = selectedRoute() ? '更换 ›' : '选择路线 ›';
    $('fuel-profile-summary').textContent = `FTP ${recipe.parameters.ftpWatts ?? '未填写'}${recipe.parameters.ftpWatts == null ? '' : ' W'} · 体重 ${recipe.parameters.weightKg ?? '未填写'}${recipe.parameters.weightKg == null ? '' : ' kg'}`;
    $('fuel-power').textContent = recipe.parameters.ftpWatts == null ? '' : `目标功率 ${Math.round(recipe.parameters.ftpWatts * recipe.parameters.effort)} W`;
    for (const button of dialog.querySelectorAll('[data-effort]')) button.setAttribute('aria-pressed', String(Number(button.dataset.effort) === recipe.parameters.effort));
  }
  function calculate() {
    try {
      if (needsRoute) throw new Error('请先选择路书；也可以进入计算器，明确设置模拟路线。');
      settings();
      if (!recipe.gel) throw new Error('请选择自己的能量胶；还没配置时，点“管理”添加名称与每支碳水。');
      result = calculateRecipe(recipe, source());
      $('fuel-duration').textContent = `约 ${duration(result.ride.elapsedSeconds)}`;
      $('fuel-route-summary').textContent = `${distanceLabel(result.ride.totalDistanceMeters)} · 爬升 ${Math.round(result.ride.ascentMeters)} m${recipe.mode === 'simulation' ? ' · 模拟路线' : ''}`;
      if ($('fuel-auto-carbs').checked) $('fuel-carbs').value = result.ride.carbsPerHour;
      $('fuel-preview-button').disabled = false; $('fuel-save').disabled = false; notice($('fuel-notice'));
      notice($('fuel-warnings'), result.ride.warnings.join(' ')); return true;
    } catch (error) {
      result = null; $('fuel-duration').textContent = '—'; $('fuel-preview-button').disabled = true; $('fuel-save').disabled = true;
      notice($('fuel-notice'), error.message); notice($('fuel-warnings')); return false;
    }
  }
  function view(value) {
    preview = value; dialog.classList.toggle('showing-preview', preview);
    dialog.querySelector('.fuel-source').hidden = preview;
    previewRuler.setActive(preview); $('fuel-settings').hidden = preview; $('fuel-preview').hidden = !preview;
    $('fuel-preview-button').hidden = preview; $('fuel-save').hidden = !preview;
    $('fuel-title').textContent = preview ? '补给预览' : '生成补给';
    $('fuel-back').setAttribute('aria-label', preview ? '返回生成设置' : '关闭生成补给');
    $('fuel-back').innerHTML = preview ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>' : icon('close');
    if (preview && result) {
      const { ride, schedule } = result;
      $('fuel-preview-summary').textContent = `${recipe.gel.name} · ${recipe.gel.carbsGrams}g/支 · ${schedule.gelCount} 支 · 约${duration(ride.elapsedSeconds)}`;
      $('fuel-preview-summary').title = `目标 ${ride.carbsPerHour} g/h，共 ${schedule.plannedCarbsGrams}g，计划平均 ${schedule.actualCarbsPerHour.toFixed(0)} g/h`;
      renderStops($('fuel-preview-stops'), schedule); $('fuel-preview-empty').hidden = schedule.stops.length > 0;
      requestAnimationFrame(() => { if (dialog.open && result) previewRuler.update(previewRulerPlan(ride, schedule), rideTerrain(ride, recipe.mode === 'route' ? selectedRoute() : null)); });
    }
    dialog.scrollTop = 0;
  }
  function open(transferred = null, showPreview = false, missingRoute = false) {
    if (!available()) return;
    const loaded = loadProfile(storage);
    recipe = transferred ?? initialRecipe(current(), loaded.profile); needsRoute = missingRoute || !transferred && !current()?.route;
    fill(); view(false); openSheet(dialog);
    if (needsRoute) $('fuel-route-name').textContent = '尚未选择路线';
    if (calculate() && showPreview) view(true);
    if (loaded.message) notice($('fuel-notice'), loaded.message);
  }
  async function openOther(buttonID, dialogID) {
    settings(); const previous = structuredClone(recipe), beforeProfile = loadProfile(storage).profile, previousNeedsRoute = needsRoute;
    leaving = true;
    await new Promise(resolve => { dialog.addEventListener('close', () => requestAnimationFrame(resolve), { once: true }); dialog.close(); });
    leaving = false;
    $(dialogID).addEventListener('close', () => requestAnimationFrame(() => {
      if (buttonID !== 'profile-entry') { open(); return; }
      const nextProfile = loadProfile(storage).profile;
      for (const key of ['ftpWatts', 'weightKg']) if (nextProfile[key] !== beforeProfile[key]) previous.parameters[key] = nextProfile[key];
      open(previous, false, previousNeedsRoute);
    }), { once: true });
    $(buttonID).click();
  }
  $('fuel-profile').addEventListener('click', () => openOther('profile-entry', 'profile-dialog'));
  $('fuel-gel-manage').addEventListener('click', async () => {
    settings(); const previous = structuredClone(recipe), missing = needsRoute;
    leaving = true;
    await new Promise(resolve => { dialog.addEventListener('close', () => requestAnimationFrame(resolve), { once: true }); dialog.close(); });
    leaving = false; await manageGels(); open(previous, false, missing);
  });
  $('fuel-choose-route').addEventListener('click', async () => {
    settings(); const previous = structuredClone(recipe), previousNeedsRoute = needsRoute, route = selectedRoute();
    leaving = true;
    await new Promise(resolve => { dialog.addEventListener('close', () => requestAnimationFrame(resolve), { once: true }); dialog.close(); });
    leaving = false;
    const selected = await chooseRoute(route);
    if (selected !== undefined) { previous.route = selected; previous.mode = selected ? 'route' : 'simulation'; }
    open(previous, false, selected === undefined ? previousNeedsRoute : !selected);
  });
  $('fuel-back').addEventListener('click', () => preview ? view(false) : dialog.close());
  for (const button of dialog.querySelectorAll('[data-effort]')) button.addEventListener('click', () => {
    settings(); recipe.parameters.effort = Number(button.dataset.effort); fill(); calculate();
  });
  $('fuel-auto-carbs').addEventListener('change', () => { $('fuel-carbs').disabled = $('fuel-auto-carbs').checked; calculate(); });
  $('fuel-carbs').addEventListener('input', calculate);
  $('fuel-gel').addEventListener('change', calculate);
  $('fuel-preview-button').addEventListener('click', () => { if (calculate()) view(true); });
  $('fuel-save').addEventListener('click', () => {
    try { if (!calculate()) return; save(recipe); saved = true; dialog.close(); }
    catch (error) { notice($('fuel-notice'), error.message); }
  });
  dialog.addEventListener('close', () => {
    previewRuler.setActive(false);
    if (!leaving && !saved) requestAnimationFrame(() => returnToPlan(recipe));
    saved = false;
  });
  $('fuel-calculator').addEventListener('click', event => {
    settings();
    try { writeTransfer(session, recipe); }
    catch (error) { event.preventDefault(); notice($('fuel-notice'), error.message); }
  });
  if (new URL(location.href).searchParams.get('generate') === 'preview') {
    const transferred = readTransfer(session);
    const url = new URL(location.href); url.searchParams.delete('generate'); history.replaceState(null, '', url);
    requestAnimationFrame(() => transferred ? open(transferred, true) : open());
  }
  return { open };
}
