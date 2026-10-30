import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_MAX,
  ITEM_TYPES,
  FIELD_KINDS,
  ITEM_TEMPLATES,
  newId,
  isId,
  createVault,
  addProject,
  updateProject,
  deleteProject,
  addEnv,
  updateEnv,
  deleteEnv,
  createItem,
  newField,
  updateItem,
  trashItem,
  restoreItem,
  purgeItem,
  validateVault,
} from '../src/public/js/core/model.js';
import { ctx, T0, DEV_A, DEV_B, hasCode, readCoreSource } from '../testkit/helpers.js';

const VID = '3f9c1a0b7d2e4c58';
const live = (item) => item.fields.filter((f) => f.deletedAt === null);

test('FR13 createVault gives an empty v2 vault that validates', () => {
  const v = createVault(VID);
  assert.deepEqual(v, { v: 2, vaultId: VID, projects: [], envs: [], items: [] });
  assert.deepEqual(validateVault(v), { ok: true });
  assert.throws(() => createVault('p_3f9c1a0b7d2e4c58'), hasCode('invalid'));
});

// Copied by hand from docs/03 §1 "Mẫu field theo loại item" (label, kind, order).
const EXPECTED_TEMPLATES = {
  login: [['Username', 'text'], ['Password', 'secret'], ['URL', 'url']],
  api_key: [['API key', 'secret'], ['Secret', 'secret'], ['Endpoint', 'url']],
  token: [['Token', 'secret-multi']],
  ssh: [['Private key', 'secret-multi'], ['Public key', 'multi'], ['Passphrase', 'secret']],
  db: [['Host', 'text'], ['Port', 'text'], ['Database', 'text'], ['Username', 'text'], ['Password', 'secret'], ['Connection string', 'secret']],
  server: [['Host', 'text'], ['Username', 'text'], ['Password', 'secret'], ['Admin URL', 'url']],
  vpn: [['Server', 'text'], ['Username', 'text'], ['Password', 'secret'], ['Cấu hình', 'secret-multi']],
  doc: [['URL', 'url']],
  note: [],
};

test('AC14 FR15 createItem uses the docs/03 template for each of the 9 types', () => {
  assert.deepEqual([...ITEM_TYPES], Object.keys(EXPECTED_TEMPLATES));
  const vault = createVault(VID);
  for (const type of ITEM_TYPES) {
    const item = createItem(vault, type, {}, ctx());
    assert.deepEqual(item.fields.map((f) => [f.label, f.kind]), EXPECTED_TEMPLATES[type], type);
    assert.deepEqual(item.fieldOrder, item.fields.map((f) => f.id));
    assert.ok(item.fields.every((f) => f.kind !== 'otp'), `${type} has no otp field`);
    for (const f of item.fields) assert.equal('file' in f, type === 'vpn' && f.label === 'Cấu hình');
  }
  const vpn = vault.items.find((i) => i.type === 'vpn');
  assert.equal(vpn.fields[3].file, 'client.ovpn');
  assert.throws(() => createItem(vault, 'wifi', {}, ctx()), hasCode('invalid'));
  assert.deepEqual(validateVault(vault), { ok: true });
});

test('AC14 ITEM_TEMPLATES is frozen so callers cannot change the templates', () => {
  assert.ok(Object.isFrozen(ITEM_TEMPLATES));
  assert.ok(Object.isFrozen(ITEM_TEMPLATES.login));
  assert.ok(Object.isFrozen(ITEM_TEMPLATES.login[0]));
});

test('FR13 a new item has every schema key with its default and a clock per single attribute', () => {
  const item = createItem(createVault(VID), 'login', { title: 'Portal' }, ctx());
  assert.deepEqual(Object.keys(item), [
    'id', 'type', 'title', 'fields', 'fieldOrder', 'notes', 'tags', 'favorite', 'expires', 'scopes', 'forkedFrom',
    'clock', 'conflict', 'history', 'createdAt', 'updatedAt', 'rev', 'deletedAt', 'purgedAt',
  ]);
  assert.deepEqual(Object.keys(item.clock).sort(), ['deletedAt', 'expires', 'favorite', 'fieldOrder', 'forkedFrom', 'notes', 'title', 'type']);
  assert.equal(item.rev, 1);
  assert.equal(item.createdAt, T0);
  assert.equal(item.deletedAt, null);
  assert.equal(item.purgedAt, null);
  assert.equal(item.conflict, null);
});

test('AC15 FR14 new ids carry the right prefix and 16 lowercase hex', () => {
  const prefixes = { project: 'p', env: 'e', item: 'i', field: 'f', device: 'd' };
  for (const [kind, p] of Object.entries(prefixes)) {
    const ids = new Set();
    for (let n = 0; n < 1000; n++) {
      const id = newId(kind);
      assert.match(id, /^[pefid]_[0-9a-f]{16}$/);
      assert.equal(id[0], p);
      ids.add(id);
    }
    assert.equal(ids.size, 1000);
  }
  assert.throws(() => newId('vault'), hasCode('invalid'));
});

test('AC15 FR14 bare 16-hex ids validate, and the prefix does not decide the entity type', () => {
  assert.ok(isId('0123456789abcdef'));
  assert.ok(isId('e_0123456789abcdef'));
  assert.ok(!isId('x_0123456789abcdef'));
  assert.ok(!isId('0123456789ABCDEF'));
  const vault = createVault(VID);
  const item = createItem(vault, 'login', {}, ctx());
  item.id = '0123456789abcdef';
  item.fields[0].id = 'p_0123456789abcdef'; // a "project" prefix on a field is still just an id
  assert.deepEqual(validateVault(vault), { ok: true });
});

test('FR16 file is only allowed on multi and secret-multi, and must be a non-empty string', () => {
  assert.equal(newField({ label: 'Cfg', kind: 'multi', v: 'x', file: 'a.conf' }, ctx()).file, 'a.conf');
  assert.equal(newField({ label: 'Key', kind: 'secret-multi', v: 'x', file: 'id_rsa' }, ctx()).file, 'id_rsa');
  for (const kind of ['text', 'secret', 'url', 'otp']) {
    assert.throws(() => newField({ label: 'X', kind, v: '', file: 'a.txt' }, ctx()), hasCode('invalid'), kind);
  }
  assert.throws(() => newField({ label: 'X', kind: 'multi', v: '', file: '' }, ctx()), hasCode('invalid'));
  assert.throws(() => newField({ label: 'X', kind: 'qr', v: '' }, ctx()), hasCode('invalid'));
  assert.deepEqual([...FIELD_KINDS], ['text', 'secret', 'url', 'multi', 'secret-multi', 'otp']);
  const otp = newField({ label: 'One-time password', kind: 'otp', v: 'otpauth://totp/x?secret=JBSWY3DP' }, ctx());
  assert.equal(otp.kind, 'otp');
});

test('AC16 FR17 FR18 editing only notes moves only clock.notes, bumps rev, archives the old version', () => {
  const vault = createVault(VID);
  const item = createItem(vault, 'login', { title: 'Portal', notes: 'old' }, ctx(T0, DEV_B));
  const clockBefore = structuredClone(item.clock);
  const fieldsBefore = structuredClone(item.fields);
  const T = T0 + 5000;
  updateItem(vault, item.id, { notes: 'new', title: 'Portal' }, ctx(T, DEV_A));
  assert.equal(item.notes, 'new');
  assert.deepEqual(item.clock.notes, { at: T, dev: DEV_A });
  for (const k of Object.keys(clockBefore)) if (k !== 'notes') assert.deepEqual(item.clock[k], clockBefore[k], k);
  assert.deepEqual(item.fields, fieldsBefore);
  assert.equal(item.rev, 2);
  assert.equal(item.updatedAt, T);
  assert.equal(item.history.length, 1);
  assert.deepEqual(item.history[0], {
    at: T, rev: 1, dev: DEV_A, reason: 'edit',
    title: 'Portal', type: 'login', fields: fieldsBefore, notes: 'old', expires: null, scopes: [],
  });
});

test('AC16 FR18 changing only favorite, order-like fieldOrder or tags bumps rev without history', () => {
  const vault = createVault(VID);
  const item = createItem(vault, 'login', {}, ctx());
  updateItem(vault, item.id, { favorite: true }, ctx(T0 + 1));
  assert.equal(item.rev, 2);
  assert.deepEqual(item.clock.favorite, { at: T0 + 1, dev: DEV_A });
  updateItem(vault, item.id, { fieldOrder: [...item.fieldOrder].reverse() }, ctx(T0 + 2));
  assert.equal(item.rev, 3);
  updateItem(vault, item.id, { tags: ['partner-x'] }, ctx(T0 + 3));
  assert.equal(item.rev, 4);
  assert.deepEqual(item.history, []);
  // A save that changes nothing is not a save.
  updateItem(vault, item.id, { favorite: true, tags: ['partner-x'] }, ctx(T0 + 4));
  assert.equal(item.rev, 4);
});

test('AC16 FR17 editing one field value moves only that field at/dev', () => {
  const vault = createVault(VID);
  const item = createItem(vault, 'login', {}, ctx(T0, DEV_B));
  const [user, pass, url] = item.fields;
  const T = T0 + 9000;
  updateItem(vault, item.id, { fields: [{ id: user.id }, { id: pass.id, v: 'hunter2' }, { id: url.id }] }, ctx(T, DEV_A));
  assert.equal(pass.v, 'hunter2');
  assert.deepEqual([pass.at, pass.dev], [T, DEV_A]);
  assert.deepEqual([user.at, user.dev], [T0, DEV_B]);
  assert.deepEqual([url.at, url.dev], [T0, DEV_B]);
  assert.deepEqual(item.clock.fieldOrder, { at: T0, dev: DEV_B });
  assert.equal(item.rev, 2);
  assert.equal(item.history.length, 1);
});

test('FR19 FR17 adding a field, removing one (field.deletedAt) and setting/clearing file', () => {
  const vault = createVault(VID);
  const item = createItem(vault, 'ssh', {}, ctx());
  const [priv, pub] = item.fields;
  const T = T0 + 100;
  updateItem(vault, item.id, {
    fields: [{ id: priv.id, file: 'id_ed25519' }, { id: pub.id }, { label: 'One-time password', kind: 'otp', v: 'JBSWY3DP' }],
  }, ctx(T));
  assert.equal(priv.file, 'id_ed25519');
  const passphrase = item.fields[2];
  assert.equal(passphrase.deletedAt, T);
  assert.deepEqual([passphrase.at, passphrase.dev], [T, DEV_A]);
  assert.equal(live(item).length, 3);
  assert.equal(item.fieldOrder.length, 3);
  assert.deepEqual(item.clock.fieldOrder, { at: T, dev: DEV_A });
  updateItem(vault, item.id, { fields: live(item).map((f) => (f.id === priv.id ? { id: f.id, file: null } : { id: f.id })) }, ctx(T + 1));
  assert.ok(!('file' in priv));
  assert.throws(() => updateItem(vault, item.id, { fields: [{ id: pub.id, kind: 'text', file: 'x' }] }, ctx(T + 2)), hasCode('invalid'));
  assert.deepEqual(validateVault(vault), { ok: true });
});

test('AC17 FR18 25 title edits keep exactly 20 history entries, newest first', () => {
  const vault = createVault(VID);
  const item = createItem(vault, 'note', { title: 'v0' }, ctx());
  for (let n = 1; n <= 25; n++) updateItem(vault, item.id, { title: `v${n}` }, ctx(T0 + n));
  assert.equal(item.rev, 26);
  assert.equal(item.history.length, HISTORY_MAX);
  assert.equal(HISTORY_MAX, 20);
  assert.equal(item.history[0].rev, item.rev - 1);
  assert.equal(item.history[0].title, 'v24');
  for (let n = 1; n < item.history.length; n++) assert.ok(item.history[n - 1].rev > item.history[n].rev);
  assert.equal(item.history.at(-1).rev, 6);
});

test('AC19 FR19 deleting a project tombstones it and its envs; items keep the env ids', () => {
  const vault = createVault(VID);
  const p = addProject(vault, { name: 'Payment Gateway' }, ctx());
  const uat = addEnv(vault, p.id, { name: 'uat' }, ctx());
  const prod = addEnv(vault, p.id, { name: 'prod', color: 'red' }, ctx());
  const other = addProject(vault, { name: 'Other' }, ctx());
  const otherEnv = addEnv(vault, other.id, { name: 'dev' }, ctx());
  const item = createItem(vault, 'login', { scopes: [uat.id, prod.id] }, ctx());
  const T = T0 + 50;
  deleteProject(vault, p.id, ctx(T));
  assert.deepEqual([p.deletedAt, uat.deletedAt, prod.deletedAt], [T, T, T]);
  assert.deepEqual([p.rev, uat.rev, prod.rev], [2, 2, 2]);
  assert.equal(otherEnv.deletedAt, null);
  assert.deepEqual(item.scopes, [uat.id, prod.id]);
  assert.deepEqual(validateVault(vault), { ok: true });
});

test('AC19 FR19 trash then restore gives the same item except rev, updatedAt, clock.deletedAt', () => {
  const vault = createVault(VID);
  const item = createItem(vault, 'db', { title: 'Orders DB', notes: 'n' }, ctx());
  updateItem(vault, item.id, { title: 'Orders DB (UAT)' }, ctx(T0 + 1));
  const before = structuredClone(item);
  trashItem(vault, item.id, ctx(T0 + 2));
  assert.equal(item.deletedAt, T0 + 2);
  assert.deepEqual(item.fields, before.fields);
  assert.deepEqual(item.history, before.history);
  assert.throws(() => updateItem(vault, item.id, { title: 'x' }, ctx(T0 + 3)), hasCode('invalid'));
  restoreItem(vault, item.id, ctx(T0 + 4));
  const strip = ({ rev, updatedAt, clock: { deletedAt, ...clock }, ...rest }) => ({ ...rest, clock });
  assert.deepEqual(strip(item), strip(before));
  assert.equal(item.rev, before.rev + 2);
  assert.deepEqual(item.clock.deletedAt, { at: T0 + 4, dev: DEV_A });
});

test('AC19 FR19 purge leaves only id, deletedAt and purgedAt meaningful; content is blank', () => {
  const vault = createVault(VID);
  const env = addEnv(vault, addProject(vault, {}, ctx()).id, {}, ctx());
  const item = createItem(vault, 'login', { title: 'Secret portal', notes: 'secret notes', tags: ['t'], scopes: [env.id], favorite: true, expires: '2027-01-01' }, ctx());
  updateItem(vault, item.id, { title: 'Secret portal 2' }, ctx(T0 + 1));
  trashItem(vault, item.id, ctx(T0 + 2));
  purgeItem(vault, item.id, ctx(T0 + 3));
  assert.equal(item.deletedAt, T0 + 2);
  assert.equal(item.purgedAt, T0 + 3);
  assert.deepEqual(
    { title: item.title, fields: item.fields, fieldOrder: item.fieldOrder, notes: item.notes, history: item.history, tags: item.tags, scopes: item.scopes, favorite: item.favorite, expires: item.expires, forkedFrom: item.forkedFrom, conflict: item.conflict },
    { title: '', fields: [], fieldOrder: [], notes: '', history: [], tags: [], scopes: [], favorite: false, expires: null, forkedFrom: null, conflict: null },
  );
  assert.ok(!JSON.stringify(item).includes('Secret'));
  assert.ok(!JSON.stringify(item).includes('secret notes'));
  assert.deepEqual(validateVault(vault), { ok: true });
  assert.throws(() => restoreItem(vault, item.id, ctx(T0 + 4)), hasCode('invalid'));
  // Purging an item that is not in the trash yet also sets deletedAt.
  const other = createItem(vault, 'note', {}, ctx());
  purgeItem(vault, other.id, ctx(T0 + 5));
  assert.deepEqual([other.deletedAt, other.purgedAt], [T0 + 5, T0 + 5]);
});

test('FR17 FR19 project and env edits move only the changed clocks; deleteEnv tombstones one env', () => {
  const vault = createVault(VID);
  const p = addProject(vault, { name: 'A' }, ctx());
  const e = addEnv(vault, p.id, { name: 'uat' }, ctx());
  assert.equal(p.order, 0);
  assert.equal(e.order, 0);
  assert.equal(addEnv(vault, p.id, { name: 'prod' }, ctx()).order, 1);
  updateProject(vault, p.id, { name: 'B', order: 0 }, ctx(T0 + 1, DEV_B));
  assert.deepEqual(p.clock.name, { at: T0 + 1, dev: DEV_B });
  assert.deepEqual(p.clock.order, { at: T0, dev: DEV_A });
  assert.equal(p.rev, 2);
  updateEnv(vault, e.id, { color: 'red' }, ctx(T0 + 2));
  assert.deepEqual(e.clock.color, { at: T0 + 2, dev: DEV_A });
  assert.deepEqual(e.clock.name, { at: T0, dev: DEV_A });
  deleteEnv(vault, e.id, ctx(T0 + 3));
  assert.equal(e.deletedAt, T0 + 3);
  assert.throws(() => updateEnv(vault, e.id, { name: 'x' }, ctx()), hasCode('invalid'));
  assert.throws(() => addEnv(vault, 'p_0000000000000000', {}, ctx()), hasCode('invalid'));
});

test('AC21 FR20 a vault with 6 distinct violations reports all 6 with paths', () => {
  const vault = createVault(VID);
  const p = addProject(vault, { name: 'P' }, ctx());
  addEnv(vault, p.id, { name: 'ok' }, ctx());
  const orphan = addEnv(vault, p.id, { name: 'orphan' }, ctx());
  const a = createItem(vault, 'login', {}, ctx());
  const b = createItem(vault, 'note', {}, ctx());
  const c = createItem(vault, 'token', {}, ctx());
  for (let n = 1; n <= 21; n++) updateItem(vault, c.id, { title: `t${n}` }, ctx(T0 + n));
  assert.deepEqual(validateVault(vault), { ok: true });

  vault.v = 1;
  b.type = 'wifi';
  a.fields[0].file = 'user.txt'; // kind text
  b.id = a.id;
  orphan.projectId = 'p_ffffffffffffffff';
  c.history.push(structuredClone(c.history[0])); // 21 entries
  const r = validateVault(vault);
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.errors.map((e) => [e.path, e.code]).sort(),
    [
      ['v', 'version'],
      ['items[1].type', 'enum'],
      ['items[0].fields[0].file', 'file-kind'],
      ['items[1].id', 'duplicate-id'],
      ['envs[1].projectId', 'dangling-ref'],
      ['items[2].history', 'history-max'],
    ].sort(),
  );
  for (const e of r.errors) assert.equal(typeof e.message, 'string');
});

test('FR20 missing fields and wrong types are reported per path', () => {
  const vault = createVault(VID);
  const item = createItem(vault, 'login', {}, ctx());
  delete item.title;
  item.favorite = 'yes';
  item.fields[1].kind = 'password';
  delete vault.envs;
  const r = validateVault(vault);
  assert.deepEqual(
    r.errors.map((e) => [e.path, e.code]).sort(),
    [['envs', 'required'], ['items[0].title', 'required'], ['items[0].favorite', 'type'], ['items[0].fields[1].kind', 'enum']].sort(),
  );
  assert.deepEqual(validateVault(null), { ok: false, errors: [{ path: '', code: 'type', message: 'Wrong value type' }] });
});

test('FR20 scopes = [] and scopes pointing at a tombstoned env are valid', () => {
  const vault = createVault(VID);
  const e = addEnv(vault, addProject(vault, {}, ctx()).id, {}, ctx());
  createItem(vault, 'login', {}, ctx());
  createItem(vault, 'login', { scopes: [e.id] }, ctx());
  deleteEnv(vault, e.id, ctx(T0 + 1));
  assert.deepEqual(validateVault(vault), { ok: true });
});

test('FR22 every model operation takes time and deviceId from ctx; bad ctx is invalid', () => {
  const vault = createVault(VID);
  const item = createItem(vault, 'login', {}, ctx(123, 'd_0000000000000001'));
  assert.equal(item.createdAt, 123);
  assert.ok(Object.values(item.clock).every((c) => c.at === 123 && c.dev === 'd_0000000000000001'));
  assert.ok(item.fields.every((f) => f.at === 123 && f.dev === 'd_0000000000000001'));
  assert.throws(() => createItem(vault, 'login', {}, { now: 1 }), hasCode('invalid'));
  assert.throws(() => addProject(vault, {}, { deviceId: DEV_A }), hasCode('invalid'));
  assert.throws(() => updateItem(vault, item.id, { title: 'x' }), hasCode('invalid'));
});

const CORE_FILES = ['bytes.js', 'errors.js', 'crypto.js', 'model.js'];

test('FR22 core sources use no storage, network, DOM or console, and import only within core/', async () => {
  for (const name of CORE_FILES) {
    const src = await readCoreSource(name);
    for (const banned of [/\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bdocument\b/, /\bwindow\b/, /\bconsole\b/, /\bnavigator\b/]) {
      assert.doesNotMatch(src, banned, `${name} uses ${banned}`);
    }
    const specs = [...src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.doesNotMatch(src, /\bimport\s*\(/, `${name} has a dynamic import`);
    for (const s of specs) {
      assert.match(s, /^\.\/[a-z-]+\.js$/, `${name} imports ${s}`);
      assert.ok(CORE_FILES.includes(s.slice(2)), `${name} imports ${s} outside core/`);
    }
  }
});
