// Three-way merge of two copies of one vault against their common base (docs/05-sync.md,
// docs/09-core-api.md § merge.js). Pure: the result depends only on the three inputs.
import { KeymeshError } from './errors.js';
import { validateVault, VAULT_VERSION, HISTORY_MAX } from './model.js';

// `note` of a conflict history entry whose side moved the item to the trash while the other side
// edited it (FR19). The UI turns it into "đã bị xoá ở thiết bị khác"; the wording is not data.
export const DELETED_ELSEWHERE = 'deleted-elsewhere';

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

// Single-valued item attributes merged with their own clock (FR06). fieldOrder is kept apart: it
// follows the fields and never conflicts on its own (see mergeFieldOrder).
const ITEM_ATTRS = ['type', 'title', 'notes', 'expires', 'favorite', 'forkedFrom'];
const ITEM_KEYS = [
  'id', 'type', 'title', 'fields', 'fieldOrder', 'notes', 'tags', 'favorite', 'expires', 'scopes', 'forkedFrom',
  'clock', 'conflict', 'history', 'createdAt', 'updatedAt', 'rev', 'deletedAt', 'purgedAt',
];

const mapById = (list) => new Map(list.map((e) => [e.id, e]));
// The part of a field that its at/dev clock covers (docs/03 §1).
const fieldValue = (f) => ({ label: f.label, kind: f.kind, v: f.v, file: f.file, deletedAt: f.deletedAt });
const fieldClock = (f) => ({ at: f.at, dev: f.dev });
const sameSet = (a, b) => eq([...new Set(a)].sort(), [...new Set(b)].sort());

// Conflicts found while merging one item: which values, which sides lost one, and their clocks.
function conflictLog() {
  return { attrs: [], fields: [], losers: new Set(), at: null };
}

// Record a conflict on `name`; `loser` ('l', 'r' or null) goes to history; `at` feeds conflict.at.
function mark(log, list, name, loser, at) {
  list.push(name);
  if (loser !== null) log.losers.add(loser);
  log.at = log.at === null ? at : Math.max(log.at, at);
}

function lost(log, m, list, name, cl, cr) {
  mark(log, list, name, m.side === 'l' ? 'r' : 'l', Math.max(clockOf(cl).at, clockOf(cr).at));
}

// Set-valued attributes (FR08): one side's change is taken as is; both changed → three-way set, sorted.
function mergeSet(b, l, r) {
  const m = merge3(b, l, r);
  if (!m.conflict) return [...m.value];
  const B = new Set(b === ABSENT ? [] : b);
  const L = new Set(l);
  const R = new Set(r);
  const keep = (x) => (L.has(x) && R.has(x)) || (L.has(x) && !B.has(x)) || (R.has(x) && !B.has(x));
  return [...new Set([...l, ...r])].filter(keep).sort(cmp);
}

function mergeFields(b, l, r, log) {
  const bf = b === ABSENT ? new Map() : mapById(b.fields);
  const lf = mapById(l.fields);
  const rf = mapById(r.fields);
  const ids = mergeOrder(
    b === ABSENT ? [] : b.fields.map((f) => f.id),
    l.fields.map((f) => f.id),
    r.fields.map((f) => f.id),
  );
  return ids.map((id) => {
    const x = lf.get(id);
    const y = rf.get(id);
    if (x === undefined || y === undefined || eq(x, y)) return clone(x ?? y);
    const base = bf.get(id);
    const m = merge3(
      base === undefined ? ABSENT : fieldValue(base),
      fieldValue(x),
      fieldValue(y),
      base === undefined ? ABSENT : fieldClock(base),
      fieldClock(x),
      fieldClock(y),
    );
    if (m.conflict) lost(log, m, log.fields, id, x, y);
    const { label, kind, v, file, deletedAt } = m.value;
    const f = { id, label, kind, v };
    if (file !== undefined) f.file = file;
    return { ...f, at: m.clock.at, dev: m.clock.dev, deletedAt };
  });
}

// fieldOrder: one side's change is taken as is. Both changed → the ids kept as a three-way set, in the
// order of the side with the later clock, then the rest in the other side's order. Either way the
// result is then fitted to the merged fields: deleted fields leave it, live fields missing join the end.
function mergeFieldOrder(b, l, r, fields) {
  const m = merge3(get(b, 'fieldOrder'), l.fieldOrder, r.fieldOrder, getClock(b, 'fieldOrder'), l.clock?.fieldOrder, r.clock?.fieldOrder);
  let ids = m.value;
  if (m.conflict) {
    const set = new Set(mergeSet(get(b, 'fieldOrder'), l.fieldOrder, r.fieldOrder));
    const [first, second] = m.side === 'l' ? [l.fieldOrder, r.fieldOrder] : [r.fieldOrder, l.fieldOrder];
    ids = [...new Set([...first, ...second])].filter((id) => set.has(id));
  }
  const state = new Map(fields.map((f) => [f.id, f.deletedAt === null]));
  const out = ids.filter((id) => state.get(id) !== false);
  for (const f of fields) if (f.deletedAt === null && !out.includes(f.id)) out.push(f.id);
  return { value: out, clock: m.clock };
}

// "Edited content" (FR13): any user-editable attribute differs from base; tags/scopes compare as sets.
function editedContent(b, x) {
  if (b === ABSENT) return true;
  if ([...ITEM_ATTRS, 'fieldOrder'].some((k) => !eq(b[k], x[k]))) return true;
  const bf = mapById(b.fields);
  for (const f of x.fields) {
    const o = bf.get(f.id);
    if (o === undefined || !eq(fieldValue(o), fieldValue(f))) return true;
  }
  return !sameSet(b.tags, x.tags) || !sameSet(b.scopes, x.scopes);
}

// Attributes, fields and sets of a live item (FR04–FR08, FR15).
function mergeContent(b, l, r, log) {
  const out = { id: l.id, clock: {} };
  for (const k of ITEM_ATTRS) {
    const cl = l.clock?.[k];
    const cr = r.clock?.[k];
    const m = merge3(get(b, k), l[k], r[k], getClock(b, k), cl, cr);
    out[k] = clone(m.value);
    if (m.clock !== undefined && m.clock !== ABSENT) out.clock[k] = clone(m.clock);
    if (m.conflict) lost(log, m, log.attrs, k, cl, cr);
  }
  out.fields = mergeFields(b, l, r, log);
  const fo = mergeFieldOrder(b, l, r, out.fields);
  out.fieldOrder = fo.value;
  if (fo.clock !== undefined && fo.clock !== ABSENT) out.clock.fieldOrder = clone(fo.clock);
  out.tags = mergeSet(get(b, 'tags'), l.tags, r.tags);
  out.scopes = mergeSet(get(b, 'scopes'), l.scopes, r.scopes);
  return out;
}

// --- history and conflict marks (FR09–FR11) --------------------------------------------------------

const num = (v) => (Number.isFinite(v) ? v : 0);
const historyKey = (h) => canon([h.at ?? null, h.rev ?? null, h.dev ?? null]);
// Newest first by (at, rev, dev); a full tie falls back to the entry itself so the order is total.
const newestFirst = (x, y) => cmp(num(y.at), num(x.at)) || cmp(num(y.rev), num(x.rev)) || cmp(String(y.dev), String(x.dev)) || cmp(canon(y), canon(x));

// The pre-merge state of a side that lost at least one value. Its key comes from that side's own
// rev and latest clock, so every device merging the same three copies writes the same entry.
function conflictEntry(x, note) {
  const c = latestClock(x);
  const head = { at: c.at, rev: x.rev, dev: c.dev, reason: 'conflict' };
  if (note) head.note = DELETED_ELSEWHERE;
  return { ...head, title: x.title, type: x.type, fields: clone(x.fields), notes: x.notes, expires: x.expires, scopes: [...x.scopes] };
}

// Union by (at, rev, dev); same key with different content → the larger canon form. Entries written
// by this merge are always kept; the rest fill up to HISTORY_MAX, newest first.
function mergeHistory(b, l, r, added) {
  if (added.length === 0) {
    const m = merge3(get(b, 'history'), l.history, r.history);
    if (!m.conflict) return clone(m.value);
  }
  const byKey = new Map();
  for (const h of [...l.history, ...r.history, ...added]) {
    const k = historyKey(h);
    const o = byKey.get(k);
    if (o === undefined || canon(h) > canon(o)) byKey.set(k, h);
  }
  const fresh = new Set(added.map(historyKey));
  let room = HISTORY_MAX - fresh.size;
  const all = [...byKey.values()].sort(newestFirst);
  return clone(all.filter((h) => fresh.has(historyKey(h)) || room-- > 0));
}

const marks = (c, k) => (c === ABSENT ? ABSENT : Array.isArray(c?.[k]) ? c[k] : []);

// Earlier marks merge as sets against base (so "Đã xử lý" on one side sticks), then this merge's
// conflicts are added. conflict.at: the latest clock among this merge's conflicting values and the
// `at` of each side whose marks survive. No marks → null.
function mergeConflict(b, l, r, log) {
  const bc = get(b, 'conflict');
  const m = merge3(bc, l.conflict, r.conflict);
  if (log.attrs.length === 0 && log.fields.length === 0 && !m.conflict) return clone(m.value);
  const fields = new Set([...mergeSet(marks(bc, 'fields'), marks(l.conflict, 'fields'), marks(r.conflict, 'fields')), ...log.fields]);
  const attrs = new Set([...mergeSet(marks(bc, 'attrs'), marks(l.conflict, 'attrs'), marks(r.conflict, 'attrs')), ...log.attrs]);
  if (fields.size === 0 && attrs.size === 0) return null;
  const ats = log.at === null ? [] : [log.at];
  for (const x of [l, r]) {
    const kept = marks(x.conflict, 'fields').some((id) => fields.has(id)) || marks(x.conflict, 'attrs').some((k) => attrs.has(k));
    if (kept && Number.isFinite(x.conflict.at)) ats.push(x.conflict.at);
  }
  return { at: ats.length ? Math.max(...ats) : 0, fields: [...fields].sort(cmp), attrs: [...attrs].sort(cmp) };
}

// deletedAt of a live (not purged) item, per the trash table of docs/05 (FR13). Returns
// { value, clock, noteSide }: noteSide is the side whose trashing lost to an edit on the other side.
function mergeDeletedAt(b, l, r, log) {
  const cl = l.clock?.deletedAt;
  const cr = r.clock?.deletedAt;
  const m = merge3(b === ABSENT ? null : b.deletedAt, l.deletedAt, r.deletedAt, getClock(b, 'deletedAt'), cl, cr);
  const side = (s) => (s === 'l' ? l : r);
  const other = (s) => (s === 'l' ? 'r' : 'l');
  const at = Math.max(clockOf(cl).at, clockOf(cr).at);
  if (!m.conflict) {
    // Only one side moved it. Trashing loses to an edit of the content on the other side.
    if (m.side !== null && m.value !== null && editedContent(b, side(other(m.side)))) {
      const keep = side(other(m.side));
      mark(log, log.attrs, 'deletedAt', m.side, at);
      return { value: keep.deletedAt, clock: keep.clock?.deletedAt, noteSide: m.side };
    }
    return { value: m.value, clock: m.clock, noteSide: null };
  }
  // Both trashed at different times: the earlier one, so the 30 days count from the first deletion.
  if (l.deletedAt !== null && r.deletedAt !== null) {
    const s = l.deletedAt < r.deletedAt ? 'l' : 'r';
    return { value: side(s).deletedAt, clock: side(s).clock?.deletedAt, noteSide: null };
  }
  // One restored, the other restored and trashed again: the clock decides, unless the restoring
  // side edited the content, which always beats trashing.
  let win = m.side;
  if (m.value !== null && editedContent(b, side(other(win)))) win = other(win);
  const lose = other(win);
  mark(log, log.attrs, 'deletedAt', lose, at);
  const trashLost = side(lose).deletedAt !== null && side(win).deletedAt === null;
  return { value: side(win).deletedAt, clock: side(win).clock?.deletedAt, noteSide: trashLost ? lose : null };
}

function setClock(out, k, c) {
  if (c !== undefined && c !== ABSENT) out.clock[k] = clone(c);
  else delete out.clock[k];
}

// Neither side purged the item.
function mergeLive(b, l, r) {
  const log = conflictLog();
  const out = mergeContent(b, l, r, log);
  const del = mergeDeletedAt(b, l, r, log);
  out.deletedAt = del.value;
  setClock(out, 'deletedAt', del.clock);
  out.purgedAt = null;
  const added = [...log.losers].map((s) => conflictEntry(s === 'l' ? l : r, s === del.noteSide));
  out.history = mergeHistory(b, l, r, added);
  out.conflict = mergeConflict(b, l, r, log);
  return setMeta(order(out, ITEM_KEYS), l, r);
}

// Exactly one side purged it (FR14). An edit or a restore on the other side brings the item back with
// that side's content; the purged side has no content left, so it writes no history entry.
function mergePurge(b, p, o, l, r) {
  const restored = b !== ABSENT && b.deletedAt !== null && o.deletedAt === null;
  if (editedContent(b, o) || restored) {
    const out = clone(o);
    out.purgedAt = null;
    const log = conflictLog();
    mark(log, log.attrs, 'purgedAt', null, p.purgedAt);
    out.conflict = mergeConflict(b, l, r, log);
    return setMeta(order(out, ITEM_KEYS), l, r);
  }
  const out = clone(p);
  // The other side trashed it too (its deletedAt moved from base): keep the earlier deletion.
  const oTrashed = o.deletedAt !== null && o.deletedAt !== (b === ABSENT ? null : b.deletedAt);
  if (oTrashed && o.deletedAt < p.deletedAt) {
    out.deletedAt = o.deletedAt;
    setClock(out, 'deletedAt', o.clock?.deletedAt);
  }
  return setMeta(order(out, ITEM_KEYS), l, r);
}

// Both purged: tombstones carry no content, so no history and no marks; the earlier times are kept.
function mergeTombstones(b, l, r) {
  const out = mergeContent(b, l, r, conflictLog());
  const minTime = (x, y) => (x === null ? y : y === null ? x : Math.min(x, y));
  const first = l.deletedAt === r.deletedAt ? null : minTime(l.deletedAt, r.deletedAt) === l.deletedAt ? l : r;
  out.deletedAt = minTime(l.deletedAt, r.deletedAt);
  const c = first === null ? merge3(get(b, 'deletedAt'), l.deletedAt, r.deletedAt, getClock(b, 'deletedAt'), l.clock?.deletedAt, r.clock?.deletedAt).clock : first.clock?.deletedAt;
  setClock(out, 'deletedAt', c);
  out.purgedAt = minTime(l.purgedAt, r.purgedAt);
  out.history = [];
  out.conflict = null;
  return setMeta(order(out, ITEM_KEYS), l, r);
}

function mergeItem(b, l, r) {
  const lp = l.purgedAt !== null;
  const rp = r.purgedAt !== null;
  if (lp && rp) return mergeTombstones(b, l, r);
  if (lp) return mergePurge(b, l, r, l, r);
  if (rp) return mergePurge(b, r, l, l, r);
  return mergeLive(b, l, r);
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
