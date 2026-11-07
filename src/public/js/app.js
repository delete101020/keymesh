// App state and actions; knows nothing about how screens are drawn. Screens read `state`, call the
// actions below, and redraw on the regions emit() names.
import { assertSupported } from './core/crypto.js';
import { KeymeshError } from './core/errors.js';
import { updateEnv, updateItem, updateProject, deleteEnv, deleteProject, addEnv, restoreItemVersion, clearItemConflict } from './core/model.js';
import { openStore, StoreError } from './store.js';
import { createSession, LockedError } from './session.js';
import { createApi } from './remote.js';
import { createAuth } from './auth.js';
import { createSync } from './sync.js';
import { acquireTabLock } from './tab-lock.js';
import { createIdleTimer } from './idle.js';
import { createClipboardGuard } from './clipboard.js';
import { cleanSettings, defaultSettings, isTouchDevice, lockTimes, pushRecent } from './settings.js';
import { parseOtp, totp } from './otp.js';
import { isProd, itemLiveEnvs, liveEnvs, liveProjects, queryItems } from './vault-query.js';
import {
  addProjectWithEnvs,
  commitDraft,
  StaleDraftError,
  draftErrors,
  duplicateDraft,
  editDraft,
  forkItem,
  moveEnv,
  moveProject,
  templateDraft,
} from './vault-ops.js';

// Passive where the browser would otherwise wait for this handler before scrolling. Those can't cancel
// the event that finds the session expired, but by then the lock has removed everything it could touch.
const PASSIVE_ACTIVITY = ['pointermove', 'mousemove', 'wheel', 'scroll', 'touchstart', 'touchmove'];
const ACTIVE_ACTIVITY = ['pointerdown', 'keydown', 'input', 'click'];
// The events that carry a user gesture. iOS fires no click on a tap outside a control, hence touchend.
const GESTURE_EVENTS = ['touchend', 'keydown', 'click'];
// Tabs of this app tell each other when the account on this device went away (KM-006 FR13, Concern 16).
const CHANNEL = 'keymesh';

// "Chrome · macOS": what the server lists as this device. No identifier, nothing from storage.
function deviceLabel(nav = globalThis.navigator) {
  const ua = nav?.userAgent ?? '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

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
  fromHome: false, // the item was opened from the home screen, so Back returns there
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
  const touch = isTouchDevice();
  const state = {
    screen: 'loading',
    errorDetail: null,
    updateReady: false,
    shielded: false,
    settings: defaultSettings(),
    sync: null, // what sync.js reports, for the status bar (KM-006 FR31)
    account: null, // { username, registered } of the account on this device
    ...emptyView(),
  };
  let store = null;
  let session = null;
  let auth = null;
  let sync = null;
  let channel = null;
  let pendingLogin = null; // a login waiting for the user to choose (FR09): { result, release }
  let releaseTab = null;
  let toastTimer = null;
  const clipboard = createClipboardGuard({
    onRetryChange: (pending) =>
      pending
        ? toast('Trình duyệt chưa cho xoá clipboard. Chạm vào app để xoá.', 'warn')
        : toast('Đã xoá khỏi clipboard.'),
  });
  const idle = createIdleTimer({ onExpire: () => lock() });
  const applySettings = () => idle.setTimeouts(lockTimes(state.settings, touch));
  applySettings();

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

  // A broken value or a failed read falls back to the defaults: the app stays locked down either way.
  async function loadSettings() {
    state.settings = cleanSettings(await store.readSettings().catch(() => null));
    applySettings();
  }

  async function readAccountInfo() {
    const a = await store.readAccount().catch(() => null);
    state.account = a ? { username: a.username, registered: a.userId !== null } : null;
  }

  function enterMain() {
    Object.assign(state, emptyView(), { screen: 'main' });
    idle.start();
    emit('screen');
    sync.start().catch(() => {});
  }

  // What sync brought in is drawn at once (FR21), except into an open form: the draft is the user's until
  // they save, and saving applies only what they changed (FR22).
  function synced(event) {
    state.sync = event;
    if (!session?.unlocked) return;
    if (event.changed) {
      normalize();
      const regions = ['nav', 'list', 'sync'];
      if (state.mode === 'view') regions.push('detail');
      if (state.pane === 'detail' && state.mode === 'view' && !app.selectedItem()) state.pane = 'list';
      return emit(...regions, 'pane');
    }
    emit('sync');
  }

  // The account on this device is gone (wiped here or in another tab): back to the empty-device screen.
  function toEmptyDevice() {
    lock();
    state.account = null;
    state.sync = null;
    state.screen = 'setup';
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
    await loadSettings();
    await readAccountInfo();
    enterMain();
    return { ok: true };
  }

  function lock() {
    sync?.stop();
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
      sync.saved().catch(() => {});
      return { ok: true, value };
    } catch (e) {
      if (e instanceof StaleDraftError) toast('Item đã đổi ở thiết bị khác nên không lưu được bản nháp này. Bản nháp vẫn còn trên màn hình.', 'error');
      else if (!(e instanceof LockedError)) toast('Lưu thất bại. Dữ liệu chưa được ghi, hãy thử lại.', 'error');
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

  // Local to this device and not worth interrupting anyone over: a failed write just forgets it.
  function noteRecent(id) {
    const recents = pushRecent(state.settings.recents, id);
    if (recents.join() === state.settings.recents.join()) return;
    state.settings = { ...state.settings, recents };
    store.writeSettings(state.settings).catch(() => {});
    emit('nav');
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

  // `sameView`: the same account logged in again while open, so what is on screen stays. Otherwise the
  // main screen starts fresh; the tab lock is the one just taken, or the one this open tab already holds.
  async function finishLogin(release, sameView) {
    await readAccountInfo();
    if (sameView) {
      emit('sync', 'nav');
      sync.start().catch(() => {});
      return { ok: true };
    }
    if (release) releaseTab = release;
    await loadSettings();
    enterMain();
    return { ok: true };
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
    touch,

    async boot() {
      const missing = platformProblem();
      if (missing) {
        state.screen = 'error';
        state.errorDetail = { kind: 'unsupported', what: missing };
        return emit('screen');
      }
      try {
        store = await openStore();
        session = createSession({ store });
        const api = createApi();
        auth = createAuth({ store, session, api, deviceName: deviceLabel() });
        sync = createSync({ store, session, api, onChange: synced });
        await loadSettings();
        await readAccountInfo();
        state.screen = state.account ? 'locked' : 'setup';
        if (typeof BroadcastChannel === 'function') {
          channel = new BroadcastChannel(CHANNEL);
          channel.onmessage = (e) => {
            if (e.data?.type === 'account-gone' && !session.unlocked) toEmptyDevice();
            if (e.data?.type === 'account-changed' && !session.unlocked) readAccountInfo().then(() => emit('screen'));
          };
        }
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
        if (e.cancelable && !PASSIVE_ACTIVITY.includes(e.type)) e.preventDefault();
      };
      for (const type of ACTIVE_ACTIVITY) win.addEventListener(type, seen, { capture: true, passive: false });
      for (const type of PASSIVE_ACTIVITY) win.addEventListener(type, seen, { capture: true, passive: true });
      const wake = () => idle.check();
      win.addEventListener('focus', () => {
        wake();
        clipboard.retry();
      });
      const gesture = () => clipboard.retry();
      for (const type of GESTURE_EVENTS) win.addEventListener(type, gesture, { capture: true, passive: true });
      win.addEventListener('pageshow', wake);
      // Coming back or the network returning syncs at once (FR16); a sync is never user activity (FR15).
      win.addEventListener('online', () => {
        if (session?.unlocked) sync.syncNow();
      });
      win.document.addEventListener('visibilitychange', () => {
        const hidden = win.document.visibilityState === 'hidden';
        if (hidden) idle.hidden();
        else idle.visible();
        if (hidden) sync?.hidden();
        else if (session?.unlocked) sync.syncNow();
        // Cover the content before the OS takes its picture for the task switcher (touch devices only).
        state.shielded = touch && hidden;
        emit('shield');
      });
      // Going into the back/forward cache with a vault open would keep it in memory.
      win.addEventListener('pagehide', () => {
        if (session?.unlocked) lock();
      });
    },

    createAccount: (password) => open(() => session.createAccount(password)),
    async unlock(password) {
      // Another tab may have wiped the account while this one sat on the lock screen (AC20).
      if (!(await session.hasAccount())) {
        toEmptyDevice();
        return { ok: false, error: 'no-account' };
      }
      return open(() => session.unlock(password));
    },
    lock,

    // --- account and sync (KM-006) ---------------------------------------------------------------

    get syncStatus() {
      return state.sync;
    },

    async register(input) {
      const r = await auth.register(input).catch(() => ({ ok: false, error: 'storage' }));
      if (!r.ok) return r;
      await readAccountInfo();
      toast('Đã đăng ký. Dữ liệu trên máy này sẽ được đồng bộ.');
      sync.start().catch(() => {});
      emit('sync', 'nav');
      return r;
    },

    // From the empty device, the lock screen, or "Cần đăng nhập lại" while open. A login that finds another
    // account here comes back with `choose`; the screens then call confirmReplace() or cancelLogin().
    async login(input) {
      const wasOpen = Boolean(session.unlocked);
      const release = wasOpen ? null : await acquireTabLock().catch(() => null);
      if (!wasOpen && !release) return { ok: false, error: 'other-tab' };
      let r;
      try {
        r = await auth.login(input);
      } catch (e) {
        release?.();
        if (!wasOpen) session.lock();
        return { ok: false, error: e instanceof KeymeshError ? 'vault-damaged' : 'storage' };
      }
      if (r.choose) {
        pendingLogin = { result: r, release };
        return { ok: false, choose: r.choose };
      }
      if (!r.ok) {
        release?.();
        return r;
      }
      return finishLogin(release, wasOpen);
    },

    async confirmReplace() {
      const { result, release } = pendingLogin ?? {};
      pendingLogin = null;
      if (!result) return { ok: false, error: 'storage' };
      const wasOpen = Boolean(session.unlocked);
      sync.stop();
      clipboard.lockNow();
      let r;
      try {
        r = await result.replace();
      } catch {
        r = { ok: false, error: 'storage' };
      }
      if (!r.ok) {
        release?.();
        if (wasOpen && !session.unlocked) lock();
        return r;
      }
      channel?.postMessage({ type: 'account-changed' });
      return finishLogin(release, false);
    },

    async cancelLogin() {
      const { result, release } = pendingLogin ?? {};
      pendingLogin = null;
      release?.();
      await result?.cancel().catch(() => {});
    },

    // FR12: before a wipe, a last try to get pending changes to the server. { pending, dirty } after it.
    async pendingBeforeLogout() {
      const dirty = async () => (await store.readVaultRows()).some((r) => r.current.dirty);
      if ((await dirty()) && navigator.onLine !== false) await sync.syncNow().catch(() => {});
      return { dirty: await dirty(), pending: session.pendingCount() };
    },

    // FR11, FR13. `wipe`: everything of the account leaves this device. Returns { revoked, passkey }.
    async logout({ wipe = false } = {}) {
      sync.stop();
      const { revoked } = await auth.endSession().catch(() => ({ revoked: false }));
      if (!wipe) {
        lock();
        await readAccountInfo();
        if (!revoked) toast('Đã đăng xuất trên máy này. Phiên trên server chưa huỷ được vì không có kết nối; nó tự hết sau 30 ngày không dùng.', 'warn');
        return { ok: true, revoked };
      }
      const passkey = await store.hasPasskey().catch(() => false);
      clipboard.lockNow();
      try {
        await auth.wipe();
      } catch {
        lock();
        toast('Không xoá được dữ liệu trên máy này. Không có gì bị xoá; hãy thử lại.', 'error');
        return { ok: false };
      }
      toEmptyDevice();
      channel?.postMessage({ type: 'account-gone' });
      if (passkey) toast('Đã xoá dữ liệu trên máy này. Passkey đã lưu trong hệ điều hành không xoá được từ web: hãy xoá trong phần cài đặt mật khẩu của thiết bị.', 'warn');
      else if (!revoked) toast('Đã xoá dữ liệu trên máy này. Phiên trên server chưa huỷ được vì không có kết nối; nó tự hết sau 30 ngày không dùng.', 'warn');
      return { ok: true, revoked, passkey };
    },

    // FR34: one round at once, none if one is running; offline says so at once.
    async syncNow() {
      if (navigator.onLine === false) toast('Không có mạng. Thay đổi vẫn lưu trên máy và sẽ đồng bộ khi có mạng.', 'warn');
      await sync.syncNow();
    },

    // FR37 "Đã xử lý": only the mark goes; saved and synced like any change.
    resolveConflict: (id) => app.changeVault((v, ctx) => clearItemConflict(v, id, ctx) && undefined, 'Đã bỏ đánh dấu xung đột.'),

    // --- settings --------------------------------------------------------------------------------

    async changeSettings(patch, okMessage) {
      const next = cleanSettings({ ...state.settings, ...patch });
      try {
        await store.writeSettings(next);
      } catch {
        toast('Lưu thất bại. Dữ liệu chưa được ghi, hãy thử lại.', 'error');
        return false;
      }
      state.settings = next;
      applySettings();
      if (okMessage) toast(okMessage);
      return true;
    },

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
      state.fromHome = false;
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

    async selectItem(id, { fromHome = false } = {}) {
      if (!(await leaveDraft())) return;
      dropDraft();
      state.selectedId = id;
      state.revealed = new Set();
      if (fromHome) state.fromHome = true;
      state.pane = 'detail';
      state.focus = 'detail-title';
      noteRecent(id);
      emit('list', 'detail', 'pane');
    },

    async back() {
      if (state.pane === 'detail') {
        if (!(await leaveDraft())) return;
        dropDraft();
        state.pane = state.fromHome ? 'nav' : 'list';
        state.focus = state.fromHome ? 'nav-all' : 'list-head';
        state.fromHome = false;
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
      const baseline = draft.id === null ? null : JSON.parse(state.draftBaseline);
      const r = await change((v, ctx) => commitDraft(v, draft, ctx, baseline).id);
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

    async toggleFavorite(id) {
      const item = session.vault.items.find((i) => i.id === id);
      const r = await change((v, ctx) => updateItem(v, id, { favorite: !item.favorite }, ctx) && undefined);
      emit('nav', 'detail');
      return r;
    },

    async copyField(item, field) {
      let value = field.v;
      if (field.kind === 'otp') {
        const parsed = parseOtp(field.v);
        if (!parsed.ok) return toast('Secret OTP không hợp lệ, không có mã để copy.', 'error');
        value = totp(parsed, Date.now()); // not awaited: the write must start inside the gesture
      }
      const ok = await clipboard.copy(value);
      if (!ok) return toast('Không copy được: trình duyệt đã từ chối.', 'error');
      noteRecent(item.id);
      const warnProd = session?.vault && isProd(session.vault, item);
      if (warnProd) return toast('Đã copy giá trị của env prod. Sẽ xoá khỏi clipboard sau 30 giây nếu trình duyệt cho phép.', 'warn');
      return toast('Đã copy. Sẽ xoá khỏi clipboard sau 30 giây nếu trình duyệt cho phép.');
    },

    canFork: (item) => itemLiveEnvs(session.vault, item).length >= 2,
  };
  return app;
}
