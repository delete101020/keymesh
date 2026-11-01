import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault, addProject, addEnv, createItem, updateItem, deleteEnv, deleteProject, validateVault, ITEM_TEMPLATES, ITEM_TYPES, FIELD_KINDS } from '../src/public/js/core/model.js';
import { ctx } from '../testkit/helpers.js';
import {
  DEFAULT_ENVS,
  projectNameError,
  envNameError,
  envListError,
  parseEnvList,
  addProjectWithEnvs,
  moveProject,
  moveEnv,
  countItemsInProject,
  countItemsInEnv,
  templateDraft,
  editDraft,
  duplicateDraft,
  blankDraftField,
  setDraftFieldKind,
  moveDraftField,
  setScopeSelection,
  draftErrors,
  commitDraft,
  forkItem,
} from '../src/public/js/vault-ops.js';
import { liveEnvs, liveProjects, orderedFields, queryItems } from '../src/public/js/vault-query.js';

const fresh = () => createVault('00000000000000aa');
const titles = (list) => list.map((i) => i.title);

test('KM-003 AC12 FR14 a new project gets dev, uat, staging, prod in order; names are checked', () => {
  const v = fresh();
  assert.deepEqual([...DEFAULT_ENVS], ['dev', 'uat', 'staging', 'prod']);
  assert.deepEqual(parseEnvList(' dev, uat ,,prod '), ['dev', 'uat', 'prod']);
  const p = addProjectWithEnvs(v, 'Payment GW', [...DEFAULT_ENVS], ctx());
  assert.deepEqual(liveEnvs(v, p.id).map((e) => e.name), ['dev', 'uat', 'staging', 'prod']);
  assert.equal(projectNameError(v, '   ', null), 'empty');
  assert.equal(projectNameError(v, 'payment gw', null), 'duplicate');
  assert.equal(projectNameError(v, 'payment gw', p.id), null);
  assert.equal(projectNameError(v, 'Other', null), null);
  assert.equal(envNameError(v, p.id, 'UAT', null), 'duplicate');
  assert.equal(envNameError(v, p.id, '', null), 'empty');
  assert.equal(envNameError(v, p.id, 'qa', null), null);
  assert.equal(envListError(['a', 'A']), 'duplicate');
  assert.equal(envListError(['a', 'b']), null);
});

test('KM-003 FR15 FR16 a deleted name can be used again', () => {
  const v = fresh();
  const p = addProjectWithEnvs(v, 'P', ['dev'], ctx());
  deleteEnv(v, liveEnvs(v, p.id)[0].id, ctx());
  assert.equal(envNameError(v, p.id, 'dev', null), null);
  deleteProject(v, p.id, ctx());
  assert.equal(projectNameError(v, 'P', null), null);
});

test('KM-003 AC13 FR15 FR16 project delete: confirm count 3, 2 go to unassigned, 1 stays, scopes keep ids', () => {
  const v = fresh();
  const p = addProjectWithEnvs(v, 'A', ['e1', 'e2'], ctx());
  const q = addProjectWithEnvs(v, 'B', ['x'], ctx());
  const [e1, e2] = liveEnvs(v, p.id);
  const [x] = liveEnvs(v, q.id);
  const one = createItem(v, 'note', { title: 'one', scopes: [e1.id] }, ctx());
  createItem(v, 'note', { title: 'two', scopes: [e1.id, e2.id] }, ctx());
  const three = createItem(v, 'note', { title: 'three', scopes: [e2.id, x.id] }, ctx());
  assert.equal(countItemsInProject(v, p.id), 3);
  assert.equal(countItemsInEnv(v, e1.id), 2);
  deleteProject(v, p.id, ctx());
  assert.deepEqual(liveProjects(v).map((n) => n.name), ['B']);
  assert.deepEqual(titles(queryItems(v, { k: 'unassigned' }, '', 0)), ['one', 'two']);
  assert.deepEqual(titles(queryItems(v, { k: 'project', id: q.id }, '', 0)), ['three']);
  assert.deepEqual(one.scopes, [e1.id]);
  assert.deepEqual(three.scopes, [e2.id, x.id]);
});

test('KM-003 AC14 FR17 moves renumber the order and stop at the ends', () => {
  const v = fresh();
  const a = addProject(v, { name: 'a' }, ctx());
  const b = addProject(v, { name: 'b' }, ctx());
  assert.equal(moveProject(v, a.id, -1, ctx()), false);
  assert.equal(moveProject(v, a.id, 1, ctx()), true);
  assert.deepEqual(liveProjects(v).map((p) => p.name), ['b', 'a']);
  const e1 = addEnv(v, b.id, { name: 'e1' }, ctx());
  const e2 = addEnv(v, b.id, { name: 'e2' }, ctx());
  assert.equal(moveEnv(v, e2.id, -1, ctx()), true);
  assert.deepEqual(liveEnvs(v, b.id).map((e) => e.id), [e2.id, e1.id]);
  assert.equal(moveEnv(v, e1.id, 1, ctx()), false);
});

test('KM-003 AC16 FR20 all 9 types: template fields match docs/03 and an empty title cannot be saved', () => {
  assert.equal(ITEM_TYPES.length, 9);
  for (const type of ITEM_TYPES) {
    const v = fresh();
    const d = templateDraft(type);
    assert.deepEqual(d.fields.map((f) => ({ label: f.label, kind: f.kind, ...(f.file ? { file: f.file } : {}) })), ITEM_TEMPLATES[type].map((t) => ({ ...t })), type);
    assert.equal(draftErrors(d).title, 'empty');
    d.title = '   ';
    assert.equal(draftErrors(d).title, 'empty');
    d.title = 'x';
    assert.equal(draftErrors(d), null);
    const item = commitDraft(v, d, ctx());
    assert.equal(item.type, type);
    assert.deepEqual(validateVault(v), { ok: true });
  }
});

test('KM-003 FR22 a draft made while filtering by env has that env selected', () => {
  assert.deepEqual(templateDraft('note', { k: 'env', id: 'e_1' }).scopes, ['e_1']);
  assert.deepEqual(templateDraft('note', { k: 'project', id: 'p_1' }).scopes, []);
});

test('KM-003 AC17 FR21 add otp, remove, reorder, change a file field to text: no file left', () => {
  const v = fresh();
  const d0 = templateDraft('vpn');
  d0.title = 'VPN';
  const item = commitDraft(v, d0, ctx());
  const d = editDraft(item);
  const otp = blankDraftField('otp');
  otp.label = 'OTP';
  otp.v = 'JBSWY3DP';
  d.fields.push(otp);
  const server = d.fields.find((f) => f.label === 'Server');
  d.fields = d.fields.filter((f) => f !== server);
  const cfg = d.fields.find((f) => f.file);
  assert.equal(cfg.file, 'client.ovpn');
  setDraftFieldKind(cfg, 'text');
  assert.equal('file' in cfg, false);
  moveDraftField(d, cfg.key, -2);
  assert.equal(draftErrors(d), null);
  commitDraft(v, d, ctx());
  const fields = orderedFields(item);
  assert.deepEqual(fields.map((f) => f.label), ['Cấu hình', 'Username', 'Password', 'OTP']);
  assert.equal(fields[0].kind, 'text');
  assert.equal('file' in fields[0], false);
  assert.equal(fields[3].kind, 'otp');
  for (const kind of FIELD_KINDS) setDraftFieldKind(blankDraftField(), kind);
  assert.deepEqual(validateVault(v), { ok: true });
});

test('KM-003 AC30 FR33 an otp field with a bad or empty value blocks the save, at that field', () => {
  const d = templateDraft('note');
  d.title = 't';
  const f = blankDraftField('otp');
  d.fields.push(f);
  assert.equal(draftErrors(d).fields[f.key], 'empty');
  f.v = 'otpauth://hotp/x?secret=JBSWY3DP';
  assert.equal(draftErrors(d).fields[f.key], 'hotp');
  f.v = 'JBSWY3DP';
  assert.equal(draftErrors(d), null);
});

test('KM-003 AC19 FR22 editing assignments keeps the id of a deleted env', () => {
  const v = fresh();
  const p = addProjectWithEnvs(v, 'A', ['gone', 'live', 'other'], ctx());
  const [gone, live, other] = liveEnvs(v, p.id);
  const item = createItem(v, 'note', { title: 't', scopes: [gone.id, live.id] }, ctx());
  deleteEnv(v, gone.id, ctx());
  const d = editDraft(item);
  setScopeSelection(d, live.id, false);
  setScopeSelection(d, other.id, true);
  commitDraft(v, d, ctx());
  assert.deepEqual(item.scopes, [gone.id, other.id]);
});

test('KM-003 AC21 FR24 fork: new item in that env only, new field ids, empty history; both independent', () => {
  const v = fresh();
  const p = addProjectWithEnvs(v, 'A', ['uat', 'staging'], ctx(1));
  const [uat, stg] = liveEnvs(v, p.id);
  const item = createItem(v, 'login', { title: 't', scopes: [uat.id, stg.id], tags: ['keep'] }, ctx(1));
  const [user, pass] = item.fields;
  updateItem(v, item.id, { fields: [{ id: user.id, v: 'u' }, { id: pass.id, v: 'p' }, { id: item.fields[2].id }] }, ctx(2));
  const fork = forkItem(v, item.id, stg.id, ctx(3));
  assert.deepEqual(fork.scopes, [stg.id]);
  assert.equal(fork.forkedFrom, item.id);
  assert.deepEqual(fork.history, []);
  assert.deepEqual(fork.tags, ['keep']);
  assert.deepEqual(orderedFields(fork).map((f) => f.v), ['u', 'p', '']);
  assert.ok(fork.fields.every((f) => !item.fields.some((x) => x.id === f.id)));
  assert.deepEqual(item.scopes, [uat.id]);
  updateItem(v, fork.id, { fields: [{ id: orderedFields(fork)[1].id, v: 'fork' }, ...orderedFields(fork).filter((_, i) => i !== 1).map((f) => ({ id: f.id }))] }, ctx(4));
  assert.equal(pass.v, 'p');
  updateItem(v, item.id, { title: 'changed' }, ctx(5));
  assert.equal(fork.title, 't');
  assert.deepEqual(validateVault(v), { ok: true });
});

test('KM-003 AC22 FR24 no fork from an item with one live env, even if a deleted env remains', () => {
  const v = fresh();
  const p = addProjectWithEnvs(v, 'A', ['uat', 'gone'], ctx());
  const [uat, gone] = liveEnvs(v, p.id);
  const item = createItem(v, 'note', { title: 't', scopes: [uat.id, gone.id] }, ctx());
  deleteEnv(v, gone.id, ctx());
  assert.equal(forkItem(v, item.id, uat.id, ctx()), null);
  assert.equal(v.items.length, 1);
});

test('KM-003 AC23 FR25 duplicate: title suffix, same scopes, empty history, no forkedFrom, new field ids', () => {
  const v = fresh();
  const p = addProjectWithEnvs(v, 'A', ['uat'], ctx());
  const [uat] = liveEnvs(v, p.id);
  const item = createItem(v, 'login', { title: 't', scopes: [uat.id], forkedFrom: 'i_0000000000000001' }, ctx());
  updateItem(v, item.id, { title: 't2' }, ctx());
  const d = duplicateDraft(item);
  assert.equal(d.title, 't2 (bản sao)');
  assert.equal(v.items.length, 1);
  const copy = commitDraft(v, d, ctx());
  assert.deepEqual(copy.scopes, item.scopes);
  assert.deepEqual(copy.history, []);
  assert.equal(copy.forkedFrom, null);
  assert.ok(copy.fields.every((f) => !item.fields.some((x) => x.id === f.id)));
});

test('KM-003 AC34 FR39 a save that does not touch a field leaves its bytes as they were', () => {
  const v = fresh();
  const item = createItem(v, 'vpn', { title: 't', fields: [{ label: 'C', kind: 'secret-multi', v: 'a\r\nb\r\n', file: 'c.ovpn' }, { label: 'N', kind: 'text', v: 'x' }] }, ctx());
  const d = editDraft(item);
  d.fields[1].v = 'y';
  commitDraft(v, d, ctx());
  const f = item.fields.find((x) => x.label === 'C');
  assert.equal(f.v, 'a\r\nb\r\n');
  assert.equal(f.file, 'c.ovpn');
});
