// Programmatic focus after a touch must not inherit a keyboard focus ring.
const root = document.documentElement;
root.dataset.focusInput = 'pointer';
document.addEventListener('pointerdown', () => { root.dataset.focusInput = 'pointer'; }, true);
document.addEventListener('keydown', event => {
  if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) root.dataset.focusInput = 'keyboard';
}, true);
