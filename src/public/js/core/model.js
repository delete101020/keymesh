import { KeymeshError } from './errors.js';
import { toHex, randomBytes } from './bytes.js';

export const VAULT_VERSION = 2;
export const HISTORY_MAX = 20;
export const ITEM_TYPES = Object.freeze(['login', 'api_key', 'token', 'ssh', 'db', 'server', 'vpn', 'doc', 'note']);
export const FIELD_KINDS = Object.freeze(['text', 'secret', 'url', 'multi', 'secret-multi', 'otp']);
export const FILE_KINDS = Object.freeze(['multi', 'secret-multi']);

const tpl = (label, kind, file) => Object.freeze(file ? { label, kind, file } : { label, kind });

// docs/03 §1 "Mẫu field theo loại item". No template carries an `otp` field.
export const ITEM_TEMPLATES = Object.freeze({
  login: Object.freeze([tpl('Username', 'text'), tpl('Password', 'secret'), tpl('URL', 'url')]),
  api_key: Object.freeze([tpl('API key', 'secret'), tpl('Secret', 'secret'), tpl('Endpoint', 'url')]),
  token: Object.freeze([tpl('Token', 'secret-multi')]),
  ssh: Object.freeze([tpl('Private key', 'secret-multi'), tpl('Public key', 'multi'), tpl('Passphrase', 'secret')]),
  db: Object.freeze([
    tpl('Host', 'text'),
    tpl('Port', 'text'),
    tpl('Database', 'text'),
    tpl('Username', 'text'),
    tpl('Password', 'secret'),
    tpl('Connection string', 'secret'),
  ]),
  server: Object.freeze([tpl('Host', 'text'), tpl('Username', 'text'), tpl('Password', 'secret'), tpl('Admin URL', 'url')]),
  vpn: Object.freeze([tpl('Server', 'text'), tpl('Username', 'text'), tpl('Password', 'secret'), tpl('Cấu hình', 'secret-multi', 'client.ovpn')]),
  doc: Object.freeze([tpl('URL', 'url')]),
  note: Object.freeze([]),
});

const ID_PREFIX = Object.freeze({ project: 'p', env: 'e', item: 'i', field: 'f', device: 'd' });
const ID_RE = /^(?:[pefid]_)?[0-9a-f]{16}$/;
const VAULT_ID_RE = /^[0-9a-f]{16}$/;

// Attributes whose change archives the previous version (docs/03 §1 "Thay đổi đáng lưu lịch sử").
const HISTORY_ATTRS = ['title', 'type', 'fields', 'notes', 'expires', 'scopes'];
// Single-valued item attributes with their own clock; tags and scopes are sets and have none.
const ITEM_CLOCKED = ['type', 'title', 'notes', 'favorite', 'expires', 'forkedFrom', 'fieldOrder'];

const fail = (detail) => {
  throw new KeymeshError('invalid', detail);
};

export function newId(kind) {
  const prefix = ID_PREFIX[kind];
  if (!prefix) fail('kind');
  return `${prefix}_${toHex(randomBytes(8))}`;
}

// Accepts prefixed and bare 16-hex ids alike; the prefix never decides the entity type (Q7).
export function isId(s) {
  return typeof s === 'string' && ID_RE.test(s);
}

function stamp(ctx) {
  if (!ctx || !Number.isFinite(ctx.now) || typeof ctx.deviceId !== 'string' || !ctx.deviceId) fail('ctx');
  return { at: ctx.now, dev: ctx.deviceId };
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function touch(entity, ctx) {
  entity.rev += 1;
  entity.updatedAt = ctx.now;
}

function find(list, id, detail) {
  const e = Array.isArray(list) ? list.find((x) => x.id === id) : undefined;
  if (!e) fail(detail);
  return e;
}

const isStr = (v) => typeof v === 'string';
const isNullableStr = (v) => v === null || typeof v === 'string';
const isStrArray = (v) => Array.isArray(v) && v.every(isStr);
const isIdArray = (v) => Array.isArray(v) && v.every(isId);

// --- vault ---------------------------------------------------------------------------------------

export function createVault(vaultId) {
  if (typeof vaultId !== 'string' || !VAULT_ID_RE.test(vaultId)) fail('vaultId');
  return { v: VAULT_VERSION, vaultId, projects: [], envs: [], items: [] };
}

// --- projects and envs ---------------------------------------------------------------------------

function nextOrder(list, pred = () => true) {
  return list.filter((x) => x.deletedAt === null && pred(x)).length;
}

// Apply `patch` to the clocked attributes `keys` of a project or env; returns whether anything changed.
function patchClocked(entity, patch, keys, checks, ctx) {
  const c = stamp(ctx);
  const changes = keys.filter((k) => k in patch && !same(patch[k], entity[k]));
  // Check every value before writing any, so a failed patch leaves the entity untouched.
  for (const k of changes) if (!checks[k](patch[k])) fail(k);
  for (const k of changes) {
    entity[k] = patch[k];
    entity.clock[k] = { ...c };
  }
  if (changes.length > 0) touch(entity, ctx);
  return changes.length > 0;
}

const PROJECT_CHECKS = { name: isStr, order: Number.isFinite };
const ENV_CHECKS = { name: isStr, order: Number.isFinite, color: isNullableStr };

export function addProject(vault, init, ctx) {
  const c = stamp(ctx);
  const { name = '', order = nextOrder(vault.projects) } = init ?? {};
  if (!isStr(name)) fail('name');
  if (!Number.isFinite(order)) fail('order');
  const project = {
    id: newId('project'),
    name,
    order,
    clock: { name: { ...c }, order: { ...c } },
    createdAt: ctx.now,
    updatedAt: ctx.now,
    rev: 1,
    deletedAt: null,
  };
  vault.projects.push(project);
  return project;
}

export function updateProject(vault, projectId, patch, ctx) {
  const project = find(vault.projects, projectId, 'projectId');
  if (project.deletedAt !== null) fail('projectId');
  patchClocked(project, patch ?? {}, ['name', 'order'], PROJECT_CHECKS, ctx);
  return project;
}

function tombstone(entity, ctx) {
  if (entity.deletedAt !== null) return false;
  entity.deletedAt = ctx.now;
  touch(entity, ctx);
  return true;
}

// Tombstones the project and every live env in it; items keep those env ids in `scopes`.
export function deleteProject(vault, projectId, ctx) {
  stamp(ctx);
  const project = find(vault.projects, projectId, 'projectId');
  tombstone(project, ctx);
  for (const env of vault.envs) if (env.projectId === projectId) tombstone(env, ctx);
  return project;
}

export function addEnv(vault, projectId, init, ctx) {
  const c = stamp(ctx);
  const project = find(vault.projects, projectId, 'projectId');
  if (project.deletedAt !== null) fail('projectId');
  const { name = '', order = nextOrder(vault.envs, (e) => e.projectId === projectId), color = null } = init ?? {};
  if (!isStr(name)) fail('name');
  if (!Number.isFinite(order)) fail('order');
  if (!isNullableStr(color)) fail('color');
  const env = {
    id: newId('env'),
    projectId,
    name,
    order,
    color,
    clock: { name: { ...c }, order: { ...c }, color: { ...c } },
    createdAt: ctx.now,
    updatedAt: ctx.now,
    rev: 1,
    deletedAt: null,
  };
  vault.envs.push(env);
  return env;
}

export function updateEnv(vault, envId, patch, ctx) {
  const env = find(vault.envs, envId, 'envId');
  if (env.deletedAt !== null) fail('envId');
  patchClocked(env, patch ?? {}, ['name', 'order', 'color'], ENV_CHECKS, ctx);
  return env;
}

export function deleteEnv(vault, envId, ctx) {
  stamp(ctx);
  const env = find(vault.envs, envId, 'envId');
  tombstone(env, ctx);
  return env;
}

// --- fields and items ----------------------------------------------------------------------------

function checkFieldShape({ label, kind, v, file }) {
  if (!isStr(label)) fail('field.label');
  if (!FIELD_KINDS.includes(kind)) fail('field.kind');
  if (!isStr(v)) fail('field.v');
  if (file !== undefined && (!FILE_KINDS.includes(kind) || !isStr(file) || file === '')) fail('field.file');
}

export function newField(init, ctx) {
  const c = stamp(ctx);
  const { label = '', kind = 'text', v = '', file } = init ?? {};
  checkFieldShape({ label, kind, v, file });
  const field = { id: newId('field'), label, kind, v };
  if (file !== undefined) field.file = file;
  return { ...field, at: c.at, dev: c.dev, deletedAt: null };
}

const ITEM_CHECKS = {
  type: (v) => ITEM_TYPES.includes(v),
  title: isStr,
  notes: isStr,
  favorite: (v) => typeof v === 'boolean',
  expires: isNullableStr,
  forkedFrom: (v) => v === null || isId(v),
  fieldOrder: isStrArray,
  tags: isStrArray,
  scopes: isIdArray,
};

export function createItem(vault, type, init, ctx) {
  const c = stamp(ctx);
  if (!ITEM_TYPES.includes(type)) fail('type');
  const i = init ?? {};
  const fields = (i.fields ?? ITEM_TEMPLATES[type]).map((f) => newField(f, ctx));
  const item = {
    id: newId('item'),
    type,
    title: i.title ?? '',
    fields,
    fieldOrder: fields.map((f) => f.id),
    notes: i.notes ?? '',
    tags: i.tags ?? [],
    favorite: i.favorite ?? false,
    expires: i.expires ?? null,
    scopes: i.scopes ?? [],
    forkedFrom: i.forkedFrom ?? null,
    clock: {},
    conflict: null,
    history: [],
    createdAt: ctx.now,
    updatedAt: ctx.now,
    rev: 1,
    deletedAt: null,
    purgedAt: null,
  };
  for (const k of ['title', 'notes', 'tags', 'favorite', 'expires', 'scopes', 'forkedFrom']) {
    if (!ITEM_CHECKS[k](item[k])) fail(k);
  }
  item.tags = [...item.tags];
  item.scopes = [...item.scopes];
  for (const k of [...ITEM_CLOCKED, 'deletedAt']) item.clock[k] = { ...c };
  vault.items.push(item);
  return item;
}

function liveItem(vault, itemId) {
  const item = find(vault.items, itemId, 'itemId');
  if (item.purgedAt !== null) fail('itemId');
  return item;
}

// Merge the caller's field drafts into item.fields. A draft with a known id updates that field
// (its at/dev move only if label/kind/v/file differ); a draft without id is a new field; a live
// field missing from the drafts is tombstoned. Returns whether any field changed.
function applyFields(item, drafts, ctx) {
  if (!Array.isArray(drafts)) fail('fields');
  const c = stamp(ctx);
  const byId = new Map(item.fields.map((f) => [f.id, f]));
  const seen = new Set();
  let changed = false;
  const order = [];
  for (const d of drafts) {
    if (d === null || typeof d !== 'object') fail('fields');
    if (d.id === undefined) {
      const f = newField(d, ctx);
      item.fields.push(f);
      order.push(f.id);
      changed = true;
      continue;
    }
    const f = byId.get(d.id);
    if (!f || f.deletedAt !== null || seen.has(d.id)) fail('fields');
    seen.add(d.id);
    order.push(f.id);
    const next = { label: d.label ?? f.label, kind: d.kind ?? f.kind, v: d.v ?? f.v, file: 'file' in d ? d.file : f.file };
    if (next.file === null) next.file = undefined;
    checkFieldShape(next);
    if (next.label === f.label && next.kind === f.kind && next.v === f.v && next.file === f.file) continue;
    f.label = next.label;
    f.kind = next.kind;
    f.v = next.v;
    if (next.file === undefined) delete f.file;
    else f.file = next.file;
    f.at = c.at;
    f.dev = c.dev;
    changed = true;
  }
  for (const f of item.fields) {
    if (f.deletedAt === null && !order.includes(f.id)) {
      f.deletedAt = ctx.now;
      f.at = c.at;
      f.dev = c.dev;
      changed = true;
    }
  }
  return { changed, order };
}

function snapshot(item) {
  return {
    title: item.title,
    type: item.type,
    fields: clone(item.fields),
    notes: item.notes,
    expires: item.expires,
    scopes: [...item.scopes],
  };
}

// Save a new state of an item. `draft` holds only the attributes the caller is changing; values
// equal to the current ones are not changes. One call is one save: rev + 1, and at most one history
// entry holding the state from before this save. A draft that fails validation changes nothing.
export function updateItem(vault, itemId, draft, ctx) {
  stamp(ctx);
  const item = liveItem(vault, itemId);
  if (item.deletedAt !== null) fail('itemId');
  // applyFields validates as it goes, so a failure midway is rolled back from a copy taken first.
  const saved = clone(item);
  try {
    return saveItem(item, draft ?? {}, ctx);
  } catch (err) {
    for (const k of Object.keys(item)) delete item[k];
    Object.assign(item, saved);
    throw err;
  }
}

function saveItem(item, d, ctx, { reason = 'edit', before = snapshot(item), changed = [] } = {}) {
  const c = stamp(ctx);
  const changedAttrs = new Set(changed);

  if ('fields' in d) {
    const { changed, order } = applyFields(item, d.fields, ctx);
    if (changed) changedAttrs.add('fields');
    if (!('fieldOrder' in d) && !same(order, item.fieldOrder)) {
      item.fieldOrder = order;
      item.clock.fieldOrder = { ...c };
      changedAttrs.add('fieldOrder');
    }
  }
  for (const k of [...ITEM_CLOCKED, 'tags', 'scopes']) {
    if (!(k in d) || same(d[k], item[k])) continue;
    if (!ITEM_CHECKS[k](d[k])) fail(k);
    item[k] = Array.isArray(d[k]) ? [...d[k]] : d[k];
    if (ITEM_CLOCKED.includes(k)) item.clock[k] = { ...c };
    changedAttrs.add(k);
  }

  if (changedAttrs.size === 0) return item;
  if (HISTORY_ATTRS.some((k) => changedAttrs.has(k))) {
    item.history.unshift({ at: c.at, rev: item.rev, dev: c.dev, reason, ...before });
    item.history.length = Math.min(item.history.length, HISTORY_MAX);
  }
  touch(item, ctx);
  return item;
}

// Put title, fields, notes and expires back to a history entry, as one save with reason 'restore'.
// Scopes stay as they are (restoring them would re-attach an env that was forked away), the field ids
// stay so merge still pairs them up, and every restored value gets a fresh clock. The entry has no
// fieldOrder: the current order is kept and fields that come back are appended.
export function restoreItemVersion(vault, itemId, entry, ctx) {
  const c = stamp(ctx);
  const item = liveItem(vault, itemId);
  if (item.deletedAt !== null) fail('itemId');
  if (entry === null || typeof entry !== 'object' || !Array.isArray(entry.fields)) fail('entry');
  for (const f of entry.fields) {
    if (f === null || typeof f !== 'object' || !isId(f.id)) fail('entry');
    checkFieldShape(f);
  }
  for (const k of ['title', 'notes', 'expires']) if (!ITEM_CHECKS[k](entry[k])) fail('entry');
  const live = entry.fields.filter((f) => f.deletedAt === null);
  const saved = clone(item);
  try {
    const before = snapshot(item);
    let revived = false;
    for (const f of live) {
      const current = item.fields.find((x) => x.id === f.id);
      if (!current) item.fields.push({ ...clone(f), at: c.at, dev: c.dev, deletedAt: null });
      else if (current.deletedAt !== null) Object.assign(current, { at: c.at, dev: c.dev, deletedAt: null });
      else continue;
      revived = true;
    }
    const ids = new Set(live.map((f) => f.id));
    const kept = item.fieldOrder.filter((id) => ids.has(id));
    const draft = {
      title: entry.title,
      notes: entry.notes,
      expires: entry.expires,
      fields: live.map((f) => ({ id: f.id, label: f.label, kind: f.kind, v: f.v, file: f.file ?? null })),
      fieldOrder: [...kept, ...live.map((f) => f.id).filter((id) => !kept.includes(id))],
    };
    return saveItem(item, draft, ctx, { reason: 'restore', before, changed: revived ? ['fields'] : [] });
  } catch (err) {
    for (const k of Object.keys(item)) delete item[k];
    Object.assign(item, saved);
    throw err;
  }
}

export function trashItem(vault, itemId, ctx) {
  const c = stamp(ctx);
  const item = liveItem(vault, itemId);
  if (item.deletedAt !== null) return item;
  item.deletedAt = ctx.now;
  item.clock.deletedAt = { ...c };
  touch(item, ctx);
  return item;
}

export function restoreItem(vault, itemId, ctx) {
  const c = stamp(ctx);
  const item = liveItem(vault, itemId);
  if (item.deletedAt === null) return item;
  item.deletedAt = null;
  item.clock.deletedAt = { ...c };
  touch(item, ctx);
  return item;
}

// Purge keeps the schema keys so the tombstone still validates, but blanks all user content.
// Only id, deletedAt and purgedAt carry meaning afterwards; type/rev/timestamps/clock are not secret.
export function purgeItem(vault, itemId, ctx) {
  const c = stamp(ctx);
  const item = find(vault.items, itemId, 'itemId');
  if (item.purgedAt !== null) return item;
  if (item.deletedAt === null) {
    item.deletedAt = ctx.now;
    item.clock.deletedAt = { ...c };
  }
  Object.assign(item, {
    title: '',
    fields: [],
    fieldOrder: [],
    notes: '',
    tags: [],
    favorite: false,
    expires: null,
    scopes: [],
    forkedFrom: null,
    conflict: null,
    history: [],
    purgedAt: ctx.now,
  });
  touch(item, ctx);
  return item;
}

// --- validation ----------------------------------------------------------------------------------

// Messages are fixed per code; the path says where. Neither ever contains vault content.
const VALIDATION_MESSAGES = Object.freeze({
  version: 'Unsupported vault version',
  required: 'Missing required field',
  type: 'Wrong value type',
  enum: 'Unknown value',
  'file-kind': 'file is only allowed on multi and secret-multi fields',
  'duplicate-id': 'Duplicate id',
  'dangling-ref': 'Reference to a missing entity',
  'history-max': `History longer than ${HISTORY_MAX}`,
});

export function validateVault(vault) {
  const errors = [];
  const err = (path, code) => errors.push({ path, code, message: VALIDATION_MESSAGES[code] });

  // check(path, value, pred): missing → required, present but failing pred → type.
  const check = (path, obj, key, pred) => {
    if (!(key in obj) || obj[key] === undefined) return err(path, 'required'), false;
    if (!pred(obj[key])) return err(path, 'type'), false;
    return true;
  };
  const isTime = Number.isFinite;
  const isNullableTime = (v) => v === null || Number.isFinite(v);
  const isRev = (v) => Number.isSafeInteger(v) && v >= 1;
  const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const isClockEntry = (v) => isObj(v) && Number.isFinite(v.at) && isStr(v.dev);
  const isClock = (v) => isObj(v) && Object.values(v).every(isClockEntry);

  if (!isObj(vault)) {
    err('', 'type');
    return { ok: false, errors };
  }
  if (!('v' in vault)) err('v', 'required');
  else if (vault.v !== VAULT_VERSION) err('v', 'version');
  check('vaultId', vault, 'vaultId', (v) => isStr(v) && VAULT_ID_RE.test(v));

  const lists = {};
  for (const key of ['projects', 'envs', 'items']) {
    lists[key] = check(key, vault, key, Array.isArray) ? vault[key] : [];
  }

  const dupes = (list, base) => {
    const seen = new Set();
    list.forEach((e, i) => {
      if (!isObj(e) || !isId(e.id)) return;
      if (seen.has(e.id)) err(`${base}[${i}].id`, 'duplicate-id');
      seen.add(e.id);
    });
  };

  const common = (e, p) => {
    check(`${p}.id`, e, 'id', isId);
    check(`${p}.clock`, e, 'clock', isClock);
    check(`${p}.createdAt`, e, 'createdAt', isTime);
    check(`${p}.updatedAt`, e, 'updatedAt', isTime);
    check(`${p}.rev`, e, 'rev', isRev);
    check(`${p}.deletedAt`, e, 'deletedAt', isNullableTime);
  };

  lists.projects.forEach((e, i) => {
    const p = `projects[${i}]`;
    if (!isObj(e)) return err(p, 'type');
    common(e, p);
    check(`${p}.name`, e, 'name', isStr);
    check(`${p}.order`, e, 'order', Number.isFinite);
  });
  dupes(lists.projects, 'projects');

  const projectIds = new Set(lists.projects.filter(isObj).map((x) => x.id));
  lists.envs.forEach((e, i) => {
    const p = `envs[${i}]`;
    if (!isObj(e)) return err(p, 'type');
    common(e, p);
    if (check(`${p}.projectId`, e, 'projectId', isId) && !projectIds.has(e.projectId)) err(`${p}.projectId`, 'dangling-ref');
    check(`${p}.name`, e, 'name', isStr);
    check(`${p}.order`, e, 'order', Number.isFinite);
    check(`${p}.color`, e, 'color', isNullableStr);
  });
  dupes(lists.envs, 'envs');

  lists.items.forEach((e, i) => {
    const p = `items[${i}]`;
    if (!isObj(e)) return err(p, 'type');
    common(e, p);
    if (check(`${p}.type`, e, 'type', isStr) && !ITEM_TYPES.includes(e.type)) err(`${p}.type`, 'enum');
    check(`${p}.title`, e, 'title', isStr);
    check(`${p}.fieldOrder`, e, 'fieldOrder', isStrArray);
    check(`${p}.notes`, e, 'notes', isStr);
    check(`${p}.tags`, e, 'tags', isStrArray);
    check(`${p}.favorite`, e, 'favorite', (v) => typeof v === 'boolean');
    check(`${p}.expires`, e, 'expires', isNullableStr);
    check(`${p}.scopes`, e, 'scopes', isIdArray);
    check(`${p}.forkedFrom`, e, 'forkedFrom', (v) => v === null || isId(v));
    check(`${p}.conflict`, e, 'conflict', (v) => v === null || isObj(v));
    check(`${p}.purgedAt`, e, 'purgedAt', isNullableTime);
    if (check(`${p}.history`, e, 'history', (v) => Array.isArray(v) && v.every(isObj)) && e.history.length > HISTORY_MAX) {
      err(`${p}.history`, 'history-max');
    }
    if (!check(`${p}.fields`, e, 'fields', Array.isArray)) return;
    e.fields.forEach((f, j) => {
      const fp = `${p}.fields[${j}]`;
      if (!isObj(f)) return err(fp, 'type');
      check(`${fp}.id`, f, 'id', isId);
      check(`${fp}.label`, f, 'label', isStr);
      const kindOk = check(`${fp}.kind`, f, 'kind', isStr);
      if (kindOk && !FIELD_KINDS.includes(f.kind)) err(`${fp}.kind`, 'enum');
      check(`${fp}.v`, f, 'v', isStr);
      check(`${fp}.at`, f, 'at', isTime);
      check(`${fp}.dev`, f, 'dev', isStr);
      check(`${fp}.deletedAt`, f, 'deletedAt', isNullableTime);
      if ('file' in f) {
        if (!isStr(f.file) || f.file === '') err(`${fp}.file`, 'type');
        else if (kindOk && !FILE_KINDS.includes(f.kind)) err(`${fp}.file`, 'file-kind');
      }
    });
    dupes(e.fields, `${p}.fields`);
  });
  dupes(lists.items, 'items');

  return errors.length ? { ok: false, errors } : { ok: true };
}
