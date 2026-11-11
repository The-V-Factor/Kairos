import { distanceLabel, roundedMeters } from './workout.mjs';
import { majorInterval } from './plan.mjs';
import { fuelArtwork } from './artwork.mjs';

// Native horizontal scrolling supplies touch momentum. Only the visible ticks are drawn.
export class DistanceRuler {
  constructor(root, onBrowse, onSelect) {
    this.root = root;
    this.scroll = root.querySelector('.ruler-scroll');
    this.track = root.querySelector('.ruler-track');
    this.svg = root.querySelector('.ruler-ticks');
    this.markers = root.querySelector('.ruler-markers');
    this.readout = root.querySelector('output');
    this.onBrowse = onBrowse;
    this.onSelect = onSelect;
    this.zoom = 1;
    this.cursor = 0;
    this.wave = 0;
    this.targetWave = 0;
    this.direction = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.scroll.addEventListener('scroll', () => {
      // Browsers may quantize scrollLeft to pixels; do not shift an exact programmatic position.
      if (Math.abs(this.scroll.scrollLeft - this.appliedOffset) < .01) return;
      const previous = this.cursor;
      const end = this.scroll.scrollWidth - this.scroll.clientWidth;
      this.cursor = this.scroll.scrollLeft >= end - .5 ? this.total : this.clamp(this.scroll.scrollLeft / this.scale);
      this.direction = Math.sign(this.cursor - previous);
      this.targetWave = this.reduced.matches ? 0 : .85;
      clearTimeout(this.settle);
      this.settle = setTimeout(() => { this.targetWave = 0; this.frame(); }, 90);
      this.publish(); this.frame();
    });
    this.scroll.addEventListener('keydown', event => {
      const moves = { ArrowLeft: -1, ArrowRight: 1, PageDown: -10, PageUp: 10 };
      if (event.key in moves || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        this.move(event.key === 'Home' ? 0 : event.key === 'End' ? this.total : this.cursor + moves[event.key] * this.step);
      }
    });
    this.scroll.addEventListener('touchstart', event => {
      if (event.touches.length !== 2) return;
      const [a, b] = event.touches;
      const x = (a.clientX + b.clientX) / 2 - this.root.getBoundingClientRect().left;
      this.pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: this.zoom,
        anchor: this.cursor + (x - this.width / 2) / this.scale };
      this.transition = null;
    }, { passive: true });
    this.scroll.addEventListener('touchmove', event => {
      if (event.touches.length !== 2 || !this.pinch) return;
      event.preventDefault();
      const [a, b] = event.touches;
      const x = (a.clientX + b.clientX) / 2 - this.root.getBoundingClientRect().left;
      this.zoom = Math.min(64, Math.max(1, this.pinch.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(1, this.pinch.distance)));
      this.layout(this.pinch.anchor - (x - this.width / 2) / this.scale);
      this.targetWave = this.reduced.matches ? 0 : .7;
      this.frame();
    }, { passive: false });
    const endPinch = () => { this.pinch = null; this.targetWave = 0; this.frame(); };
    this.scroll.addEventListener('touchend', endPinch);
    this.scroll.addEventListener('touchcancel', endPinch);
    new ResizeObserver(() => { if (this.total) this.layout(this.cursor); }).observe(root);
    this.reduced.addEventListener('change', () => { this.wave = 0; this.targetWave = 0; this.frame(); });
  }
  get width() { return this.root.clientWidth; }
  get scale() { return Math.max(1, this.width - 48) / this.total * this.zoom; }
  get step() { return majorInterval(this.total / this.zoom) / 10; }
  clamp(value) { return Math.max(0, Math.min(this.total, value)); }
  update(plan) {
    const changed = this.total !== plan.totalDistanceMeters;
    const first = !this.total;
    this.total = plan.totalDistanceMeters;
    this.points = plan.stops;
    if (changed) { this.zoom = 1; this.transition = null; }
    this.layout(first ? this.total / 2 : this.cursor);
  }
  layout(cursor) {
    this.cursor = this.clamp(cursor);
    this.track.style.width = `${this.total * this.scale + this.width}px`;
    this.scroll.scrollLeft = this.cursor * this.scale;
    this.appliedOffset = this.scroll.scrollLeft;
    this.draw(); this.publish();
  }
  publish() {
    this.readout.textContent = distanceLabel(this.cursor);
    this.scroll.setAttribute('aria-valuemax', this.total);
    this.scroll.setAttribute('aria-valuenow', roundedMeters(this.cursor));
    this.scroll.setAttribute('aria-valuetext', distanceLabel(this.cursor));
    this.onBrowse(roundedMeters(this.cursor));
  }
  move(value) {
    this.transition = null;
    this.scroll.scrollTo({ left: this.clamp(value) * this.scale, behavior: this.reduced.matches ? 'instant' : 'smooth' });
  }
  changeZoom(factor) {
    const destination = Math.min(64, Math.max(1, this.zoom * factor));
    if (this.reduced.matches) { this.zoom = destination; this.layout(this.cursor); return; }
    this.transition = { from: this.zoom, to: destination, cursor: this.cursor, start: performance.now() };
    this.frame();
  }
  fit() { this.transition = null; this.zoom = 1; this.layout(this.total / 2); }
  frame() {
    if (this.frameID) return;
    this.frameID = requestAnimationFrame(now => {
      this.frameID = null;
      if (this.transition) {
        const progress = Math.min(1, (now - this.transition.start) / 260);
        this.zoom = this.transition.from + (this.transition.to - this.transition.from) * (1 - (1 - progress) ** 3);
        this.layout(this.transition.cursor);
        if (progress === 1) this.transition = null;
      }
      this.wave += (this.targetWave - this.wave) * .22;
      if (this.reduced.matches) this.wave = 0;
      this.draw();
      if (this.transition || Math.abs(this.wave - this.targetWave) > .005) this.frame();
    });
  }
  draw() {
    if (!this.total || !this.width) return;
    const width = this.width, middle = width / 2, scale = this.scale;
    const xAt = meters => middle + (meters - this.cursor) * scale;
    const major = majorInterval(this.total / this.zoom), step = major / 10;
    const start = Math.max(0, Math.floor((this.cursor - middle / scale) / step));
    const end = Math.min(Math.ceil(this.total / step), Math.ceil((this.cursor + middle / scale) / step));
    const nearest = Math.min(this.total, Math.round(this.cursor / step) * step);
    const focus = Math.abs(this.total - this.cursor) < Math.abs(nearest - this.cursor) ? this.total : nearest;
    const endpoint = xAt(this.total), separateEnd = Math.abs(this.total / major - Math.round(this.total / major)) > 1e-8;
    const labels = [];
    const label = (meters, x, isEnd = false) => {
      const km = major >= 1000;
      const text = `${Number((meters / (km ? 1000 : 1)).toFixed(isEnd ? 1 : 0))} ${km ? 'km' : 'm'}`;
      const inset = Math.max(20, text.length * 3);
      labels.push(`<text x="${Math.max(inset, Math.min(width - inset, x))}" y="130">${text}</text>`);
    };
    const lines = [];
    for (let i = start; i <= end && i - start < 200; i++) {
      const meters = Math.min(i * step, this.total), x = xAt(meters);
      const selected = Math.abs(meters - focus) < .00001, longer = i % 5 === 0;
      const proximity = Math.max(0, 1 - Math.abs(x - middle) / middle);
      const arc = (1 - proximity) ** 2 * 5;
      const phase = (x - middle) / 44 - this.direction * .35;
      const ripple = Math.exp(-phase * phase) * (.6 + .4 * Math.cos(phase * 3));
      const height = selected ? 27 : (longer ? 16 : 9) + ripple * this.wave * 6;
      lines.push(`<line class="${selected ? 'focus-tick' : 'tick'}" x1="${x}" x2="${x}" y1="${102 + arc - height}" y2="${102 + arc}" stroke-width="${selected ? 3 : longer ? 1.2 : .8}" opacity="${selected ? 1 : (longer ? .28 : .12) + proximity * .15}"/>`);
      if (i % 10 === 0 && !(separateEnd && endpoint >= 0 && endpoint <= width && Math.abs(x - endpoint) < 58)) label(meters, x);
    }
    if (separateEnd && endpoint >= 0 && endpoint <= width) label(this.total, endpoint, true);
    this.svg.setAttribute('viewBox', `0 0 ${width} 144`);
    this.svg.innerHTML = lines.join('') + labels.join('');
    // Keep labels aligned with the actual highlighted tick; there is no second pointer.
    this.readout.style.left = `${Math.max(42, Math.min(width - 42, xAt(focus)))}px`;
    const groups = [];
    for (const point of this.points) {
      const x = xAt(point.distanceMeters);
      if (x < 12 || x > width - 12) continue;
      const last = groups.at(-1);
      if (last && x - last.at(-1).x < 26) last.push({ point, x });
      else groups.push([{ point, x }]);
    }
    this.markers.replaceChildren();
    for (const group of groups) {
      const { point } = group[0];
      const button = document.createElement('button');
      button.type = 'button'; button.className = `ruler-marker marker-${point.kind}`;
      button.style.left = `${group.reduce((sum, item) => sum + item.x, 0) / group.length}px`;
      if (group.length > 1) { button.classList.add('cluster'); button.textContent = group.length; }
      else button.innerHTML = fuelArtwork(point.kind);
      button.setAttribute('aria-label', group.length > 1 ? `${group.length} 个相邻补给点，放大查看` : `${distanceLabel(point.distanceMeters)} ${point.reminder}，定位补给点`);
      button.onclick = () => {
        if (group.length > 1) { this.layout(point.distanceMeters); this.changeZoom(2); }
        else { this.move(point.distanceMeters); this.onSelect(point.id); }
      };
      this.markers.append(button);
    }
  }
}
