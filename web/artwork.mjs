// The same bottle, gel packet and tag geometry as Kairos/FuelArtwork.swift.
const drawings = {
  water: '<path class="bottle-body" d="M9.3 4h10.4v4.6Q27 11.6 27 17.2v20.6q0 4.3-5.3 4.3H7.3Q2 42.1 2 37.8V17.2q0-5.6 7.3-8.6Z"/><path class="water-fill" d="M2.8 16Q10 13 14.5 16T26.2 16v21.8q0 3.5-4.5 3.5H7.3q-4.5 0-4.5-3.5Z"/><path class="bottle-outline" d="M9.3 4h10.4v4.6Q27 11.6 27 17.2v20.6q0 4.3-5.3 4.3H7.3Q2 42.1 2 37.8V17.2q0-5.6 7.3-8.6Z"/><rect class="bottle-cap" x="8" y="0" width="13" height="5" rx="2"/><rect class="bottle-label" x="8" y="23" width="13" height="6" rx="3"/>',
  gel: '<g transform="rotate(-9 14.5 24)"><rect class="gel-cap" x="8" y="3" width="13" height="5"/><path class="gel-packet" d="M3 10h23q3 0 3 3v25q0 5-5 5H5q-5 0-5-5V13q0-3 3-3Z"/><text class="gel-word" x="14.5" y="29" text-anchor="middle">GEL</text></g>',
  custom: '<path class="tag-outline" d="m3 23 16-16h9v9L12 32a3 3 0 0 1-4 0l-5-5a3 3 0 0 1 0-4Z"/><circle class="tag-hole" cx="23" cy="12" r="1.5"/>',
};

export function fuelArtwork(kind) {
  return `<svg class="fuel-art" viewBox="-3 -2 35 48" aria-hidden="true">${drawings[kind] ?? drawings.custom}</svg>`;
}

const icons = {
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  pencil: '<path d="m5 16-1 4 4-1L20 7l-3-3Z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M5 19 19 5M6 5h13v13"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2M12 17h.01"/>',
  watch: '<rect x="6" y="5" width="12" height="14" rx="4"/><path d="m9 5 1-3h4l1 3M9 19l1 3h4l1-3M19 10v4"/>',
  minus: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/>',
  zoom: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  palette: '<rect x="3" y="3" width="7" height="18" rx="1"/><path d="M3 9h7M3 15h7m0 4 7-4-7-12M13 8l6 1 3 7-12 5"/>',
};

export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? ''}</svg>`;
}
