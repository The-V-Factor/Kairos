import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileAddressPreparer } from '../file-address.mjs';

function environment() {
  const entries = new Map(), registrations = [];
  const cache = {
    keys: async () => [...entries.keys()], delete: async key => entries.delete(key),
    put: async (url, response) => { entries.set(url, response); },
  };
  return { entries, cache, registrations, options: {
    secure: true, baseURL: 'https://kairos.example/',
    serviceWorker: { register: async (...args) => { registrations.push(args); return { active: { state: 'activated' } }; } },
    caches: { open: async () => cache },
  } };
}
const file = text => new File([text], 'Kairos-1234.workout', { type: 'application/octet-stream' });

test('main-page preparation uses the file-only scope and returns exact current bytes without Web Share', async () => {
  const env = environment(), prepare = createFileAddressPreparer(env.options);
  const url = await prepare(file('current plan'), '1234');
  assert.equal(url, 'https://kairos.example/open/Kairos-1234.workout');
  assert.deepEqual(env.registrations, [['https://kairos.example/open/worker.mjs', { scope: 'https://kairos.example/open/', type: 'module' }]]);
  const response = env.entries.get(url);
  assert.equal(await response.text(), 'current plan');
  assert.equal(response.headers.get('Content-Disposition'), 'inline; filename="Kairos-1234.workout"');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('a slower previous preparation cannot overwrite the latest edited plan', async () => {
  const env = environment(), originalPut = env.cache.put;
  let release, started;
  const firstWrite = new Promise(resolve => { started = resolve; });
  env.cache.put = async (url, response) => {
    if (!release) { await new Promise(resolve => { release = resolve; started(); }); }
    await originalPut(url, response);
  };
  const prepare = createFileAddressPreparer(env.options);
  const first = prepare(file('before edit'), '1234');
  await firstWrite;
  const second = prepare(file('after edit'), '1234');
  release(); await first;
  const latest = await second;
  assert.equal(env.entries.size, 1);
  assert.equal(await env.entries.get(latest).text(), 'after edit');
  assert.equal(env.registrations.length, 1);
});
test('a failed cache write rejects, and the next preparation can recover', async () => {
  const env = environment(), put = env.cache.put;
  env.cache.put = async () => { throw new Error('Quota exceeded'); };
  const prepare = createFileAddressPreparer(env.options);
  await assert.rejects(prepare(file('failed'), '1234'), /Quota/);
  assert.equal(env.entries.size, 0);
  env.cache.put = put;
  const url = await prepare(file('recovered'), '5678');
  assert.equal(await env.entries.get(url).text(), 'recovered');
});
test('unsupported environments reject without attempting registration', async () => {
  const env = environment();
  for (const overrides of [{ secure: false }, { serviceWorker: undefined }, { caches: undefined }]) {
    await assert.rejects(createFileAddressPreparer({ ...env.options, ...overrides })(file('plan'), '1234'));
  }
  assert.equal(env.registrations.length, 0);
});
test('the file is not ready until the worker finishes activating', async () => {
  const env = environment();
  let check, started;
  const watching = new Promise(resolve => { started = resolve; });
  const worker = { state: 'activating', addEventListener: (_, fn) => { check = fn; started(); }, removeEventListener: () => {} };
  env.options.serviceWorker.register = async () => ({ active: worker });
  const pending = createFileAddressPreparer(env.options)(file('ready after activation'), '1234');
  await watching;
  assert.equal(env.entries.size, 0);
  worker.state = 'activated'; check();
  const url = await pending;
  assert.equal(await env.entries.get(url).text(), 'ready after activation');
});
