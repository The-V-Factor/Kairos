import test from 'node:test';
import assert from 'node:assert/strict';
import { IGPSPORT, apiOrigin, sessionKey } from '../igpsport.mjs';
import { ConnectionExpired, loadSession, storeSession, tokenExpiry } from '../route-session.mjs';

const token = 'test-token-not-a-real-credential';
const session = { token, expiresAt: null };
const reply = (data, code = 0) => new Response(JSON.stringify({ code, data }), { headers: { 'Content-Type': 'application/json' } });

test('native browser fetch keeps its global receiver when stored on the API client', async () => {
  const browserFetch = function () {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(reply({ access_token: token }));
  };
  const api = new IGPSPORT(browserFetch);
  assert.deepEqual(await api.login('demo', 'dummy'), session);
});

function mockAPI(responses) {
  const calls = [];
  return { calls, api: new IGPSPORT(async (url, options) => { calls.push({ url: new URL(url), ...options }); return responses.shift(); }) };
}

test('password login posts directly to China endpoint and persistence contains only token and expiry', async () => {
  const { api, calls } = mockAPI([reply({ access_token: token, expires_in: 7200 })]);
  const connected = await api.login('  demo@example.invalid  ', 'dummy-password');
  assert.equal(connected.token, token);
  assert.ok(connected.expiresAt > Date.now() + 7000000);
  assert.equal(calls[0].url.origin, apiOrigin);
  assert.equal(calls[0].url.pathname, '/service/auth/account/login');
  assert.deepEqual(JSON.parse(calls[0].body), { appId: 'igpsport-web', username: 'demo@example.invalid', password: 'dummy-password' });
  assert.equal(calls[0].credentials, 'omit'); assert.equal(calls[0].cache, 'no-store'); assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[0].headers.Authorization, undefined);
  let stored;
  const storage = { setItem(key, value) { assert.equal(key, sessionKey); stored = value; }, getItem() { return stored; } };
  assert.equal(storeSession(storage, connected, sessionKey), '');
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['expiresAt', 'token']);
  assert.ok(!stored.includes('password') && !stored.includes('demo@example.invalid'));
  assert.deepEqual(loadSession(storage, sessionKey), connected);
  storeSession(storage, null, sessionKey); assert.equal(loadSession(storage, sessionKey), null);
});

test('JWT expiry, malformed sessions and denied storage do not create a usable cached login', () => {
  const jwt = `header.${btoa(JSON.stringify({ exp: 1800000000 }))}.signature`;
  assert.equal(tokenExpiry(jwt), 1800000000000);
  assert.equal(tokenExpiry('opaque'), null);
  const storage = value => ({ getItem: () => JSON.stringify(value) });
  assert.equal(loadSession(storage({ token: jwt }), sessionKey, 1800000000000), null);
  assert.ok(loadSession(storage({ token: jwt }), sessionKey, 1799999900000));
  for (const value of [null, {}, { token: 'bad\nheader' }, { token, expiresAt: 'tomorrow' }]) assert.equal(loadSession(storage(value), sessionKey), null);
  const denied = { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Quota'); } };
  assert.equal(loadSession(denied, sessionKey), null); assert.ok(storeSession(denied, session, sessionKey)); assert.ok(storeSession(denied, null, sessionKey));
});

test('route searches encode keywords and pages; bearer token never appears in URL', async () => {
  const { api, calls } = mockAPI([reply({ items: [{ roadBookId: 123, title: '松山湖', distance: '75000', totalAscent: 430 }] })]);
  const results = await api.search(session, '松山湖 & 广州', 2);
  assert.equal(results[0].distanceMeters, 75000); assert.equal(results[0].ascentMeters, 430);
  assert.equal(calls[0].url.searchParams.get('key'), '松山湖 & 广州');
  assert.equal(calls[0].url.searchParams.get('pageIndex'), '2'); assert.equal(calls[0].url.searchParams.get('type'), 'find');
  assert.equal(calls[0].headers.Authorization, `Bearer ${token}`); assert.ok(!calls[0].url.href.includes(token));
  await assert.rejects(api.search({ token, expiresAt: 1 }, '松山湖'), ConnectionExpired);
  await assert.rejects(api.search(session, ''), /输入地点/);
  await assert.rejects(api.detail(session, '../secret'), /编号无效/);
  assert.equal(calls.length, 1);
});

test('QR handshake uses a caller-generated device identity and only returns token after app confirmation', async () => {
  const { api, calls } = mockAPI([
    reply({ oauthKey: 'demo-key', platform: 'web', type: 'analyzeWebLogin' }),
    reply({ qr_status: 'not_scan' }), reply({ qr_status: 'scanned' }),
    reply({ qr_status: 'verified', access_token: token }), reply({ qr_status: 'expired' }),
  ]);
  const qr = await api.createQR('demo-device');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(qr.payload)), { oauthKey: 'demo-key', platform: 'web', type: 'analyzeWebLogin', deviceId: 'demo-device' });
  assert.deepEqual(JSON.parse(calls[0].body), { deviceId: 'demo-device', platform: 'web', type: 'analyzeWebLogin' });
  assert.deepEqual(await api.queryQR(qr), { state: 'not_scan' });
  assert.deepEqual(await api.queryQR(qr), { state: 'scanned' });
  assert.deepEqual(await api.queryQR(qr), { state: 'verified', session });
  assert.deepEqual(await api.queryQR(qr), { state: 'expired' });
  assert.deepEqual(JSON.parse(calls[1].body), { deviceId: 'demo-device', oauthKey: 'demo-key' });
  assert.ok(calls.every(call => call.headers.Authorization === undefined));
});

test('invalid QR responses and unconfirmed or missing tokens are rejected', async () => {
  const { api } = mockAPI([reply({}), reply({ qr_status: 'unknown' }), reply({ qr_status: 'verified' })]);
  await assert.rejects(api.createQR('test'), /有效二维码/);
  await assert.rejects(api.queryQR({ deviceId: 'test', key: 'test' }), /状态无法识别/);
  await assert.rejects(api.queryQR({ deviceId: 'test', key: 'test' }), /有效令牌/);
});

test('HTTP and business errors distinguish expired connections from permission, throttling and schema changes', async () => {
  const { api } = mockAPI([
    new Response('', { status: 401 }), reply({}, 401), new Response('', { status: 403 }),
    new Response('', { status: 429 }), new Response('not json'), reply({ wrong: [] }),
    reply(null, 1002), reply({ access_token: '' }),
  ]);
  await assert.rejects(api.search(session, 'test'), ConnectionExpired);
  await assert.rejects(api.search(session, 'test'), ConnectionExpired);
  await assert.rejects(api.search(session, 'test'), /暂不允许/);
  await assert.rejects(api.search(session, 'test'), /太频繁/);
  await assert.rejects(api.search(session, 'test'), /格式已变化/);
  await assert.rejects(api.search(session, 'test'), /列表格式/);
  await assert.rejects(api.login('test', 'dummy'), /账号和密码/);
  await assert.rejects(api.login('test', 'dummy'), /有效令牌/);
  const offline = new IGPSPORT(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(offline.search(session, 'test'), /无法连接/);
});

test('closing a request aborts fetch instead of finishing login in the background', async () => {
  const controller = new AbortController();
  const api = new IGPSPORT(async (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = api.login('demo', 'dummy', controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('hanging requests time out with a retryable message', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const api = new IGPSPORT(async (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = api.search(session, 'test');
  t.mock.timers.tick(30000);
  await assert.rejects(pending, /超时/);
});
