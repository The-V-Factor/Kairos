import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { themes, themeKey, loadTheme, storeTheme } from '../themes.mjs';
import { draftKey } from '../plan.mjs';

test('both pages restore the saved palette and toolbar color before rendering the body', () => {
  const bootstrap = readFileSync(new URL('../theme-init.js', import.meta.url), 'utf8');
  for (const page of ['index.html', 'calculator.html']) {
    const html = readFileSync(new URL('../' + page, import.meta.url), 'utf8');
    assert.match(html.split('</head>')[0], /href="\.\/workbench\.css">\s*<script src="\.\/theme-init\.js"><\/script>/);
  }
  for (const saved of [...themes.map(t => t.id), null, 'unknown', new Error('denied')]) {
    const root = { dataset: {} }, meta = {};
    const storage = { getItem(key) {
      assert.equal(key, themeKey);
      if (saved instanceof Error) throw saved;
      return saved;
    } };
    const context = {
      URL, location: { href: 'https://kairos.test/' },
      document: { documentElement: root, querySelector: () => meta }, localStorage: storage,
      getComputedStyle: () => ({ getPropertyValue: name => name === '--canvas' ? ' #123456 ' : '' }),
    };
    runInNewContext(bootstrap, context);
    assert.equal(root.dataset.theme, loadTheme(storage));
    assert.equal(root.dataset.loadingPreview, undefined);
    assert.equal(meta.content, '#123456');
    context.location.href += '?generate=preview';
    runInNewContext(bootstrap, context);
    assert.equal(root.dataset.loadingPreview, '');
  }
});

test('all five original skins persist independently of the riding plan', () => {
  const values = new Map([[draftKey, 'existing plan']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(themes.map(theme => theme.id), ['trail', 'rhythm', 'journal', 'pocket', 'precision']);
  for (const theme of themes) {
    assert.equal(storeTheme(storage, theme.id), '');
    assert.equal(loadTheme(storage), theme.id);
    assert.equal(values.get(draftKey), 'existing plan');
  }
});
test('unknown or unavailable preferences fall back without overwriting stored data', () => {
  let writes = 0;
  const storage = { getItem: () => 'future-theme', setItem: () => { writes++; } };
  assert.equal(loadTheme(storage), 'rhythm');
  assert.ok(storeTheme(storage, 'invalid'));
  assert.equal(writes, 0);
  assert.equal(loadTheme({ getItem() { throw new Error('Denied'); } }), 'rhythm');
});
test('a denied write is reported rather than claiming the selection was saved', () => {
  assert.ok(storeTheme({ setItem(key) { assert.equal(key, themeKey); throw new Error('Denied'); } }, 'trail'));
});
