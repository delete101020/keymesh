// The only way screens make DOM: text always goes through text nodes, and there is no prop for
// markup, inline style or string event handlers.
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'indeterminate', 'min', 'max', 'step']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (tag === 'button') el.type = 'button';
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'fk') el.dataset.fk = v;
    else if (k === 'style' || k.startsWith('on')) throw new TypeError(`h(): ${k} is not allowed`);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

// `form-action 'none'` blocks real submits, so every form goes through this.
export function form(props, onSubmit, ...children) {
  const el = h('form', { novalidate: true, ...props }, ...children);
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit();
  });
  return el;
}

export function field(label, control) {
  return h('label', { class: 'f' }, label, control);
}

// Rebuilds a region while keeping focus and scroll where they were.
export function replaceRegion(region, children) {
  const active = document.activeElement;
  const key = active && region.contains(active) ? active.dataset.fk : null;
  const top = region.scrollTop;
  region.replaceChildren(...[children].flat(Infinity).filter(Boolean));
  region.scrollTop = top;
  if (!key) return;
  const target = region.querySelector(`[data-fk="${CSS.escape(key)}"]`);
  // A move button at the end of the list comes back disabled and cannot hold focus.
  const next = target?.disabled ? nearestEnabled(target) ?? region.querySelector(FOCUSABLE) : target;
  next?.focus({ preventScroll: true });
}

const FOCUSABLE = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)';

function nearestEnabled(el) {
  for (const dir of ['nextElementSibling', 'previousElementSibling']) {
    for (let x = el[dir]; x; x = x[dir]) if (x.matches(FOCUSABLE)) return x;
  }
  return null;
}

export function focusKey(key) {
  const el = document.querySelector(`[data-fk="${CSS.escape(key)}"]`);
  if (!el) return false;
  el.focus();
  return true;
}

// A modal <dialog>: the browser keeps focus inside and gives it back on close. Registered with the
// app so locking closes every dialog with whatever it holds.
export function openDialog(app, { title, onClose }) {
  const titleEl = h('h2', { id: `dlg-${Math.random().toString(36).slice(2)}` }, title);
  const body = h('div', { class: 'dlg-b' });
  const foot = h('div', { class: 'dlg-f' });
  const el = h('dialog', { 'aria-labelledby': titleEl.id }, h('div', { class: 'dlg-h' }, titleEl), body, foot);
  const opener = document.activeElement;
  const openerKey = opener?.dataset?.fk;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    disposeFromApp();
    onClose?.();
    el.close();
    el.remove();
    if (opener?.isConnected) opener.focus();
    else if (openerKey) focusKey(openerKey);
  };
  const disposeFromApp = app.addDisposer(close);
  el.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(el);
  el.showModal();
  return {
    el,
    close,
    setTitle: (t) => titleEl.replaceChildren(t),
    setBody: (...nodes) => replaceRegion(body, nodes),
    setFoot: (...nodes) => replaceRegion(foot, nodes),
    get isOpen() {
      return open;
    },
  };
}

export function confirmDialog(app, { title, message, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const d = openDialog(app, { title, onClose: () => resolve(answer) });
    d.setBody(h('p', { class: 'grow' }, message));
    d.setFoot(
      h('button', { on: { click: d.close } }, 'Huỷ'),
      h('button', { class: danger ? 'primary danger-fill' : 'primary', on: { click: () => { answer = true; d.close(); } } }, confirmLabel),
    );
    d.el.querySelector('.dlg-f button:last-child').focus();
  });
}
