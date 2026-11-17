import { ConnectionExpired, loadSession, storeSession, validSession } from './route-session.mjs';
import { routeProviders } from './route-providers.mjs';
import { qrSVG } from './qr.mjs';
import { previewLines } from './routes.mjs';
import { distanceLabel } from './workout.mjs';
import { newID } from './plan.mjs';
import { ElevationChart } from './elevation-chart.mjs';

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function setupRoutePicker({ storage, current, openSheet }) {
  const $ = id => document.getElementById(id), dialog = $('route-dialog');
  const elevationChart = new ElevationChart($('route-elevation'), $('elevation-controls'), $('elevation-range'));
  let provider = null, api = null, session = null, request = null, serial = 0, selected = null, page = 1, keyword = '', mode = 'sources', loginMethod = 'password';
  let connectionOnly = null, connectedSession = null, selectionOnly = null;
  const savedRoute = () => selectionOnly ? selectionOnly.route : current()?.route;
  const notice = text => { $('route-notice').textContent = text; $('route-notice').hidden = !text; };
  function cancel() {
    serial++; request?.abort(); request = null; dialog.setAttribute('aria-busy', 'false');
    $('route-search').disabled = false; $('route-login').disabled = false;
  }
  function view(nextMode) {
    mode = nextMode;
    if (mode !== 'detail') elevationChart.clear();
    for (const name of ['sources', 'connect', 'browse', 'detail']) $(`route-${name}`).hidden = name !== mode;
    const sources = mode === 'sources', root = sources || !!connectionOnly, disconnect = !root && !!session;
    $('route-disconnect').hidden = !disconnect;
    $('route-close').hidden = root || disconnect;
    $('route-header-space').hidden = !root;
    $('route-nav-label').hidden = root;
    $('route-nav').querySelector('[data-icon]').innerHTML = root ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>' : '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
    $('route-nav').setAttribute('aria-label', connectionOnly ? '取消 iGPSPORT 连接' : sources ? '关闭路线库' : '返回路线库');
    $('route-title').textContent = sources ? '路线库' : mode === 'detail' ? '路线详情' : provider.name;
    dialog.scrollTop = 0;
  }
  function connectedView() { view(session ? 'browse' : 'connect'); }
  function sourcesView() {
    cancel(); notice(''); view('sources');
    const saved = savedRoute();
    $('route-current').hidden = !saved; $('route-saved-name').textContent = saved?.title ?? '';
    if (saved) {
      const outline = previewLines(saved.points, saved.distanceMeters).outline, thumbnail = $('route-saved-outline');
      thumbnail.querySelector('polyline').setAttribute('points', outline);
      const points = outline.split(' ').map(point => point.split(',').map(Number));
      const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
      const left = Math.min(...xs), top = Math.min(...ys);
      thumbnail.setAttribute('viewBox', `${left - 12} ${top - 12} ${Math.max(...xs) - left + 24} ${Math.max(...ys) - top + 24}`);
      $('route-saved-metrics').textContent = `${distanceLabel(saved.distanceMeters)}${saved.ascentMeters === null ? '' : ` · 爬升 ${Math.round(saved.ascentMeters)} m`}`;
    }
    $('route-provider-list').replaceChildren();
    for (const item of routeProviders) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'route-source';
      button.innerHTML = '<span class="route-source-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/></svg></span><span class="route-source-copy"><strong></strong><small></small></span><span class="route-source-status"></span><span aria-hidden="true">›</span>';
      button.querySelector('strong').textContent = item.name;
      button.querySelector('small').textContent = item.caption;
      const connected = !!(loadSession(storage, item.sessionKey) || (provider?.id === item.id && validSession(session)));
      button.querySelector('.route-source-status').textContent = connected ? '已连接' : '未连接';
      button.querySelector('.route-source-status').classList.toggle('connected', connected);
      button.addEventListener('click', () => enterProvider(item));
      $('route-provider-list').append(button);
    }
  }
  function enterProvider(item) {
    cancel(); notice('');
    const previous = provider?.id === item.id ? session : null;
    provider = item; api = item.createClient(); session = loadSession(storage, item.sessionKey) ?? validSession(previous);
    $('route-login-caption').textContent = connectionOnly ? 'iGPSPORT 账号' : item.caption; $('route-browse-caption').textContent = item.caption;
    $('route-login-title').textContent = connectionOnly ? '连接后读取个人档案' : '连接你的路书库';
    $('route-login').textContent = connectionOnly ? '登录并读取档案' : '登录并查找路线';
    resetSearch(); connectedView(); if (!session) selectLoginMethod('password');
  }
  function resetSearch() {
    page = 1; keyword = ''; $('route-results').replaceChildren(); $('route-pagination').hidden = true;
    $('route-keyword').value = ''; searchEmpty();
  }
  function searchEmpty(query = '') {
    $('route-search-status').hidden = true; $('route-search-empty').hidden = false;
    $('route-search-empty').classList.toggle('no-results', !!query);
    $('route-empty-title').textContent = query ? '换个关键词试试' : '下一趟，想骑哪儿？';
    $('route-empty-copy').textContent = query ? `没有找到“${query}”的路书。` : '输入目的地，找一条适合这趟骑行的路。';
    $('route-empty-hint').hidden = !query; $('route-search-clear').hidden = !query;
  }
  async function run(work, success) {
    cancel(); const id = serial; request = new AbortController();
    notice(''); dialog.setAttribute('aria-busy', 'true');
    $('route-search').disabled = true; $('route-login').disabled = true;
    try {
      const value = await work(request.signal);
      if (id === serial && dialog.open) { success(value); return true; }
    } catch (error) {
      if (id !== serial || !dialog.open || error.name === 'AbortError') return;
      if (error instanceof ConnectionExpired) {
        session = null; resetSearch(); connectedView(); selectLoginMethod('password');
        const warning = storeSession(storage, null, provider.sessionKey); notice(`${error.message}${warning}`);
      } else notice(error.message);
    } finally {
      if (id === serial) {
        request = null; dialog.setAttribute('aria-busy', 'false');
        $('route-search').disabled = false; $('route-login').disabled = false;
      }
    }
    return false;
  }
  function loggedIn(value) {
    session = value; clearPassword();
    const warning = storeSession(storage, session, provider.sessionKey);
    if (connectionOnly) { connectedSession = session; dialog.close(); return; }
    resetSearch(); view('browse'); notice(warning);
  }
  function clearPassword() {
    $('route-login-form').reset(); $('route-password').type = 'password';
    $('route-password-visibility').setAttribute('aria-label', '显示密码'); $('route-password-visibility').setAttribute('aria-pressed', 'false');
  }
  function selectLoginMethod(method) {
    cancel(); notice(''); loginMethod = method; clearPassword();
    $('route-login-form').hidden = method !== 'password'; $('route-qr-panel').hidden = method !== 'qr';
    for (const [id, selected] of [['route-password-tab', method === 'password'], ['route-qr-tab', method === 'qr']]) {
      $(id).setAttribute('aria-selected', String(selected)); $(id).tabIndex = selected ? 0 : -1;
    }
    $('route-qr-image').replaceChildren(); $('route-qr-image').hidden = true;
    if (method === 'qr') startQR();
  }
  async function startQR() {
    $('route-qr-image').replaceChildren(); $('route-qr-image').hidden = true;
    $('route-qr-status').textContent = '正在生成二维码…';
    const ok = await run(async signal => {
      const challenge = await api.createQR(newID(), signal), expiresAt = Date.now() + 120000;
      if (signal.aborted) throw new DOMException('已取消', 'AbortError');
      $('route-qr-image').innerHTML = qrSVG(challenge.payload); $('route-qr-image').hidden = false;
      $('route-qr-status').textContent = '等待扫码确认';
      while (!signal.aborted && Date.now() < expiresAt) {
        await pause(1500, signal);
        if (Date.now() >= expiresAt) break;
        if (document.hidden) continue;
        const result = await api.queryQR(challenge, signal);
        if (signal.aborted) throw new DOMException('已取消', 'AbortError');
        if (result.state === 'verified') return result.session;
        if (result.state === 'expired') break;
        $('route-qr-status').textContent = result.state === 'scanned' ? '扫码成功，请在 iGPSPORT App 确认登录' : '等待扫码确认';
      }
      throw new Error('二维码已过期，请刷新后重试。');
    }, loggedIn);
    if (!ok && dialog.open && mode === 'connect' && loginMethod === 'qr' && !request) {
      $('route-qr-image').replaceChildren(); $('route-qr-image').hidden = true;
      $('route-qr-status').textContent = '请刷新二维码后重试';
    }
  }
  function showDetail(route, saved = false) {
    selected = route; view('detail');
    $('route-detail-name').textContent = route.title;
    $('route-detail-author').textContent = [route.region, route.author && `路书作者 · ${route.author}`].filter(Boolean).join(' · ');
    const lines = previewLines(route.points, route.distanceMeters);
    $('route-outline').querySelector('polyline').setAttribute('points', lines.outline);
    const [cx, cy] = lines.outline.split(' ')[0].split(',');
    $('route-outline').querySelector('circle').setAttribute('cx', cx);
    $('route-outline').querySelector('circle').setAttribute('cy', cy);
    $('elevation-view').hidden = !lines.elevation;
    if (lines.elevation) elevationChart.setRoute(route); else elevationChart.clear();
    $('route-elevation-status').hidden = !!lines.elevation;
    $('route-elevation-status').textContent = lines.elevation ? '' : '此路书缺少完整海拔，暂不展示海拔曲线。';
    $('route-metrics').replaceChildren();
    for (const [label, value] of [['距离', distanceLabel(route.distanceMeters)], ['累计爬升', route.ascentMeters === null ? '未提供' : `${Math.round(route.ascentMeters)} m`]]) {
      const item = document.createElement('div'), caption = document.createElement('span'), number = document.createElement('strong');
      caption.textContent = label; number.textContent = value; item.append(caption, number); $('route-metrics').append(item);
    }
    $('route-use').textContent = saved ? '按路线距离设置全程' : '使用这条路线';
    $('route-remove').hidden = !saved;
    dialog.scrollTop = 0;
  }
  async function search(nextPage) {
    const query = $('route-keyword').value.trim();
    if (!query) { notice('输入地点、路书名称或编号。'); return; }
    // Remove old results while loading; failure never presents a previous query as new results.
    $('route-results').replaceChildren(); $('route-pagination').hidden = true;
    $('route-search-empty').hidden = true; $('route-search-status').hidden = false;
    $('route-search-status').textContent = '正在寻找路线…';
    await run(signal => api.search(session, query, nextPage, signal), results => {
      page = nextPage; keyword = query;
      $('route-search-status').textContent = `“${query}” · 第 ${page} 页`;
      if (!results.length) searchEmpty(query);
      for (const route of results) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'route-result';
        const title = document.createElement('strong'), stats = document.createElement('span'), author = document.createElement('small');
        title.textContent = route.title;
        stats.textContent = `${distanceLabel(route.distanceMeters)}${route.ascentMeters === null ? '' : ` · 爬升 ${Math.round(route.ascentMeters)} m`}`;
        author.textContent = [route.region, route.author].filter(Boolean).join(' · ');
        button.append(title, stats, author);
        button.addEventListener('click', () => run(signal => api.detail(session, route.id, signal), detail => showDetail(detail)));
        $('route-results').append(button);
      }
      $('route-pagination').hidden = page === 1 && results.length < 20;
      $('route-page').textContent = `第 ${page} 页`; $('route-prev').disabled = page === 1; $('route-next').disabled = results.length < 20;
    });
    if (!$('route-notice').hidden && !request && !session) return;
    if (!$('route-notice').hidden) $('route-search-status').textContent = '未完成搜索，请重试。';
  }
  $('route-login-form').addEventListener('submit', event => {
    event.preventDefault();
    const username = $('route-username').value, password = $('route-password').value;
    $('route-password').value = '';
    run(signal => api.login(username, password, signal), loggedIn);
  });
  $('route-password-visibility').addEventListener('click', () => {
    const show = $('route-password').type === 'password'; $('route-password').type = show ? 'text' : 'password';
    $('route-password-visibility').setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    $('route-password-visibility').setAttribute('aria-pressed', String(show));
  });
  for (const method of ['password', 'qr']) {
    const tab = $(`route-${method}-tab`);
    tab.addEventListener('click', () => { if (method !== loginMethod) selectLoginMethod(method); });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'password' : event.key === 'End' ? 'qr' : method === 'qr' ? 'password' : 'qr';
      selectLoginMethod(next); $(`route-${next}-tab`).focus();
    });
  }
  $('route-qr-refresh').addEventListener('click', startQR);
  $('route-nav').addEventListener('click', () => { if (mode === 'sources' || connectionOnly) dialog.close(); else { clearPassword(); sourcesView(); } });
  $('route-close').addEventListener('click', () => dialog.close());
  $('route-saved').addEventListener('click', () => {
    const route = savedRoute(); if (!route) return;
    const item = routeProviders.find(item => item.id === route.source); if (!item) return;
    enterProvider(item); showDetail(route, true);
  });
  $('route-search-form').addEventListener('submit', event => { event.preventDefault(); search(1); });
  for (const button of dialog.querySelectorAll('[data-route-example]')) button.addEventListener('click', () => {
    $('route-keyword').value = button.dataset.routeExample; search(1);
  });
  $('route-search-clear').addEventListener('click', () => { cancel(); notice(''); resetSearch(); });
  for (const [id, delta] of [['route-prev', -1], ['route-next', 1]]) $(id).addEventListener('click', () => {
    $('route-keyword').value = keyword; search(page + delta);
  });
  $('route-back').addEventListener('click', () => { cancel(); notice(''); connectedView(); });
  $('route-disconnect').addEventListener('click', () => {
    cancel(); session = null; resetSearch(); clearPassword(); connectedView(); selectLoginMethod('password'); notice(storeSession(storage, null, provider.sessionKey));
  });
  function apply(route) {
    if (!selectionOnly) return;
    selectionOnly.result = route; dialog.close();
  }
  $('route-use').addEventListener('click', () => { if (selected) apply(selected); });
  $('route-remove').addEventListener('click', () => apply(null));
  dialog.addEventListener('close', () => {
    cancel(); elevationChart.clear(); selected = null; clearPassword(); $('route-qr-image').replaceChildren(); dialog.setAttribute('aria-busy', 'false');
    $('route-login').disabled = false; $('route-search').disabled = false;
    if (selectionOnly) {
      const { resolve, result } = selectionOnly; selectionOnly = null;
      requestAnimationFrame(() => resolve(result));
    }
    if (connectionOnly) {
      const resolve = connectionOnly, value = connectedSession;
      connectionOnly = null; connectedSession = null;
      requestAnimationFrame(() => resolve(value));
    }
  });
  return {
    pick(route = null) {
      return new Promise(resolve => {
        selectionOnly = { route, resolve, result: undefined };
        clearPassword(); sourcesView(); openSheet(dialog);
      });
    },
    connect() {
      return new Promise(resolve => {
        connectionOnly = resolve; connectedSession = null;
        enterProvider(routeProviders[0]); view('connect'); selectLoginMethod('password'); openSheet(dialog);
      });
    },
  };
}
