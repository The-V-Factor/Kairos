import { encodeWorkout, validatePlan, workoutSteps, distanceLabel, roundedMeters } from './workout.mjs';
import { sharePrepared, shareSupport } from './share.mjs';
import { kinds, newID, samplePlan, parseDistance, validateDraft, saveStop, loadDraft, storeDraft } from './plan.mjs';
import { fuelArtwork, icon } from './artwork.mjs';
import { DistanceRuler } from './ruler.mjs';
import { createFileAddressPreparer } from './file-address.mjs';

const $ = id => document.getElementById(id);
const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
const loaded = loadDraft(storage);
const prepareAddress = createFileAddressPreparer({ serviceWorker: navigator.serviceWorker, caches: window.caches, baseURL: new URL('./', location.href), secure: isSecureContext });
let preparation = 0;
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
  const revision = ++preparation;
  const open = $('open-workout');
  open.removeAttribute('href'); open.setAttribute('aria-disabled', 'true'); open.tabIndex = -1;
  $('open-label').textContent = '下载训练';
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
    if (!sharing && !removing.size) {
      $('open-label').textContent = '正在准备训练…';
      prepareAddress(prepared, plan.id).then(url => {
        if (revision !== preparation) return;
        open.href = url; open.removeAttribute('aria-disabled'); open.tabIndex = 0;
        $('open-label').textContent = '下载训练';
      }).catch(() => {
        if (revision !== preparation) return;
        $('open-label').textContent = '文件地址暂不可用';
        message('error', '未能准备下载地址，请在使用说明中分享或备用下载。');
      });
    }
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
  $('total').value = String(plan.totalDistanceMeters / 1000); validateTotal(); openSheet($('distance-dialog')); $('total').focus(); $('total').select();
});
$('total').addEventListener('input', validateTotal);
$('distance-form').addEventListener('submit', event => {
  event.preventDefault(); const next = validateTotal(); if (!next) return;
  $('distance-dialog').close(); apply(next);
});
$('help').addEventListener('click', () => openSheet($('help-dialog')));
$('replace-draft').hidden = writable;
$('replace-draft').addEventListener('click', () => { writable = true; persist(); $('replace-draft').hidden = true; });

$('share').addEventListener('click', async () => {
  if (!prepared || sharing || removing.size) return;
  sharing = true; $('app').inert = true;
  ++preparation; $('open-workout').removeAttribute('href'); $('open-workout').setAttribute('aria-disabled', 'true'); $('open-workout').tabIndex = -1;
  $('share').disabled = true; $('download').disabled = true;
  try {
    // Keep the prepared File and invoke share before any await or network work.
    const outcome = await sharePrepared(prepared, navigator, isSecureContext);
    lastShare = outcome;
    message('result', outcome.message);
  } finally { sharing = false; $('app').inert = false; prepare(); }
});
$('open-workout').addEventListener('click', event => {
  if (!$('open-workout').hasAttribute('href') || sharing || removing.size) { event.preventDefault(); return; }
  message('result', '请确认下载，再从 Safari 下载列表打开训练，在“健身”添加到手表。');
});
$('download').addEventListener('click', () => {
  if (!prepared || sharing || removing.size) return;
  const url = URL.createObjectURL(prepared), link = document.createElement('a');
  link.href = url; link.download = prepared.name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  message('result', '已请求备用下载。可先从 Safari 下载列表打开；若无法打开，再从“文件”分享至“健身”。');
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${$('diagnostics').innerText} 浏览器：${navigator.userAgent}`); message('result', '兼容性信息已复制，不含补给内容。'); }
  catch { message('result', '未能复制，请截图兼容性信息。'); }
});
message('storage-message', loaded.message);
if (!loaded.plan && writable) persist();
render();
// Returning from the experiment may restore a page whose cached file was replaced.
window.addEventListener('pageshow', event => { if (event.persisted) prepare(); });
// Keep long results and larger text from covering the final list item.
new ResizeObserver(() => { document.querySelector('main').style.paddingBottom = `${document.querySelector('.send-dock').offsetHeight + 32}px`; }).observe(document.querySelector('.send-dock'));
