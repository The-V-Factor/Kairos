import test from 'node:test';
import assert from 'node:assert/strict';
import { themes, themeKey, loadTheme, storeTheme } from '../themes.mjs';
import { draftKey } from '../plan.mjs';

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
