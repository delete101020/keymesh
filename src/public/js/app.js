// App state and actions; knows nothing about how screens are drawn. Screens read `state`, call the
// actions below, and redraw on the regions emit() names.
import { assertSupported } from './core/crypto.js';
import { KeymeshError } from './core/errors.js';
import { updateEnv, updateProject, deleteEnv, deleteProject, addEnv, restoreItemVersion } from './core/model.js';
import { openStore, StoreError } from './store.js';
import { createSession, LockedError } from './session.js';
import { acquireTabLock } from './tab-lock.js';
import { createIdleTimer } from './idle.js';
import { createClipboardGuard } from './clipboard.js';
import { parseOtp, totp } from './otp.js';
import { isProd, itemLiveEnvs, liveEnvs, liveProjects, queryItems } from './vault-query.js';
import {
  addProjectWithEnvs,
  commitDraft,
  draftErrors,
  duplicateDraft,
  editDraft,
  forkItem,
  moveEnv,
  moveProject,
  templateDraft,
} from './vault-ops.js';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'mousemove', 'keydown', 'wheel', 'scroll', 'touchstart', 'input', 'click'];

const emptyView = () => ({
  filter: { k: 'all' },
  query: '',
  selectedId: null,
  mode: 'view', // view | pick | edit
  draft: null,
  draftBaseline: '',
  draftErrors: null,
  saveFailed: false,
  revealed: new Set(),
  pane: 'nav', // on narrow screens: nav | list | detail
  focus: null,
});

function platformProblem() {
  try {
    assertSupported();
  } catch (e) {
    return e.message;
  }
  if (!globalThis.indexedDB) return 'indexedDB';
  if (!navigator.locks) return 'navigator.locks';
  if (typeof structuredClone !== 'function') return 'structuredClone';
  return null;
}

export function createApp({ confirmDiscard = async () => true } = {}) {
  const listeners = new Set();
  const disposers = new Set();
  const state = { screen: 'loading', errorDetail: null, updateReady: false, ...emptyView() };
  let session = null;
  let releaseTab = null;
  let toastTimer = null;
  const clipboard = createClipboardGuard();
  const idle = createIdleTimer({ onExpire: () => lock() });

  const emit = (...regions) => {
    for (const fn of listeners) fn(regions);
  };

  const toast = (message, kind = 'info') => {
    clearTimeout(toastTimer);
    const ms = kind === 'info' ? 3000 : 6000;
    for (const fn of listeners) fn(['toast'], { message, kind });
    toastTimer = setTimeout(() => {
      for (const fn of listeners) fn(['toast'], null);
    }, ms);
  };

  function enterMain() {
    Object.assign(state, emptyView(), { screen: 'main' });
    idle.start();
    emit('screen');
  }

  // Bound to the tab lock: holds it for the whole time this tab has a vault open.
  async function open(action) {
    const release = await acquireTabLock().catch(() => null);
    if (!release) return { ok: false, error: 'other-tab' };
    try {
      await action();
    } catch (e) {
      release();
      session.lock();
      if (e instanceof KeymeshError && e.vaultError) return { ok: false, error: e.code === 'unsupported' ? 'unsupported' : 'vault-damaged' };
      if (e instanceof KeymeshError && e.code === 'decrypt-failed') return { ok: false, error: 'wrong-password' };
      if (e instanceof KeymeshError && e.code === 'unsupported') return { ok: false, error: 'unsupported' };
      if (e instanceof KeymeshError) return { ok: false, error: 'vault-damaged' };
      return { ok: false, error: 'storage' };
    }
    releaseTab = release;
    enterMain();
    return { ok: true };
  }

  function lock() {
    idle.stop();
    clipboard.lockNow();
    session?.lock();
    for (const fn of [...disposers]) fn();
    disposers.clear();
    releaseTab?.();
    releaseTab = null;
    clearTimeout(toastTimer);
    Object.assign(state, emptyView(), { screen: session ? 'locked' : state.screen });
    emit('toast', 'screen');
    for (const fn of listeners) fn(['toast'], null);
  }

  // Reports the outcome; a save that loses the race against a lock is not an error worth showing.
  async function change(fn, okMessage) {
    try {
      const value = await session.mutate(fn);
      normalize();
      if (okMessage) toast(okMessage);
      return { ok: true, value };
    } catch (e) {
      if (!(e instanceof LockedError)) toast('Lưu thất bại. Dữ liệu chưa được ghi, hãy thử lại.', 'error');
      return { ok: false, error: e };
    }
  }

  // After a change a filter or selection may point at something that is gone.
  function normalize() {
    const v = session.vault;
    const { filter } = state;
    if (filter.k === 'project' && !liveProjects(v).some((p) => p.id === filter.id)) state.filter = { k: 'all' };
    if (filter.k === 'env' && !liveEnvs(v).some((e) => e.id === filter.id)) state.filter = { k: 'all' };
  }

  const draftDirty = () => state.mode === 'edit' && JSON.stringify(state.draft) !== state.draftBaseline;

  // Leaving the form with unsaved edits asks first. True means go ahead.
  async function leaveDraft() {
    if (!draftDirty()) return true;
    return confirmDiscard();
  }

  function dropDraft() {
    state.mode = 'view';
    state.draft = null;
    state.draftErrors = null;
    state.saveFailed = false;
  }

  function beginDraft(draft) {
    state.mode = 'edit';
    state.draft = draft;
    state.draftBaseline = JSON.stringify(draft);
    state.draftErrors = null;
    state.saveFailed = false;
    state.pane = 'detail';
    state.focus = 'edit-title';
    emit('detail', 'pane');
  }

  const app = {
    state,
    get vault() {
      return session?.vault ?? null;
    },
    get vaultName() {
      return session?.vaultMeta?.name ?? '';
    },
    on(fn) {
      listeners.add(fn);
    },
    // Returns the function that takes it off again. Disposers run on lock.
    addDisposer(fn) {
      disposers.add(fn);
      return () => disposers.delete(fn);
    },
    toast,

    async boot() {
      const missing = platformProblem();
      if (missing) {
        state.screen = 'error';
        state.errorDetail = { kind: 'unsupported', what: missing };
        return emit('screen');
      }
      try {
        const store = await openStore();
        session = createSession({ store });
        state.screen = (await session.hasAccount()) ? 'locked' : 'setup';
      } catch (e) {
        state.screen = 'error';
        state.errorDetail = { kind: 'storage', what: e instanceof StoreError ? e.reason : null };
      }
      return emit('screen');
    },

    bindActivity(win = window) {
      const seen = (e) => {
        if (idle.activity()) return;
        // Expired while nothing ran (machine asleep): the app has just locked, drop this event.
        e.stopImmediatePropagation();
        e.preventDefault();
      };
      for (const type of ACTIVITY_EVENTS) win.addEventListener(type, seen, { capture: true, passive: false });
      const wake = () => idle.check();
      win.addEventListener('focus', () => {
        wake();
        clipboard.focused();
      });
      win.addEventListener('pageshow', wake);
      win.document.addEventListener('visibilitychange', wake);
      // Going into the back/forward cache with a vault open would keep it in memory.
      win.addEventListener('pagehide', () => {
        if (session?.unlocked) lock();
      });
    },

    createAccount: (password) => open(() => session.createAccount(password)),
    unlock: (password) => open(() => session.unlock(password)),
    lock,

    // --- new version -----------------------------------------------------------------------------

    updateReady() {
      state.updateReady = true;
      emit('update');
    },
    // Reloading locks the vault and loses the form, so unsaved edits ask first. True means go ahead.
    leaveForUpdate: () => leaveDraft(),

    // --- navigation ------------------------------------------------------------------------------

    items: () => queryItems(session.vault, state.filter, state.query, Date.now()),
    selectedItem() {
      return session?.vault?.items.find((i) => i.id === state.selectedId && i.deletedAt === null && i.purgedAt === null) ?? null;
    },

    async setFilter(filter) {
      if (!(await leaveDraft())) return;
      dropDraft();
      state.filter = filter;
      state.query = '';
      if (!app.items().some((i) => i.id === state.selectedId)) app.clearSelection();
      state.pane = 'list';
      emit('nav', 'list', 'detail', 'pane', 'search');
    },

    clearSelection() {
      state.selectedId = null;
      state.revealed = new Set();
    },

    setQuery(query) {
      state.query = query;
      if (query) state.pane = state.mode === 'view' ? 'list' : state.pane;
      emit('list', 'pane');
    },

    async selectItem(id) {
      if (!(await leaveDraft())) return;
      dropDraft();
      state.selectedId = id;
      state.revealed = new Set();
      state.pane = 'detail';
      state.focus = 'detail-title';
      emit('list', 'detail', 'pane');
    },

    async back() {
      if (state.pane === 'detail') {
        if (!(await leaveDraft())) return;
        dropDraft();
        state.pane = 'list';
        state.focus = 'list-head';
      } else {
        state.pane = 'nav';
        state.focus = 'nav-all';
      }
      emit('list', 'detail', 'pane');
    },

    // --- item form -------------------------------------------------------------------------------

    async startNew() {
      if (!(await leaveDraft())) return;
      dropDraft();
      state.mode = 'pick';
      state.pane = 'detail';
      state.focus = 'pick-title';
      emit('detail', 'pane');
    },
    pickType(type) {
      beginDraft(templateDraft(type, state.filter));
    },
    startEdit() {
      beginDraft(editDraft(app.selectedItem()));
    },
    startDuplicate() {
      beginDraft(duplicateDraft(app.selectedItem()));
    },
    async cancelEdit() {
      if (!(await leaveDraft())) return;
      dropDraft();
      state.focus = 'detail-title';
      if (!app.selectedItem()) state.pane = 'list';
      emit('detail', 'pane');
    },
    formChanged() {
      emit('detail');
    },

    async saveDraft() {
      const errors = draftErrors(state.draft);
      state.draftErrors = errors;
      if (errors) {
        state.focus = errors.title ? 'edit-title' : `value-${Object.keys(errors.fields)[0]}`;
        return emit('detail');
      }
      const { draft } = state;
      const r = await change((v, ctx) => commitDraft(v, draft, ctx).id);
      if (!r.ok) {
        if (state.draft === draft) {
          state.saveFailed = true;
          emit('detail');
        }
        return r;
      }
      dropDraft();
      state.selectedId = r.value;
      state.revealed = new Set();
      state.focus = 'detail-title';
      toast('Đã lưu.');
      emit('nav', 'list', 'detail', 'pane');
      return r;
    },

    async fork(envId) {
      const id = state.selectedId;
      const r = await change((v, ctx) => forkItem(v, id, envId, ctx)?.id, 'Đã tách thành item riêng.');
      if (r.ok && r.value) {
        state.selectedId = r.value;
        state.revealed = new Set();
        state.focus = 'detail-title';
      }
      emit('nav', 'list', 'detail');
      return r;
    },

    async restoreVersion(entry) {
      const id = state.selectedId;
      const r = await change((v, ctx) => {
        restoreItemVersion(v, id, entry, ctx);
      }, 'Đã khôi phục.');
      state.revealed = new Set();
      emit('nav', 'list', 'detail');
      return r;
    },

    // --- projects and envs -----------------------------------------------------------------------

    async changeVault(fn, okMessage) {
      const r = await change(fn, okMessage);
      emit('nav', 'list', 'detail');
      return r;
    },
    addProject: (name, envs) => app.changeVault((v, ctx) => addProjectWithEnvs(v, name, envs, ctx).id),
    renameProject: (id, name) => app.changeVault((v, ctx) => updateProject(v, id, { name: name.trim() }, ctx) && undefined, 'Đã đổi tên.'),
    moveProject: (id, delta) => app.changeVault((v, ctx) => moveProject(v, id, delta, ctx)),
    deleteProject: (id) => app.changeVault((v, ctx) => deleteProject(v, id, ctx) && undefined, 'Đã xoá project.'),
    addEnv: (projectId, name) => app.changeVault((v, ctx) => addEnv(v, projectId, { name: name.trim() }, ctx) && undefined),
    renameEnv: (id, name) => app.changeVault((v, ctx) => updateEnv(v, id, { name: name.trim() }, ctx) && undefined, 'Đã đổi tên.'),
    setEnvColor: (id, color) => app.changeVault((v, ctx) => updateEnv(v, id, { color }, ctx) && undefined),
    moveEnv: (id, delta) => app.changeVault((v, ctx) => moveEnv(v, id, delta, ctx)),
    deleteEnv: (id) => app.changeVault((v, ctx) => deleteEnv(v, id, ctx) && undefined, 'Đã xoá env.'),

    // --- field actions ---------------------------------------------------------------------------

    toggleReveal(fieldId) {
      if (state.revealed.has(fieldId)) state.revealed.delete(fieldId);
      else state.revealed.add(fieldId);
      emit('detail');
    },

    async copyField(item, field) {
      let value = field.v;
      if (field.kind === 'otp') {
        const parsed = parseOtp(field.v);
        if (!parsed.ok) return toast('Secret OTP không hợp lệ, không có mã để copy.', 'error');
        value = await totp(parsed, Date.now());
      }
      const ok = await clipboard.copy(value);
      if (!ok) return toast('Không copy được: trình duyệt đã từ chối.', 'error');
      const warnProd = session?.vault && isProd(session.vault, item);
      if (warnProd) return toast('Đã copy giá trị của env prod. Sẽ xoá khỏi clipboard sau 30 giây.', 'warn');
      return toast('Đã copy. Sẽ xoá khỏi clipboard sau 30 giây.');
    },

    canFork: (item) => itemLiveEnvs(session.vault, item).length >= 2,
  };
  return app;
}
