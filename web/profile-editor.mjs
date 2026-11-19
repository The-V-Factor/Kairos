import { emptyProfile, loadProfile, storeProfile, validateProfile, profileValue, profileChanges, mergeProfile } from './profile.mjs';
import { IGPSPORT, sessionKey } from './igpsport.mjs';
import { ConnectionExpired, loadSession, storeSession, validSession } from './route-session.mjs';
import { icon } from './artwork.mjs';

export function setupProfileEditor({ storage, openSheet, connect, manageGels }) {
  const $ = id => document.getElementById(id), dialog = $('profile-dialog'), api = new IGPSPORT();
  const loaded = loadProfile(storage);
  let saved = loaded.profile, draft = emptyProfile(), incoming = null, base = null, request = null, serial = 0;
  let finish = null, openingChild = false;
  const inputs = { ageYears: 'profile-age', heightCm: 'profile-height', weightKg: 'profile-weight', ftpWatts: 'profile-ftp' };
  function notice(text = '') { $('profile-notice').textContent = text; $('profile-notice').hidden = !text; }
  function cancelRead() {
    serial++; request?.abort(); request = null; $('profile-import').disabled = false; dialog.setAttribute('aria-busy', 'false');
  }
  function connectionLabel() { $('profile-connection').textContent = loadSession(storage, sessionKey) ? '已连接' : '未连接'; }
  function sex(value) {
    draft.sex = value;
    for (const button of dialog.querySelectorAll('[data-profile-sex]')) button.setAttribute('aria-pressed', String(button.dataset.profileSex === value));
  }
  function fill(value) {
    draft = { ...value }; sex(value.sex);
    for (const [key, id] of Object.entries(inputs)) $(id).value = value[key] === null ? '' : key === 'weightKg' ? value[key].toFixed(1) : String(value[key]);
  }
  function read() {
    return validateProfile({ sex: draft.sex, ...Object.fromEntries(Object.entries(inputs).map(([key, id]) => [key, $(id).value.trim()])) });
  }
  function view(review = false) {
    $('profile-form').hidden = review; $('profile-review').hidden = !review;
    $('profile-title').textContent = review ? '核对导入内容' : '个人档案';
    $('profile-nav').setAttribute('aria-label', review ? '返回个人档案' : '关闭个人档案');
    $('profile-nav').innerHTML = review ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>' : icon('close');
    dialog.scrollTop = 0;
  }
  function afterClose(sheet) {
    openingChild = true;
    return new Promise(resolve => { sheet.addEventListener('close', () => requestAnimationFrame(resolve), { once: true }); sheet.close(); });
  }
  function open() {
    $('account-menu').hidePopover();
    fill(saved); incoming = null; view(); connectionLabel(); notice(loaded.message); openSheet(dialog);
    return new Promise(resolve => { finish = resolve; });
  }
  $('profile-entry').addEventListener('click', open);
  for (const button of dialog.querySelectorAll('[data-profile-sex]')) button.addEventListener('click', () => sex(draft.sex === button.dataset.profileSex ? null : button.dataset.profileSex));
  $('profile-nav').addEventListener('click', () => {
    if (!$('profile-review').hidden) { incoming = null; view(); notice(loaded.message); }
    else dialog.close();
  });
  $('profile-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      saved = read();
      const warning = loaded.writable ? storeProfile(storage, saved) : loaded.message;
      if (warning) { notice(warning); return; }
      dialog.close();
    } catch (error) { notice(error.message); }
  });
  function updateApply() {
    const count = $('profile-review-fields').querySelectorAll('input:checked').length;
    $('profile-apply').textContent = count ? `确认填入 ${count} 项` : '没有选中更新项'; $('profile-apply').disabled = count === 0;
  }
  function review(result) {
    base = read(); incoming = result.profile;
    $('profile-review-fields').replaceChildren();
    for (const field of profileChanges(base, incoming)) {
      const row = document.createElement('label'); row.className = 'profile-review-row';
      const changed = field.value !== null && !field.same, name = document.createElement('span'), value = document.createElement('strong');
      name.textContent = field.label; value.textContent = profileValue(incoming, field.key);
      if (changed) {
        const check = document.createElement('input'); check.type = 'checkbox'; check.checked = true; check.value = field.key; check.setAttribute('aria-label', `更新${field.label}`);
        check.addEventListener('change', updateApply);
        const before = document.createElement('small'), arrow = document.createElement('span');
        before.textContent = profileValue(base, field.key); arrow.textContent = '→'; arrow.setAttribute('aria-hidden', 'true');
        row.append(check, name, before, arrow, value);
      } else {
        row.classList.add('unchanged'); const badge = document.createElement('small');
        badge.textContent = field.same ? '相同' : '未提供';
        value.textContent = profileValue(base, field.key); row.append(name, value, badge);
      }
      $('profile-review-fields').append(row);
    }
    view(true); notice(result.message); updateApply();
  }
  $('profile-gels').addEventListener('click', async () => {
    await afterClose(dialog);
    await manageGels(); openSheet(dialog);
  });
  $('profile-import').addEventListener('click', async () => {
    try { read(); } catch (error) { notice(error.message); return; }
    let session = loadSession(storage, sessionKey);
    if (!session) {
      await afterClose(dialog);
      try { session = await connect(); } finally { openSheet(dialog); connectionLabel(); }
      if (!validSession(session)) return;
    }
    cancelRead(); const id = serial; request = new AbortController();
    $('profile-import').disabled = true; dialog.setAttribute('aria-busy', 'true'); notice('正在读取个人档案…');
    try {
      const result = await api.profile(session, request.signal);
      if (id === serial && dialog.open) review(result);
    } catch (error) {
      if (id !== serial || !dialog.open || error.name === 'AbortError') return;
      if (error instanceof ConnectionExpired) {
        const warning = storeSession(storage, null, sessionKey); connectionLabel();
        notice(`iGPSPORT 连接已过期，请重新读取并连接。${warning}`);
      } else notice(error.message);
    } finally {
      if (id === serial) { request = null; $('profile-import').disabled = false; dialog.setAttribute('aria-busy', 'false'); }
    }
  });
  $('profile-apply').addEventListener('click', () => {
    if (!incoming) return;
    const keys = [...$('profile-review-fields').querySelectorAll('input:checked')].map(input => input.value);
    fill(mergeProfile(base, incoming, keys)); incoming = null; view(); notice('已填入，请保存档案。');
  });
  dialog.addEventListener('close', () => {
    cancelRead(); incoming = null; base = null; $('profile-review-fields').replaceChildren();
    if (openingChild) { openingChild = false; return; }
    finish?.(); finish = null;
  });
  return { open };
}
