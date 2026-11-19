// A suspended sheet keeps its draft and focus while its child is being edited.
const suspendedFocus = new WeakMap();
let scrollY = null, flow = 0;
export async function visitSheet(parent, openChild, resume) {
  const started = flow;
  suspendSheet(parent);
  const value = await openChild();
  if (flow === started) return resume(value);
}
export function leaveSheetFlow() {
  flow++;
}
export function suspendSheet(dialog) {
  if (!dialog.open) return;
  suspendedFocus.set(dialog, document.activeElement);
  dialog.addEventListener('close', event => event.stopImmediatePropagation(), { capture: true, once: true });
  dialog.close();
}
export function showSheet(dialog) {
  if (scrollY === null) {
    scrollY = window.scrollY;
    Object.assign(document.body.style, { overflow: 'hidden', position: 'fixed', top: `-${scrollY}px`, width: '100%' });
  }
  dialog.showModal();
  const focus = suspendedFocus.get(dialog);
  suspendedFocus.delete(dialog);
  if (focus?.isConnected && focus.getClientRects().length) focus.focus({ preventScroll: true });
  return scrollY;
}
export function releaseSheets() {
  if (scrollY === null || document.querySelector('dialog[open]')) return;
  Object.assign(document.body.style, { overflow: '', position: '', top: '', width: '' });
  window.scrollTo({ top: scrollY, behavior: 'instant' });
  scrollY = null;
}
