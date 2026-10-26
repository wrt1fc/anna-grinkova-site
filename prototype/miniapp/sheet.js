// The bottom sheet: one dialog shared by the pickers, the limit notice and the person lists.
const backdrop = document.getElementById('sheet-backdrop');
const sheet = document.getElementById('sheet');
const titleNode = document.getElementById('sheet-title');
const bodyNode = document.getElementById('sheet-body');
let opener = null;
let onClose = null;

export const node = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};

export function closeSheet() {
  if (backdrop.hidden) return;
  backdrop.hidden = true;
  bodyNode.replaceChildren();
  const callback = onClose; onClose = null;
  opener?.focus?.(); opener = null;
  callback?.();
}

export function openSheet(title, content, { close } = {}) {
  opener = document.activeElement;
  onClose = close ?? null;
  titleNode.textContent = title;
  bodyNode.replaceChildren(content);
  backdrop.hidden = false;
  sheet.focus();
}

backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeSheet(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheet();
  if (event.key !== 'Tab' || backdrop.hidden) return;
  const focusable = [...sheet.querySelectorAll('button, input, [tabindex="0"], a[href]')].filter((item) => !item.disabled);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
