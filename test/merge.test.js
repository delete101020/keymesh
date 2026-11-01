import test from 'node:test';
import assert from 'node:assert/strict';
import { merge } from '../src/public/js/core/merge.js';
import {
  createVault,
  addProject,
  updateProject,
  deleteProject,
  addEnv,
  updateEnv,
  deleteEnv,
  createItem,
  validateVault,
} from '../src/public/js/core/model.js';
import { ctx, T0, DEV_A, DEV_B, hasCode, readCoreSource, withGlobal } from '../testkit/helpers.js';

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
