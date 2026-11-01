// Three-way merge of two copies of one vault against their common base (docs/05-sync.md,
// docs/09-core-api.md § merge.js). Pure: the result depends only on the three inputs.
import { KeymeshError } from './errors.js';
import { validateVault, VAULT_VERSION } from './model.js';

const NO_CLOCK = Object.freeze({ at: 0, dev: '' });
// Stands for "this entity or value is not in base" (two sides created the same id, FR15).
const ABSENT = Symbol('absent');

// --- comparison ----------------------------------------------------------------------------------

// JSON with sorted keys and undefined dropped: equal values give equal strings whatever the key order.
function canon(v) {
  if (v === null || typeof v !== 'object') return v === undefined ? 'null' : JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const keys = Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
}

const eq = (a, b) => a === b || (a !== ABSENT && b !== ABSENT && canon(a) === canon(b));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function clockOf(c) {
  return c && Number.isFinite(c.at) ? c : NO_CLOCK;
}

// > 0 when clock ca (holding value va) beats cb (holding vb): later at, then larger dev, then larger value.
function beats(ca, va, cb, vb) {
  const a = clockOf(ca);
  const b = clockOf(cb);
  return cmp(a.at, b.at) || cmp(a.dev, b.dev) || cmp(canon(va), canon(vb));
}

// --- merge3 --------------------------------------------------------------------------------------

// One value with its clock. Returns { value, clock, side, conflict }: side is 'l', 'r' or null
// (both sides hold the value); conflict is true when both sides changed it to different values.
function merge3(b, l, r, cb, cl, cr) {
  if (eq(l, r)) {
    // Both hold the same value: keep the clock of the side that moved it, else the later one.
    let clock = cl;
    if (eq(cl, cb)) clock = cr;
    else if (!eq(cr, cb) && beats(cr, r, cl, l) > 0) clock = cr;
    return { value: l, clock, side: null, conflict: false };
  }
  if (eq(l, b)) return { value: r, clock: cr, side: 'r', conflict: false };
  if (eq(r, b)) return { value: l, clock: cl, side: 'l', conflict: false };
  return beats(cl, l, cr, r) > 0
    ? { value: l, clock: cl, side: 'l', conflict: true }
    : { value: r, clock: cr, side: 'r', conflict: true };
}

// Order of the id lists of a table (or of item.fields). Every id of l and r is kept exactly once.
function mergeOrder(b, l, r) {
  const fill = (first, other) => {
    const seen = new Set(first);
    return [...first, ...other.filter((id) => !seen.has(id))];
  };
  if (eq(l, r)) return [...l];
  if (eq(l, b)) return fill(r, l);
  if (eq(r, b)) return fill(l, r);
  // Both reordered: base ids in base order, then each side's new ids as a group, smaller first id first.
  const inSides = new Set([...l, ...r]);
  const out = b.filter((id) => inSides.has(id));
  const seen = new Set(out);
  const groups = [l, r]
    .map((side) => side.filter((id) => !seen.has(id)))
    .filter((g) => g.length > 0)
    .sort((x, y) => cmp(x[0], y[0]));
  for (const g of groups) {
    for (const id of g) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// --- entity metadata (FR12) ----------------------------------------------------------------------

function withoutMeta(e) {
  const { rev, updatedAt, ...rest } = e;
  return rest;
}

function latestClock(entity) {
  let best = NO_CLOCK;
  for (const c of Object.values(entity.clock ?? {})) if (beats(c, null, best, null) > 0) best = c;
  for (const f of entity.fields ?? []) if (beats(f, null, best, null) > 0) best = f;
  return best;
}

// rev/updatedAt of the merged entity: those of the side it equals, else max rev + 1.
function setMeta(out, l, r) {
  out.createdAt = Math.min(l.createdAt, r.createdAt);
  const body = withoutMeta(out);
  const sameL = eq(body, withoutMeta(l));
  const sameR = eq(body, withoutMeta(r));
  let from = null;
  if (sameL && sameR) from = (cmp(l.rev, r.rev) || cmp(l.updatedAt, r.updatedAt)) >= 0 ? l : r;
  else if (sameL) from = l;
  else if (sameR) from = r;
  if (from) {
    out.rev = from.rev;
    out.updatedAt = from.updatedAt;
  } else {
    out.rev = Math.max(l.rev, r.rev) + 1;
    out.updatedAt = Math.max(l.updatedAt, r.updatedAt, latestClock(out).at);
  }
  return out;
}

// --- projects and envs (FR16, FR17) ---------------------------------------------------------------

const getClock = (e, k) => (e === ABSENT ? ABSENT : e.clock?.[k]);
const get = (e, k) => (e === ABSENT ? ABSENT : e[k]);

// deletedAt of a project or env, which has no clock: one side's change wins, both deleted → earlier.
function mergeTombstoneTime(b, l, r) {
  const m = merge3(b, l, r);
  if (!m.conflict) return m.value;
  if (l !== null && r !== null) return Math.min(l, r);
  return l ?? r;
}

function mergeClocked(out, b, l, r, keys) {
  out.clock = {};
  for (const k of keys) {
    const m = merge3(get(b, k), l[k], r[k], getClock(b, k), l.clock?.[k], r.clock?.[k]);
    out[k] = clone(m.value);
    if (m.clock !== undefined && m.clock !== ABSENT) out.clock[k] = clone(m.clock);
  }
}

function mergeProject(b, l, r) {
  const out = { id: l.id };
  mergeClocked(out, b, l, r, ['name', 'order']);
  out.deletedAt = mergeTombstoneTime(get(b, 'deletedAt'), l.deletedAt, r.deletedAt);
  return setMeta(order(out, PROJECT_KEYS), l, r);
}

function mergeEnv(b, l, r) {
  const out = { id: l.id };
  // projectId never changes after creation; it can differ only when both sides created the id.
  const p = merge3(get(b, 'projectId'), l.projectId, r.projectId);
  if (p.conflict) {
    out.projectId = (cmp(l.updatedAt, r.updatedAt) || cmp(canon(l.projectId), canon(r.projectId))) > 0 ? l.projectId : r.projectId;
  } else out.projectId = p.value;
  mergeClocked(out, b, l, r, ['name', 'order', 'color']);
  out.deletedAt = mergeTombstoneTime(get(b, 'deletedAt'), l.deletedAt, r.deletedAt);
  return setMeta(order(out, ENV_KEYS), l, r);
}

const PROJECT_KEYS = ['id', 'name', 'order', 'clock', 'createdAt', 'updatedAt', 'rev', 'deletedAt'];
const ENV_KEYS = ['id', 'projectId', 'name', 'order', 'color', 'clock', 'createdAt', 'updatedAt', 'rev', 'deletedAt'];

// Rebuild `obj` with its keys in schema order (the order model.js creates them in).
function order(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

// --- items ---------------------------------------------------------------------------------------

function mergeItem(b, l, r) {
  throw new KeymeshError('unsupported', 'item');
}

// --- vault ---------------------------------------------------------------------------------------

// Step 1 of docs/05: per entity id, over the union of the ids of the three copies.
function mergeTable(bList, lList, rList, mergeEntity) {
  const byId = (list) => new Map(list.map((e) => [e.id, e]));
  const bm = byId(bList);
  const lm = byId(lList);
  const rm = byId(rList);
  const ids = mergeOrder(
    bList.map((e) => e.id),
    lList.map((e) => e.id),
    rList.map((e) => e.id),
  );
  const out = [];
  for (const id of ids) {
    const l = lm.get(id);
    const r = rm.get(id);
    if (l === undefined || r === undefined || eq(l, r)) out.push(clone(l ?? r));
    else out.push(mergeEntity(bm.has(id) ? bm.get(id) : ABSENT, l, r));
  }
  return out;
}

function check(vault, name) {
  if (!validateVault(vault).ok) throw new KeymeshError('invalid', name);
}

export function merge(base, local, remote) {
  check(local, 'local');
  check(remote, 'remote');
  const b = base ?? { v: VAULT_VERSION, vaultId: local.vaultId, projects: [], envs: [], items: [] };
  if (base !== null && base !== undefined) check(base, 'base');
  if (local.v !== remote.v || b.v !== local.v) throw new KeymeshError('invalid', 'v');
  if (local.vaultId !== remote.vaultId || b.vaultId !== local.vaultId) throw new KeymeshError('invalid', 'vaultId');
  return {
    v: local.v,
    vaultId: local.vaultId,
    projects: mergeTable(b.projects, local.projects, remote.projects, mergeProject),
    envs: mergeTable(b.envs, local.envs, remote.envs, mergeEnv),
    items: mergeTable(b.items, local.items, remote.items, mergeItem),
  };
}
