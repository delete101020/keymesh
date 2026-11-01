// AC26 NFR06: the properties of docs/05 § "Tính chất cần test" on ≥ 500 seeded random triples.
// A failure names its seed; rerun one case with MERGE_SEED=<seed> MERGE_CASES=1 (Node).
//
// How "mọi nội dung thua tìm lại được" is read: per element. Every pre-merge title/type/notes/expires,
// every field (id + value) and every scope of local/remote that is not in the merged item is in one of
// its history entries. Not checked where FR14 blanks content on purpose (purge) or where the merged
// history is at HISTORY_MAX (the cut is AC20's job); the generator keeps saves per side ≤ 5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { merge } from '../src/public/js/core/merge.js';
import { validateVault } from '../src/public/js/core/model.js';
import { genCase, same, lostIds, unrecoverable, wrongDeletions } from '../testkit/merge-gen.js';

const env = globalThis.process?.env ?? {};
const SEED = Number(env.MERGE_SEED ?? 0x5eed);
const CASES = Number(env.MERGE_CASES ?? 500);

function check(c) {
  const { b, l, r } = c;
  const m = merge(b, l, r);
  const fails = [];
  if (!same(merge(b, l, l), l) || !same(merge(b, r, r), r)) fails.push('merge(b, x, x) = x');
  if (!same(merge(b, b, r), r)) fails.push('merge(b, b, r) = r');
  if (!same(merge(b, l, b), l)) fails.push('merge(b, l, b) = l');
  if (!same(merge(b, r, l), m)) fails.push('merge(b, l, r) = merge(b, r, l)');
  if (!same(merge(b, m, m), m)) fails.push('merge(b, m, m) = m');
  const lost = lostIds(m, l, r);
  if (lost.length) fails.push(`ids lost: ${lost.join(', ')}`);
  const gone = unrecoverable(m, l, r);
  if (gone.length) fails.push(`losing content not in history: ${gone.join(', ')}`);
  const wrong = wrongDeletions(m, b, l, r);
  if (wrong.length) fails.push(`wrong deletions: ${wrong.join(', ')}`);
  const v = validateVault(m);
  if (!v.ok) fails.push(`invalid result: ${JSON.stringify(v.errors.slice(0, 3))}`);
  return { m, fails };
}

test(`AC26 FR01 FR03 FR18 NFR04 NFR06 merge properties on ${CASES} seeded cases from seed ${SEED}`, (t) => {
  const failed = [];
  let conflicts = 0;
  let deletions = 0;
  for (let i = 0; i < CASES; i++) {
    const c = genCase(SEED + i);
    const { m, fails } = check(c);
    if (fails.length) failed.push(`seed ${c.seed}: ${fails.join('; ')}`);
    conflicts += m.items.filter((x) => x.conflict !== null).length;
    deletions += m.items.filter((x) => x.deletedAt !== null).length;
  }
  t.diagnostic(`AC26 ${CASES} cases: ${conflicts} items with a conflict mark, ${deletions} in the trash or purged`);
  assert.deepEqual(failed.slice(0, 10), [], `${failed.length} of ${CASES} cases failed`);
  assert.ok(conflicts > CASES / 10, 'the generator produces conflicts');
  assert.ok(deletions > CASES / 10, 'the generator produces deletions');
});

test('AC26 NFR04 the same seed gives the same case and the same merge result', () => {
  const a = genCase(SEED);
  const b = genCase(SEED);
  assert.deepEqual(a, b);
  assert.deepEqual(merge(a.b, a.l, a.r), merge(b.b, b.l, b.r));
});
