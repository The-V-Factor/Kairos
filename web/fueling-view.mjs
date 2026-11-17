import { distanceLabel } from './workout.mjs';
import { fuelArtwork } from './artwork.mjs';

export function duration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60)), hours = Math.floor(minutes / 60);
  return hours ? `${hours}小时${minutes % 60}分` : `${minutes}分`;
}
export function notice(node, text = '') { node.textContent = text; node.hidden = !text; }
export function renderStops(node, schedule) {
  node.replaceChildren();
  for (const stop of schedule.stops) {
    const row = document.createElement('li'), art = document.createElement('span'), position = document.createElement('strong');
    const text = document.createElement('span'), time = document.createElement('small');
    art.innerHTML = fuelArtwork(stop.kind); position.textContent = distanceLabel(stop.distanceMeters); text.textContent = stop.reminder;
    time.textContent = `约${Math.round(stop.seconds / 60)}分`;
    row.append(art, position, text, time); node.append(row);
  }
}
export function drawRide(svg, ride, schedule, mode = 'elevation') {
  svg.replaceChildren();
  const width = Math.max(260, svg.getBoundingClientRect().width || 340), height = Math.max(110, svg.getBoundingClientRect().height || 150);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-label', `${mode === 'speed' ? '预计速度' : '路线海拔与补给'}，全程 ${distanceLabel(ride.totalDistanceMeters)}`);
  const add = (tag, attrs = {}, text, parent = svg) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    parent.append(node); return node;
  };
  const left = 42, right = width - 14, top = 27, bottom = height - 25;
  const values = ride.segments.flatMap(s => mode === 'speed' ? [s.speedMps * 3.6] : [s.startElevation, s.endElevation]);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(mode === 'speed' ? 5 : 10, max - min);
  const low = Math.floor(min / (span / 2)) * (span / 2), high = Math.max(low + span, max);
  const x = distance => left + distance / ride.totalDistanceMeters * (right - left);
  const y = value => bottom - (value - low) / (high - low) * (bottom - top);
  add('text', { x: left, y: 13, class: 'fuel-axis-label' }, mode === 'speed' ? '速度 km/h' : '海拔 m');
  for (let i = 0; i < 3; i++) {
    const value = low + (high - low) * i / 2, py = y(value);
    add('line', { x1: left, x2: right, y1: py, y2: py, class: 'fuel-grid' });
    add('text', { x: left - 7, y: py + 4, 'text-anchor': 'end' }, String(Math.round(value)));
  }
  const target = ride.totalDistanceMeters / Math.max(2, Math.floor((right - left) / 75));
  const magnitude = 10 ** Math.floor(Math.log10(target)), fraction = target / magnitude;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  const ticks = [0];
  for (let distance = step; distance < ride.totalDistanceMeters; distance += step) if (right - x(distance) >= 52) ticks.push(distance);
  ticks.push(ride.totalDistanceMeters);
  for (const distance of ticks) {
    add('line', { x1: x(distance), x2: x(distance), y1: top, y2: bottom, class: 'fuel-grid' });
    add('text', { x: x(distance), y: height - 6, 'text-anchor': distance === 0 ? 'start' : distance === ride.totalDistanceMeters ? 'end' : 'middle' }, `${+(distance / 1000).toFixed(1)} km`);
  }
  const points = ride.segments.flatMap(s => [[x(s.startMeters), y(mode === 'speed' ? s.speedMps * 3.6 : s.startElevation)], [x(s.endMeters), y(mode === 'speed' ? s.speedMps * 3.6 : s.endElevation)]]);
  const line = points.map(p => p.join(',')).join(' ');
  add('polygon', { points: `${left},${bottom} ${line} ${right},${bottom}`, class: 'fuel-area' });
  add('polyline', { points: line, class: 'fuel-curve' });
  let last = -Infinity;
  for (const stop of schedule.stops) {
    const px = x(stop.distanceMeters);
    if (px - last < 9) continue;
    last = px;
    add('line', { x1: px, x2: px, y1: top, y2: bottom, class: 'fuel-marker-line' });
    if (stop.gels) {
      add('rect', { x: px - 4, y: bottom - 15, width: 8, height: 12, rx: 1, class: 'fuel-gel-dot' });
      add('rect', { x: px - 2, y: bottom - 18, width: 4, height: 2, class: 'fuel-gel-dot' });
    }
    if (stop.waters) add('path', { d: `M${px},${bottom - 17}q-9,10 0,13q9,-3 0,-13Z`, class: 'fuel-water-dot' });
  }
  const tooltip = add('g', { visibility: 'hidden' });
  const guide = add('line', { y1: top, y2: bottom, class: 'fuel-crosshair' }, undefined, tooltip);
  const box = add('rect', { y: 3, width: Math.min(230, width - 8), height: 20, rx: 5, class: 'fuel-tooltip-box' }, undefined, tooltip);
  const label = add('text', { y: 17, class: 'fuel-tooltip-label' }, '', tooltip);
  const show = stop => {
    if (!stop) return;
    const px = x(stop.distanceMeters), bx = Math.max(2, Math.min(width - Number(box.getAttribute('width')) - 2, px - 110));
    tooltip.setAttribute('visibility', 'visible'); guide.setAttribute('x1', px); guide.setAttribute('x2', px);
    box.setAttribute('x', bx); label.setAttribute('x', bx + 8);
    label.textContent = `${distanceLabel(stop.distanceMeters)} · 约${Math.round(stop.seconds / 60)}分 · ${stop.reminder}`;
  };
  svg.onpointermove = event => {
    const rect = svg.getBoundingClientRect(), distance = Math.max(0, Math.min(ride.totalDistanceMeters, (event.clientX - rect.left - left) / (right - left) * ride.totalDistanceMeters));
    show(schedule.stops.reduce((best, stop) => !best || Math.abs(stop.distanceMeters - distance) < Math.abs(best.distanceMeters - distance) ? stop : best, null));
  };
  svg.onpointerleave = () => tooltip.setAttribute('visibility', 'hidden');
  let focus = -1;
  svg.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') tooltip.setAttribute('visibility', 'hidden');
    else { focus = Math.max(0, Math.min(schedule.stops.length - 1, focus + (event.key === 'ArrowRight' ? 1 : -1))); show(schedule.stops[focus]); }
  };
}
