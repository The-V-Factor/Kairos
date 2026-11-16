import { routeID, routeSummary, routeDetail } from './routes.mjs';
import { ConnectionExpired, validSession, tokenExpiry } from './route-session.mjs';

export const apiOrigin = 'https://prod.zh.igpsport.com';
export const sessionKey = 'kairos.web.igpsport.cn.v1';
export function sessionFromResponse(data) {
  const token = data?.access_token ?? data?.token;
  const expiresAt = tokenExpiry(typeof token === 'string' ? token : '') ?? (Number(data?.expires_in) > 0 ? Date.now() + Number(data.expires_in) * 1000 : null);
  const session = validSession({ token, expiresAt }, Date.now());
  if (!session) throw new Error('iGPSPORT 未返回有效令牌，暂时无法连接。');
  return session;
}
export class IGPSPORT {
  constructor(fetcher = globalThis.fetch) { this.fetcher = fetcher.bind(globalThis); }
  async request(path, { token, body, signal } = {}) {
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 30000);
    try {
      const response = await this.fetcher(`${apiOrigin}${path}`, {
        method: body ? 'POST' : 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        headers: body ? { 'Content-Type': 'application/json' } : { Authorization: `Bearer ${token}` },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal,
      });
      if (response.status === 401 && token) throw new ConnectionExpired();
      if (response.status === 403) throw new Error('iGPSPORT 暂不允许此请求，请稍后再试。');
      if (response.status === 429) throw new Error('请求太频繁，请稍后再试。');
      if (!response.ok) throw new Error(path.endsWith('/account/login') ? '连接失败，请检查中国站账号和密码后重试。' : 'iGPSPORT 请求失败，请稍后再试。');
      let json;
      try { json = await response.json(); } catch { throw new Error('iGPSPORT 返回格式已变化，暂时无法读取。'); }
      if ([401, '401'].includes(json.code) && token) throw new ConnectionExpired();
      if (json.code !== 0 || !json.data) throw new Error(path.endsWith('/account/login') ? '连接失败，请检查中国站账号和密码后重试。' : 'iGPSPORT 未能返回数据，请重试。');
      return json.data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      if (controller.signal.aborted) throw new Error('连接超时，请重试。');
      if (error instanceof TypeError) throw new Error('无法连接 iGPSPORT，请检查网络；接口也可能暂不支持浏览器访问。');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async login(username, password, signal) {
    if (!username.trim() || !password) throw new Error('请填写中国站手机号／邮箱和密码。');
    const data = await this.request('/service/auth/account/login', { body: { appId: 'igpsport-web', username: username.trim(), password }, signal });
    return sessionFromResponse(data);
  }
  async createQR(deviceId, signal) {
    const data = await this.request('/service/sportg/base/scan/createQr', { body: { deviceId, platform: 'web', type: 'analyzeWebLogin' }, signal });
    if (typeof data.oauthKey !== 'string' || !data.oauthKey || data.oauthKey.length > 512) throw new Error('iGPSPORT 未返回有效二维码，请重试。');
    const payload = new URLSearchParams({ oauthKey: data.oauthKey, platform: 'web', type: 'analyzeWebLogin', deviceId }).toString();
    return { deviceId, key: data.oauthKey, payload };
  }
  async queryQR(challenge, signal) {
    const data = await this.request('/service/sportg/base/scan/queryQr', { body: { deviceId: challenge.deviceId, oauthKey: challenge.key }, signal });
    if (!['expired', 'not_scan', 'scanned', 'verified'].includes(data.qr_status)) throw new Error('扫码状态无法识别，请刷新二维码。');
    return { state: data.qr_status, ...(data.qr_status === 'verified' ? { session: sessionFromResponse(data) } : {}) };
  }
  async search(session, keyword, page = 1, signal) {
    if (!validSession(session, Date.now())) throw new ConnectionExpired();
    if (!keyword.trim()) throw new Error('输入地点、路书名称或编号。');
    const query = new URLSearchParams({ type: 'find', key: keyword.trim(), pageIndex: page, pageSize: 20 });
    const data = await this.request(`/service/web/api/Routes/RouteListForWeb?${query}`, { token: session.token, signal });
    if (!Array.isArray(data.items)) throw new Error('路书列表格式已变化，暂时无法读取。');
    return data.items.map(routeSummary);
  }
  async detail(session, id, signal) {
    if (!validSession(session, Date.now())) throw new ConnectionExpired();
    const data = await this.request(`/service/web/api/Routes/DetailsRoutesWeb?routeId=${routeID(id)}`, { token: session.token, signal });
    return routeDetail(id, data);
  }
}
