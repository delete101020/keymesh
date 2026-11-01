import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault, addProject, addEnv, createItem, updateItem, deleteEnv, deleteProject, trashItem, purgeItem } from '../src/public/js/core/model.js';
import { ctx } from '../testkit/helpers.js';
import {
  liveEnvs,
  liveProjects,
  orderedFields,
  daysLeft,
  isExpiring,
  isProd,
  foldText,
  queryItems,
  searchItems,
  filterCounts,
  sharedChip,
  itemLiveEnvs,
  recentItems,
  favoriteItems,
} from '../src/public/js/vault-query.js';

function fixture() {
  const v = createVault('00000000000000aa');
  const pay = addProject(v, { name: 'PaymentGW' }, ctx());
  const crm = addProject(v, { name: 'CRM' }, ctx());
  const payUat = addEnv(v, pay.id, { name: 'uat' }, ctx());
  const payStg = addEnv(v, pay.id, { name: 'staging' }, ctx());
  const crmUat = addEnv(v, crm.id, { name: 'uat' }, ctx());
  return { v, pay, crm, payUat, payStg, crmUat };
}
const titles = (list) => list.map((i) => i.title);
const NOW = new Date(2026, 5, 15, 12).getTime();

test('KM-003 AC40 FR43 each filter gives the right items, deleted env and deleted project included', () => {
  const { v, pay, crm, payUat, payStg, crmUat } = fixture();
  const gone = addEnv(v, crm.id, { name: 'old' }, ctx());
  createItem(v, 'note', { title: 'none' }, ctx());
  createItem(v, 'note', { title: 'one', scopes: [payUat.id] }, ctx());
  createItem(v, 'note', { title: 'two', scopes: [payUat.id, crmUat.id] }, ctx());
  createItem(v, 'note', { title: 'ghost', scopes: [gone.id] }, ctx());
  const trashed = createItem(v, 'note', { title: 'trashed', scopes: [payUat.id] }, ctx());
  const purged = createItem(v, 'note', { title: 'purged', scopes: [payUat.id] }, ctx());
  trashItem(v, trashed.id, ctx());
  purgeItem(v, purged.id, ctx());
  deleteEnv(v, gone.id, ctx());

  const q = (filter) => titles(queryItems(v, filter, '', NOW));
  assert.deepEqual(q({ k: 'all' }), ['ghost', 'none', 'one', 'two']);
  assert.deepEqual(q({ k: 'unassigned' }), ['ghost', 'none']);
  assert.deepEqual(q({ k: 'project', id: pay.id }), ['one', 'two']);
  assert.deepEqual(q({ k: 'project', id: crm.id }), ['two']);
  assert.deepEqual(q({ k: 'env', id: payUat.id }), ['one', 'two']);
  assert.deepEqual(q({ k: 'env', id: payStg.id }), []);

  const counts = filterCounts(v, NOW);
  assert.equal(counts.all, 4);
  assert.equal(counts.unassigned, 2);
  assert.equal(counts.projects.get(pay.id), 2);
  assert.equal(counts.envs.get(payUat.id), 2);
});

test('KM-003 AC40 Concern 12 an env alive under a deleted project counts as deleted for display', () => {
  const { v, crm, crmUat } = fixture();
  const item = createItem(v, 'note', { title: 'x', scopes: [crmUat.id] }, ctx());
  deleteProject(v, crm.id, ctx());
  // What merge can produce: the env's own tombstone lost, the project's kept.
  crmUat.deletedAt = null;
  assert.ok(!liveEnvs(v).some((e) => e.id === crmUat.id));
  assert.deepEqual(itemLiveEnvs(v, item), []);
  assert.deepEqual(titles(queryItems(v, { k: 'unassigned' }, '', NOW)), ['x']);
  assert.ok(!liveProjects(v).some((p) => p.id === crm.id));
});

test('KM-003 AC18 FR26 shared chip names envs of the filtered project and counts the others', () => {
  const { v, pay, crm, payUat, payStg, crmUat } = fixture();
  const item = createItem(v, 'note', { title: 'x', scopes: [payUat.id, payStg.id, crmUat.id] }, ctx());
  assert.equal(sharedChip(v, item, { k: 'project', id: pay.id }), 'Dùng chung: uat, staging (+1 project khác)');
  assert.equal(sharedChip(v, item, { k: 'env', id: payUat.id }), 'Dùng chung: uat, staging (+1 project khác)');
  assert.equal(sharedChip(v, item, { k: 'project', id: crm.id }), 'Dùng chung: uat (+1 project khác)');
  assert.equal(sharedChip(v, item, { k: 'all' }), 'Dùng chung: uat, staging (+1 project khác)');
  const single = createItem(v, 'note', { title: 'y', scopes: [payUat.id] }, ctx());
  assert.equal(sharedChip(v, single, { k: 'all' }), null);
  const same = createItem(v, 'note', { title: 'z', scopes: [payUat.id, payStg.id] }, ctx());
  assert.equal(sharedChip(v, same, { k: 'all' }), 'Dùng chung: uat, staging');
});

test('KM-003 AC15 FR19 prod is recognised in any case and only on a live env', () => {
  const { v, pay, payUat } = fixture();
  const prod = addEnv(v, pay.id, { name: 'PROD' }, ctx());
  const a = createItem(v, 'note', { title: 'a', scopes: [prod.id] }, ctx());
  const b = createItem(v, 'note', { title: 'b', scopes: [payUat.id] }, ctx());
  assert.equal(isProd(v, a), true);
  assert.equal(isProd(v, b), false);
  deleteEnv(v, prod.id, ctx());
  assert.equal(isProd(v, a), false);
});

test('KM-003 AC26 FR29 FR30 expiry by local calendar: N−1, N, N+14 in, N+15 out', () => {
  const day = (d) => `2026-06-${String(d).padStart(2, '0')}`;
  assert.equal(daysLeft(day(14), NOW), -1);
  assert.equal(daysLeft(day(15), NOW), 0);
  assert.equal(daysLeft(day(29), NOW), 14);
  assert.equal(daysLeft('2026-06-30', NOW), 15);
  assert.equal(isExpiring({ expires: day(14) }, NOW), true);
  assert.equal(isExpiring({ expires: day(15) }, NOW), true);
  assert.equal(isExpiring({ expires: day(29) }, NOW), true);
  assert.equal(isExpiring({ expires: '2026-06-30' }, NOW), false);
  assert.equal(isExpiring({ expires: null }, NOW), false);
  assert.equal(daysLeft('rubbish', NOW), null);
  const { v } = fixture();
  for (const [title, expires] of [['a', day(14)], ['b', day(15)], ['c', day(29)], ['d', '2026-06-30'], ['e', null]]) {
    createItem(v, 'note', { title, expires }, ctx());
  }
  assert.deepEqual(titles(queryItems(v, { k: 'expiring' }, '', NOW)), ['a', 'b', 'c']);
});

test('KM-003 AC26 FR29 a day with a clock change still counts as one day, at any hour', () => {
  // US and EU DST dates, in whatever time zone the runner uses; local midnight and late evening alike.
  for (const [y, m, d] of [[2026, 2, 8], [2026, 2, 29], [2026, 9, 25], [2026, 10, 1]]) {
    for (const hour of [0, 1, 3, 23]) {
      const now = new Date(y, m, d, hour).getTime();
      const iso = (t) => {
        const x = new Date(t);
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      };
      assert.equal(daysLeft(iso(new Date(y, m, d + 1, 12)), now), 1);
      assert.equal(daysLeft(iso(new Date(y, m, d - 1, 12)), now), -1);
    }
  }
});

test('KM-003 AC41 FR44 search folds case and Vietnamese accents, skips secrets, otp and history', () => {
  const { v } = fixture();
  const item = createItem(v, 'login', { title: 'Mật khẩu VPN', fields: [{ label: 'City', kind: 'text', v: 'đà nẵng' }, { label: 'P', kind: 'secret', v: 'zebra' }, { label: 'O', kind: 'otp', v: 'OTPSECRET' }, { label: 'M', kind: 'secret-multi', v: 'hidden-multi' }, { label: 'U', kind: 'url', v: 'https://Find.Example' }, { label: 'T', kind: 'multi', v: 'dòng một' }], notes: 'Ghi Chú' }, ctx());
  updateItem(v, item.id, { title: 'Mật khẩu VPN', notes: 'Ghi Chú mới' }, ctx());
  const hit = (q) => searchItems([item], q).length === 1;
  for (const q of ['mat khau', 'MẬT', 'da nang', 'DA NANG', 'find.example', 'dong mot', 'ghi chu', 'd', 'mat vpn']) assert.ok(hit(q), q);
  for (const q of ['zebra', 'otpsecret', 'hidden-multi', 'mat zebra', 'không có']) assert.ok(!hit(q), q);
  assert.equal(foldText('Đặng ĐÀ'), 'dang da');
  assert.ok(hit(''));
});

test('KM-003 FR44 tags and field labels are not searched', () => {
  const { v } = fixture();
  const item = createItem(v, 'note', { title: 't', tags: ['tagword'], fields: [{ label: 'labelword', kind: 'text', v: 'x' }] }, ctx());
  assert.equal(searchItems([item], 'tagword').length, 0);
  assert.equal(searchItems([item], 'labelword').length, 0);
});

test('KM-003 FR21 orderedFields follows fieldOrder, appends unknown live fields, hides deleted ones', () => {
  const { v } = fixture();
  const item = createItem(v, 'login', {}, ctx());
  const [a, b, c] = item.fields;
  item.fieldOrder = [c.id, a.id];
  assert.deepEqual(orderedFields(item).map((f) => f.id), [c.id, a.id, b.id]);
  a.deletedAt = 1;
  assert.deepEqual(orderedFields(item).map((f) => f.id), [c.id, b.id]);
});

test('KM-004 AC12 recents keep their order and drop ids that are gone, trashed or purged', () => {
  const v = createVault('00000000000000ab');
  const mk = (title, extra = {}) => createItem(v, 'note', { title, ...extra }, ctx());
  const [a, b, c, d] = [mk('a'), mk('b'), mk('c'), mk('d')];
  trashItem(v, c.id, ctx());
  trashItem(v, d.id, ctx());
  purgeItem(v, d.id, ctx());
  assert.deepEqual(recentItems(v, [b.id, 'i_gone', c.id, d.id, a.id]).map((i) => i.title), ['b', 'a']);
});

test('KM-004 AC12 favourites: starred live items by title', () => {
  const v = createVault('00000000000000ac');
  const mk = (title) => createItem(v, 'note', { title }, ctx());
  const [z, a, n, t] = [mk('z'), mk('a'), mk('n'), mk('t')];
  for (const i of [z, a, t]) updateItem(v, i.id, { favorite: true }, ctx());
  trashItem(v, t.id, ctx());
  assert.deepEqual(favoriteItems(v).map((i) => i.title), ['a', 'z']);
  assert.equal(n.favorite, false);
});
