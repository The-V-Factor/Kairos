import { encodeWorkout, validatePlan, workoutSteps, distanceLabel, roundedMeters } from './workout.mjs';
import { sharePrepared, shareSupport } from './share.mjs';
import { kinds, newID, samplePlan, parseDistance, validateDraft, saveStop, loadDraft, storeDraft } from './plan.mjs';
import { fuelArtwork, icon } from './artwork.mjs';
import { DistanceRuler } from './ruler.mjs';
import { themes, loadTheme, storeTheme } from './themes.mjs';

const $ = id => document.getElementById(id);
const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
const loaded = loadDraft(storage);
let themeID = loadTheme(storage);
let plan = loaded.plan ?? samplePlan();
let writable = loaded.writable;
let prepared = null, sharing = false, cursor = plan.totalDistanceMeters / 2, deleted = null, editing = null, lastShare = null;
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
  if (writable) message('storage-message', storeDraft(storage, plan));
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
  const wanted = new Set(plan.stops.map(stop => stop.id));
  for (const [id, row] of rows) if (!wanted.has(id)) { row.remove(); rows.delete(id); }
  for (const [index, stop] of plan.stops.entries()) {
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
  $('empty').hidden = plan.stops.length > 0;
  updateSelection();
}
function render(eventID) {
  $('total-label').textContent = distanceLabel(plan.totalDistanceMeters);
  renderRows(eventID); ruler.update(plan); prepare();
}
function apply(next, eventID) {
  plan = next; message('result'); persist(); render(eventID);
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
    const valid = validatePlan(plan), bytes = encodeWorkout(valid);
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
    message('error', plan.stops.length ? error.message : '先添加一个补给点，再交给手表。');
    $('support').textContent = '补全计划后即可分享或下载训练文件。'; diagnostics({ ok: false }, 0);
  }
}
async function removeStop(id) {
  if (sharing || removing.size) return;
  const stop = plan.stops.find(item => item.id === id);
  if (!stop) return;
  const row = rows.get(id); removing.add(id); row.classList.add('removing'); row.inert = true; prepare();
  await new Promise(resolve => setTimeout(resolve, reduced.matches ? 80 : 480));
  deleted = stop; removing.delete(id); closeSwipes();
  if (selectedID === id) selectedID = null;
  apply(validateDraft({ ...plan, stops: plan.stops.filter(item => item.id !== id) }));
  $('undo-message').textContent = `已移除${displayName(stop)}补给点`; $('undo-bar').hidden = false;
}
$('undo').addEventListener('click', () => {
  if (!deleted || sharing || removing.size) return;
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
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
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
  for (const dialog of document.querySelectorAll('dialog[open]')) {
    dialog.style.bottom = `${keyboard}px`; dialog.style.maxHeight = `${view.height * .88}px`;
    dialog.classList.toggle('keyboard-open', keyboard > 80);
  }
}
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);

function openComposer(id = null) {
  if (sharing || removing.size) return;
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

function validateTotal() {
  try {
    const next = validateDraft({ ...plan, totalDistanceMeters: parseDistance($('total').value, 'km') });
    $('save-total').disabled = false; message('total-error'); return next;
  } catch (error) { $('save-total').disabled = true; message('total-error', error.message); return null; }
}
$('edit-total').addEventListener('click', () => {
  if (sharing || removing.size) return;
  $('total').value = String(plan.totalDistanceMeters / 1000); validateTotal(); openSheet($('distance-dialog'));
  $('total').focus(); $('total').setSelectionRange($('total').value.length, $('total').value.length);
});
$('total').addEventListener('input', validateTotal);
$('distance-form').addEventListener('submit', event => {
  event.preventDefault(); const next = validateTotal(); if (!next) return;
  $('distance-dialog').close(); apply(next);
});
$('help').addEventListener('click', () => openSheet($('help-dialog')));
$('theme').addEventListener('click', () => {
  if (sharing || removing.size) return;
  openSheet($('theme-dialog'));
  $('theme-options').querySelector('[aria-checked="true"]').focus({ preventScroll: true });
});
$('replace-draft').hidden = writable;
$('replace-draft').addEventListener('click', () => { writable = true; persist(); $('replace-draft').hidden = true; });

async function shareWorkout() {
  if (!prepared || sharing || removing.size) return;
  ruler.haptics.stop();
  sharing = true; $('app').inert = true;
  $('share').disabled = true; $('download').disabled = true;
  try {
    // Keep the prepared File and invoke share before any await or network work.
    const outcome = await sharePrepared(prepared, navigator, isSecureContext);
    lastShare = outcome;
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
  message('result', '已请求下载。打开训练文件，在“健身”中核对并添加到手表；Safari 可从下载列表打开。');
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${$('diagnostics').innerText} 浏览器：${navigator.userAgent}`); message('result', '兼容性信息已复制，不含补给内容。'); }
  catch { message('result', '未能复制，请截图兼容性信息。'); }
});
message('storage-message', loaded.message);
if (!loaded.plan && writable) persist();
render();
// Restore the prepared file and enabled actions when returning through browser history.
window.addEventListener('pageshow', event => { if (event.persisted) prepare(); });
// Keep long results and larger text from covering the final list item.
new ResizeObserver(() => { document.querySelector('main').style.paddingBottom = `${document.querySelector('.send-dock').offsetHeight + 32}px`; }).observe(document.querySelector('.send-dock'));
