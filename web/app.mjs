import { encodeWorkout, validatePlan, workoutSteps, distanceLabel, roundedMeters } from './workout.mjs';
import { sharePrepared, shareSupport } from './share.mjs';
import { kinds, newID, parseDistance, validateDraft, saveStop } from './plan.mjs';
import { fuelArtwork, icon } from './artwork.mjs';
import { DistanceRuler } from './ruler.mjs';
import { themes, loadTheme, storeTheme } from './themes.mjs';
import { loadLibrary, storeLibrary, activeEntry, createPlan, updatePlan, updateDetails, selectPlan, duplicatePlan, deletePlan, restorePlan, recordExport, validateDate, today } from './library.mjs';
import { PlanCalendar, KilometerWheel, shortDate } from './plan-controls.mjs';

const $ = id => document.getElementById(id);
const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
const loaded = loadLibrary(storage);
let themeID = loadTheme(storage);
let library = loaded.library;
let plan = activeEntry(library)?.plan ?? null;
let writable = loaded.writable;
let prepared = null, sharing = false, cursor = (plan?.totalDistanceMeters ?? 0) / 2, deleted = null, editing = null, lastShare = null;
let removedPlan = null, libraryTab = 'plans', libraryMode = 'list', managedEntry = null, storageNotice = loaded.message;
let draft = null, reminderWasEdited = false, selectedID = null, swipedID = null;
const removing = new Set();
const rows = new Map();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
for (const node of document.querySelectorAll('[data-icon]')) node.innerHTML = icon(node.dataset.icon);
for (const button of document.querySelectorAll('[data-kind]')) button.querySelector('.type-art').innerHTML = fuelArtwork(button.dataset.kind);
const ruler = new DistanceRuler($('ruler'), value => { cursor = value; }, id => {
  selectedID = id; updateSelection();
  rows.get(id)?.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'instant' : 'smooth' });
});
$('haptics-toggle').disabled = !ruler.haptics.available;
$('haptics-status').textContent = ruler.haptics.available
  ? '本次打开有效。开启后在刻度线上拖动，尝试跨刻度触感；松手后的惯性不震动，效果以真机为准。'
  : '当前浏览器未提供可用的触感路径，距离尺仍可正常使用。';
$('haptics-toggle').addEventListener('change', () => ruler.haptics.setEnabled($('haptics-toggle').checked));

for (const [index, theme] of themes.entries()) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'theme-choice';
  button.dataset.themeID = theme.id; button.setAttribute('role', 'radio');
  button.setAttribute('aria-label', `${theme.title}，${theme.caption}`);
  button.innerHTML = `<span class="theme-preview" data-theme="${theme.id}" aria-hidden="true"><span class="mini-brand">KAIROS <i>${'ABCDE'[index]}</i></span><span class="mini-title">${theme.id === 'journal' ? '补给路书' : '骑行补给'}</span><span class="mini-landscape"></span><span class="mini-ruler"></span><span class="mini-stop">${fuelArtwork('water')}<strong>25.0<small>喝水</small></strong></span><span class="mini-stop">${fuelArtwork('gel')}<strong>45.0<small>吃胶</small></strong></span><span class="mini-action"></span></span><span class="theme-choice-title">${theme.title}<span class="theme-check" aria-hidden="true">✓</span></span><span class="theme-caption">${theme.caption}</span>`;
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
  $('theme-status').textContent = storeTheme(storage, id) || '只更换外观，沿途补给仍留在原位。';
}
renderTheme();

function message(id, text = '') { $(id).textContent = text; $(id).hidden = !text; }
function displayName(stop) { return stop.kind === 'custom' ? stop.name : kinds[stop.kind].title; }
function wiggle(node) {
  if (!node || reduced.matches) return;
  node.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(9deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(0deg)' }], { duration: 500, easing: 'ease-out' });
}
function persist() {
  if (writable) storageNotice = storeLibrary(storage, library);
  message('storage-message', storageNotice);
  message('library-notice', storageNotice);
}
function updateSelection() { for (const [id, row] of rows) row.classList.toggle('selected', id === selectedID); }
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
      row.innerHTML = `<button class="swipe-delete" type="button" inert>${icon('trash')}<span>删除</span></button><button class="stop-content" type="button"><span class="stop-symbol"><span class="stop-number"></span><span class="stop-art"></span></span><span class="stop-copy"><strong class="stop-distance"></strong><span class="stop-reminder"></span><span class="stop-caption"></span></span>${icon('chevron')}</button>`;
      rows.set(stop.id, row); wireSwipe(row, stop.id);
    }
    row.querySelector('.stop-number').textContent = String(index + 1).padStart(2, '0');
    if (row.dataset.signature !== JSON.stringify(stop)) {
      row.querySelector('.stop-art').innerHTML = fuelArtwork(stop.kind);
      row.querySelector('.stop-distance').textContent = distanceLabel(stop.distanceMeters);
      row.querySelector('.stop-reminder').textContent = stop.reminder;
      row.querySelector('.stop-caption').textContent = `${displayName(stop)} · 距出发里程`;
      row.querySelector('.stop-content').setAttribute('aria-label', `${distanceLabel(stop.distanceMeters)} ${stop.reminder}，编辑补给点`);
      row.querySelector('.swipe-delete').setAttribute('aria-label', `删除 ${distanceLabel(stop.distanceMeters)} ${displayName(stop)}`);
      row.dataset.signature = JSON.stringify(stop);
    }
    if ($('stops').children[index] !== row) $('stops').insertBefore(row, $('stops').children[index] ?? null);
    if (stop.id === eventID) wiggle(row.querySelector('.fuel-art'));
  }
  $('empty').hidden = stops.length > 0;
  updateSelection();
}
function render(eventID) {
  const current = activeEntry(library);
  $('plan-name').textContent = current?.name ?? '';
  $('library').setAttribute('aria-label', current ? `${current.name}，编辑骑行计划` : '计划');
  $('ride-date').textContent = current ? `${current.rideDate.slice(0, 4) === String(new Date().getFullYear()) ? '' : `${current.rideDate.slice(0, 4)}年`}${shortDate(current.rideDate)}` : '';
  $('plan-heading').hidden = !current;
  $('no-plan').hidden = !!current; $('ride-content').hidden = !current;
  $('total-label').textContent = plan ? distanceLabel(plan.totalDistanceMeters) : '';
  renderRows(eventID); if (plan) ruler.update(plan); else ruler.haptics.stop(); prepare();
}
function apply(next, eventID) {
  library = updatePlan(library, next); plan = activeEntry(library).plan;
  message('result'); persist(); render(eventID);
}
function diagnostics(support, bytes) {
  const items = [
    ['安全环境', isSecureContext ? '是' : '否，请使用 HTTPS'],
    ['当前文件可分享', prepared ? support.ok ? '是，目标需在面板确认' : '否' : '文件尚未准备'],
    ['文件', prepared ? `${prepared.name} · ${bytes} 字节` : '—'],
    ['系统导入与手表接收', '网页无法检测，请在设备确认'],
  ];
  $('diagnostics').replaceChildren();
  for (const [key, value] of items) {
    const dt = document.createElement('dt'); dt.textContent = key;
    const dd = document.createElement('dd'); dd.textContent = value;
    $('diagnostics').append(dt, dd);
  }
  if (lastShare) {
    const dt = document.createElement('dt'); dt.textContent = '最近分享结果';
    const dd = document.createElement('dd'); dd.textContent = `${lastShare.state}${lastShare.reason ? ` · ${lastShare.reason}` : ''}`;
    $('diagnostics').append(dt, dd);
  }
}
function prepare() {
  prepared = null; $('share').disabled = true; $('download').disabled = true;
  $('steps').replaceChildren(); message('error');
  try {
    if (!plan) throw new Error('先创建一份骑行计划。');
    const valid = validatePlan(plan), bytes = encodeWorkout(valid, `Kairos · ${activeEntry(library).name}`);
    prepared = new File([bytes], `Kairos-${plan.id.slice(0, 8)}.workout`, { type: 'application/octet-stream' });
    let from = 0;
    for (const step of workoutSteps(valid)) {
      const li = document.createElement('li'), title = document.createElement('strong'), caption = document.createElement('span');
      title.textContent = step.name;
      caption.textContent = step.distanceMeters === null ? '开放目标 · 由你手动结束运动' : `${distanceLabel(from)} → ${distanceLabel(from + step.distanceMeters)}，本段 ${distanceLabel(step.distanceMeters)}`;
      if (step.distanceMeters !== null) from += step.distanceMeters;
      li.append(title, caption); $('steps').append(li);
    }
    const support = shareSupport(prepared, navigator, isSecureContext);
    $('support').textContent = support.message;
    $('share').disabled = sharing || removing.size > 0 || !support.ok;
    $('download').disabled = sharing || removing.size > 0;
    diagnostics(support, bytes.byteLength);
  } catch (error) {
    message('error', !plan || plan.stops.length ? error.message : '先添加一个补给点，再交给手表。');
    $('support').textContent = '补全计划后即可分享或下载训练文件。'; diagnostics({ ok: false }, 0);
  }
}
async function removeStop(id) {
  if (sharing || removing.size) return;
  const stop = plan.stops.find(item => item.id === id);
  if (!stop) return;
  const row = rows.get(id); removing.add(id); row.classList.add('removing'); row.inert = true; prepare();
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

let sheetScrollY = 0;
function openSheet(dialog) {
  ruler.haptics.stop();
  sheetScrollY = window.scrollY;
  Object.assign(document.body.style, { overflow: 'hidden', position: 'fixed', top: `${-sheetScrollY}px`, width: '100%' });
  dialog.showModal(); updateViewport();
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    Object.assign(document.body.style, { overflow: '', position: '', top: '', width: '' });
    window.scrollTo({ top: sheetScrollY, behavior: 'instant' });
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
    dialog.style.bottom = `${keyboard}px`; dialog.style.maxHeight = `${view.height * .88}px`;
    dialog.classList.toggle('keyboard-open', keyboard > 80);
  }
}
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);

function openComposer(id = null) {
  if (!plan || sharing || removing.size) return;
  closeSwipes(); editing = id;
  const existing = plan.stops.find(stop => stop.id === id);
  if (existing) { selectedID = id; updateSelection(); }
  draft = existing ? { ...existing } : { id: newID(), distanceMeters: roundedMeters(cursor), kind: 'water', name: '', reminder: '喝水' };
  reminderWasEdited = !!existing;
  $('stop-reminder').value = draft.reminder; $('stop-name').value = draft.name;
  $('edit-position').hidden = !existing; $('delete-stop').hidden = !existing;
  $('stop-unit').value = draft.distanceMeters >= 1000 ? 'km' : 'm';
  previousUnit = $('stop-unit').value;
  $('stop-distance').value = String(draft.distanceMeters / ($('stop-unit').value === 'km' ? 1000 : 1));
  $('composer-title').textContent = distanceLabel(draft.distanceMeters);
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
    if (editing) $('composer-title').textContent = distanceLabel(stop.distanceMeters);
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
$('zoom-in').addEventListener('click', () => ruler.changeZoom(2));
$('zoom-out').addEventListener('click', () => ruler.changeZoom(.5));
$('fit').addEventListener('click', () => { selectedID = null; updateSelection(); ruler.fit(); });

$('help').addEventListener('click', () => openSheet($('help-dialog')));
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
function changeLibrary(next) {
  library = next; plan = activeEntry(library)?.plan ?? null;
  deleted = null; removedPlan = null; selectedID = null; lastShare = null;
  $('undo-bar').hidden = true; closeSwipes(); message('result'); persist(); render();
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
  $('library-hint').textContent = history ? '保留导出时的版本。这里只记录下载请求或系统分享，不表示手表已收到。' : '按骑行日期排列。选择一份继续编辑，改动会自动保存在这个浏览器。';
  const entries = [...(history ? library.history : library.plans)].sort((a, b) => b.rideDate.localeCompare(a.rideDate) || (b.exportedAt ?? b.updatedAt).localeCompare(a.exportedAt ?? a.updatedAt));
  $('library-items').replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p'); empty.className = 'muted library-empty';
    empty.textContent = history ? '还没有导出记录。下载一份训练后，会在这里留下当时的版本。' : '还没有计划。从一趟新的骑行开始。';
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
  managedEntry = source;
  libraryView(mode);
  $('library-plan-name').value = mode === 'copy' ? `${source.name.slice(0, 55)} · 副本` : source?.name ?? '新的骑行';
  $('library-plan-date').value = source?.rideDate ?? today();
  $('plan-date-label').textContent = shortDate($('library-plan-date').value);
  $('library-plan-distance').value = String((source?.plan.totalDistanceMeters ?? plan?.totalDistanceMeters ?? 75000) / 1000);
  expandPlanField(null);
  $('copy-plan').hidden = mode !== 'edit'; $('delete-plan').hidden = mode !== 'edit';
  $('save-plan').textContent = mode === 'edit' ? '保存计划' : '创建计划';
  validatePlanForm();
}
function planDetails() {
  const name = $('library-plan-name').value.trim(), rideDate = validateDate($('library-plan-date').value);
  if (!name || name.length > 60) throw new Error('请填写 1 至 60 字的计划名称。');
  const totalDistanceMeters = parseDistance($('library-plan-distance').value, 'km');
  if (totalDistanceMeters <= 0) throw new Error('计划全程需要大于 0。');
  if (managedEntry) validateDraft({ ...managedEntry.plan, totalDistanceMeters });
  return { name, rideDate, totalDistanceMeters };
}
function validatePlanForm() {
  try { const details = planDetails(); $('plan-distance-label').textContent = distanceLabel(details.totalDistanceMeters); $('save-plan').disabled = false; message('plan-form-error'); }
  catch (error) { $('save-plan').disabled = true; message('plan-form-error', error.message); }
}
function showHistory(snapshot) {
  managedEntry = snapshot; libraryView('history');
  $('history-date').textContent = `骑行日期 · ${formatDate(snapshot.rideDate)}`;
  $('history-name').textContent = snapshot.name;
  $('history-summary').textContent = `全程 ${distanceLabel(snapshot.plan.totalDistanceMeters)}`;
  $('history-status').textContent = `${new Date(snapshot.exportedAt).toLocaleString('zh-CN')} · ${snapshot.method === 'download' ? '请求下载' : '交给系统分享'}。这不是导入或运动完成回执。`;
  $('history-stops').replaceChildren();
  for (const stop of snapshot.plan.stops) {
    const item = document.createElement('li'), position = document.createElement('strong'), reminder = document.createElement('span');
    position.textContent = distanceLabel(stop.distanceMeters); reminder.textContent = stop.reminder;
    item.append(position, reminder); $('history-stops').append(item);
  }
}
$('library').addEventListener('click', () => {
  if (sharing || removing.size) return;
  closeSwipes(); if (plan) editPlanView('edit', activeEntry(library)); else renderLibraryList(); openSheet($('library-dialog'));
});
$('history').addEventListener('click', () => {
  if (sharing || removing.size) return;
  closeSwipes(); libraryTab = 'history'; renderLibraryList(); openSheet($('library-dialog'));
});
$('first-plan').addEventListener('click', () => { editPlanView('new'); openSheet($('library-dialog')); });
$('new-plan').addEventListener('click', () => editPlanView('new'));
$('current-plan-tab').addEventListener('click', () => { if (plan && !['new', 'edit', 'copy'].includes(libraryMode)) editPlanView('edit', activeEntry(library)); });
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
$('library-plan-name').addEventListener('click', () => expandPlanField(null));
$('plan-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const details = planDetails();
    const next = libraryMode === 'new' ? createPlan(library, details) : libraryMode === 'copy' ? duplicatePlan(library, managedEntry, details) : selectPlan(updateDetails(library, managedEntry.plan.id, details), managedEntry.plan.id);
    changeLibrary(next);
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
    lastShare = outcome;
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
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${$('diagnostics').innerText} 浏览器：${navigator.userAgent}`); message('result', '兼容性信息已复制，不含补给内容。'); }
  catch { message('result', '未能复制，请截图兼容性信息。'); }
});
message('storage-message', loaded.message);
if (loaded.needsSave && writable) persist();
render();
// Restore the prepared file and enabled actions when returning through browser history.
window.addEventListener('pageshow', event => { if (event.persisted) prepare(); });
// Keep long results and larger text from covering the final list item.
new ResizeObserver(() => { document.querySelector('main').style.paddingBottom = `${document.querySelector('.send-dock').offsetHeight + 32}px`; }).observe(document.querySelector('.send-dock'));
