const objects = new URL('./assets/fuel-objects.svg', import.meta.url).href;

export function fuelArtwork(kind) {
  const object = kind === 'water'
    ? `<use href="${objects}#bottle"/><use class="water-fill" href="${objects}#water"/>`
    : kind === 'gel' ? `<use href="${objects}#gel"/>`
    : '<path d="m17 92 51-52h23v24L40 115a7 7 0 0 1-10 0l-13-13a7 7 0 0 1 0-10Z" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="77" cy="53" r="4" fill="currentColor"/>';
  return `<svg class="fuel-art" viewBox="0 0 110 180" aria-hidden="true">${object}</svg>`;
}

const icons = {
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  pencil: '<path d="m5 16-1 4 4-1L20 7l-3-3Z"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7M12 7v5l3 2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M5 19 19 5M6 5h13v13"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2M12 17h.01"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2H4Z"/>',
  calculator: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h1m3 0h1m3 0h.1M8 15h1m3 0h1m3 0h.1M8 19h1m3 0h1m3 0h.1"/>',
  watch: '<rect x="6" y="5" width="12" height="14" rx="4"/><path d="m9 5 1-3h4l1 3M9 19l1 3h4l1-3M19 10v4"/>',
  minus: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/>',
  zoom: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  palette: '<rect x="3" y="3" width="7" height="18" rx="1"/><path d="M3 9h7M3 15h7m0 4 7-4-7-12M13 8l6 1 3 7-12 5"/>',
};

export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? ''}</svg>`;
}
