import test from 'node:test';
import assert from 'node:assert/strict';
import { TickFeedback, RulerHaptics } from '../haptics.mjs';
import { DistanceRuler } from '../ruler.mjs';

test('slow movement waits for an actual tick, not the half-step rounding boundary', () => {
  const ticks = new TickFeedback(); ticks.begin(0, 100, 770);
  for (const [i, value] of [10, 50, 51, 75, 99].entries()) assert.equal(ticks.cross(value, 100, 770, i * 100), false);
  assert.equal(ticks.cross(100, 100, 770, 600), true);
  assert.equal(ticks.cross(100, 100, 770, 700), false);
  assert.equal(ticks.cross(150, 100, 770, 800), false);
  assert.equal(ticks.cross(200, 100, 770, 900), true);
});
test('fast movement crossing many ticks requests once and never catches up while stationary', () => {
  const ticks = new TickFeedback(); ticks.begin(0, 10, 1000);
  assert.equal(ticks.cross(500, 10, 1000, 0), true);
  assert.equal(ticks.cross(600, 10, 1000, 10), false);
  assert.equal(ticks.cross(600, 10, 1000, 100), false);
  assert.equal(ticks.cross(610, 10, 1000, 150), true);
});
test('reverse crossing and non-integral endpoint work without repeated endpoint pulses', () => {
  const ticks = new TickFeedback(); ticks.begin(210, 100, 770);
  assert.equal(ticks.cross(200, 100, 770, 0), true);
  assert.equal(ticks.cross(190, 100, 770, 100), false);
  assert.equal(ticks.cross(100, 100, 770, 200), true);
  assert.equal(ticks.cross(0, 100, 770, 300), true);
  assert.equal(ticks.cross(0, 100, 770, 400), false);
  ticks.begin(750, 100, 770);
  assert.equal(ticks.cross(770, 100, 770, 500), true);
  assert.equal(ticks.cross(770, 100, 770, 600), false);
});
test('zoom or range changes reset the baseline; ending a drag suppresses inertia and programmatic moves', () => {
  const ticks = new TickFeedback(); ticks.begin(100, 100, 1000);
  assert.equal(ticks.cross(100, 10, 1000, 0), false);
  assert.equal(ticks.cross(100, 10, 2000, 100), false);
  assert.equal(ticks.cross(110, 10, 2000, 200), true);
  ticks.end();
  assert.equal(ticks.cross(500, 10, 2000, 300), false);
  ticks.begin(500, 10, 2000);
  assert.equal(ticks.cross(500, 10, 2000, 400), false);
  assert.equal(ticks.cross(510, 10, 2000, 500), true);
});

function nativeRuler(t, actualRuler = false) {
  class Element {
    constructor() { this.switch = false; this.style = {}; this.events = new Map(); }
    setAttribute() {}
    removeAttribute() { this.style = {}; }
    append(...children) { this.children = children; }
    addEventListener(type, fn) { this.events.set(type, [...(this.events.get(type) ?? []), fn]); }
    emit(type, values = {}) { for (const fn of this.events.get(type) ?? []) fn(values); }
    getBoundingClientRect() { return { left: 0, top: 0 }; }
  }
  const frames = new Map(), root = new Element(), scroll = new Element();
  const replacements = {
    navigator: {}, window: new Element(), document: new Element(),
    requestAnimationFrame: fn => { const id = ++sequence; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    ResizeObserver: class { observe() {} },
  };
  let sequence = 0;
  replacements.window.scrollBy = () => {};
  replacements.document.createElement = () => new Element();
  for (const [name, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
  }
  const parts = new Map([['.ruler-scroll', scroll]]);
  root.querySelector = selector => { if (!parts.has(selector)) parts.set(selector, new Element()); return parts.get(selector); };
  const ruler = actualRuler ? new DistanceRuler(root, () => {}, () => {}) : { root, scroll, cursor: 500, step: 100, total: 1000, scale: 1,
    reduced: { matches: false }, clamp: value => Math.max(0, Math.min(1000, value)),
    layout(value) { this.cursor = value; }, frame() {} };
  const haptics = actualRuler ? ruler.haptics : new RulerHaptics(ruler);
  const send = (type, x, time) => haptics.input.emit(type,
    { isPrimary: true, pointerId: 1, button: 0, clientX: x, clientY: 0, timeStamp: time });
  return { ruler, haptics, frames, send };
}
test('native drag is local, flips only on crossing, and stopping cancels inertial work', t => {
  const { ruler, haptics, frames, send } = nativeRuler(t);
  assert.equal(haptics.surface.hidden, true);
  haptics.setEnabled(true);
  assert.equal(haptics.surface.hidden, false);
  send('pointerdown', 300, 0);
  send('pointermove', 250, 100);
  assert.equal(ruler.cursor, 550);
  assert.equal(haptics.clip.style.direction, 'ltr');
  send('pointermove', 200, 200);
  assert.equal(ruler.cursor, 600);
  assert.equal(haptics.clip.style.direction, 'rtl');
  send('pointermove', 190, 300);
  assert.equal(haptics.clip.style.direction, 'rtl');
  send('pointerup', 190, 320);
  assert.equal(haptics.feedback.active, false);
  assert.equal(frames.size, 1);
  haptics.setEnabled(false);
  assert.equal(frames.size, 0);
  assert.equal(haptics.surface.hidden, true);
  send('pointerdown', 300, 400); send('pointermove', 100, 500);
  assert.equal(ruler.cursor, 610);
});
test('a second finger or cancellation stops native feedback and never resumes the old drag', t => {
  const { ruler, haptics, send } = nativeRuler(t);
  haptics.setEnabled(true); send('pointerdown', 300, 0);
  ruler.root.emit('touchstart', { touches: [{}, {}] });
  send('pointermove', 100, 100);
  assert.equal(ruler.cursor, 500);
  assert.equal(haptics.feedback.active, false);
  send('pointerdown', 300, 200); send('pointercancel', 300, 250);
  send('pointermove', 100, 300);
  assert.equal(ruler.cursor, 500);
});
test('an ordinary button tap inside the ruler does not redraw at touchend and suppress the iOS click', t => {
  const { ruler } = nativeRuler(t, true);
  let frames = 0;
  ruler.frame = () => { frames++; };
  ruler.root.emit('touchend');
  assert.equal(frames, 0);
  ruler.pinch = {};
  ruler.root.emit('touchend');
  assert.equal(frames, 1);
  assert.equal(ruler.pinch, null);
});
