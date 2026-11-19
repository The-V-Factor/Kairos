import { distanceLabel, roundedMeters } from './workout.mjs';
import { majorInterval } from './plan.mjs';
import { fuelArtwork, icon } from './artwork.mjs';
import { RulerHaptics } from './haptics.mjs';
import { elevationAt, terrainDomain, visibleTerrain } from './terrain.mjs';

let hapticsEnabled = true;
const instances = new Set();
let nextProfileID = 0;
export function setRulerHaptics(enabled) {
  hapticsEnabled = !!enabled;
  for (const ruler of instances) ruler.haptics.setEnabled(hapticsEnabled && ruler.active);
}

// Native horizontal scrolling supplies touch momentum. Only the visible ticks are drawn.
export class DistanceRuler {
  constructor(root, onBrowse = () => {}, onSelect = () => {}) {
    this.root = root;
    this.profileID = `terrain-${++nextProfileID}`;
    root.classList.add('terrain-ruler');
    root.innerHTML = `<div class="ruler-viewport"><div class="ruler-scroll" role="slider" tabindex="0" aria-label="距离尺" aria-valuemin="0"><div class="ruler-track"></div></div><svg class="ruler-ticks" aria-hidden="true"></svg><output class="ruler-readout" aria-label="当前里程"><strong><span></span> <span class="reading-unit"></span></strong><small></small></output><div class="ruler-markers" role="group" aria-label="沿途补给"></div></div><div class="ruler-controls"><span>距出发里程</span><div><button type="button" data-ruler="out" aria-label="缩小距离尺">${icon('minus')}</button><button type="button" data-ruler="in" aria-label="放大距离尺">${icon('zoom')}</button><button type="button" data-ruler="fit">全览</button></div></div>`;
    this.viewport = root.querySelector('.ruler-viewport');
    this.profile = null; this.domain = null; this.points = []; this.markerNodes = new Map(); this.active = true;
    for (const [action, id] of [['out', 'zoom-out'], ['in', 'zoom-in'], ['fit', 'fit']]) {
      const button = root.querySelector(`[data-ruler="${action}"]`);
      if (root.id === 'ruler') button.id = id;
      button.addEventListener('click', () => action === 'fit' ? this.fit() : this.changeZoom(action === 'in' ? 2 : .5));
    }
    this.scroll = root.querySelector('.ruler-scroll');
    this.track = root.querySelector('.ruler-track');
    this.svg = root.querySelector('.ruler-ticks');
    this.markers = root.querySelector('.ruler-markers');
    this.readout = root.querySelector('output');
    this.distanceReadout = this.readout.querySelector('strong > span');
    this.unitReadout = this.readout.querySelector('.reading-unit');
    this.altitudeReadout = this.readout.querySelector('small');
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
      this.haptics.browse();
    });
    this.scroll.addEventListener('keydown', event => {
      const moves = { ArrowLeft: -1, ArrowRight: 1, PageDown: -10, PageUp: 10 };
      if (event.key in moves || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        this.move(event.key === 'Home' ? 0 : event.key === 'End' ? this.total : this.cursor + moves[event.key] * this.step);
      }
    });
    this.root.addEventListener('touchstart', event => {
      if (event.touches.length !== 2) return;
      const [a, b] = event.touches;
      const x = (a.clientX + b.clientX) / 2 - this.root.getBoundingClientRect().left;
      this.pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: this.zoom,
        anchor: this.cursor + (x - this.width / 2) / this.scale };
      this.transition = null;
    }, { passive: true });
    this.root.addEventListener('touchmove', event => {
      if (event.touches.length !== 2 || !this.pinch) return;
      event.preventDefault();
      const [a, b] = event.touches;
      const x = (a.clientX + b.clientX) / 2 - this.root.getBoundingClientRect().left;
      this.zoom = Math.min(64, Math.max(1, this.pinch.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(1, this.pinch.distance)));
      this.layout(this.pinch.anchor - (x - this.width / 2) / this.scale);
      this.targetWave = this.reduced.matches ? 0 : .7;
      this.frame();
    }, { passive: false });
    const endPinch = () => {
      if (!this.pinch) return;
      this.pinch = null; this.targetWave = 0; this.frame();
    };
    this.root.addEventListener('touchend', endPinch);
    this.root.addEventListener('touchcancel', endPinch);
    this.haptics = new RulerHaptics(this);
    instances.add(this); this.haptics.setEnabled(hapticsEnabled);
    this.resize = new ResizeObserver(() => { this.haptics.stop(); if (this.active && this.total) this.layout(this.cursor); });
    this.resize.observe(root);
    this.reduced.addEventListener('change', () => { this.wave = 0; this.targetWave = 0; this.frame(); });
  }
  get width() { return this.viewport.clientWidth; }
  get scale() { return Math.max(1, this.width - 48) / this.total * this.zoom; }
  get step() { return majorInterval(this.total / this.zoom) / 10; }
  clamp(value) { return Math.max(0, Math.min(this.total, value)); }
  setActive(active) {
    if (this.active === active) return;
    this.active = active; this.haptics.setEnabled(active && hapticsEnabled);
    if (active) this.resize.observe(this.root);
    else {
      this.resize.disconnect(); cancelAnimationFrame(this.frameID); clearTimeout(this.settle);
      this.frameID = null; this.transition = null; this.wave = this.targetWave = 0;
    }
  }
  update(plan, profile = null) {
    this.haptics.stop();
    this.profile = profile; this.domain = terrainDomain(profile);
    this.root.classList.toggle('has-terrain', !!profile);
    const changed = this.total !== plan.totalDistanceMeters;
    const first = !this.total;
    this.total = plan.totalDistanceMeters;
    this.points = plan.stops;
    if (changed) { this.zoom = 1; this.transition = null; }
    this.layout(first ? this.total / 2 : this.cursor);
  }
  layout(cursor) {
    this.cursor = this.clamp(cursor);
    if (!this.width) { this.publish(); return; }
    this.track.style.width = `${this.total * this.scale + this.width}px`;
    this.scroll.scrollLeft = this.cursor * this.scale;
    this.appliedOffset = this.scroll.scrollLeft;
    this.draw(); this.publish();
  }
  publish() {
    const [value, unit] = distanceLabel(this.cursor).split(' ');
    this.distanceReadout.textContent = value; this.unitReadout.textContent = unit;
    const altitude = elevationAt(this.profile, this.cursor);
    this.altitudeReadout.hidden = !this.profile;
    this.altitudeReadout.textContent = `${this.profile?.source === 'simulation' ? '模拟海拔' : '海拔'} ${altitude === null ? '—' : `${Math.round(altitude)} m`}`;
    this.scroll.setAttribute('aria-valuemax', this.total);
    this.scroll.setAttribute('aria-valuenow', roundedMeters(this.cursor));
    this.scroll.setAttribute('aria-valuetext', `${distanceLabel(this.cursor)}${altitude === null ? '' : `，海拔 ${Math.round(altitude)} 米`}`);
    this.onBrowse(roundedMeters(this.cursor));
  }
  move(value) {
    this.haptics.stop();
    this.transition = null;
    this.scroll.scrollTo({ left: this.clamp(value) * this.scale, behavior: this.reduced.matches ? 'instant' : 'smooth' });
  }
  changeZoom(factor) {
    this.haptics.stop();
    const destination = Math.min(64, Math.max(1, this.zoom * factor));
    if (this.reduced.matches) { this.zoom = destination; this.layout(this.cursor); return; }
    this.transition = { from: this.zoom, to: destination, cursor: this.cursor, start: performance.now() };
    this.frame();
  }
  fit() { this.haptics.stop(); this.transition = null; this.zoom = 1; this.layout(this.total / 2); }
  frame() {
    if (this.frameID || !this.active) return;
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
    const height = this.viewport.clientHeight, baseline = height - (this.profile ? 32 : 42), labelY = height - (this.profile ? 6 : 14);
    const xAt = meters => middle + (meters - this.cursor) * scale;
    const bottom = height - 60, top = Math.min(84, bottom - 20);
    const yAt = altitude => bottom - (altitude - this.domain.bottom) / (this.domain.top - this.domain.bottom) * (bottom - top);
    const anchorY = point => {
      const altitude = elevationAt(this.profile, point.distanceMeters);
      return altitude === null ? baseline - (this.profile ? 12 : 25) : yAt(altitude);
    };
    const major = majorInterval(this.total / this.zoom), step = major / 10;
    const start = Math.max(0, Math.floor((this.cursor - middle / scale) / step));
    const end = Math.min(Math.ceil(this.total / step), Math.ceil((this.cursor + middle / scale) / step));
    const endpoint = xAt(this.total), separateEnd = Math.abs(this.total / major - Math.round(this.total / major)) > 1e-8;
    const elements = [], labels = [];
    const label = (meters, x, isEnd = false) => {
      const km = major >= 1000;
      const text = `${Number((meters / (km ? 1000 : 1)).toFixed(isEnd ? 1 : 0))} ${km ? 'km' : 'm'}`;
      const inset = Math.max(20, text.length * 3);
      labels.push(`<text x="${Math.max(inset, Math.min(width - inset, x))}" y="${labelY}">${text}</text>`);
    };
    if (this.profile) {
      for (let i = 0; i < 3; i++) {
        const altitude = this.domain.bottom + (this.domain.top - this.domain.bottom) * i / 2, y = yAt(altitude);
        elements.push(`<line class="ruler-elevation-grid" x1="0" x2="${width}" y1="${y}" y2="${y}"/><text class="ruler-elevation-label" x="2" y="${y - 4}">${Math.round(altitude)} m</text>`);
      }
      const from = Math.max(0, this.cursor - middle / scale), to = Math.min(this.total, this.cursor + middle / scale);
      const points = visibleTerrain(this.profile, from, to, [...this.points.map(p => p.distanceMeters), this.cursor]);
      if (points.length) {
        const line = points.map(p => `${xAt(p.distanceMeters)},${yAt(p.elevationMeters)}`).join(' ');
        const id = this.profileID;
        const area = `${xAt(points[0].distanceMeters)},${bottom} ${line} ${xAt(points.at(-1).distanceMeters)},${bottom}`;
        elements.push(`<defs><polyline id="${id}" points="${line}"/><pattern id="${id}-hatch" width="7" height="7" patternUnits="userSpaceOnUse"><path class="terrain-hatch" d="M0 0V7"/></pattern></defs><polygon class="ruler-terrain-area" points="${area}"/><polygon class="terrain-screen" points="${area}" fill="url(#${id}-hatch)"/>`);
        for (const fraction of [.18, .34, .50, .66, .82]) {
          elements.push(`<use class="terrain-contour" href="#${id}" transform="translate(0 ${bottom * (1 - fraction)}) scale(1 ${fraction})"/>`);
        }
        elements.push(`<polyline class="ruler-profile fuel-curve" points="${line}"/>`);
      }
      const cursorAltitude = elevationAt(this.profile, this.cursor);
      if (cursorAltitude !== null) elements.push(`<line class="ruler-guide" x1="${middle}" x2="${middle}" y1="${yAt(cursorAltitude) + 5}" y2="${baseline - 28}"/><circle class="ruler-cursor" cx="${middle}" cy="${yAt(cursorAltitude)}" r="4"/>`);
      if (to > this.profile.distanceMeters) {
        const left = Math.max(0, xAt(this.profile.distanceMeters)), right = Math.min(width, xAt(to));
        elements.push(`<rect class="ruler-uncovered" x="${left}" y="${top}" width="${Math.max(0, right - left)}" height="${bottom - top}"/>`);
        if (right - left > 65) elements.push(`<text class="ruler-uncovered-label" x="${(left + right) / 2}" y="${(top + bottom) / 2}">暂无海拔</text>`);
      }
    }
    for (let i = start; i <= end && i - start < 200; i++) {
      const meters = Math.min(i * step, this.total), x = xAt(meters), longer = i % 5 === 0;
      const proximity = Math.max(0, 1 - Math.abs(x - middle) / middle);
      const arc = (1 - proximity) ** 2 * 5;
      const phase = (x - middle) / 44 - this.direction * .35;
      const ripple = Math.exp(-phase * phase) * (.6 + .4 * Math.cos(phase * 3));
      const tickHeight = (longer ? 16 : 9) + ripple * this.wave * 6;
      if (Math.abs(x - middle) > 3) elements.push(`<line class="tick" x1="${x}" x2="${x}" y1="${baseline + arc - tickHeight}" y2="${baseline + arc}" stroke-width="${longer ? 1.2 : .8}" opacity="${(longer ? .28 : .12) + proximity * .15}"/>`);
      if (i % 10 === 0 && !(separateEnd && endpoint >= 0 && endpoint <= width && Math.abs(x - endpoint) < 58)) label(meters, x);
    }
    elements.push(`<line class="focus-tick" x1="${middle}" x2="${middle}" y1="${baseline - 27}" y2="${baseline}" stroke-width="3"/>`);
    if (separateEnd && endpoint >= 0 && endpoint <= width) label(this.total, endpoint, true);
    this.readout.style.left = `${middle}px`;
    const groups = [];
    for (const point of this.points) {
      const x = xAt(point.distanceMeters);
      if (x < 12 || x > width - 12) continue;
      if (this.profile) elements.push(`<circle class="ruler-anchor marker-${point.kind}" cx="${x}" cy="${anchorY(point)}" r="3" data-distance="${point.distanceMeters}"/>`);
      const last = groups.at(-1);
      if (last && x - last.at(-1).x < 26) last.push({ point, x });
      else groups.push([{ point, x }]);
    }
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.innerHTML = elements.join('') + labels.join('');
    const retained = new Set();
    for (const group of groups) {
      const { point, x } = group[0], key = group.map(item => item.point.id).join(':');
      retained.add(key);
      let button = this.markerNodes.get(key);
      if (!button) { button = document.createElement('button'); button.type = 'button'; this.markerNodes.set(key, button); this.markers.append(button); }
      button.className = `ruler-marker marker-${point.kind}${group.length > 1 ? ' cluster' : ''}`;
      button.style.left = `${x}px`; button.style.top = `${anchorY(point) - 42}px`;
      button.dataset.distance = point.distanceMeters;
      if (group.length > 1) { button.innerHTML = `<span class="ruler-cluster-count">${group.length}</span>`; }
      else if (button.dataset.kind !== point.kind) { button.innerHTML = fuelArtwork(point.kind); }
      button.dataset.kind = group.length > 1 ? 'cluster' : point.kind;
      button.setAttribute('aria-label', group.length > 1 ? `${group.length} 个相邻补给点，放大查看` : `${distanceLabel(point.distanceMeters)} ${point.reminder}，定位补给点`);
      button.onclick = () => {
        if (group.length > 1) { this.layout(point.distanceMeters); this.changeZoom(2); }
        else { this.move(point.distanceMeters); this.onSelect(point.id); }
      };
    }
    for (const [key, button] of this.markerNodes) if (!retained.has(key)) { button.remove(); this.markerNodes.delete(key); }
  }
}
