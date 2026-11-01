// Entry point: draws the screens and redraws the regions the app names. The only place that binds
// app state to DOM regions.
import { createApp } from '../app.js';
import { h, confirmDialog, focusKey, replaceRegion } from './dom.js';
import { icon } from './icons.js';
import { renderSetup, renderUnlock, renderError } from './gate.js';
import { renderNav } from './nav.js';
import { renderList } from './list.js';
import { renderDetail, stopOtpTicks } from './detail.js';
import { renderEdit } from './edit.js';
import { registerPwa } from '../pwa.js';

const root = document.getElementById('root');
const toastEl = document.getElementById('toast');
const updateEl = document.getElementById('update');

const app = createApp({
  confirmDiscard: () => confirmDialog(app, { title: 'Bỏ bản nháp?', message: 'Những gì vừa sửa chưa được lưu sẽ mất.', confirmLabel: 'Bỏ bản nháp' }),
});

let main = null;

function buildMain() {
  const search = h('input', {
    type: 'search',
    'aria-label': 'Tìm kiếm',
    placeholder: 'Tìm item, field, ghi chú…',
    autocomplete: 'off',
    fk: 'search',
    on: { input: (e) => app.setQuery(e.target.value) },
  });
  const header = h('header', { class: 'top' },
    h('button', { class: 'icon m-back', 'aria-label': 'Quay lại', fk: 'back', on: { click: () => app.back() } }, icon('back')),
    h('div', { class: 'brand' }, h('span', { class: 'mark' }, icon('key')), h('span', null, 'KeyMesh')),
    h('div', { class: 'search' }, search, icon('search'), h('kbd', { 'aria-hidden': 'true' }, navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl K')),
    h('span', { class: 'spacer' }),
    h('button', { 'aria-label': 'Khoá', fk: 'lock', on: { click: () => app.lock() } }, icon('lock')));
  const side = h('nav', { class: 'side', 'aria-label': 'Điều hướng' });
  const list = h('section', { class: 'list', 'aria-label': 'Danh sách item' });
  const detail = h('section', { class: 'detail', 'aria-label': 'Chi tiết item' });
  const cols = h('main', { class: 'cols' }, side, list, detail);
  const shell = h('div', { class: 'app' }, header, cols);
  return { shell, cols, search, side, list, detail };
}

function setPane() {
  main.cols.dataset.pane = app.state.pane;
  main.shell.dataset.pane = app.state.pane;
}

function renderScreen() {
  const { screen, errorDetail } = app.state;
  stopOtpTicks();
  main = null;
  if (screen === 'main') {
    main = buildMain();
    root.replaceChildren(main.shell);
    setPane();
    drawRegions(['nav', 'list', 'detail']);
    focusKey('nav-all');
    return;
  }
  if (screen === 'setup') root.replaceChildren(renderSetup(app));
  else if (screen === 'locked') root.replaceChildren(renderUnlock(app));
  else if (screen === 'error') root.replaceChildren(renderError(errorDetail));
  else root.replaceChildren();
  focusKey(screen === 'setup' ? 'setup-pw' : 'unlock-pw');
}

function drawRegions(regions) {
  if (!main) return;
  if (regions.includes('pane')) setPane();
  if (regions.includes('search')) main.search.value = app.state.query;
  if (regions.includes('nav')) replaceRegion(main.side, renderNav(app));
  if (regions.includes('list')) replaceRegion(main.list, renderList(app));
  if (regions.includes('detail')) {
    stopOtpTicks();
    replaceRegion(main.detail, app.state.mode === 'view' ? renderDetail(app) : renderEdit(app));
  }
  if (app.state.focus) {
    const key = app.state.focus;
    app.state.focus = null;
    queueMicrotask(() => focusKey(key));
  }
}

function showToast(toast) {
  toastEl.replaceChildren();
  toastEl.className = '';
  toastEl.hidden = !toast;
  if (toast) {
    toastEl.className = toast.kind;
    toastEl.textContent = toast.message;
  }
}

const pwa = registerPwa({ onUpdateReady: () => app.updateReady() });

function showUpdate() {
  updateEl.hidden = !app.state.updateReady;
  updateEl.replaceChildren(
    h('span', { class: 'grow' }, 'Có phiên bản mới của KeyMesh.'),
    h('button', { class: 'primary', on: { click: async () => {
      if (await app.leaveForUpdate()) pwa.apply();
    } } }, 'Tải lại'));
}

app.on((regions, payload) => {
  if (regions.includes('toast') && payload !== undefined) return showToast(payload);
  if (regions.includes('update')) return showUpdate();
  if (regions.includes('screen')) return renderScreen();
  return drawRegions(regions);
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && main) {
    e.preventDefault();
    if (!document.querySelector('dialog[open]')) main.search.focus();
  }
});

app.bindActivity();
app.boot();
pwa.start();
