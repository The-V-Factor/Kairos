import { showSheet, suspendSheet, releaseSheets, visitSheet } from './sheets.mjs';
import { setupCalculator } from './calculator.mjs';
import { setupNavigation } from './navigation.mjs';
import { encodeWorkout, validatePlan, distanceLabel, roundedMeters } from './workout.mjs';
import { sharePrepared, shareSupport } from './share.mjs';
import { kinds, newID, parseDistance, validateDraft, saveStop } from './plan.mjs';
import { fuelArtwork, icon } from './artwork.mjs';
import { DistanceRuler, setRulerHaptics } from './ruler.mjs';
import { entryTerrain } from './terrain.mjs';
import { loadHaptics, storeHaptics } from './haptics.mjs';
import { themes, loadTheme, storeTheme } from './themes.mjs';
import { loadLibrary, storeLibrary, activeEntry, createPlan, updatePlan, updateDetails, selectPlan, duplicatePlan, deletePlan, restorePlan, recordExport, validateDate, today, validateLibrary } from './library.mjs';
import { PlanCalendar, KilometerWheel, shortDate } from './plan-controls.mjs';
import { setupRoutePicker } from './route-picker.mjs';
import { loadProfile } from './profile.mjs';
import { setupProfileEditor } from './profile-editor.mjs';
import { setupGenerator } from './generator.mjs';
import { generatedLibrary, initialRecipe, readTransfer, revision } from './generation.mjs';
import './focus.mjs';
import { setupGelEditor, renderGelSelect } from './gel-editor.mjs';

const $ = id => document.getElementById(id);
const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
const loaded = loadLibrary(storage);
let themeID = loadTheme(storage);
let library = loaded.library;
let plan = activeEntry(library)?.plan ?? null;
let writable = loaded.writable;
let prepared = null, sharing = false, cursor = (plan?.totalDistanceMeters ?? 0) / 2, deleted = null, editing = null;
let removedPlan = null, libraryTab = 'plans', libraryMode = 'list', managedEntry = null, routeDraft = null, gelDraft = null, readPlanGel = () => null, storageNotice = loaded.message;
let draft = null, reminderWasEdited = false, selectedID = null, swipedID = null;
const removing = new Set();
const rows = new Map();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
for (const node of document.querySelectorAll('[data-icon]')) node.innerHTML = icon(node.dataset.icon);
for (const button of document.querySelectorAll('[data-kind]')) button.querySelector('.type-art').innerHTML = fuelArtwork(button.dataset.kind);
const ruler = new DistanceRuler($('ruler'), value => {
  cursor = value;
  const nearest = plan?.stops.reduce((best, stop) => {
    const delta = Math.abs(stop.distanceMeters - value);
    if (!best || delta < Math.abs(best.distanceMeters - value)
      || (delta === Math.abs(best.distanceMeters - value) && stop.id === selectedID)) return stop;
    return best;
  }, null);
  if (selectedID !== (nearest?.id ?? null)) {
    selectedID = nearest?.id ?? null;
    updateSelection();
  }
  $('detail-heading').textContent = nearest && nearest.distanceMeters !== value ? '最近补给' : '当前补给';
}, id => {
  selectedID = id; updateSelection();
  const list = $('stops'), row = rows.get(id);
  if (!row) return;
  const behavior = reduced.matches ? 'instant' : 'smooth';
  if (list.scrollHeight <= list.clientHeight) row.scrollIntoView({ block: 'nearest', behavior });
  else {
    const bounds = list.getBoundingClientRect(), item = row.getBoundingClientRect();
    const delta = item.top < bounds.top ? item.top - bounds.top : Math.max(0, item.bottom - bounds.bottom);
    list.scrollBy({ top: delta, behavior });
  }
});
const preferredHaptics = loadHaptics(storage);
setRulerHaptics(preferredHaptics);
$('haptics-toggle').checked = preferredHaptics && ruler.haptics.available;
$('haptics-toggle').disabled = !ruler.haptics.available;
$('haptics-status').textContent = ruler.haptics.available ? '' : '此设备不支持触感。';
$('haptics-status').hidden = ruler.haptics.available;
$('haptics-toggle').addEventListener('change', () => {
  const enabled = $('haptics-toggle').checked;
  setRulerHaptics(enabled);
  const warning = storeHaptics(storage, enabled);
  $('haptics-status').textContent = warning; $('haptics-status').hidden = !warning;
});

for (const [index, theme] of themes.entries()) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'theme-choice';
  button.dataset.themeID = theme.id; button.setAttribute('role', 'radio');
  button.setAttribute('aria-label', `${theme.title}，${theme.caption}`);
  button.innerHTML = `<span class="theme-preview" data-theme="${theme.id}" aria-hidden="true"><span class="mini-brand">KAIROS <i>${'ABCDE'[index]}</i></span><span class="mini-title">${theme.id === 'journal' ? '补给路书' : '骑行补给'}</span><span class="mini-landscape"></span><span class="mini-ruler"></span><span class="mini-stop">${fuelArtwork('water')}<strong>25.0<small>喝水</small></strong></span><span class="mini-stop">${fuelArtwork('gel')}<strong>45.0<small>吃胶</small></strong></span><span class="mini-action"></span></span><span class="theme-choice-title">${theme.title}<span class="theme-check" aria-hidden="true">✓</span></span>`;
  button.addEventListener('click', () => { chooseTheme(theme.id); $('theme-dialog').close(); });
  button.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % themes.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + themes.length - 1) % themes.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = themes.length - 1;
    else return;
    event.preventDefault(); chooseTheme(themes[next].id); $('theme-options').children[next].focus();
  });
  $('theme-options').append(button);
}
function renderTheme() {
  const theme = themes.find(theme => theme.id === themeID);
  document.documentElement.dataset.theme = themeID;
  $('theme-name').textContent = theme.title;
  $('theme').setAttribute('aria-label', `更换皮肤，当前${theme.title}`);
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
  for (const button of $('theme-options').children) {
    const selected = button.dataset.themeID === themeID;
    button.setAttribute('aria-checked', String(selected)); button.tabIndex = selected ? 0 : -1;
  }
}
function chooseTheme(id) {
  ruler.haptics.stop(); themeID = id; renderTheme();
  message('theme-status', storeTheme(storage, id));
}
renderTheme();

function message(id, text = '') { $(id).textContent = text; $(id).hidden = !text; }
function displayName(stop) { return stop.kind === 'custom' ? stop.name : kinds[stop.kind].title; }
function wiggle(node) {
  if (!node || reduced.matches) return;
  node.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(9deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(0deg)' }], { duration: 500, easing: 'ease-out' });
}
function reportStorage(warning) {
  storageNotice = warning;
  message('storage-message', storageNotice);
  message('library-notice', storageNotice);
}
function persist() { reportStorage(writable ? storeLibrary(storage, library) : storageNotice); }
function updateSelection() {
  for (const [id, row] of rows) row.classList.toggle('selected', id === selectedID);
  const stops = plan?.stops ?? [];
  const index = stops.findIndex(stop => stop.id === selectedID), stop = stops[index];
  const gel = stop?.kind === 'gel' ? activeEntry(library)?.gel : null;
  $('detail-index').textContent = stop ? `${String(index + 1).padStart(2, '0')} / ${String(stops.length).padStart(2, '0')}` : '';
  $('detail-type').textContent = stop ? { water: 'WATER', gel: 'ENERGY GEL', custom: 'CUSTOM' }[stop.kind] : '';
  $('detail-art').innerHTML = stop ? fuelArtwork(stop.kind) : '';
  $('detail-distance').textContent = stop ? distanceLabel(stop.distanceMeters) : '';
  $('detail-name').textContent = stop ? (gel?.name ?? displayName(stop)) : '尚无补给点';
  $('detail-reminder').textContent = stop?.reminder ?? '';
  $('detail-prompt').hidden = !stop;
  $('detail-edit').hidden = !stop;
  $('detail-art').parentElement.hidden = !stop;
}
$('detail-edit').addEventListener('click', () => { if (selectedID) openComposer(selectedID); });
function closeSwipes() {
  swipedID = null;
  for (const row of rows.values()) {
    row.querySelector('.stop-content').style.transform = '';
    row.querySelector('.swipe-delete').inert = true;
  }
}
function wireSwipe(row, stopID) {
  const button = row.querySelector('.stop-content'), remove = row.querySelector('.swipe-delete');
  let gesture = null, suppressClick = false;
  button.addEventListener('pointerdown', event => {
    if (removing.size || sharing || (event.pointerType === 'mouse' && event.button !== 0)) return;
    suppressClick = false;
    gesture = { x: event.clientX, y: event.clientY, offset: swipedID === stopID ? -80 : 0, delta: 0, active: false };
  });
  button.addEventListener('pointermove', event => {
    if (!gesture) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.active && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
    if (!gesture.active && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      gesture.active = true; suppressClick = true;
      const offset = gesture.offset; closeSwipes(); gesture.offset = offset;
      button.setPointerCapture(event.pointerId); button.classList.add('dragging');
    }
    if (gesture.active) {
      gesture.delta = Math.max(-80, Math.min(0, gesture.offset + dx));
      button.style.transform = `translateX(${gesture.delta}px)`;
    }
  });
  const finish = () => {
    button.classList.remove('dragging');
    if (gesture?.active) {
      const open = gesture.delta < -32;
      button.style.transform = open ? 'translateX(-80px)' : '';
      swipedID = open ? stopID : null; remove.inert = !open;
    }
    gesture = null;
  };
  button.addEventListener('pointerup', finish);
  button.addEventListener('pointercancel', finish);
  button.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); suppressClick = false; return; }
    if (swipedID) { closeSwipes(); return; }
    openComposer(stopID);
  });
  remove.addEventListener('click', () => removeStop(stopID));
}
function renderRows(eventID) {
  const stops = plan?.stops ?? [];
  const wanted = new Set(stops.map(stop => stop.id));
  for (const [id, row] of rows) if (!wanted.has(id)) { row.remove(); rows.delete(id); }
  for (const [index, stop] of stops.entries()) {
    let row = rows.get(stop.id);
    if (!row) {
      row = document.createElement('div'); row.className = 'stop';
      row.innerHTML = `<button class="swipe-delete" type="button" inert>${icon('trash')}<span>删除</span></button><button class="stop-content" type="button"><span class="stop-symbol"><span class="stop-number"></span><span class="stop-art"></span></span><span class="stop-kind"></span><span class="stop-copy"><strong class="stop-distance"></strong><span class="stop-reminder"></span><span class="stop-caption"></span></span>${icon('chevron')}</button>`;
      rows.set(stop.id, row); wireSwipe(row, stop.id);
    }
    row.querySelector('.stop-number').textContent = String(index + 1).padStart(2, '0');
    row.querySelector('.stop-kind').textContent = stop.kind === 'gel' ? (activeEntry(library)?.gel?.name ?? '能量胶') : displayName(stop);
    if (row.dataset.signature !== JSON.stringify(stop)) {
      row.querySelector('.stop-art').innerHTML = fuelArtwork(stop.kind);
      row.querySelector('.stop-distance').textContent = distanceLabel(stop.distanceMeters);
      row.querySelector('.stop-reminder').textContent = stop.reminder;
      const caption = row.querySelector('.stop-caption');
      caption.textContent = stop.kind === 'custom' && stop.name !== stop.reminder ? stop.name : '';
      caption.hidden = !caption.textContent;
      row.querySelector('.stop-content').setAttribute('aria-label', `${distanceLabel(stop.distanceMeters)} ${stop.reminder}${caption.hidden ? '' : `，${stop.name}`}，编辑补给点`);
      row.querySelector('.swipe-delete').setAttribute('aria-label', `删除 ${distanceLabel(stop.distanceMeters)} ${displayName(stop)}`);
      row.dataset.signature = JSON.stringify(stop);
    }
    if ($('stops').children[index] !== row) $('stops').insertBefore(row, $('stops').children[index] ?? null);
    if (stop.id === eventID) wiggle(row.querySelector('.fuel-art'));
  }
  $('stop-count').textContent = String(stops.length).padStart(2, '0');
  $('empty').hidden = stops.length > 0;
  updateSelection();
}
let homeRendered = false;
function render(eventID) {
  homeRendered = true;
  const current = activeEntry(library);
  $('plan-name').textContent = current?.name ?? '';
  $('library').setAttribute('aria-label', current ? `${current.name}，编辑骑行计划` : '计划');
  $('ride-date').textContent = current ? `${current.rideDate.slice(0, 4) === String(new Date().getFullYear()) ? '' : `${current.rideDate.slice(0, 4)}年`}${shortDate(current.rideDate)}` : '';
  $('plan-heading').hidden = !current;
  $('no-plan').hidden = !!current; $('ride-content').hidden = !current;
  const [total, unit] = plan ? distanceLabel(plan.totalDistanceMeters).split(' ') : ['', ''];
  $('total-label').firstElementChild.textContent = total;
  $('total-label').lastElementChild.textContent = unit;
  $('home-route-summary').textContent = current?.route?.title ?? '';
  $('home-route-summary').hidden = !current?.route;
  renderRows(eventID);
  if (plan) {
    ruler.update(plan, entryTerrain(current));
    const changed = eventID && plan.stops.find(stop => stop.id === eventID);
    if (changed) ruler.layout(changed.distanceMeters);
  } else ruler.haptics.stop();
  prepare();
}
function apply(next, eventID) {
  library = updatePlan(library, next); plan = activeEntry(library).plan;
  message('result'); persist(); render(eventID);
}
function prepare() {
  prepared = null; $('share').disabled = true; $('download').disabled = true;
  message('error');
  try {
    if (!plan) throw new Error('先创建一份骑行计划。');
    const valid = validatePlan(plan), bytes = encodeWorkout(valid, `Kairos · ${activeEntry(library).name}`);
    prepared = new File([bytes], `Kairos-${plan.id.slice(0, 8)}.workout`, { type: 'application/octet-stream' });
    const support = shareSupport(prepared, navigator, isSecureContext);
    $('support').textContent = support.ok ? '' : '当前浏览器不支持系统分享，可使用下载训练。';
    $('support').hidden = support.ok;
    $('share').disabled = sharing || removing.size > 0 || !support.ok;
    $('download').disabled = sharing || removing.size > 0;
  } catch (error) {
    message('error', !plan || plan.stops.length ? error.message : '先添加一个补给点，再交给手表。');
    $('support').textContent = '安排补给后即可导入训练。'; $('support').hidden = false;
  }
}
async function removeStop(id) {
  if (sharing || removing.size) return;
  const stop = plan.stops.find(item => item.id === id);
  if (!stop) return;
  const row = rows.get(id); removing.add(id); row.inert = true; prepare();
  // The swipe moves the artwork outside the clipped row. Reveal it before animating.
  closeSwipes();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  row.style.scrollMarginBottom = `${document.querySelector('.send-dock').offsetHeight + 16}px`;
  row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  await Promise.all(row.querySelector('.stop-content').getAnimations().map(animation => animation.finished.catch(() => {})));
  row.classList.add('removing');
  await new Promise(resolve => setTimeout(resolve, reduced.matches ? 80 : 480));
  deleted = stop; removedPlan = null; removing.delete(id); closeSwipes();
  if (selectedID === id) selectedID = null;
  apply(validateDraft({ ...plan, stops: plan.stops.filter(item => item.id !== id) }));
  $('undo-message').textContent = `已移除${displayName(stop)}补给点`; $('undo-bar').hidden = false;
}
$('undo').addEventListener('click', () => {
  if (sharing || removing.size) return;
  if (removedPlan) {
    try { changeLibrary(restorePlan(library, removedPlan)); } catch (error) { message('result', error.message); }
    return;
  }
  if (!deleted || !plan) return;
  try {
    const id = deleted.id; apply(saveStop(plan, deleted), id); deleted = null; $('undo-bar').hidden = true;
  } catch (error) { message('result', `暂时无法撤销：${error.message}`); }
});


function openSheet(dialog) {
  ruler.haptics.stop();
  const sheetScrollY = showSheet(dialog); updateViewport();
  if (dialog === $('composer') && matchMedia('(max-width: 899px)').matches) {
    const chartBottom = $('ruler').getBoundingClientRect().bottom + sheetScrollY;
    const available = window.innerHeight - dialog.offsetHeight;
    document.body.style.top = `${-Math.max(0, chartBottom - available + 8)}px`;
  }
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    requestAnimationFrame(releaseSheets);
  });
  let outsidePress = false;
  dialog.addEventListener('pointerdown', event => {
    const rect = dialog.getBoundingClientRect();
    outsidePress = event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  });
  dialog.addEventListener('click', event => {
    // Focusing a field may resize the sheet before pointerup. That is not a backdrop tap.
    if (outsidePress && event.target === dialog) dialog.close();
    outsidePress = false;
  });
  const grabber = dialog.querySelector('.sheet-grabber'); let start = null;
  grabber.addEventListener('pointerdown', event => { start = event.clientY; grabber.setPointerCapture(event.pointerId); });
  grabber.addEventListener('pointerup', event => { if (start !== null && event.clientY - start > 55) dialog.close(); start = null; });
  grabber.addEventListener('pointercancel', () => { start = null; });
}
function updateViewport() {
  const view = window.visualViewport;
  if (!view) return;
  // Safari may pan offsetTop to reveal a focused field; subtracting it lets the sheet fall under the keyboard.
  const keyboard = Math.max(0, window.innerHeight - view.height);
  if (keyboard > 80 && document.activeElement === $('library-plan-name')) expandPlanField(null);
  for (const dialog of document.querySelectorAll('dialog[open]')) {
    dialog.style.bottom = keyboard > 0 ? `${keyboard}px` : ''; dialog.style.maxHeight = `${view.height * .88}px`;
    dialog.classList.toggle('keyboard-open', keyboard > 80);
  }
}
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);

function openComposer(id = null) {
  if (!plan || sharing || removing.size) return;
  closeSwipes(); editing = id;
  const existing = plan.stops.find(stop => stop.id === id);
  if (existing) { selectedID = id; ruler.layout(existing.distanceMeters); updateSelection(); }
  draft = existing ? { ...existing } : { id: newID(), distanceMeters: roundedMeters(cursor), kind: 'water', name: '', reminder: '喝水' };
  reminderWasEdited = !!existing;
  $('stop-reminder').value = draft.reminder; $('stop-name').value = draft.name;
  $('edit-position').hidden = !existing; $('delete-stop').hidden = !existing;
  $('stop-unit').value = draft.distanceMeters >= 1000 ? 'km' : 'm';
  previousUnit = $('stop-unit').value;
  $('stop-distance').value = String(draft.distanceMeters / ($('stop-unit').value === 'km' ? 1000 : 1));
  $('composer-title').textContent = existing ? '编辑补给点' : `添加补给 · ${distanceLabel(draft.distanceMeters)}`;
  $('save-stop').textContent = existing ? '保存' : '添加';
  renderKind(); validateComposer(); openSheet($('composer'));
}
function renderKind() {
  $('hero-art').innerHTML = fuelArtwork(draft.kind);
  $('custom-name-field').hidden = draft.kind !== 'custom';
  for (const button of document.querySelectorAll('[data-kind]')) button.setAttribute('aria-pressed', String(button.dataset.kind === draft.kind));
}
function candidate() {
  return { ...draft, distanceMeters: editing ? parseDistance($('stop-distance').value, $('stop-unit').value) : draft.distanceMeters,
    reminder: $('stop-reminder').value, name: $('stop-name').value };
}
function validateComposer() {
  try {
    const stop = candidate(); saveStop(plan, stop);
    $('save-stop').disabled = false; message('fuel-error');
    return stop;
  } catch (error) { $('save-stop').disabled = true; message('fuel-error', error.message); return null; }
}
for (const button of document.querySelectorAll('[data-kind]')) button.addEventListener('click', () => {
  const kind = button.dataset.kind;
  if (draft.kind === kind) return;
  draft.kind = kind;
  if (!reminderWasEdited) $('stop-reminder').value = kinds[kind].reminder;
  renderKind(); validateComposer(); wiggle($('hero-art').firstElementChild);
  if (kind === 'custom') $('stop-name').focus();
  else if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
});
$('fuel-form').addEventListener('input', event => {
  if (event.target.id === 'stop-reminder') reminderWasEdited = true;
  validateComposer();
});
let previousUnit = 'km';
$('stop-unit').addEventListener('focus', () => { previousUnit = $('stop-unit').value; });
$('stop-unit').addEventListener('change', () => {
  try { $('stop-distance').value = String(parseDistance($('stop-distance').value, previousUnit) / ($('stop-unit').value === 'km' ? 1000 : 1)); } catch { /* Keep incomplete input for correction. */ }
  previousUnit = $('stop-unit').value; validateComposer();
});
$('fuel-form').addEventListener('submit', event => {
  event.preventDefault(); const stop = validateComposer(); if (!stop) return;
  $('composer').close(); apply(saveStop(plan, stop), stop.id);
});
$('delete-stop').addEventListener('click', () => { const id = editing; $('composer').close(); removeStop(id); });
$('add').addEventListener('click', () => openComposer());

const accountMenu = $('account-menu');
accountMenu.addEventListener('beforetoggle', event => {
  if (event.newState !== 'open') return;
  const rect = $('account').getBoundingClientRect();
  accountMenu.style.top = `${rect.bottom + 8}px`;
  accountMenu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
});
accountMenu.addEventListener('toggle', event => {
  $('account').setAttribute('aria-expanded', String(event.newState === 'open'));
  if (event.newState === 'open') accountMenu.querySelector('[role="menuitem"]').focus({ preventScroll: true });
});
accountMenu.addEventListener('keydown', event => {
  if (event.key === 'Tab') { accountMenu.hidePopover(); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const items = [...accountMenu.querySelectorAll('[role="menuitem"]')], index = items.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next].focus();
});
$('account').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); accountMenu.showPopover(); }
});
const closeAccountMenu = () => { if (accountMenu.matches(':popover-open')) accountMenu.hidePopover(); };
window.addEventListener('scroll', closeAccountMenu, { passive: true });
window.addEventListener('resize', closeAccountMenu);
$('help').addEventListener('click', () => { accountMenu.hidePopover(); openSheet($('help-dialog')); });
$('theme').addEventListener('click', () => {
  if (sharing || removing.size) return;
  openSheet($('theme-dialog'));
  $('theme-options').querySelector('[aria-checked="true"]').focus({ preventScroll: true });
});
$('replace-draft').hidden = writable;
$('replace-draft').addEventListener('click', () => { writable = true; persist(); $('replace-draft').hidden = true; });

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}
function changeLibrary(next, requireSave = false) {
  const warning = writable ? storeLibrary(storage, next) : storageNotice;
  if (requireSave && warning) throw new Error('浏览器未能保存新计划，请检查可用存储后重试。原计划保持不变。');
  library = next; plan = activeEntry(library)?.plan ?? null;
  deleted = null; removedPlan = null; selectedID = null;
  $('undo-bar').hidden = true; closeSwipes(); message('result'); reportStorage(warning); render();
}
const calendar = new PlanCalendar($('plan-calendar'), value => {
  $('library-plan-date').value = value; $('plan-date-label').textContent = shortDate(value);
  expandPlanField(null); validatePlanForm(); $('edit-plan-date').focus({ preventScroll: true });
});
const kilometerWheel = new KilometerWheel($('plan-wheel'), value => {
  $('library-plan-distance').value = String(value); validatePlanForm();
});
function expandPlanField(field) {
  kilometerWheel.stop();
  for (const [kind, button, content] of [['date', 'edit-plan-date', 'plan-calendar'], ['distance', 'edit-plan-distance', 'plan-distance-editor']]) {
    $(button).setAttribute('aria-expanded', String(field === kind)); $(content).hidden = field !== kind;
  }
  if (field === 'date') { calendar.set($('library-plan-date').value); calendar.focus(); }
  if (field === 'distance') showDistanceWheel();
}
function showDistanceWheel() {
  try {
    const km = parseDistance($('library-plan-distance').value, 'km') / 1000;
    if (km <= 0) throw new Error('计划全程需要大于 0。');
    $('wheel-frame').hidden = false; $('direct-distance').hidden = false; $('direct-distance-field').hidden = true;
    kilometerWheel.set(km);
  } catch { $('wheel-frame').hidden = true; $('direct-distance').hidden = true; $('direct-distance-field').hidden = false; validatePlanForm(); }
}
for (const [id, field] of [['edit-plan-date', 'date'], ['edit-plan-distance', 'distance']]) $(id).addEventListener('click', () => expandPlanField($(id).getAttribute('aria-expanded') === 'true' ? null : field));
$('direct-distance').addEventListener('click', () => {
  kilometerWheel.stop(); $('wheel-frame').hidden = true; $('direct-distance').hidden = true; $('direct-distance-field').hidden = false;
  const input = $('library-plan-distance'); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
});
$('return-wheel').addEventListener('click', () => { $('library-plan-distance').blur(); showDistanceWheel(); });
$('library-dialog').addEventListener('close', () => kilometerWheel.stop());
function libraryView(mode) {
  kilometerWheel.stop();
  libraryMode = mode;
  const editor = ['new', 'edit', 'copy'].includes(mode);
  $('library-list-view').hidden = mode !== 'list';
  $('plan-form').hidden = !editor;
  $('plan-name-field').hidden = !editor;
  $('plan-methods').hidden = true;
  $('current-plan-tab').setAttribute('aria-controls', 'plan-form');
  $('history-detail').hidden = mode !== 'history';
  $('current-plan-tab').textContent = mode === 'new' ? '新计划' : mode === 'copy' ? '新副本' : '当前计划';
  $('current-plan-tab').disabled = !plan && !editor;
  for (const [id, selected] of [['current-plan-tab', editor], ['library-tab', !editor]]) {
    $(id).setAttribute('aria-selected', String(selected)); $(id).tabIndex = selected ? 0 : -1;
  }
  message('library-notice', storageNotice);
}
function renderLibraryList() {
  libraryView('list');
  const history = libraryTab === 'history';
  for (const [id, selected] of [['plans-tab', !history], ['history-tab', history]]) {
    $(id).setAttribute('aria-selected', String(selected)); $(id).tabIndex = selected ? 0 : -1;
  }
  $('library-items').setAttribute('aria-labelledby', history ? 'history-tab' : 'plans-tab');
  message('library-hint', history && library.history.length ? '导出时间只记录本机操作。手表接收状态需在手表上确认。' : '');
  const entries = [...(history ? library.history : library.plans)].sort((a, b) => b.rideDate.localeCompare(a.rideDate) || (b.exportedAt ?? b.updatedAt).localeCompare(a.exportedAt ?? a.updatedAt));
  $('library-items').replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p'); empty.className = 'muted library-empty';
    empty.textContent = history ? '还没有导出记录。' : '还没有计划。';
    $('library-items').append(empty);
  }
  let group;
  for (const item of entries) {
    if (item.rideDate !== group) {
      group = item.rideDate;
      const heading = document.createElement('h3'); heading.className = 'library-group'; heading.textContent = formatDate(group);
      $('library-items').append(heading);
    }
    const card = document.createElement('div'); card.className = 'library-card';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'library-open';
    const title = document.createElement('strong'), summary = document.createElement('small');
    title.textContent = item.name;
    summary.textContent = `${distanceLabel(item.plan.totalDistanceMeters)}${history ? ` · ${item.method === 'download' ? '请求下载' : '交给系统分享'}` : ''}`;
    open.append(title, summary);
    open.setAttribute('aria-label', `${history ? '查看导出版本' : '打开计划'} ${item.name}，${item.rideDate}`);
    open.addEventListener('click', () => {
      if (history) showHistory(item);
      else { changeLibrary(selectPlan(library, item.plan.id)); $('library-dialog').close(); }
    });
    card.append(open);
    if (!history) {
      if (item.plan.id === library.activePlanID) {
        card.classList.add('current'); const badge = document.createElement('em'); badge.textContent = '正在编辑'; open.append(badge);
      }
      const manage = document.createElement('button'); manage.type = 'button'; manage.className = 'icon-button library-manage';
      manage.innerHTML = icon('pencil'); manage.setAttribute('aria-label', `管理计划 ${item.name}`);
      manage.addEventListener('click', () => editPlanView('edit', item)); card.append(manage);
    }
    $('library-items').append(card);
  }
}
function editPlanView(mode, source = null) {
  managedEntry = source; routeDraft = source?.route ?? null; gelDraft = source?.gel ?? null;
  libraryView(mode);
  $('library-plan-name').value = mode === 'copy' ? `${source.name.slice(0, 55)} · 副本` : source?.name ?? '新的骑行';
  $('library-plan-date').value = source?.rideDate ?? today();
  $('plan-date-label').textContent = shortDate($('library-plan-date').value);
  $('library-plan-distance').value = String((source?.plan.totalDistanceMeters ?? plan?.totalDistanceMeters ?? 75000) / 1000);
  expandPlanField(null);
  $('copy-plan').hidden = mode !== 'edit'; $('delete-plan').hidden = mode !== 'edit'; $('delete-plan-note').hidden = mode !== 'edit';
  $('plan-method-back').hidden = mode === 'copy';
  $('save-plan').textContent = mode === 'edit' ? '保存计划' : '创建计划';
  validatePlanForm();
}
function showMethodChoice() {
  expandPlanField(null); $('plan-form').hidden = true; $('plan-methods').hidden = false;
  $('current-plan-tab').setAttribute('aria-controls', 'plan-methods');
  $('route-label').textContent = routeDraft?.title ?? '选择路线（手动可选）';
  $('route').setAttribute('aria-label', routeDraft ? `查看或更换路线 ${routeDraft.title}` : '选择路线，手动填写时可选');
  readPlanGel = renderGelSelect($('plan-gel'), storage, gelDraft, '手动可不选；自动需选择');
}
function showPlanChoice(mode, source = null) { editPlanView(mode, source); showMethodChoice(); }
function planDetails() {
  const identity = planIdentity();
  const totalDistanceMeters = parseDistance($('library-plan-distance').value, 'km');
  if (totalDistanceMeters <= 0) throw new Error('计划全程需要大于 0。');
  if (managedEntry) validateDraft({ ...managedEntry.plan, totalDistanceMeters });
  return { ...identity, totalDistanceMeters };
}
function planIdentity() {
  const name = $('library-plan-name').value.trim(), rideDate = validateDate($('library-plan-date').value);
  if (!name || name.length > 60) throw new Error('请填写 1 至 60 字的计划名称。');
  return { name, rideDate };
}
function validatePlanForm() {
  try { const details = planDetails(); $('plan-distance-label').textContent = distanceLabel(details.totalDistanceMeters); $('save-plan').disabled = false; message('plan-form-error'); }
  catch (error) { $('save-plan').disabled = true; message('plan-form-error', error.message); }
}
function showHistory(snapshot) {
  managedEntry = snapshot; libraryView('history');
  $('history-date').textContent = `骑行日期 · ${formatDate(snapshot.rideDate)}`;
  $('history-name').textContent = snapshot.name;
  $('history-summary').textContent = `全程 ${distanceLabel(snapshot.plan.totalDistanceMeters)}${snapshot.route ? ` · ${snapshot.route.title}` : ''}`;
  $('history-status').textContent = `${new Date(snapshot.exportedAt).toLocaleString('zh-CN')} · ${snapshot.method === 'download' ? '请求下载' : '交给系统分享'}`;
  $('history-stops').replaceChildren();
  for (const stop of snapshot.plan.stops) {
    const item = document.createElement('li'), position = document.createElement('strong'), reminder = document.createElement('span');
    position.textContent = distanceLabel(stop.distanceMeters); reminder.textContent = stop.reminder;
    item.append(position, reminder); $('history-stops').append(item);
  }
}
$('library').addEventListener('click', () => {
  if (sharing || removing.size) return;
  closeSwipes(); if (plan) showPlanChoice('edit', activeEntry(library)); else renderLibraryList(); openSheet($('library-dialog'));
});
$('browse-library').addEventListener('click', () => {
  if (sharing || removing.size) return;
  closeSwipes(); libraryTab = 'plans'; renderLibraryList(); openSheet($('library-dialog'));
});
$('history').addEventListener('click', () => {
  if (sharing || removing.size) return;
  closeSwipes(); libraryTab = 'history'; renderLibraryList(); openSheet($('library-dialog'));
});
$('first-plan').addEventListener('click', () => { showPlanChoice('new'); openSheet($('library-dialog')); });
$('new-plan').addEventListener('click', () => showPlanChoice('new'));
$('current-plan-tab').addEventListener('click', () => { if (plan && !['new', 'edit', 'copy'].includes(libraryMode)) showPlanChoice('edit', activeEntry(library)); });
$('plan-manual').addEventListener('click', () => { $('plan-methods').hidden = true; $('plan-form').hidden = false; $('current-plan-tab').setAttribute('aria-controls', 'plan-form'); });
$('plan-method-back').addEventListener('click', showMethodChoice);
$('plan-auto').addEventListener('click', async () => {
  let details;
  try { details = planIdentity(); message('library-notice'); }
  catch (error) { message('library-notice', error.message); return; }
  suspendSheet($('library-dialog'));
  const recipe = initialRecipe(libraryMode === 'new' ? null : managedEntry, loadProfile(storage).profile);
  recipe.details = details;
  recipe.gel = gelDraft;
  recipe.route = routeDraft; recipe.mode = routeDraft ? 'route' : 'simulation';
  generator.open(recipe, false, !routeDraft);
});
$('library-tab').addEventListener('click', renderLibraryList);
for (const id of ['current-plan-tab', 'library-tab']) $(id).addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const target = event.key === 'Home' ? $('current-plan-tab') : event.key === 'End' ? $('library-tab') : $(id === 'current-plan-tab' ? 'library-tab' : 'current-plan-tab');
  if (!target.disabled) { target.click(); target.focus(); }
});
$('library-back').addEventListener('click', renderLibraryList);
for (const [id, tab] of [['plans-tab', 'plans'], ['history-tab', 'history']]) {
  $(id).addEventListener('click', () => { libraryTab = tab; renderLibraryList(); });
  $(id).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); libraryTab = event.key === 'Home' ? 'plans' : event.key === 'End' ? 'history' : libraryTab === 'plans' ? 'history' : 'plans';
    renderLibraryList(); $(libraryTab === 'plans' ? 'plans-tab' : 'history-tab').focus();
  });
}
$('plan-form').addEventListener('input', validatePlanForm);
$('library-plan-name').addEventListener('input', validatePlanForm);
$('library-plan-name').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (!$('plan-form').hidden) $('plan-form').requestSubmit();
  }
});
$('library-plan-name').addEventListener('click', () => expandPlanField(null));
$('plan-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const details = planDetails();
    const next = libraryMode === 'new' ? createPlan(library, details) : libraryMode === 'copy' ? duplicatePlan(library, managedEntry, details) : selectPlan(updateDetails(library, managedEntry.plan.id, details), managedEntry.plan.id);
    changeLibrary(validateLibrary({ ...next, plans: next.plans.map(item => item.plan.id === next.activePlanID ? { ...item, terrain: routeDraft ? undefined : item.terrain, route: routeDraft, gel: gelDraft } : item) }));
    if (storageNotice) { editPlanView('edit', activeEntry(library)); message('library-notice', storageNotice); }
    else $('library-dialog').close();
  } catch (error) { message('plan-form-error', error.message); }
});
$('copy-plan').addEventListener('click', () => editPlanView('copy', managedEntry));
$('reuse-history').addEventListener('click', () => editPlanView('copy', managedEntry));
$('delete-plan').addEventListener('click', () => {
  const removed = structuredClone(managedEntry);
  changeLibrary(deletePlan(library, removed.plan.id)); removedPlan = removed;
  $('library-dialog').close(); $('undo-message').textContent = `已删除“${removed.name}”`; $('undo-bar').hidden = false;
});

async function shareWorkout() {
  if (!prepared || sharing || removing.size) return;
  const snapshot = structuredClone(activeEntry(library));
  ruler.haptics.stop();
  sharing = true; $('app').inert = true;
  $('share').disabled = true; $('download').disabled = true;
  try {
    // Keep the prepared File and invoke share before any await or network work.
    const outcome = await sharePrepared(prepared, navigator, isSecureContext);
    if (outcome.state === 'handed-off') { library = recordExport(library, snapshot, 'share'); persist(); }
    message('result', outcome.message);
  } finally { sharing = false; $('app').inert = false; prepare(); }
}
$('share').addEventListener('click', shareWorkout);
$('download').addEventListener('click', () => {
  if (!prepared || sharing || removing.size) return;
  ruler.haptics.stop();
  const url = URL.createObjectURL(prepared), link = document.createElement('a');
  link.href = url; link.download = prepared.name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  library = recordExport(library, activeEntry(library), 'download'); persist();
  message('result', '已请求下载。打开训练文件，在“健身”中核对并添加到手表；Safari 可从下载列表打开。');
});
message('storage-message', loaded.message);
const routePicker = setupRoutePicker({ storage, current: () => activeEntry(library), openSheet });
$('route').addEventListener('click', () => {
  visitSheet($('library-dialog'), () => routePicker.pick(routeDraft), selected => {
    if (selected !== undefined) {
      routeDraft = selected;
      if (selected) $('library-plan-distance').value = String(roundedMeters(selected.distanceMeters) / 1000);
      validatePlanForm();
    }
    showMethodChoice(); openSheet($('library-dialog'));
  });
});
const gelEditor = setupGelEditor({ storage, openSheet });
$('plan-gel').addEventListener('change', () => { gelDraft = readPlanGel($('plan-gel').value); });
$('plan-gel-manage').addEventListener('click', () => {
  visitSheet($('library-dialog'), gelEditor.open, () => { showMethodChoice(); openSheet($('library-dialog')); });
});
const profileEditor = setupProfileEditor({ storage, openSheet, connect: () => routePicker.connect(), manageGels: () => gelEditor.open() });
const fuelDraft = { recipe: null, result: null };
function sourceEntry(recipe) {
  return recipe ? library.plans.find(item => revision(item) === recipe.sourceRevision) ?? null : activeEntry(library);
}
const generator = setupGenerator({
  draft: fuelDraft, storage, current: sourceEntry, openSheet,
  available: () => !sharing && !removing.size,
  openCalculator: () => navigation.calculator(true),
  closeCalculatorPreview: saved => navigation.finishPreview(saved),
  finishGenerator: () => navigation.finishGenerator(),
  manageGels: () => gelEditor.open(),
  editProfile: profileEditor.open,
  chooseRoute: route => routePicker.pick(route), returnToPlan: recipe => {
    if (!['new', 'edit'].includes(libraryMode)) showPlanChoice(plan ? 'edit' : 'new', activeEntry(library)); else showMethodChoice();
    if (recipe.details) { $('library-plan-name').value = recipe.details.name; $('library-plan-date').value = recipe.details.rideDate; $('plan-date-label').textContent = shortDate(recipe.details.rideDate); validatePlanForm(); }
    if (Object.hasOwn(recipe, 'gel')) { gelDraft = recipe.gel; showMethodChoice(); }
    if (Object.hasOwn(recipe, 'route')) { routeDraft = recipe.route; showMethodChoice(); }
    openSheet($('library-dialog'));
  },
  save(recipe) {
    const fresh = loadLibrary(storage);
    if (!writable || !fresh.writable) throw new Error('本机计划库暂时无法保存，原内容未被覆盖。请先处理存储提示。');
    changeLibrary(generatedLibrary(fresh.library, recipe), true);
    message('result', '已保存为新计划。');
  },
});
function showHome() {
  if (homeRendered) return;
  if (loaded.needsSave && writable) persist();
  render();
}
const navigation = setupNavigation({
  draft: fuelDraft, generator, ruler, showHome,
  getCalculator() {
    return setupCalculator({ storage, draft: fuelDraft, manageGels: () => gelEditor.open(), onPreview: () => navigation.preview() });
  },
  source: recipe => !recipe && !homeRendered && loaded.needsSave ? null : sourceEntry(recipe),
  legacyRecipe: () => readTransfer({ getItem: key => sessionStorage.getItem(key) }),
});
if (document.documentElement.dataset.page !== 'calculator') showHome();
// Restore the prepared file and enabled actions when returning through browser history.
window.addEventListener('pageshow', event => { if (event.persisted) prepare(); });
// Keep long results and larger text from covering the final list item.
new ResizeObserver(() => { document.querySelector('main').style.setProperty('--dock-clearance', `${document.querySelector('.send-dock').offsetHeight + 32}px`); }).observe(document.querySelector('.send-dock'));
