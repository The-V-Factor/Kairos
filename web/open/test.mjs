import { encodeWorkout, validatePlan, distanceLabel } from '../workout.mjs';
import { loadDraft, samplePlan } from '../plan.mjs';
import { createFileAddressPreparer } from '../file-address.mjs';

const $ = id => document.getElementById(id);
const fileAddress = createFileAddressPreparer({ serviceWorker: navigator.serviceWorker, caches: window.caches, baseURL: new URL('../', location.href), secure: isSecureContext });
const loaded = loadDraft({ getItem: key => localStorage.getItem(key) });
const candidate = loaded.plan ?? (loaded.writable ? samplePlan() : null);

function enableLink(id, url, text) {
  const link = $(id);
  link.href = url; link.textContent = text; link.removeAttribute('aria-disabled');
}

async function prepareAddress(file, plan) {
  try {
    const url = await fileAddress(file, plan.id);
    enableLink('open-address', url, '通过文件网址打开当前计划');
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
