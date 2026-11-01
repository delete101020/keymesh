import test from 'node:test';
import assert from 'node:assert/strict';
import { merge, DELETED_ELSEWHERE } from '../src/public/js/core/merge.js';
import {
  HISTORY_MAX,
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
  validateVault,
} from '../src/public/js/core/model.js';
import { ctx, T0, DEV_A, DEV_B, hasCode, readCoreSource, readRepoFile, withGlobal } from '../testkit/helpers.js';

const VID = '3f9c1a0b7d2e4c58';
// Time n seconds after T0, on device A (laptop) unless told otherwise; B is the phone.
const at = (n, dev = DEV_A) => ctx(T0 + n * 1000, dev);
const fork = (v) => structuredClone(v);
const byId = (list, id) => list.find((e) => e.id === id);

// base: project PaymentGW with uat/staging, project CRM with uat, one login item in uat + staging.
function fixture() {
  const vault = createVault(VID);
  const pay = addProject(vault, { name: 'PaymentGW' }, at(0));
  const crm = addProject(vault, { name: 'CRM' }, at(0));
  const uat = addEnv(vault, pay.id, { name: 'uat', color: 'green' }, at(0));
  const staging = addEnv(vault, pay.id, { name: 'staging' }, at(0));
  const crmUat = addEnv(vault, crm.id, { name: 'uat' }, at(0));
  const item = createItem(vault, 'login', { title: 'Partner X', scopes: [uat.id, staging.id], tags: ['partner-x'] }, at(0));
  item.fields[1].v = 'P0';
  return { vault, pay, crm, uat, staging, crmUat, item };
}

// --- step 1: entities, projects/envs, inputs -------------------------------------------------------

test('AC15 FR16 both rename one env: the later name wins with no history or conflict mark', () => {
  const { vault: b, uat } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateEnv(l, uat.id, { name: 'uat-laptop' }, at(10));
  updateEnv(r, uat.id, { name: 'uat-phone' }, at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const env = byId(m.envs, uat.id);
    assert.equal(env.name, 'uat-phone');
    assert.deepEqual(env.clock.name, { at: T0 + 20000, dev: DEV_B });
    assert.equal(env.rev, 2, 'equals remote, so remote rev');
    assert.deepEqual(m.items, b.items, 'no history entry or conflict mark anywhere');
  }
});

test('AC15 FR16 one side renames an env, the other recolours it: both changes are kept', () => {
  const { vault: b, uat } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateEnv(l, uat.id, { name: 'UAT' }, at(10));
  updateEnv(r, uat.id, { color: 'red' }, at(5, DEV_B));
  const env = byId(merge(b, l, r).envs, uat.id);
  assert.equal(env.name, 'UAT');
  assert.equal(env.color, 'red');
  assert.deepEqual(env.clock.name, l.envs[0].clock.name);
  assert.deepEqual(env.clock.color, r.envs[0].clock.color);
  assert.equal(env.rev, 3, 'differs from both sides: max rev + 1');
  assert.equal(env.updatedAt, T0 + 10000);
  assert.deepEqual(merge(b, l, r), merge(b, r, l));
});

test('AC17 FR17 both delete one project at different times: the earlier deletedAt is kept', () => {
  const { vault: b, crm } = fixture();
  const l = fork(b);
  const r = fork(b);
  deleteProject(l, crm.id, at(30));
  deleteProject(r, crm.id, at(10, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    assert.equal(byId(m.projects, crm.id).deletedAt, T0 + 10000);
    assert.equal(byId(m.envs, b.envs[2].id).deletedAt, T0 + 10000);
  }
});

test('AC17 FR17 one side renames a project, the other deletes it: the result is deleted and renamed', () => {
  const { vault: b, crm } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateProject(l, crm.id, { name: 'CRM v2' }, at(30));
  deleteProject(r, crm.id, at(10, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const p = byId(m.projects, crm.id);
    assert.equal(p.name, 'CRM v2');
    assert.equal(p.deletedAt, T0 + 10000);
    assert.deepEqual(validateVault(m), { ok: true });
  }
});

test('FR03 FR17 projects and envs created on either side are all kept, in a symmetric order', () => {
  const { vault: b, pay } = fixture();
  const l = fork(b);
  const r = fork(b);
  const pl = addProject(l, { name: 'Laptop project' }, at(10));
  const el = addEnv(l, pay.id, { name: 'prod' }, at(10));
  const pr = addProject(r, { name: 'Phone project' }, at(10, DEV_B));
  const m = merge(b, l, r);
  assert.ok(byId(m.projects, pl.id) && byId(m.projects, pr.id) && byId(m.envs, el.id));
  assert.deepEqual(m.projects.slice(0, 2).map((p) => p.id), b.projects.map((p) => p.id));
  assert.deepEqual(m, merge(b, r, l));
  assert.deepEqual(merge(b, b, r), r);
  assert.deepEqual(merge(b, l, b), l);
});

test('FR15 an env created on both sides under one id: projectId follows the later updatedAt', () => {
  const { vault: b, pay, crm } = fixture();
  const l = fork(b);
  const r = fork(b);
  const e = addEnv(l, pay.id, { name: 'shared' }, at(10));
  r.envs.push({ ...structuredClone(e), projectId: crm.id, updatedAt: T0 + 20000, clock: { name: { at: T0 + 20000, dev: DEV_B }, order: e.clock.order, color: e.clock.color } });
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const env = byId(m.envs, e.id);
    assert.equal(env.projectId, crm.id);
    assert.deepEqual(validateVault(m), { ok: true });
  }
});

test('AC24 FR21 without a base every entity of both sides is kept', () => {
  const l = createVault(VID);
  const r = createVault(VID);
  const il = createItem(l, 'login', { title: 'Laptop item' }, at(1));
  const ir = createItem(r, 'note', { title: 'Phone item' }, at(2, DEV_B));
  const pr = addProject(r, { name: 'Phone project' }, at(2, DEV_B));
  for (const base of [null, undefined]) {
    const m = merge(base, l, r);
    assert.deepEqual(m.items.map((i) => i.id).sort(), [il.id, ir.id].sort());
    assert.deepEqual(byId(m.items, il.id), il);
    assert.deepEqual(byId(m.projects, pr.id), pr);
    assert.deepEqual(validateVault(m), { ok: true });
  }
  assert.deepEqual(merge(null, l, l), l);
});

test('AC22 FR02 invalid input throws invalid, returns nothing and leaves all three inputs untouched', () => {
  const { vault: b } = fixture();
  const l = fork(b);
  const r = fork(b);
  const badType = fork(b);
  badType.items[0].type = 'TYPE-MARKER-1';
  const otherId = { ...fork(b), vaultId: '00000000000000bb' };
  const badBase = fork(b);
  delete badBase.items[0].title;
  const cases = [
    [[b, badType, r], 'local'],
    [[b, l, badType], 'remote'],
    [[badBase, l, r], 'base'],
    [[b, l, otherId], 'vaultId'],
    [[otherId, l, r], 'vaultId'],
    [[null, l, otherId], 'vaultId'],
    [[b, { ...l, v: 3 }, r], 'local'],
    [[b, 'not a vault', r], 'local'],
    [[b, l, undefined], 'remote'],
  ];
  for (const [args, detail] of cases) {
    const before = structuredClone(args);
    assert.throws(() => merge(...args), (e) => hasCode('invalid')(e) && e.message === `Invalid argument: ${detail}`, detail);
    assert.deepEqual(args, before, `${detail}: inputs unchanged`);
  }
});

test('AC23 FR01 merge never modifies its inputs and the result shares no object with them', () => {
  const { vault: b, uat, crm } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateEnv(l, uat.id, { name: 'UAT' }, at(10));
  deleteProject(r, crm.id, at(10, DEV_B));
  addProject(r, { name: 'New' }, at(11, DEV_B));
  const snap = structuredClone([b, l, r]);
  const m = merge(b, l, r);
  assert.deepEqual([b, l, r], snap);
  // Mutate every object of the result: the inputs must not move.
  const scribble = (o) => {
    if (o === null || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      scribble(o[k]);
      if (!Array.isArray(o)) o[k] = 'X';
    }
    if (Array.isArray(o)) o.length = 0;
  };
  scribble(m);
  assert.deepEqual([b, l, r], snap);
});

// A stand-in that throws on any use: calling, constructing, or reading a property.
const trap = new Proxy(function () {}, {
  get() {
    throw new Error('read a banned global');
  },
  apply() {
    throw new Error('called a banned global');
  },
  construct() {
    throw new Error('constructed a banned global');
  },
});

test('FR01 NFR01 merge reads no clock and no randomness: Date, performance, crypto and Math.random are trapped', async () => {
  const { vault: b, uat } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateEnv(l, uat.id, { name: 'UAT' }, at(10));
  updateEnv(r, uat.id, { name: 'uat2' }, at(20, DEV_B));
  const expected = merge(b, l, r);
  const math = Object.create(Math, { random: { value: trap } });
  const got = await withGlobal('Date', trap, () =>
    withGlobal('performance', trap, () => withGlobal('crypto', trap, () => withGlobal('Math', math, () => merge(b, l, r)))),
  );
  assert.deepEqual(got, expected);
});

test('FR01 NFR01 merge.js imports only errors.js and model.js and names no clock, randomness or console', async () => {
  const src = await readCoreSource('merge.js');
  const specs = [...src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(specs.sort(), ['./errors.js', './model.js']);
  for (const banned of [/\bDate\b/, /\bMath\.random\b/, /\bcrypto\b/, /\brandomBytes\b/, /\bnewId\b/, /\bperformance\b/, /\bconsole\b/, /\bimport\s*\(/]) {
    assert.doesNotMatch(src, banned, `merge.js uses ${banned}`);
  }
});

// --- step 2: item attributes, fields, sets ---------------------------------------------------------

// Draft for updateItem that sets field `i` of item to v, keeping the others as they are.
const setField = (item, i, v) => ({ fields: item.fields.filter((f) => f.deletedAt === null).map((f, j) => (j === i ? { id: f.id, v } : { id: f.id })) });
const dropField = (item, id) => ({ fields: item.fields.filter((f) => f.deletedAt === null && f.id !== id).map((f) => ({ id: f.id })) });
const pw = (item) => item.fields[1];

test('AC01 FR04 FR06 FR07 one side changes Password: the change is taken and history still has P0', () => {
  const { vault: b, item } = fixture();
  const r = fork(b);
  updateItem(r, item.id, setField(item, 1, 'P1'), at(10, DEV_B));
  for (const m of [merge(b, b, r), merge(b, r, b), merge(b, fork(b), r)]) {
    const x = byId(m.items, item.id);
    assert.equal(pw(x).v, 'P1');
    assert.equal(x.conflict, null);
    assert.ok(x.history.some((h) => h.fields[1].v === 'P0'));
    assert.deepEqual(x, byId(r.items, item.id));
  }
});

test('AC03 FR04 FR06 FR07 Password on one side, notes on the other: both kept, no conflict', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateItem(l, item.id, setField(item, 1, 'P-laptop'), at(10));
  updateItem(r, item.id, { notes: 'phone notes' }, at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = byId(m.items, item.id);
    assert.equal(pw(x).v, 'P-laptop');
    assert.equal(x.notes, 'phone notes');
    assert.equal(x.conflict, null);
    assert.ok(x.history.every((h) => h.reason !== 'conflict'));
    assert.equal(x.rev, 3);
    assert.deepEqual(validateVault(m), { ok: true });
  }
  assert.deepEqual(merge(b, l, r), merge(b, r, l));
});

test('AC04 FR08 scopes and tags merge as sets', () => {
  const { vault: b, item, uat, staging, crmUat } = fixture();
  const l = fork(b);
  const r = fork(b);
  const prod = addEnv(l, b.projects[0].id, { name: 'prod' }, at(5));
  updateItem(l, item.id, { scopes: [uat.id, staging.id, prod.id], tags: ['partner-x', 'shared'] }, at(10));
  updateItem(r, item.id, { scopes: [uat.id, staging.id, crmUat.id], tags: ['partner-x', 'shared'] }, at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = byId(m.items, item.id);
    assert.deepEqual([...x.scopes].sort(), [uat.id, staging.id, prod.id, crmUat.id].sort());
    assert.deepEqual(x.tags, ['partner-x', 'shared'], 'a tag added on both sides appears once');
    assert.equal(x.conflict, null);
  }
  // One side drops staging, the other leaves scopes alone: staging goes.
  const r2 = fork(b);
  updateItem(r2, item.id, { scopes: [uat.id] }, at(20, DEV_B));
  const l2 = fork(b);
  updateItem(l2, item.id, { title: 'Partner X (renamed)' }, at(10));
  const x = byId(merge(b, l2, r2).items, item.id);
  assert.deepEqual(x.scopes, [uat.id]);
  assert.equal(x.title, 'Partner X (renamed)');
});

test('AC14 FR07 each side adds a different field: both fields are kept, no conflict', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  const keep = item.fields.map((f) => ({ id: f.id }));
  updateItem(l, item.id, { fields: [...keep, { label: 'Laptop field', kind: 'text', v: 'L' }] }, at(10));
  updateItem(r, item.id, { fields: [...keep, { label: 'Phone field', kind: 'secret', v: 'R' }] }, at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = byId(m.items, item.id);
    assert.deepEqual(x.fields.map((f) => f.label).slice(3).sort(), ['Laptop field', 'Phone field']);
    assert.deepEqual([...x.fieldOrder].sort(), x.fields.map((f) => f.id).sort());
    assert.equal(x.conflict, null);
  }
  assert.deepEqual(merge(b, l, r), merge(b, r, l));
});

test('AC13 FR07 one side deletes a field, the other edits it later: the edit wins and is marked', () => {
  const { vault: b, item } = fixture();
  const f3 = item.fields[2].id;
  const l = fork(b);
  const r = fork(b);
  updateItem(l, item.id, dropField(item, f3), at(10));
  updateItem(r, item.id, setField(item, 2, 'https://new'), at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = byId(m.items, item.id);
    const f = byId(x.fields, f3);
    assert.equal(f.deletedAt, null);
    assert.equal(f.v, 'https://new');
    assert.ok(x.fieldOrder.includes(f3), 'the field that came back is in fieldOrder');
    assert.deepEqual(x.conflict.fields, [f3]);
    const lost = x.history.filter((h) => h.reason === 'conflict');
    assert.equal(lost.length, 1);
    assert.notEqual(byId(lost[0].fields, f3).deletedAt, null, 'history keeps the deleting side');
  }
});

test('AC13 FR07 the deletion is later: the field stays deleted and is marked', () => {
  const { vault: b, item } = fixture();
  const f3 = item.fields[2].id;
  const l = fork(b);
  const r = fork(b);
  updateItem(l, item.id, dropField(item, f3), at(30));
  updateItem(r, item.id, setField(item, 2, 'https://new'), at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = byId(m.items, item.id);
    assert.equal(byId(x.fields, f3).deletedAt, T0 + 30000);
    assert.ok(!x.fieldOrder.includes(f3));
    assert.deepEqual(x.conflict.fields, [f3]);
    const lost = x.history.filter((h) => h.reason === 'conflict');
    assert.equal(lost.length, 1);
    assert.equal(byId(lost[0].fields, f3).v, 'https://new', 'history keeps the edited value');
  }
});

test('AC18 FR15 both sides created one id: same values are not conflicts, Password is, tags are united', () => {
  const l = createVault(VID);
  const item = createItem(l, 'login', { title: 'Imported', tags: ['a'] }, at(1));
  item.fields[0].v = 'admin';
  item.fields[1].v = 'pw-laptop';
  const r = fork(l);
  const ri = r.items[0];
  ri.fields[1] = { ...ri.fields[1], v: 'pw-phone', at: T0 + 5000, dev: DEV_B };
  ri.tags = ['b'];
  for (const m of [merge(null, l, r), merge(null, r, l)]) {
    assert.equal(m.items.length, 1);
    const x = m.items[0];
    assert.equal(x.fields[0].v, 'admin');
    assert.equal(x.fields[1].v, 'pw-phone');
    assert.deepEqual(x.conflict.fields, [item.fields[1].id]);
    assert.deepEqual(x.conflict.attrs, []);
    assert.deepEqual(x.tags, ['a', 'b']);
    assert.ok(x.history.some((h) => h.reason === 'conflict' && h.fields[1].v === 'pw-laptop'));
    assert.deepEqual(validateVault(m), { ok: true });
  }
});

test('AC21 FR05 fully tied clocks (same at, same dev): the value decides, the same way in both orders', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateItem(l, item.id, { title: 'Alpha' }, at(10));
  updateItem(r, item.id, { title: 'Beta' }, at(10));
  const m1 = merge(b, l, r);
  const m2 = merge(b, r, l);
  assert.deepEqual(m1, m2);
  assert.equal(byId(m1.items, item.id).title, 'Beta', 'larger value wins a full tie');
  assert.deepEqual(byId(m1.items, item.id).conflict.attrs, ['title']);
});

test('AC16 FR17 FR18 deleting an env or project keeps every reference and adds no mark', () => {
  const { vault: b, item, crm, crmUat } = fixture();
  const l = fork(b);
  const r = fork(b);
  deleteEnv(l, crmUat.id, at(10));
  deleteProject(l, crm.id, at(11));
  updateItem(r, item.id, { scopes: [...item.scopes, crmUat.id] }, at(20, DEV_B));
  const f = addEnv(r, crm.id, { name: 'prod' }, at(21, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    assert.equal(byId(m.envs, crmUat.id).deletedAt, T0 + 10000);
    assert.equal(byId(m.projects, crm.id).deletedAt, T0 + 11000);
    assert.ok(byId(m.items, item.id).scopes.includes(crmUat.id));
    assert.deepEqual(byId(m.envs, f.id), f, 'the env created under the deleted project is kept as is');
    assert.ok(m.items.every((x) => x.conflict === null));
    assert.deepEqual(validateVault(m), { ok: true });
  }
});

// --- step 3: history and conflict marks -----------------------------------------------------------

test('AC02 FR05 FR07 FR09 FR10 both change Password: remote (later) wins, one mark, local in history', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateItem(l, item.id, setField(item, 1, 'P-laptop'), at(10));
  updateItem(r, item.id, setField(item, 1, 'P-phone'), at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    assert.equal(m.items.length, 1);
    const x = m.items[0];
    assert.equal(pw(x).v, 'P-phone');
    assert.deepEqual(pw(x), pw(r.items[0]), 'the winning field keeps its own clock');
    assert.deepEqual(x.conflict, { at: T0 + 20000, fields: [item.fields[1].id], attrs: [] });
    const lost = x.history.filter((h) => h.reason === 'conflict');
    assert.equal(lost.length, 1);
    assert.equal(lost[0].fields[1].v, 'P-laptop');
    assert.deepEqual(
      { at: lost[0].at, rev: lost[0].rev, dev: lost[0].dev },
      { at: T0 + 10000, rev: 2, dev: DEV_A },
      'key from the losing side: its latest clock and its rev',
    );
    assert.equal('note' in lost[0], false);
    assert.equal(x.rev, 3);
    assert.deepEqual(validateVault(m), { ok: true });
  }
  assert.deepEqual(merge(b, l, r), merge(b, r, l));
});

test('FR09 each side that loses a value goes to history (local wins notes, remote wins Password)', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateItem(l, item.id, { ...setField(item, 1, 'P-laptop'), notes: 'laptop notes' }, at(10));
  updateItem(r, item.id, setField(item, 1, 'P-phone'), at(20, DEV_B));
  updateItem(r, item.id, { notes: 'phone notes' }, at(21, DEV_B));
  updateItem(l, item.id, { notes: 'laptop notes 2' }, at(30));
  const x = merge(b, l, r).items[0];
  assert.equal(pw(x).v, 'P-phone');
  assert.equal(x.notes, 'laptop notes 2');
  assert.deepEqual(x.conflict.fields, [item.fields[1].id]);
  assert.deepEqual(x.conflict.attrs, ['notes']);
  const lost = x.history.filter((h) => h.reason === 'conflict');
  assert.deepEqual(lost.map((h) => h.dev).sort(), [DEV_A, DEV_B]);
  assert.equal(x.conflict.at, T0 + 30000);
});

test('AC19 FR10 "Đã xử lý" on one side clears the old mark; a new conflict still marks', () => {
  const { vault: b0, item } = fixture();
  const l0 = fork(b0);
  const r0 = fork(b0);
  updateItem(l0, item.id, setField(item, 1, 'P-laptop'), at(10));
  updateItem(r0, item.id, setField(item, 1, 'P-phone'), at(20, DEV_B));
  const b = merge(b0, l0, r0);
  assert.deepEqual(b.items[0].conflict.fields, [item.fields[1].id]);

  const l = fork(b);
  const r = fork(b);
  l.items[0].conflict = null; // the user pressed "Đã xử lý" on the laptop
  assert.equal(merge(b, l, r).items[0].conflict, null);
  assert.equal(merge(b, r, l).items[0].conflict, null);

  updateItem(l, item.id, { notes: 'laptop' }, at(40));
  updateItem(r, item.id, { notes: 'phone' }, at(50, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    assert.deepEqual(m.items[0].conflict, { at: T0 + 50000, fields: [], attrs: ['notes'] });
  }
});

test('AC20 FR11 a full remote history does not push out the entry this merge writes', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateItem(l, item.id, setField(item, 1, 'P-laptop'), at(5));
  for (let n = 0; n < HISTORY_MAX + 3; n++) updateItem(r, item.id, { title: `phone ${n}` }, at(100 + n, DEV_B));
  updateItem(r, item.id, setField(item, 1, 'P-phone'), at(200, DEV_B));
  assert.equal(r.items[0].history.length, HISTORY_MAX);
  assert.ok(r.items[0].history.every((h) => h.at > T0 + 5000), 'every remote entry is newer than any local one');
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    assert.equal(x.history.length, HISTORY_MAX);
    const lost = x.history.filter((h) => h.reason === 'conflict');
    assert.equal(lost.length, 1);
    assert.equal(lost[0].fields[1].v, 'P-laptop');
    assert.deepEqual(validateVault(m), { ok: true });
  }
});

test('AC25 FR09 FR11 NFR04 merging two devices\' results of the same merge changes nothing', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  updateItem(l, item.id, { ...setField(item, 1, 'P-laptop'), title: 'laptop title' }, at(10));
  updateItem(r, item.id, { ...setField(item, 1, 'P-phone'), title: 'phone title' }, at(20, DEV_B));
  const m1 = merge(b, l, r);
  const m2 = merge(b, r, l);
  for (const m of [merge(b, m1, m2), merge(m1, m1, m2), merge(b, m2, m1)]) {
    assert.deepEqual(m, m1);
    const keys = m.items[0].history.map((h) => `${h.at}|${h.rev}|${h.dev}`);
    assert.equal(new Set(keys).size, keys.length, 'no history entry twice');
  }
  // Merging again against an older base, after one more edit on top, adds no second conflict entry.
  const l2 = fork(m1);
  updateItem(l2, item.id, { notes: 'later' }, at(30));
  const again = merge(b, l2, m2).items[0];
  assert.equal(again.history.filter((h) => h.reason === 'conflict').length, 1);
});

// --- step 4: trash, restore, purge (docs/05 "Xoá, thùng rác và sửa", one test per row) --------------

// base where the item is already in the trash on both sides, with an edit in its history.
function trashedFixture() {
  const f = fixture();
  updateItem(f.vault, f.item.id, setField(f.item, 1, 'P-before'), at(1));
  const before = structuredClone(f.vault.items[0]);
  trashItem(f.vault, f.item.id, at(2));
  return { ...f, before };
}

const TOMBSTONE_BLANK = { title: '', fields: [], fieldOrder: [], notes: '', history: [], tags: [], scopes: [], favorite: false, expires: null, forkedFrom: null, conflict: null };

test('05-del-row-1 AC06 FR13 one side trashes, the other edits nothing: the item goes to the trash', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  trashItem(l, item.id, at(10));
  updateEnv(r, b.envs[0].id, { name: 'renamed' }, at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    assert.deepEqual(m.items[0], l.items[0]);
    assert.equal(m.items[0].deletedAt, T0 + 10000);
    assert.equal(m.items[0].conflict, null);
  }
});

test('05-del-row-2 AC07 FR13 FR19 one side trashes, the other edits title, favorite or tags: the edit wins', () => {
  const edits = [{ title: 'Partner X v2' }, { favorite: true }, { tags: ['partner-x', 'new-tag'] }];
  for (const edit of edits) {
    const { vault: b, item } = fixture();
    const l = fork(b);
    const r = fork(b);
    trashItem(l, item.id, at(30));
    updateItem(r, item.id, edit, at(20, DEV_B));
    for (const m of [merge(b, l, r), merge(b, r, l)]) {
      const x = m.items[0];
      const [k, v] = Object.entries(edit)[0];
      assert.equal(x.deletedAt, null, k);
      assert.deepEqual(x[k], v);
      assert.deepEqual(x.conflict, { at: T0 + 30000, fields: [], attrs: ['deletedAt'] });
      const lost = x.history.filter((h) => h.reason === 'conflict');
      assert.equal(lost.length, 1, k);
      assert.equal(lost[0].note, DELETED_ELSEWHERE);
      assert.equal(lost[0].dev, DEV_A, 'the entry is the trashing side');
      assert.deepEqual(validateVault(m), { ok: true });
    }
    assert.deepEqual(merge(b, l, r), merge(b, r, l));
  }
});

test('05-del-row-3 AC08 FR13 both trash at different times: the earlier deletedAt and its clock', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  trashItem(l, item.id, at(30));
  trashItem(r, item.id, at(10, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    assert.equal(x.deletedAt, T0 + 10000);
    assert.deepEqual(x.clock.deletedAt, { at: T0 + 10000, dev: DEV_B });
    assert.equal(x.conflict, null);
  }
});

test('05-del-row-4 AC05 AC09 FR13 one side restores, the other leaves it in the trash: it comes back whole', () => {
  const { vault: b, item, before } = trashedFixture();
  const l = fork(b);
  const r = fork(b);
  restoreItem(l, item.id, at(10));
  updateEnv(r, b.envs[0].id, { name: 'renamed' }, at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    assert.equal(x.deletedAt, null);
    assert.deepEqual(x.fields, before.fields);
    assert.deepEqual(x.history, before.history);
    assert.equal(x.conflict, null);
  }
});

test('05-del-row-5 AC10 FR14 one side purges, the other changes nothing: the purge tombstone', () => {
  const { vault: b, item } = trashedFixture();
  const l = fork(b);
  const r = fork(b);
  purgeItem(l, item.id, at(10));
  updateEnv(r, b.envs[0].id, { name: 'renamed' }, at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    assert.deepEqual(x, l.items[0]);
    assert.deepEqual({ ...x, ...TOMBSTONE_BLANK }, x, 'all content blank (09 § Purge)');
    assert.equal(x.purgedAt, T0 + 10000);
    assert.equal(x.deletedAt, T0 + 2000);
  }
});

test('05-del-row-6 AC11 FR14 one side purges, the other edits Password: the edit brings it back', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  purgeItem(l, item.id, at(30));
  updateItem(r, item.id, setField(item, 1, 'P-phone'), at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    const ri = r.items[0];
    assert.equal(x.purgedAt, null);
    assert.equal(x.deletedAt, null);
    assert.deepEqual(x.fields, ri.fields);
    assert.deepEqual(x.history, ri.history, 'the purged side writes no history entry');
    assert.deepEqual(x.conflict, { at: T0 + 30000, fields: [], attrs: ['purgedAt'] });
    assert.deepEqual(validateVault(m), { ok: true });
  }
});

test('05-del-row-7 AC13 FR07 FR09 field deleted on one side, edited on the other: the later clock wins', () => {
  const { vault: b, item } = fixture();
  const f3 = item.fields[2].id;
  for (const [delAt, editAt, alive] of [[10, 20, true], [30, 20, false]]) {
    const l = fork(b);
    const r = fork(b);
    updateItem(l, item.id, dropField(item, f3), at(delAt));
    updateItem(r, item.id, setField(item, 2, 'https://new'), at(editAt, DEV_B));
    const x = merge(b, l, r).items[0];
    assert.equal(byId(x.fields, f3).deletedAt === null, alive);
    assert.deepEqual(x.conflict.fields, [f3]);
    assert.equal(x.history.filter((h) => h.reason === 'conflict').length, 1);
  }
});

test('AC12 FR14 purge on one side, restore on the other: the restore wins and is marked', () => {
  const { vault: b, item, before } = trashedFixture();
  const l = fork(b);
  const r = fork(b);
  purgeItem(l, item.id, at(30));
  restoreItem(r, item.id, at(20, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    assert.equal(x.purgedAt, null);
    assert.equal(x.deletedAt, null);
    assert.deepEqual(x.fields, before.fields);
    assert.deepEqual(x.conflict.attrs, ['purgedAt']);
  }
});

test('FR14 both purge: one tombstone with the earlier deletedAt and purgedAt', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  purgeItem(l, item.id, at(30));
  trashItem(r, item.id, at(10, DEV_B));
  purgeItem(r, item.id, at(40, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    assert.equal(x.deletedAt, T0 + 10000);
    assert.equal(x.purgedAt, T0 + 30000);
    assert.deepEqual(x.clock.deletedAt, { at: T0 + 10000, dev: DEV_B });
    assert.deepEqual({ ...x, ...TOMBSTONE_BLANK }, x);
  }
});

test('FR14 purge on one side, trash on the other (no edit): tombstone with the earlier deletedAt', () => {
  const { vault: b, item } = fixture();
  const l = fork(b);
  const r = fork(b);
  purgeItem(l, item.id, at(30));
  trashItem(r, item.id, at(10, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    assert.equal(x.purgedAt, T0 + 30000);
    assert.equal(x.deletedAt, T0 + 10000);
    assert.equal(x.conflict, null);
  }
});

test('FR13 restore against restore-then-trash: the clock decides and deletedAt is marked', () => {
  const { vault: b, item } = trashedFixture();
  const l = fork(b);
  const r = fork(b);
  restoreItem(l, item.id, at(10));
  restoreItem(r, item.id, at(11, DEV_B));
  trashItem(r, item.id, at(12, DEV_B));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    assert.equal(x.deletedAt, T0 + 12000);
    assert.deepEqual(x.conflict.attrs, ['deletedAt']);
  }
  // The restoring side also edited: the edit beats the second trashing, whatever the clocks.
  updateItem(l, item.id, { title: 'edited after restore' }, at(5));
  for (const m of [merge(b, l, r), merge(b, r, l)]) {
    const x = m.items[0];
    assert.equal(x.deletedAt, null);
    assert.equal(x.title, 'edited after restore');
    const lost = x.history.filter((h) => h.reason === 'conflict');
    assert.equal(lost.length, 1);
    assert.equal(lost[0].note, DELETED_ELSEWHERE);
  }
});

test('FR13 FR12 metadata: a save that only changes tags, or a purge of a trashed item, keeps that side', () => {
  const { vault: b, item } = trashedFixture();
  const l = fork(b);
  purgeItem(l, item.id, at(10)); // touches rev and updatedAt but writes no clock
  assert.deepEqual(merge(b, l, b), l);
  const { vault: b2, item: i2, crm } = fixture();
  const r2 = fork(b2);
  updateItem(r2, i2.id, { tags: ['other'] }, at(10, DEV_B));
  deleteProject(r2, crm.id, at(11, DEV_B)); // touches the env under it with no clock
  assert.deepEqual(merge(b2, b2, r2), r2);
  assert.deepEqual(merge(b2, r2, r2), r2);
});

// --- regressions found by the property test (test/merge-props.test.js) ----------------------------

test('FR14 seed 24587: restore-then-purge on one side, other side untouched: the purge side as is', () => {
  const { vault: b, item } = trashedFixture();
  const r = fork(b);
  restoreItem(r, item.id, at(10, DEV_B));
  purgeItem(r, item.id, at(11, DEV_B));
  assert.deepEqual(merge(b, b, r), r);
  assert.deepEqual(merge(b, r, b), r);
  assert.equal(merge(b, fork(b), r).items[0].deletedAt, T0 + 11000);
});

// --- step 7: documentation ------------------------------------------------------------------------

test('FR20 FR19 AC28 docs 05/09/03 carry the merge rules and 05 no longer contradicts the spec', async () => {
  const sync = await readRepoFile('docs/05-sync.md');
  const core = await readRepoFile('docs/09-core-api.md');
  const data = await readRepoFile('docs/03-data-model.md');
  assert.doesNotMatch(sync, /Toàn bộ item của \*\*bên thua\*\*|Toàn bộ item của bên thua/, '05 still says the whole losing item');
  for (const rule of ['Xoá project và env', 'cùng tạo một id', 'Đã xử lý', 'HISTORY_MAX', 'Đồng hồ hoà hoàn toàn', 'Sửa nội dung', '"deleted-elsewhere"', 'hoặc khôi phục']) {
    assert.ok(sync.includes(rule), `05 lacks: ${rule}`);
  }
  for (const rule of ['## `merge.js`', '`DELETED_ELSEWHERE = \'deleted-elsewhere\'`', 'conflict.at', 'Bảng xoá', 'amendment']) {
    assert.ok(core.includes(rule), `09 lacks: ${rule}`);
  }
  assert.equal(DELETED_ELSEWHERE, 'deleted-elsewhere');
  assert.ok(data.includes('"note": "deleted-elsewhere"'), '03 §1 lacks the note key');
});
