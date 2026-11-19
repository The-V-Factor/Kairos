import { isRecipe } from './generation.mjs';
import { newID } from './plan.mjs';
import { suspendSheet, releaseSheets, leaveSheetFlow } from './sheets.mjs';

const isCalculatorURL = () => /\/calculator(?:\.html)?\/?$/.test(location.pathname);

export function setupNavigation({ draft, generator, ruler, showHome, getCalculator, source, legacyRecipe }) {
  const sheet = document.getElementById('generation-dialog');
  let editor, sessionID, calculatorVisible = false, homeScroll = 0;
  let previousCalculator, homeFocus;
  let route = history.state?.kairos;
  const checkpointKey = 'kairos.web.calculator-resume.v1';
  function checkpoint(id) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(checkpointKey));
      return saved && saved.id === id && isRecipe(saved.recipe) ? saved : null;
    } catch { return null; }
  }
  const home = './', calculatorURL = './calculator.html';
  function record(next, url, replace = false) {
    history[replace ? 'replaceState' : 'pushState']({ kairos: next }, '', url);
    route = next;
  }
  function showPage(calc) {
    const changing = calculatorVisible !== calc;
    if (changing && calc) { homeScroll = window.scrollY; homeFocus = document.activeElement; }
    if (changing && !calc) editor?.activate(false);
    calculatorVisible = calc;
    document.documentElement.dataset.page = calc ? 'calculator' : 'home';
    document.body.classList.toggle('calculator-page', calc);
    if (changing) {
      window.scrollTo({ top: calc ? 0 : homeScroll, behavior: 'instant' });
      if (calc) document.querySelector('.calc-header h1').focus({ preventScroll: true });
      else if (homeFocus?.getClientRects().length) homeFocus.focus({ preventScroll: true });
    }
    document.title = calc ? 'Kairos · 补给计算器' : 'Kairos · 骑行补给';
    ruler.setActive(!calc);
    if (!calc) showHome();
  }
  function display(next, recipe = null) {
    const fromSettings = route?.view === 'generator';
    const returningToCalculator = calculatorVisible && route?.view === 'preview';
    leaveSheetFlow();
    const current = document.querySelector('dialog[open]');
    if (current) {
      if (current === sheet && route?.view === 'preview') generator.rememberName();
      if (current === sheet) { generator.pause(); suspendSheet(current); }
      else current.close();
    }
    releaseSheets();
    route = next;
    const calc = next.view === 'calculator' || next.view === 'preview';
    if (!calc && calculatorVisible && sessionID) {
      previousCalculator = { id: sessionID, recipe: draft.recipe, ...editor.tabs(), scroll: window.scrollY };
      sessionID = null;
    }
    showPage(calc);
    if (calc) {
      editor ??= getCalculator();
      if (sessionID !== next.id) {
        sessionID = next.id;
        const saved = previousCalculator?.id === next.id ? previousCalculator : checkpoint(next.id);
        const initial = recipe ?? (fromSettings && next.fromGenerator ? draft.recipe : null) ?? saved?.recipe ?? (next.fromGenerator ? legacyRecipe() : null);
        editor.start(source(initial), initial, saved);
        if (saved?.scroll) window.scrollTo({ top: saved.scroll, behavior: 'instant' });
      }
      if (next.view === 'preview' && !draft.result) {
        next = { ...next, view: 'calculator' };
        record(next, location.pathname + location.search, true);
      }
      editor.activate(next.view !== 'preview');
      if (next.view === 'preview' && draft.result) generator.calculatorPreview();
      else if (returningToCalculator) document.getElementById('calc-preview').focus({ preventScroll: true });
    } else if (next.view === 'generator') {
      sessionID = null;
      generator.open(draft.recipe ?? checkpoint(next.id)?.recipe);
    }
  }
  function calculator(fromGenerator = false) {
    const recipe = fromGenerator ? draft.recipe : null;
    const id = newID();
    if (fromGenerator) record({ view: 'generator', id }, home, true);
    document.getElementById('account-menu').hidePopover();
    const next = { view: 'calculator', id, fromGenerator, parent: true };
    record(next, calculatorURL + (fromGenerator ? '?from=generator' : ''));
    display(next, recipe);
  }
  function preview() {
    if (route.view !== 'calculator') return;
    const next = { ...route, view: 'preview', direct: false };
    record(next, location.pathname + location.search + '#preview');
    editor.activate(false); generator.calculatorPreview();
  }
  function finishPreview(saved) {
    if (saved) {
      sessionID = null; previousCalculator = null;
      try { sessionStorage.removeItem(checkpointKey); } catch { /* Storage is optional. */ }
      const next = { view: 'home' };
      record(next, home, true); display(next);
      draft.recipe = null; draft.result = null;
    } else if (route.view === 'preview') {
      if (route.direct) {
        const next = { ...route, view: 'calculator' };
        record(next, calculatorURL, true); display(next);
      } else history.back();
    }
  }
  function leaveCalculator() {
    if (route.parent) history.back();
    else {
      const next = { view: route.fromGenerator ? 'generator' : 'home' };
      record(next, home); display(next);
    }
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a');
    if (!link) return;
    if (link.matches('#app a[href="./calculator.html"]')) { event.preventDefault(); calculator(); }
    else if (link.matches('#calculator a[href="./"]')) { event.preventDefault(); leaveCalculator(); }
    else if (link.matches('#app a[href="./"]')) { event.preventDefault(); window.scrollTo({ top: 0 }); }
  });
  window.addEventListener('popstate', () => display(history.state?.kairos ?? { view: 'home' }));
  window.addEventListener('pagehide', () => {
    if (!calculatorVisible && route?.view !== 'generator') return;
    if (calculatorVisible) editor.flush();
    if (route.view === 'preview' || (route.view === 'generator' && sheet.open)) generator.rememberName();
    // Only serialize for a document reload. Normal navigation shares the live draft.
    try {
      sessionStorage.setItem(checkpointKey, JSON.stringify({ id: route.id, recipe: draft.recipe, ...editor?.tabs() }));
    } catch { /* Live editing also works when session storage is unavailable. */ }
  });
  if (isCalculatorURL()) {
    if (!route) {
      const fromGenerator = new URL(location.href).searchParams.get('from') === 'generator';
      record({ view: location.hash === '#preview' ? 'preview' : 'calculator', id: newID(), fromGenerator, direct: location.hash === '#preview' }, location.href, true);
    }
    display(route);
  } else if (!route) record({ view: 'home' }, location.href, true);
  else display(route);
  return { calculator, preview, finishPreview, finishGenerator() {
    if (route?.view === 'generator') record({ view: 'home' }, home, true);
    draft.recipe = null; draft.result = null; previousCalculator = null;
  } };
}
