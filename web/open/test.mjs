import { encodeWorkout, validatePlan, distanceLabel } from '../workout.mjs';
import { loadDraft, samplePlan } from '../plan.mjs';

const $ = id => document.getElementById(id);
const cacheName = 'kairos.direct-open.v1';
const loaded = loadDraft({ getItem: key => localStorage.getItem(key) });
const candidate = loaded.plan ?? (loaded.writable ? samplePlan() : null);

function enableLink(id, url, text) {
  const link = $(id);
  link.href = url; link.textContent = text; link.removeAttribute('aria-disabled');
}

async function prepareAddress(file, plan) {
  if (!isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) {
    $('address-status').textContent = '当前环境不能准备本机文件地址。请用 HTTPS 下的 Safari，或先试 A／C。';
    $('open-address').textContent = '文件地址不可用'; return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./worker.mjs', { scope: './', type: 'module' });
    // Wait for this registration, not an unrelated worker at a different scope.
    if (!registration.active) {
      const worker = registration.installing ?? registration.waiting;
      if (!worker) throw new Error('No worker');
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.removeEventListener('statechange', check); reject(new Error('Activation timeout'));
        }, 10000);
        const check = () => {
          if (worker.state === 'activated' || worker.state === 'redundant') {
            clearTimeout(timer); worker.removeEventListener('statechange', check);
            if (worker.state === 'activated') resolve(); else reject(new Error('Activation failed'));
          }
        };
        worker.addEventListener('statechange', check); check();
      });
    }
    const url = new URL(`./Kairos-${plan.id}.workout`, location.href);
    const cache = await caches.open(cacheName);
    // The experiment keeps only its latest file; it never edits the plan's localStorage.
    for (const key of await cache.keys()) await cache.delete(key);
    await cache.put(url.href, new Response(file, { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `inline; filename="${file.name}"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } }));
    enableLink('open-address', url.href, '通过文件网址打开当前计划');
    $('address-status').textContent = '文件地址已准备。若成功，健身应展示当前计划的内容。';
  } catch {
    $('open-address').textContent = '文件地址未能准备';
    $('address-status').textContent = '未能准备本机文件地址，草稿未改动。请先试 A／C。';
  }
}

try {
  if (!candidate) throw new Error(loaded.message);
  const plan = validatePlan(candidate);
  const file = new File([encodeWorkout(plan)], `Kairos-${plan.id.slice(0, 8)}.workout`, { type: 'application/octet-stream' });
  $('plan-summary').textContent = `${loaded.plan ? '当前已保存计划' : '示例计划'} · ${distanceLabel(plan.totalDistanceMeters)} · ${plan.stops.length} 个补给点`;
  // A genuine File, but navigation instead of share() or an anchor download attribute.
  // Keep this single URL alive so returning through the browser history can retry it.
  enableLink('open-local', URL.createObjectURL(file), '打开当前计划');
  prepareAddress(file, plan);
} catch (error) {
  $('open-error').textContent = error.message;
  $('open-error').hidden = false;
  $('open-address').textContent = '当前计划未准备';
}
