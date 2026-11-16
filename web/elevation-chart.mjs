import { select, zoom, zoomIdentity } from './vendor/d3-zoom.mjs';
import { elevationProfile } from './routes.mjs';

export function visibleDistance(transform, total) {
  const span = total / transform.k;
  const start = Math.max(0, Math.min(total - span, ((42 - transform.x) / transform.k - 42) / 262 * total));
  return [start, Math.min(total, start + span)];
}

export class ElevationChart {
  constructor(svg, controls, status) {
    this.svg = svg; this.controls = controls; this.status = status; this.route = null;
    const namespace = 'http://www.w3.org/2000/svg';
    this.drawing = document.createElementNS(namespace, 'g');
    const hitArea = document.createElementNS(namespace, 'rect');
    for (const [name, value] of Object.entries({ x: 0, y: 0, width: 320, height: 112, fill: 'transparent', 'data-elevation-hit': '', 'aria-hidden': 'true' })) hitArea.setAttribute(name, value);
    // Keep the touched node mounted across redraws so multi-move pinch gestures continue.
    svg.replaceChildren(this.drawing, hitArea);
    this.selection = select(svg);
    this.behavior = zoom().touchable(() => true).extent([[42, 18], [304, 78]]).translateExtent([[42, 18], [304, 78]])
      .scaleExtent([1, 64]).duration(0)
      // Ordinary wheel scrolling still scrolls the sheet; trackpad pinch / Ctrl+wheel zooms.
      .filter(event => (!event.button && (event.type !== 'wheel' || event.ctrlKey)))
      .on('zoom', event => { if (this.route) this.render(event.transform); });
    this.selection.call(this.behavior);
    controls.querySelector('[data-elevation="in"]').addEventListener('click', () => this.scale(1.5));
    controls.querySelector('[data-elevation="out"]').addEventListener('click', () => this.scale(1 / 1.5));
    controls.querySelector('[data-elevation="fit"]').addEventListener('click', () => this.reset());
    svg.addEventListener('keydown', event => {
      if (!this.route) return;
      if (['+', '=', '-', 'Home', '0', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
      if (event.key === '+' || event.key === '=') this.scale(1.5);
      if (event.key === '-') this.scale(1 / 1.5);
      if (event.key === 'Home' || event.key === '0') this.reset();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') this.selection.call(this.behavior.translateBy, (event.key === 'ArrowLeft' ? 52 : -52) / this.transform.k, 0);
    });
  }
  setRoute(route) {
    this.route = route;
    this.behavior.scaleExtent([1, Math.max(1, Math.min(64, route.distanceMeters / 100))]);
    this.reset();
  }
  clear() { this.route = null; this.drawing.replaceChildren(); this.status.textContent = ''; }
  scale(factor) { if (this.route) this.selection.call(this.behavior.scaleBy, factor); }
  reset() { if (this.route) this.selection.call(this.behavior.transform, zoomIdentity); }
  render(transform) {
    this.transform = transform;
    const [start, end] = visibleDistance(transform, this.route.distanceMeters);
    const profile = elevationProfile(this.route.points, this.route.distanceMeters, start, end);
    this.drawing.replaceChildren();
    const element = (tag, attributes, text) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      if (text !== undefined) node.textContent = text;
      this.drawing.append(node);
    };
    element('text', { x: 0, y: 10 }, '海拔 m');
    for (const tick of profile.yTicks) {
      element('line', { x1: 42, x2: 304, y1: tick.y, y2: tick.y });
      element('text', { x: 34, y: tick.y + 3, 'text-anchor': 'end' }, tick.label);
    }
    element('polyline', { points: profile.elevation, fill: 'none' });
    for (const tick of profile.xTicks) element('text', { x: tick.x, y: 101, 'text-anchor': tick.x === 304 ? 'end' : tick.x === 42 ? 'start' : 'middle' }, tick.label);
    const km = this.route.distanceMeters >= 1000, divisor = km ? 1000 : 1;
    this.status.textContent = `${(start / divisor).toFixed(1)}–${(end / divisor).toFixed(1)} ${km ? 'km' : 'm'}`;
    this.svg.setAttribute('aria-label', `海拔图，可见距离 ${this.status.textContent}。加减键缩放，左右键移动，Home 键全览。`);
    this.controls.querySelector('[data-elevation="out"]').disabled = transform.k <= 1.001;
    this.controls.querySelector('[data-elevation="in"]').disabled = transform.k >= this.behavior.scaleExtent()[1] - .001;
  }
}
