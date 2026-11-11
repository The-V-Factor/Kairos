import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { encodeWorkout } from '../workout.mjs';

const fixture = JSON.parse(await readFile(new URL('./direct-open-plan.json', import.meta.url), 'utf8'));
const control = await readFile(new URL('../assets/direct-open.workout', import.meta.url));
const source = await readFile(new URL('../open/worker.mjs', import.meta.url), 'utf8');
const scope = 'https://kairos.example/open/';
const address = `${scope}Kairos-${fixture.id}.workout`;

function worker(entries = new Map()) {
  const handlers = new Map();
  let networkCalls = 0;
  runInNewContext(source, {
    self: { registration: { scope }, addEventListener: (type, fn) => handlers.set(type, fn), skipWaiting: async () => {} },
    caches: { open: async name => { assert.equal(name, 'kairos.direct-open.v1'); return { match: async url => entries.get(url)?.clone() }; } },
    URL, Response,
    fetch: () => { networkCalls++; throw new Error('Must not upload or fetch a plan'); },
  });
  function request(url, method = 'GET') {
    let response;
    handlers.get('fetch')({ request: new Request(url, { method }), respondWith: value => { response = value; } });
    return response;
  }
  return { request, networkCalls: () => networkCalls };
}

test('the published static control is exactly the independently validated plan fixture', () => {
  assert.deepEqual(new Uint8Array(control), encodeWorkout(fixture));
});
test('a local file address delivers the original bytes and inline file headers without a network request', async () => {
  const response = new Response(control, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'inline; filename="Kairos.workout"', 'Cache-Control': 'no-store' } });
  const runtime = worker(new Map([[address, response]]));
  const actual = await runtime.request(address);
  assert.equal(actual.headers.get('Content-Type'), 'application/octet-stream');
  assert.ok(actual.headers.get('Content-Disposition').startsWith('inline;'));
  assert.equal(actual.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(new Uint8Array(await actual.arrayBuffer()), new Uint8Array(control));
  assert.equal(runtime.networkCalls(), 0);
});
test('an expired local file is an explicit 404, never a remote request or fabricated import success', async () => {
  const runtime = worker();
  const response = await runtime.request(address);
  assert.equal(response.status, 404);
  assert.ok((await response.text()).includes('测试文件已失效'));
  assert.equal(runtime.networkCalls(), 0);
});
test('the experiment does not intercept the planner, static controls, other origins, or writes', () => {
  const runtime = worker();
  for (const url of ['https://kairos.example/', 'https://kairos.example/assets/direct-open.workout', `${scope}test.mjs`, `https://other.example/open/Kairos-${fixture.id}.workout`]) {
    assert.equal(runtime.request(url), undefined);
  }
  assert.equal(runtime.request(address, 'POST'), undefined);
  assert.equal(runtime.networkCalls(), 0);
});
