import { loadGels, storeGels, validateGel, gelChoices } from './gels.mjs';
import { newID } from './plan.mjs';

export function renderGelSelect(select, storage, snapshot, empty = '选择我的胶') {
  const loaded = loadGels(storage), options = gelChoices(loaded.catalog.items, snapshot);
  select.replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = empty; select.append(placeholder);
  for (const choice of options.choices) {
    const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label; select.append(option);
  }
  select.value = options.selected;
  let control = select.closest('.ui-gel-select');
  if (!control) {
    control = document.createElement('span'); control.className = 'ui-gel-select';
    const summary = document.createElement('span'); summary.className = 'ui-gel-summary'; summary.setAttribute('aria-hidden', 'true');
    summary.innerHTML = '<span class="ui-gel-symbol">GEL</span><span class="ui-gel-name"></span><span class="ui-gel-dose"></span><span class="ui-select-chevron">⌄</span>';
    select.before(control); control.append(summary, select);
    select.addEventListener('change', () => select.updateSummary());
  }
  select.updateSummary = () => {
    const gel = options.choices.find(choice => choice.value === select.value)?.gel;
    control.querySelector('.ui-gel-name').textContent = gel?.name ?? empty;
    control.querySelector('.ui-gel-dose').textContent = gel ? `${gel.carbsGrams} g / 支${select.value === 'snapshot' ? ' · 快照' : ''}` : '';
    control.classList.toggle('is-empty', !gel);
  };
  select.updateSummary();
  return value => options.choices.find(choice => choice.value === value)?.gel ?? null;
}
export function setupGelEditor({ storage, openSheet }) {
  const $ = id => document.getElementById(id), dialog = $('gels-dialog');
  let loaded, editing = null, finish = null;
  const notice = text => { $('gels-notice').textContent = text; $('gels-notice').hidden = !text; };
  function edit(gel = null) {
    editing = gel; $('gel-editor').hidden = false;
    $('gel-name').value = gel?.name ?? ''; $('gel-carbs').value = gel?.carbsGrams ?? '';
    $('gel-delete').hidden = !gel; $('gel-editor-title').textContent = gel ? '编辑能量胶' : '添加能量胶';
    $('gel-save').disabled = !loaded.writable;
  }
  function render() {
    $('gel-editor').hidden = true; $('gels-list').replaceChildren();
    for (const gel of loaded.catalog.items) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'gel-card';
      const name = document.createElement('strong'), amount = document.createElement('span');
      name.textContent = gel.name; amount.textContent = `${gel.carbsGrams}g 碳水／支 ›`; button.append(name, amount);
      button.addEventListener('click', () => edit(gel)); $('gels-list').append(button);
    }
    $('gels-empty').hidden = loaded.catalog.items.length > 0;
    $('gel-add').disabled = !loaded.writable || loaded.catalog.items.length >= 100;
  }
  function save(items) {
    if (!loaded.writable) { notice(loaded.message); return; }
    const next = { version: 1, items }, warning = storeGels(storage, next);
    if (warning) { notice(warning); return; }
    loaded.catalog = next; render(); notice('已保存在此浏览器。已保存计划保持原来的胶与含量。');
  }
  $('gel-add').addEventListener('click', () => { notice(loaded.message); edit(); });
  $('gel-edit-cancel').addEventListener('click', render);
  $('gel-editor').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const text = $('gel-carbs').value.trim();
      const gel = validateGel({ id: editing?.id ?? newID(), name: $('gel-name').value, carbsGrams: text ? Number(text) : NaN });
      save(editing ? loaded.catalog.items.map(item => item.id === gel.id ? gel : item) : [...loaded.catalog.items, gel]);
    } catch (error) { notice(error.message); }
  });
  $('gel-delete').addEventListener('click', () => { if (editing) save(loaded.catalog.items.filter(item => item.id !== editing.id)); });
  dialog.addEventListener('close', () => { const resolve = finish; finish = null; resolve?.(); });
  return { open() {
    loaded = loadGels(storage); render(); notice(loaded.message); openSheet(dialog);
    return new Promise(resolve => { finish = resolve; });
  } };
}
