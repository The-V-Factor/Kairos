export class ConnectionExpired extends Error {
  constructor() { super('连接已过期，请重新连接路书来源。'); }
}
export function tokenExpiry(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = JSON.parse(atob(payload)).exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch { return null; }
}
export function validSession(value, now = Date.now()) {
  if (!value || typeof value.token !== 'string' || !/^[\x21-\x7e]{1,16384}$/.test(value.token)) return null;
  const expiresAt = value.expiresAt ?? tokenExpiry(value.token);
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= now + 60000)) return null;
  return { token: value.token, expiresAt };
}
export function loadSession(storage, key, now = Date.now()) {
  try { return validSession(JSON.parse(storage.getItem(key)), now); }
  catch { return null; }
}
export function storeSession(storage, session, key) {
  try { storage.setItem(key, JSON.stringify(session)); return ''; }
  catch { return session ? '连接仅在本次页面打开期间有效，浏览器未能保存令牌。' : '本次连接已断开，但浏览器未能清除保存的令牌，请清除此站点数据。'; }
}
