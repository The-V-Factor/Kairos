import { today, validateDate } from './library.mjs';

// Calendar dates are civil dates, independent of UTC offsets and DST.
function dateOf(value) { validateDate(value); return new Date(`${value}T12:00:00Z`); }
function iso(date) { return date.toISOString().slice(0, 10); }
export function moveDate(value, days = 0, months = 0) {
  const date = dateOf(value), day = date.getUTCDate();
  if (months) {
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
    const last = new Date(date); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
    date.setUTCDate(Math.min(day, last.getUTCDate()));
  }
  date.setUTCDate(date.getUTCDate() + days);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return value;
  return iso(date);
}
export function monthDays(value) {
  const first = `${validateDate(value).slice(0, 7)}-01`;
  const offset = (dateOf(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = dateOf(first); date.setUTCDate(date.getUTCDate() + i - offset);
    return date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999 ? null : iso(date);
  });
}
export function shortDate(value) {
  return dateOf(value).toLocaleDateString('zh-CN', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' }).replace('日周', '日 周');
}

export class PlanCalendar {
  constructor(root, onChange) {
    this.root = root; this.onChange = onChange;
    root.innerHTML = '<div class="calendar-heading"><button type="button" data-month="-1" aria-label="上个月">‹</button><strong aria-live="polite"></strong><button type="button" data-month="1" aria-label="下个月">›</button><button type="button" class="calendar-today">今天</button></div><table class="calendar-grid"><thead><tr></tr></thead><tbody></tbody></table>';
    const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
    weekdays.forEach(day => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = day; th.setAttribute('aria-label', `星期${day}`); root.querySelector('thead tr').append(th); });
    root.addEventListener('click', event => {
      const month = event.target.closest('[data-month]');
      if (month) { this.focused = moveDate(this.visible, 0, Number(month.dataset.month)); this.visible = this.focused; this.render(); }
      else if (event.target.closest('.calendar-today')) this.choose(today());
      else if (event.target.closest('[data-date]')) this.choose(event.target.closest('[data-date]').dataset.date);
    });
    root.addEventListener('keydown', event => {
      const button = event.target.closest('[data-date]'); if (!button) return;
      const value = button.dataset.date, weekday = (dateOf(value).getUTCDay() + 6) % 7;
      let next;
      if (event.key === 'ArrowLeft') next = moveDate(value, -1);
      else if (event.key === 'ArrowRight') next = moveDate(value, 1);
      else if (event.key === 'ArrowUp') next = moveDate(value, -7);
      else if (event.key === 'ArrowDown') next = moveDate(value, 7);
      else if (event.key === 'Home') next = moveDate(value, -weekday);
      else if (event.key === 'End') next = moveDate(value, 6 - weekday);
      else if (event.key === 'PageUp' || event.key === 'PageDown') next = moveDate(value, 0, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
      else return;
      event.preventDefault(); this.focused = next; this.visible = next; this.render(); this.focus();
    });
  }
  set(value) { this.value = validateDate(value); this.visible = value; this.focused = value; this.render(); }
  choose(value) { this.set(value); this.onChange(value); }
  focus() { this.root.querySelector(`[data-date="${this.focused}"]`)?.focus({ preventScroll: true }); }
  render() {
    const month = this.visible.slice(0, 7);
    this.root.querySelector('strong').textContent = `${Number(month.slice(0, 4))}年${Number(month.slice(5))}月`;
    for (const button of this.root.querySelectorAll('[data-month]')) button.disabled = moveDate(this.visible, 0, Number(button.dataset.month)) === this.visible;
    const table = this.root.querySelector('table'); table.setAttribute('aria-label', `${month}，选择骑行日期`);
    const body = this.root.querySelector('tbody'); body.replaceChildren();
    const dates = monthDays(this.visible), now = today();
    for (let i = 0; i < dates.length; i += 7) {
      const row = document.createElement('tr');
      for (const value of dates.slice(i, i + 7)) {
        const cell = document.createElement('td'), button = document.createElement('button');
        if (!value) { row.append(cell); continue; }
        button.type = 'button'; button.dataset.date = value; button.textContent = String(Number(value.slice(8)));
        button.setAttribute('aria-label', `${value}，${shortDate(value)}`);
        button.setAttribute('aria-pressed', String(value === this.value)); button.tabIndex = value === this.focused ? 0 : -1;
        if (value === now) button.setAttribute('aria-current', 'date');
        button.classList.toggle('outside', !value.startsWith(month));
        cell.append(button); row.append(cell);
      }
      body.append(row);
    }
  }
}

// A bounded DOM window, not a distance limit. Recenter after settling near either edge.
// Keep a pre-existing fractional distance until the rider actually picks a new value.
export function kilometerOptions(value) {
  if (!Number.isFinite(value) || value <= 0 || value > 1e6) throw new Error('全程距离无效。');
  const base = Math.round(value), start = Math.max(1, base - 200), end = Math.min(1e6, base + 200);
  const values = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  if (!Number.isInteger(value)) values.push(value);
  return values.sort((a, b) => a - b);
}
const rowHeight = 44;
export class KilometerWheel {
  constructor(root, onChange) {
    this.root = root; this.onChange = onChange; this.timer = null;
    root.addEventListener('scroll', () => {
      this.paint(); clearTimeout(this.timer);
      this.timer = setTimeout(() => this.settle(), 160);
    }, { passive: true });
    root.addEventListener('keydown', event => {
      let value;
      if (event.key === 'ArrowUp') value = Math.ceil(this.value) - 1;
      else if (event.key === 'ArrowDown') value = Math.floor(this.value) + 1;
      else if (event.key === 'PageUp') value = Math.round(this.value) - 10;
      else if (event.key === 'PageDown') value = Math.round(this.value) + 10;
      else return;
      event.preventDefault(); value = Math.max(1, Math.min(1e6, value));
      this.set(value); this.onChange(value);
    });
    root.addEventListener('click', event => {
      const item = event.target.closest('[data-km]');
      if (item) root.scrollTo({ top: this.values.indexOf(Number(item.dataset.km)) * rowHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
    // Touch and trackpads use native scroll inertia; mouse users can also drag the drum.
    let drag = null;
    root.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      drag = { y: event.clientY, top: root.scrollTop, moved: false };
    });
    root.addEventListener('pointermove', event => {
      if (!drag) return;
      if (!drag.moved && Math.abs(event.clientY - drag.y) > 4) { drag.moved = true; root.classList.add('dragging'); root.setPointerCapture(event.pointerId); }
      if (drag.moved) root.scrollTop = drag.top + drag.y - event.clientY;
    });
    const finish = event => {
      if (!drag) return;
      const moved = drag.moved; drag = null; root.classList.remove('dragging');
      if (moved) { event.preventDefault(); this.settle(); }
    };
    root.addEventListener('pointerup', finish); root.addEventListener('pointercancel', finish);
  }
  set(value) {
    this.stop(); this.value = value; this.values = kilometerOptions(value);
    const track = document.createElement('div'); track.className = 'km-wheel-track'; track.setAttribute('aria-hidden', 'true');
    this.items = this.values.map(km => {
      const item = document.createElement('div'); item.className = 'km-wheel-option'; item.dataset.km = km;
      item.textContent = `${km} km`; track.append(item); return item;
    });
    this.root.replaceChildren(track); this.root.scrollTop = this.values.indexOf(value) * rowHeight; this.paint();
  }
  paint() {
    if (!this.values || this.root.closest('[hidden]')) return;
    const position = this.root.scrollTop / rowHeight, index = Math.max(0, Math.min(this.values.length - 1, Math.round(position)));
    this.value = this.values[index];
    this.root.setAttribute('aria-valuenow', this.value); this.root.setAttribute('aria-valuetext', `${this.value} 公里`);
    this.items.forEach((item, i) => {
      const delta = Math.abs(i - position);
      if (delta > 4 && !item.dataset.visible) return;
      item.dataset.visible = delta <= 4 ? 'true' : '';
      item.style.transform = `perspective(300px) rotateX(${Math.max(-60, Math.min(60, (i - position) * 18))}deg) scale(${Math.max(.75, 1 - delta * .1)})`;
      item.style.opacity = String(Math.max(.12, 1 - delta * .3));
      item.classList.toggle('selected', i === index);
    });
    this.onChange(this.value);
  }
  settle() {
    if (this.root.closest('[hidden]') || !this.values) return;
    const index = Math.max(0, Math.min(this.values.length - 1, Math.round(this.root.scrollTop / rowHeight)));
    const value = this.values[index]; this.root.scrollTop = index * rowHeight;
    if ((index < 30 && this.values[0] > 1) || (index > this.values.length - 30 && this.values.at(-1) < 1e6)) this.set(value);
    else this.paint();
  }
  stop() { clearTimeout(this.timer); this.timer = null; }
}
