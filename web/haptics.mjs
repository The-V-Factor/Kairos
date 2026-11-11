// Haptic slider semantics: cross a real tick, not the rounded displayed value.
export class TickFeedback {
  begin(value, step, total) {
    this.value = value; this.step = step; this.total = total; this.active = true; this.last = -Infinity;
  }
  end() { this.active = false; }
  cross(value, step, total, now) {
    if (!this.active) return false;
    const previous = this.value;
    this.value = value;
    if (step !== this.step || total !== this.total) {
      this.step = step; this.total = total; return false;
    }
    if (value === previous) return false;
    const crossed = value > previous
      ? Math.floor(value / step + 1e-9) > Math.floor(previous / step + 1e-9)
      : Math.ceil(value / step - 1e-9) < Math.ceil(previous / step - 1e-9);
    const endpoint = (value === total || value === 0);
    if ((!crossed && !endpoint) || now - this.last < 40) return false;
    // A skipped tick is discarded, never queued for a later animation frame.
    this.last = now; return true;
  }
}

// Local native-switch experiment, inspired by ios-vibrator-pro-max's drag technique.
// No document reparenting, synthetic clicks, global API patches, or blocking timers.
export class RulerHaptics {
  constructor(ruler) {
    this.ruler = ruler; this.feedback = new TickFeedback();
    this.surface = document.createElement('div'); this.surface.className = 'haptic-surface';
    this.clip = document.createElement('div'); this.clip.className = 'haptic-clip';
    this.input = document.createElement('input'); this.input.type = 'checkbox'; this.input.setAttribute('switch', '');
    this.input.tabIndex = -1; this.surface.setAttribute('aria-hidden', 'true');
    this.native = typeof navigator.vibrate !== 'function' && 'switch' in this.input;
    this.available = this.native || typeof navigator.vibrate === 'function';
    this.clip.append(this.input); this.surface.append(this.clip); ruler.root.append(this.surface);
    this.setEnabled(false);
    this.input.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
    this.input.addEventListener('pointerdown', event => {
      if (!this.enabled || !event.isPrimary || event.button !== 0) return;
      this.stop(); ruler.transition = null;
      this.gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, value: ruler.cursor,
        lastX: event.clientX, lastY: event.clientY, time: event.timeStamp, velocity: 0, axis: null };
      this.feedback.begin(ruler.cursor, ruler.step, ruler.total);
    });
    this.input.addEventListener('pointermove', event => this.drag(event));
    this.input.addEventListener('pointerup', event => {
      const gesture = this.gesture;
      this.stop();
      if (gesture?.axis === 'x' && event.timeStamp - gesture.time < 100 && !ruler.reduced.matches) this.coast(gesture.velocity);
    });
    this.input.addEventListener('pointercancel', () => this.stop());
    ruler.root.addEventListener('touchstart', event => {
      if (event.touches.length > 1) this.stop();
      else if (this.enabled && !this.native) this.feedback.begin(ruler.cursor, ruler.step, ruler.total);
    }, { passive: true, capture: true });
    ruler.root.addEventListener('touchend', () => this.feedback.end(), { passive: true });
    ruler.root.addEventListener('touchcancel', () => this.stop(), { passive: true });
    ruler.scroll.addEventListener('pointerdown', () => {
      if (this.enabled && !this.native) this.feedback.begin(ruler.cursor, ruler.step, ruler.total);
    });
    window.addEventListener('pointerup', () => { if (!this.native) this.feedback.end(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }
  setEnabled(enabled) {
    this.stop(); this.enabled = enabled && this.available;
    this.surface.hidden = !this.enabled || !this.native;
  }
  stop() {
    cancelAnimationFrame(this.inertia); this.inertia = null; this.gesture = null;
    this.feedback.end(); this.input.checked = false; this.flipped = false; this.clip.removeAttribute('style');
    this.ruler.targetWave = 0;
  }
  browse() {
    const r = this.ruler;
    if (this.enabled && !this.native && this.feedback.cross(r.cursor, r.step, r.total, performance.now())) navigator.vibrate(10);
  }
  position(value) {
    const r = this.ruler;
    r.direction = Math.sign(value - r.cursor); r.targetWave = r.reduced.matches ? 0 : .85;
    r.layout(value); r.frame();
  }
  drag(event) {
    const g = this.gesture, r = this.ruler;
    if (!g || event.pointerId !== g.id || r.pinch) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 5) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (!g.axis) return;
    if (g.axis === 'y') window.scrollBy(0, g.lastY - event.clientY);
    else {
      this.position(r.clamp(g.value - dx / r.scale));
      const elapsed = event.timeStamp - g.time;
      if (elapsed > 0) g.velocity = .65 * Math.max(-3, Math.min(3, (g.lastX - event.clientX) / elapsed)) + .35 * g.velocity;
    }
    const pulse = g.axis === 'x' && this.feedback.cross(r.cursor, r.step, r.total, event.timeStamp);
    // Move the native switch away between ticks. Flip it once per accepted crossing,
    // rather than repeatedly toggling for a millisecond-long vibration window.
    const box = this.surface.getBoundingClientRect();
    if (pulse) this.flipped = !this.flipped;
    const x = (pulse ? g.x : event.clientX) - box.left;
    const y = (pulse ? g.y : event.clientY) - box.top;
    Object.assign(this.clip.style, { width: '28px', height: '13px', left: `${x}px`, top: `${y}px`,
      direction: this.flipped ? 'rtl' : 'ltr',
      transform: `translate(-50%, -50%) rotate(${Math.atan2(dy, dx)}rad) translateX(${pulse ? 0 : 50}px)` });
    g.lastX = event.clientX; g.lastY = event.clientY; g.time = event.timeStamp;
  }
  coast(velocity) {
    const r = this.ruler;
    let last = performance.now();
    const frame = now => {
      const elapsed = Math.min(32, now - last); last = now;
      const next = r.clamp(r.cursor + velocity * elapsed / r.scale);
      if (Math.abs(velocity) < .015 || next === r.cursor) { this.stop(); r.frame(); return; }
      this.position(next); velocity *= Math.exp(-elapsed / 230);
      this.inertia = requestAnimationFrame(frame);
    };
    this.inertia = requestAnimationFrame(frame);
  }
}
