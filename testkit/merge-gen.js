// Seeded generator of (base, local, remote) triples for the merge property tests (KM-002 AC26), and
// the vault used by the merge benchmark (AC27). Runs unchanged on Node and in the browser runner.
import {
  ITEM_TYPES,
  createVault,
  addProject,
  updateProject,
  deleteProject,
  addEnv,
  updateEnv,
  deleteEnv,
  createItem,
  updateItem,
  trashItem,
  restoreItem,
  purgeItem,
} from '../src/public/js/core/model.js';
import { KeymeshError } from '../src/public/js/core/errors.js';
import { merge } from '../src/public/js/core/merge.js';

export const T0 = 1761600000000;
const DEVS = ['d_aaaaaaaaaaaaaaaa', 'd_bbbbbbbbbbbbbbbb', 'd_cccccccccccccccc'];
const VID = '0123456789abcdef';

// mulberry32: small, fast and the same on every platform.
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// model.js draws ids from crypto.getRandomValues; feed it the seeded stream so a seed gives the same ids.
function withSeededIds(rnd, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const fake = {
    getRandomValues(a) {
      for (let i = 0; i < a.length; i++) a[i] = Math.floor(rnd() * 256);
      return a;
    },
  };
  Object.defineProperty(globalThis, 'crypto', { value: fake, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (desc) Object.defineProperty(globalThis, 'crypto', desc);
    else delete globalThis.crypto;
  }
}

const fork = (v) => JSON.parse(JSON.stringify(v));

function tools(rnd) {
  const int = (n) => Math.floor(rnd() * n);
  const pick = (list) => list[int(list.length)];
  const chance = (p) => rnd() < p;
  return { int, pick, chance };
}

// Small value pools so that both sides often pick the same value (eq, not a conflict).
const TITLES = ['Partner X', 'Portal', 'DB main', 'VPN'];
const NOTES = ['', 'rotate monthly', 'shared with QA'];
const VALUES = ['P0', 'P1', 'P2', 'secret-x'];
const TAGS = ['t1', 't2', 't3'];
const EXPIRES = [null, '2027-01-01', '2028-06-30'];

// One random model operation on `vault` by device `dev` at `now`. Operations the model refuses on the
// current state (editing a trashed item…) throw KeymeshError and leave the vault as it was.
function randomOp(vault, t, now, dev) {
  const ctx = { now, deviceId: dev };
  const items = vault.items.filter((i) => i.purgedAt === null);
  const live = items.filter((i) => i.deletedAt === null);
  const envs = vault.envs.filter((e) => e.deletedAt === null);
  const projects = vault.projects.filter((p) => p.deletedAt === null);
  const liveFields = (item) => item.fields.filter((f) => f.deletedAt === null);
  const keep = (item) => liveFields(item).map((f) => ({ id: f.id }));
  const ops = [
    [6, () => updateItem(vault, t.pick(live).id, { title: t.pick(TITLES) }, ctx)],
    [3, () => updateItem(vault, t.pick(live).id, { notes: t.pick(NOTES) }, ctx)],
    [2, () => {
      const item = t.pick(live);
      updateItem(vault, item.id, { favorite: !item.favorite }, ctx);
    }],
    [1, () => updateItem(vault, t.pick(live).id, { type: t.pick(ITEM_TYPES) }, ctx)],
    [2, () => updateItem(vault, t.pick(live).id, { expires: t.pick(EXPIRES) }, ctx)],
    [6, () => {
      const item = t.pick(live);
      const fs = keep(item);
      if (fs.length) t.pick(fs).v = t.pick(VALUES);
      updateItem(vault, item.id, { fields: fs }, ctx);
    }],
    [3, () => {
      const item = t.pick(live);
      updateItem(vault, item.id, { fields: [...keep(item), { label: 'Extra', kind: 'text', v: t.pick(VALUES) }] }, ctx);
    }],
    [3, () => {
      const item = t.pick(live);
      const fs = keep(item);
      fs.splice(t.int(fs.length), 1);
      updateItem(vault, item.id, { fields: fs }, ctx);
    }],
    [1, () => {
      const item = t.pick(live);
      updateItem(vault, item.id, { fields: keep(item).reverse() }, ctx);
    }],
    [4, () => {
      const item = t.pick(live);
      const tag = t.pick(TAGS);
      updateItem(vault, item.id, { tags: item.tags.includes(tag) ? item.tags.filter((x) => x !== tag) : [...item.tags, tag] }, ctx);
    }],
    [4, () => {
      const item = t.pick(live);
      const env = t.pick(vault.envs);
      updateItem(vault, item.id, { scopes: item.scopes.includes(env.id) ? item.scopes.filter((x) => x !== env.id) : [...item.scopes, env.id] }, ctx);
    }],
    [3, () => trashItem(vault, t.pick(live).id, ctx)],
    [3, () => restoreItem(vault, t.pick(items.filter((i) => i.deletedAt !== null)).id, ctx)],
    [2, () => purgeItem(vault, t.pick(items).id, ctx)],
    [1, () => createItem(vault, t.pick(ITEM_TYPES), { title: t.pick(TITLES), scopes: envs.length ? [t.pick(envs).id] : [] }, ctx)],
    [2, () => updateEnv(vault, t.pick(envs).id, t.chance(0.5) ? { name: t.pick(['uat', 'staging', 'prod']) } : { color: t.pick([null, 'red', 'green']) }, ctx)],
    [1, () => updateProject(vault, t.pick(projects).id, { name: t.pick(['PaymentGW', 'CRM', 'Ops']) }, ctx)],
    [1, () => deleteEnv(vault, t.pick(envs).id, ctx)],
    [1, () => deleteProject(vault, t.pick(projects).id, ctx)],
    [1, () => addEnv(vault, t.pick(projects).id, { name: 'new' }, ctx)],
    [1, () => {
      const item = t.pick(vault.items.filter((i) => i.conflict !== null));
      item.conflict = null; // the user pressed "Đã xử lý"
    }],
  ];
  const total = ops.reduce((s, [w]) => s + w, 0);
  let n = t.int(total);
  const [, op] = ops.find(([w]) => (n -= w) < 0);
  try {
    op();
  } catch (err) {
    // t.pick on an empty list gives undefined → TypeError; the model refusing → KeymeshError.
    if (!(err instanceof KeymeshError) && !(err instanceof TypeError)) throw err;
  }
}

// Apply up to `max` operations; each step moves the device clock forward 0–2 s, so clocks tie often.
function edit(vault, t, start, dev, max) {
  let now = start;
  const n = t.int(max + 1);
  for (let i = 0; i < n; i++) {
    now += t.int(3) * 1000;
    randomOp(vault, t, now, dev);
  }
  return vault;
}

function baseVault(t) {
  const ctx = { now: T0, deviceId: DEVS[2] };
  const vault = createVault(VID);
  const p0 = addProject(vault, { name: 'PaymentGW' }, ctx);
  const p1 = addProject(vault, { name: 'CRM' }, ctx);
  const envs = [addEnv(vault, p0.id, { name: 'uat' }, ctx), addEnv(vault, p0.id, { name: 'staging' }, ctx), addEnv(vault, p1.id, { name: 'uat' }, ctx)];
  const n = 3 + t.int(3);
  for (let i = 0; i < n; i++) {
    createItem(vault, t.pick(['login', 'db', 'api_key', 'note']), { title: t.pick(TITLES), scopes: [t.pick(envs).id], tags: t.chance(0.5) ? [t.pick(TAGS)] : [] }, ctx);
  }
  return edit(vault, t, T0, DEVS[2], 3);
}

// Two devices: local is A, remote is B, or both A (same deviceId, e.g. a restored IndexedDB copy).
function sides(t) {
  return t.chance(0.15) ? [DEVS[0], DEVS[0]] : [DEVS[0], DEVS[1]];
}

// { seed, b, l, r }. With some probability base is itself a merge result, so it carries conflict
// marks and conflict history entries that the next merge has to handle.
export function genCase(seed) {
  const rnd = prng(seed);
  const t = tools(rnd);
  return withSeededIds(rnd, () => {
    let b = baseVault(t);
    const start = T0 + 10_000;
    if (t.chance(0.35)) {
      const [da, db] = sides(t);
      b = merge(b, edit(fork(b), t, start, da, 3), edit(fork(b), t, start, db, 3));
    }
    const [da, db] = sides(t);
    const later = start + 20_000;
    const l = edit(fork(b), t, later, da, 5);
    const r = edit(fork(b), t, later + t.int(3) * 1000, db, 5);
    return { seed, b, l, r };
  });
}

// --- checks --------------------------------------------------------------------------------------

// Equality that ignores key order, independent of merge.js.
function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted);
  if (v === null || typeof v !== 'object') return v;
  return Object.fromEntries(Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => [k, sorted(v[k])]));
}
export const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

const byId = (list, id) => list.find((e) => e.id === id);
const fieldValue = (f) => f && { label: f.label, kind: f.kind, v: f.v, file: f.file, deletedAt: f.deletedAt };
const setOf = (a) => JSON.stringify([...new Set(a)].sort());
const isLive = (i) => i.deletedAt === null && i.purgedAt === null;

// AC26 "chỉ xoá khi bên kia không sửa nội dung": an edit of anything the user can edit (spec FR13).
export function editedContent(b, x) {
  if (!b) return true;
  for (const k of ['type', 'title', 'notes', 'expires', 'favorite', 'forkedFrom', 'fieldOrder']) if (!same(b[k], x[k])) return true;
  for (const f of x.fields) if (!same(fieldValue(byId(b.fields, f.id)), fieldValue(f))) return true;
  return setOf(b.tags) !== setOf(x.tags) || setOf(b.scopes) !== setOf(x.scopes);
}

// Every entity id and field id of l and r is in m.
export function lostIds(m, l, r) {
  const out = [];
  for (const table of ['projects', 'envs', 'items']) {
    const ids = new Set(m[table].map((e) => e.id));
    for (const side of [l, r]) for (const e of side[table]) if (!ids.has(e.id)) out.push(`${table} ${e.id}`);
  }
  for (const side of [l, r]) {
    for (const item of side.items) {
      const x = byId(m.items, item.id);
      // A purge blanks fields on purpose (FR14); only an unpurged result must keep every field.
      if (!x || x.purgedAt !== null) continue;
      const fields = new Set(x.fields.map((f) => f.id));
      for (const f of item.fields) if (!fields.has(f.id)) out.push(`field ${item.id}/${f.id}`);
    }
  }
  return out;
}

// Every pre-merge value of title/type/notes/expires, every field (by id and value) and every scope of
// l and r that is not in the merged item is in one of its history entries. Read per element: a scope
// one side dropped must be in some entry's scopes. Skipped where FR14 blanks content on purpose
// (purged result or purged side) and where the merged history is full, since AC20 covers the cut.
export function unrecoverable(m, l, r) {
  const out = [];
  for (const x of m.items) {
    if (x.purgedAt !== null || x.history.length >= 20) continue;
    for (const side of [l, r]) {
      const s = byId(side.items, x.id);
      if (!s || s.purgedAt !== null) continue;
      const h = x.history;
      for (const k of ['title', 'type', 'notes', 'expires']) {
        if (!same(s[k], x[k]) && !h.some((e) => same(e[k], s[k]))) out.push(`${x.id}.${k}`);
      }
      for (const f of s.fields) {
        const v = fieldValue(f);
        if (same(fieldValue(byId(x.fields, f.id)), v)) continue;
        if (!h.some((e) => (e.fields ?? []).some((g) => g.id === f.id && same(fieldValue(g), v)))) out.push(`${x.id}.fields.${f.id}`);
      }
      for (const e of s.scopes) if (!x.scopes.includes(e) && !h.some((entry) => (entry.scopes ?? []).includes(e))) out.push(`${x.id}.scopes.${e}`);
    }
  }
  return out;
}

// An item is trashed or purged by the merge only when one side deleted it and no live side edited it;
// purged only when no unpurged side edited it or restored it.
export function wrongDeletions(m, b, l, r) {
  const out = [];
  for (const x of m.items) {
    const bi = byId(b.items, x.id);
    const ss = [byId(l.items, x.id), byId(r.items, x.id)].filter(Boolean);
    if (!isLive(x) && (!bi || isLive(bi))) {
      if (!ss.some((s) => !isLive(s))) out.push(`${x.id} deleted by nobody`);
      if (ss.some((s) => isLive(s) && editedContent(bi, s))) out.push(`${x.id} deleted over an edit`);
    }
    if (x.purgedAt !== null) {
      const restored = (s) => bi && bi.deletedAt !== null && s.deletedAt === null;
      if (ss.some((s) => s.purgedAt === null && (editedContent(bi, s) || restored(s)))) out.push(`${x.id} purged over an edit or restore`);
    }
  }
  return out;
}

// --- benchmark vault (AC27, NFR03) ---------------------------------------------------------------

const hex = (rnd, n) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');

// About 1 MB: 500 items × 8 fields × 20 history entries. 10% of the items are edited on both sides,
// half of those on the same field (a real conflict), the other half on different fields.
export function bigMergeCase(seed = 1) {
  const rnd = prng(seed);
  return withSeededIds(rnd, () => {
    const vault = createVault(VID);
    const ctx = (n, dev = DEVS[2]) => ({ now: T0 + n, deviceId: dev });
    const p = addProject(vault, { name: 'Load' }, ctx(0));
    const env = addEnv(vault, p.id, { name: 'uat' }, ctx(0));
    const fields = Array.from({ length: 8 }, (_, i) => ({ label: `F${i}`, kind: 'secret', v: '' }));
    for (let n = 0; n < 500; n++) {
      const item = createItem(vault, 'db', { title: `Database ${n}`, scopes: [env.id], fields }, ctx(0));
      for (let h = 0; h < 20; h++) {
        const fs = item.fields.map((f) => ({ id: f.id, v: hex(rnd, 8) }));
        updateItem(vault, item.id, { fields: fs, notes: hex(rnd, 8) }, ctx(1 + h));
      }
    }
    const b = vault;
    const l = fork(b);
    const r = fork(b);
    for (let n = 0; n < 50; n++) {
      const id = b.items[n * 10].id;
      const fs = (v) => v.items[n * 10].fields.map((f) => ({ id: f.id }));
      const lf = fs(l);
      const rf = fs(r);
      lf[0].v = 'laptop';
      (n % 2 ? rf[1] : rf[0]).v = 'phone';
      updateItem(l, id, { fields: lf }, ctx(100, DEVS[0]));
      updateItem(r, id, { fields: rf }, ctx(200, DEVS[1]));
    }
    return { b, l, r };
  });
}
