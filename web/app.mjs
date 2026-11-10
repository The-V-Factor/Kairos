import { encodeWorkout, validatePlan, workoutSteps, distanceLabel, roundedMeters } from './workout.mjs';
import { sharePrepared, shareSupport } from './share.mjs';

const $ = id => document.getElementById(id);
// getRandomValues also works on HTTP LAN pages, so they can still show the HTTPS requirement.
const random = crypto.getRandomValues(new Uint8Array(16));
random[6] = (random[6] & 15) | 64; random[8] = (random[8] & 63) | 128;
const hex = [...random].map(byte => byte.toString(16).padStart(2, '0')).join('');
const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
const stops = $('stops');
let prepared = null;
let sharing = false;

function number(text) {
  if (!/^\d+(\.\d+)?$/.test(text.trim())) throw new Error('距离请填数字，不要包含单位或千位分隔符。');
  return Number(text);
}

function addStop(position = '', reminder = '喝水') {
  const row = $('stop-template').content.firstElementChild.cloneNode(true);
  row.querySelector('.meters').value = position;
  row.querySelector('.reminder input').value = reminder;
  row.querySelector('.remove').addEventListener('click', () => { row.remove(); prepare(); });
  stops.append(row);
}

function diagnostics(support, byteLength = 0) {
  const items = [
    ['安全环境', window.isSecureContext ? '是' : '否（请用 HTTPS）'],
    ['浏览器提供文件分享', typeof navigator.share === 'function' && typeof navigator.canShare === 'function' ? '是' : '否'],
    ['当前训练文件可分享', prepared ? support.ok ? '是，分享目标仍待核对' : '否' : '文件尚未准备'],
    ['文件', prepared ? `${prepared.name} · ${byteLength} 字节` : '—'],
    ['文件类型', prepared?.type ?? '—'],
    ['系统导入与手表接收', '网页无法检测，请在真实设备核对'],
  ];
  const list = $('diagnostics'); list.replaceChildren();
  for (const [key, value] of items) {
    const term = document.createElement('dt'); term.textContent = key;
    const description = document.createElement('dd'); description.textContent = value;
    list.append(term, description);
  }
}

function prepare() {
  prepared = null;
  $('share').disabled = true; $('download').disabled = true;
  $('result').textContent = '';
  $('result').classList.remove('error');
  $('error').hidden = true;
  $('steps').replaceChildren();
  try {
    const plan = validatePlan({ id, totalDistanceMeters: number($('total').value) * 1000,
      stops: [...stops.querySelectorAll('.stop')].map(row => ({
        distanceMeters: number(row.querySelector('.meters').value),
        reminder: row.querySelector('.reminder input').value,
      })),
    });
    const bytes = encodeWorkout(plan);
    prepared = new File([bytes], `Kairos-${id.slice(0, 8)}.workout`, { type: 'application/octet-stream' });
    let from = 0;
    for (const step of workoutSteps(plan)) {
      const row = document.createElement('li');
      const heading = document.createElement('strong'); heading.textContent = step.name;
      const caption = document.createElement('span');
      caption.textContent = step.distanceMeters === null ? '开放目标 · 由你手动结束运动'
        : `${distanceLabel(from)} → ${distanceLabel(from + step.distanceMeters)}，本段 ${distanceLabel(step.distanceMeters)}`;
      if (step.distanceMeters !== null) from += step.distanceMeters;
      row.append(heading, caption); $('steps').append(row);
    }
    const support = shareSupport(prepared, navigator, window.isSecureContext);
    $('support').textContent = support.message;
    $('file-size').textContent = `${bytes.byteLength} 字节 · 已准备`;
    $('share').disabled = !support.ok;
    $('download').disabled = false;
    diagnostics(support, bytes.byteLength);
  } catch (error) {
    $('error').textContent = error.message; $('error').hidden = false;
    $('file-size').textContent = '待完善';
    $('support').textContent = '补全计划后，会在本页准备训练文件。';
    diagnostics({ ok: false });
  }
}

$('plan').addEventListener('submit', event => event.preventDefault());
$('plan').addEventListener('input', prepare);
$('plan').addEventListener('change', event => {
  const input = event.target;
  if (input.id !== 'total' && !input.classList.contains('meters')) return;
  try {
    const meters = roundedMeters(number(input.value) * (input.id === 'total' ? 1000 : 1));
    if (!Number.isFinite(meters) || meters > 1e9) return;
    input.value = input.id === 'total' ? String(meters / 1000) : String(meters);
    prepare();
  } catch { /* Preserve incomplete input for correction. */ }
});
$('add').addEventListener('click', () => {
  addStop(); prepare(); stops.lastElementChild.querySelector('.meters').focus();
});
$('share').addEventListener('click', async () => {
  if (!prepared || sharing) return;
  sharing = true;
  $('plan').inert = true;
  $('share').disabled = true;
  $('download').disabled = true;
  try {
    const active = navigator.userActivation?.isActive;
    // No fetch, encoding or other await between the click and navigator.share.
    const outcome = await sharePrepared(prepared, navigator, window.isSecureContext);
    const term = document.createElement('dt'); term.textContent = '最近分享结果';
    const value = document.createElement('dd'); value.textContent = `${outcome.state}${outcome.reason ? ` · ${outcome.reason}` : ''} · 点击激活 ${active ?? '未知'}`;
    $('diagnostics').append(term, value);
    $('result').textContent = outcome.message;
    $('result').classList.toggle('error', outcome.state === 'failed');
  } finally {
    sharing = false;
    $('plan').inert = false;
    $('share').disabled = !shareSupport(prepared, navigator, window.isSecureContext).ok;
    $('download').disabled = false;
  }
});
$('download').addEventListener('click', () => {
  if (!prepared) return;
  const url = URL.createObjectURL(prepared);
  const link = document.createElement('a'); link.href = url; link.download = prepared.name;
  document.body.append(link); link.click(); link.remove();
  // Keep the object URL alive while Safari takes over the download.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  $('result').textContent = '已请求下载文件。下载导入是备用对照，不代表直接分享或手表接收成功。';
});
$('copy').addEventListener('click', async () => {
  const info = `${$('diagnostics').innerText}\n浏览器：${navigator.userAgent}`;
  try { await navigator.clipboard.writeText(info); $('result').textContent = '测试信息已复制，不含补给内容。'; }
  catch { $('result').textContent = '未获准复制，请直接截图“本次测试信息”。'; }
});
for (const [position, reminder] of [[0, '出发前喝水'], [200, '喝水'], [400, '吃胶'], [1000, '吃巧克力']]) addStop(position, reminder);
prepare();
