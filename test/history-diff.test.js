import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault, createItem, updateItem } from '../src/public/js/core/model.js';
import { ctx } from '../testkit/helpers.js';
import { diffVersion } from '../src/public/js/history-diff.js';

function fixture() {
  const v = createVault('00000000000000aa');
  const item = createItem(v, 'login', { title: 't0', notes: 'n0', fields: [{ label: 'User', kind: 'text', v: 'u0' }, { label: 'Pass', kind: 'secret', v: 'SECRET-OLD' }, { label: 'Code', kind: 'otp', v: 'OTP-OLD' }, { label: 'Gone', kind: 'text', v: 'g' }] }, ctx(1));
  const [user, pass, code, gone] = item.fields;
  return { v, item, user, pass, code, gone };
}

test('KM-003 AC24 FR27 diff marks changed attributes; secrets are masked; otp carries no value', () => {
  const { v, item, user, pass, code } = fixture();
  updateItem(v, item.id, { title: 't1', notes: 'n1', fields: [{ id: user.id }, { id: pass.id, v: 'SECRET-NEW' }, { id: code.id, v: 'OTP-NEW' }, { label: 'New', kind: 'text', v: 'fresh' }] }, ctx(2));
  const rows = diffVersion(item, item.history[0]);
  assert.deepEqual(rows.find((r) => r.attr === 'title'), { attr: 'title', before: 't0', after: 't1', masked: false });
  assert.equal(rows.find((r) => r.attr === 'notes').before, 'n0');
  const passRow = rows.find((r) => r.fieldId === pass.id);
  assert.deepEqual([passRow.masked, passRow.before, passRow.after], [true, 'SECRET-OLD', 'SECRET-NEW']);
  const otpRow = rows.find((r) => r.fieldId === code.id);
  assert.equal(otpRow.otp, true);
  assert.ok(!JSON.stringify(otpRow).includes('OTP-'));
  assert.equal(rows.find((r) => r.label === 'Gone').change, 'removed');
  assert.equal(rows.find((r) => r.label === 'New').change, 'added');
  assert.ok(!rows.some((r) => r.fieldId === user.id));
});

test('KM-003 FR27 a kind change between otp and text never shows the otp value', () => {
  const { v, item, user, pass, code, gone } = fixture();
  updateItem(v, item.id, { fields: [{ id: user.id }, { id: pass.id }, { id: code.id, kind: 'text', v: 'plain' }, { id: gone.id }] }, ctx(2));
  const row = diffVersion(item, item.history[0]).find((r) => r.fieldId === code.id);
  assert.equal(row.otp, true);
  assert.ok(!JSON.stringify(row).includes('OTP-OLD') && !JSON.stringify(row).includes('plain'));
});

test('KM-003 FR27 secret to text stays masked, and a version equal to the current one has no rows', () => {
  const { v, item, user, pass, code, gone } = fixture();
  updateItem(v, item.id, { fields: [{ id: user.id }, { id: pass.id, kind: 'text', v: 'now-plain' }, { id: code.id }, { id: gone.id }] }, ctx(2));
  assert.equal(diffVersion(item, item.history[0]).find((r) => r.fieldId === pass.id).masked, true);
  const same = { title: item.title, notes: item.notes, expires: item.expires, fields: item.fields, scopes: item.scopes };
  assert.deepEqual(diffVersion(item, same), []);
});

test('KM-003 FR27 changed assignments appear as a row', () => {
  const { v, item } = fixture();
  updateItem(v, item.id, { scopes: ['e_0000000000000001'] }, ctx(2));
  const row = diffVersion(item, item.history[0]).find((r) => r.attr === 'scopes');
  assert.deepEqual([row.before, row.after], [[], ['e_0000000000000001']]);
});
