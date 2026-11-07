import test from 'node:test';
import assert from 'node:assert/strict';
import { addEnv, addProject, createItem, createVault, updateItem } from '../src/public/js/core/model.js';
import { countPending, sameVault } from '../src/public/js/vault-diff.js';
import { ctx } from '../testkit/helpers.js';

function base() {
  const v = createVault('0123456789abcdef');
  const p = addProject(v, { name: 'PaymentGW' }, ctx(1));
  addEnv(v, p.id, { name: 'uat' }, ctx(1));
  const item = createItem(v, 'login', { title: 'Partner X' }, ctx(1));
  return { v, p, item };
}

test('KM-006 AC42 FR32 an item saved twice and one env added count 2; back to the synced content counts 0', () => {
  const { v, p, item } = base();
  const synced = structuredClone(v);
  updateItem(v, item.id, { title: 'one' }, ctx(2));
  updateItem(v, item.id, { title: 'two' }, ctx(3));
  addEnv(v, p.id, { name: 'prod' }, ctx(4));
  assert.equal(countPending(synced, v), 2);
  const back = structuredClone(synced);
  updateItem(back, item.id, { title: 'x' }, ctx(5));
  updateItem(back, item.id, { title: 'Partner X' }, ctx(6));
  assert.equal(countPending(synced, back), 0, 'rev, clocks and history differ, content does not');
  assert.equal(sameVault(synced, back), false);
});

test('KM-006 FR32 never synced: every entity counts; equal vaults are the same whatever the key order', () => {
  const { v } = base();
  assert.equal(countPending(null, v), 3);
  const reordered = JSON.parse(JSON.stringify(v, Object.keys(v).reverse()));
  assert.equal(sameVault(v, { ...reordered, ...v }), true);
});
