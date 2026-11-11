// Keep the file local and the worker scoped to file navigation, never the main app.
export function createFileAddressPreparer({ serviceWorker, caches, baseURL, secure }) {
  let registration = null, queue = Promise.resolve();
  async function activate() {
    if (!registration) registration = serviceWorker.register(new URL('./open/worker.mjs', baseURL).href,
      { scope: new URL('./open/', baseURL).href, type: 'module' }).catch(error => { registration = null; throw error; });
    const current = await registration;
    const worker = current.active ?? current.installing ?? current.waiting;
    if (!worker) { registration = null; throw new Error('No worker'); }
    if (worker.state === 'activated') return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Activation timeout')), 10000);
      const finish = error => {
        clearTimeout(timer); worker.removeEventListener('statechange', check);
        if (error) { registration = null; reject(error); } else resolve();
      };
      const check = () => {
        if (worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('Activation failed'));
      };
      worker.addEventListener('statechange', check); check();
    });
  }
  return (file, id) => {
    const task = queue.then(async () => {
      if (!secure || !serviceWorker || !caches) throw new Error('File address unavailable');
      await activate();
      const url = new URL(`./open/Kairos-${id}.workout`, baseURL).href;
      const cache = await caches.open('kairos.direct-open.v1');
      // Serialize replacements so a slow older write cannot overwrite the newest plan.
      for (const key of await cache.keys()) await cache.delete(key);
      await cache.put(url, new Response(file, { headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `inline; filename="${file.name}"`,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      } }));
      return url;
    });
    queue = task.catch(() => {});
    return task;
  };
}
