// Runs after the stylesheets and before either page's body can be painted.
(() => {
  const root = document.documentElement;
  let theme = 'rhythm';
  try {
    const saved = localStorage.getItem('kairos.web.theme.v1');
    if (['trail', 'journal', 'pocket', 'precision'].includes(saved)) theme = saved;
  } catch { /* Storage may be unavailable in a private or restricted browser. */ }
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue('--canvas').trim();
})();
