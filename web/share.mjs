export function shareSupport(file, navigator, secure) {
  if (!secure) return { ok: false, message: '请在 HTTPS 页面或本机 localhost 上测试分享。' };
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return { ok: false, message: '当前浏览器没有提供文件分享能力，请在 iPhone Safari 中测试。' };
  }
  try {
    if (navigator.canShare({ files: [file] })) return { ok: true, message: '浏览器允许分享此文件；“健身”是否出现仍需在分享面板确认。' };
  } catch { /* Treat a rejected capability probe as unsupported, without changing the file type. */ }
  return { ok: false, message: '当前浏览器不允许直接分享此 .workout 文件。可下载作兼容性对照。' };
}

export async function sharePrepared(file, navigator, secure) {
  const support = shareSupport(file, navigator, secure);
  if (!support.ok) return { state: 'unsupported', message: support.message };
  try {
    // Called before the first await, directly from the user's click. Share only the actual file.
    await navigator.share({ files: [file] });
    return { state: 'handed-off', message: '文件已交给系统分享。请在“健身”确认添加，并在手表核对；网页无法确认是否已导入。' };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { state: 'cancelled', message: '分享未完成或已取消，计划仍保留。' };
    }
    return { state: 'failed', reason: typeof error?.name === 'string' ? error.name : 'Error',
      message: '未能打开或完成系统分享，请重试。也可下载文件作导入对照。' };
  }
}
