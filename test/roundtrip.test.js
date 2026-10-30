import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptVault, decryptVault, generateVaultKey, newVaultId } from '../src/public/js/core/crypto.js';
import {
  ITEM_TYPES,
  FIELD_KINDS,
  createVault,
  addProject,
  addEnv,
  deleteEnv,
  createItem,
  updateItem,
  trashItem,
  purgeItem,
  validateVault,
} from '../src/public/js/core/model.js';
import { toHex, randomBytes } from '../src/public/js/core/bytes.js';
import { ctx, T0, DEV_B, bigVault } from '../testkit/helpers.js';

function fullVault() {
  const vault = createVault(newVaultId());
  const p = addProject(vault, { name: 'Cổng thanh toán 💳' }, ctx());
  const uat = addEnv(vault, p.id, { name: 'uat' }, ctx());
  const prod = addEnv(vault, p.id, { name: 'prod', color: 'red' }, ctx());
  const old = addEnv(vault, p.id, { name: 'cũ' }, ctx());
  deleteEnv(vault, old.id, ctx(T0 + 1));

  for (const type of ITEM_TYPES) {
    const item = createItem(vault, type, { title: `${type} — Đối tác X 🚀`, scopes: [uat.id, old.id], tags: ['đối-tác'] }, ctx());
    updateItem(vault, item.id, { notes: 'Ghi chú nhiều dòng\nDòng 2 — tiếng Việt có dấu: ắ ằ ẳ ẵ ặ 👩‍💻' }, ctx(T0 + 2, DEV_B));
  }
  // Every field kind, a 64 KB secret-multi read from a file, and an otp field.
  const kinds = createItem(
    vault,
    'login',
    {
      title: 'Đủ kiểu field',
      scopes: [prod.id],
      expires: '2026-12-31',
      fields: FIELD_KINDS.map((kind) => ({ label: `Field ${kind}`, kind, v: `giá trị ${kind} 🔐` })),
    },
    ctx(),
  );
  const big = 'A'.repeat(1024) + toHex(randomBytes(31 * 1024)) + 'Ω\n'.repeat(512);
  updateItem(
    vault,
    kinds.id,
    {
      fields: [
        ...kinds.fields.map((f) => ({ id: f.id })),
        { label: 'Cấu hình', kind: 'secret-multi', v: big, file: 'partnerx-uat.ovpn' },
        { label: 'One-time password', kind: 'otp', v: 'otpauth://totp/KeyMesh:me?secret=JBSWY3DPEHPK3PXP&issuer=KeyMesh' },
      ],
    },
    ctx(T0 + 3),
  );
  const trashed = createItem(vault, 'note', { title: 'Trong thùng rác', notes: 'vẫn giữ nội dung' }, ctx());
  trashItem(vault, trashed.id, ctx(T0 + 4));
  const purged = createItem(vault, 'ssh', { title: 'Đã xoá trắng' }, ctx());
  trashItem(vault, purged.id, ctx(T0 + 5));
  purgeItem(vault, purged.id, ctx(T0 + 6));
  return { vault, bigLength: big.length };
}

test('AC11 FR21 a vault with all 9 types, 6 field kinds, 64 KB file field, trash, purge, env tombstone and Unicode round-trips', async () => {
  const { vault, bigLength } = fullVault();
  assert.deepEqual(validateVault(vault), { ok: true });
  assert.ok(bigLength >= 64 * 1024);
  assert.deepEqual(new Set(vault.items.map((i) => i.type)), new Set(ITEM_TYPES));
  assert.deepEqual(new Set(vault.items.flatMap((i) => i.fields.map((f) => f.kind))), new Set(FIELD_KINDS));
  assert.ok(vault.items.some((i) => i.deletedAt !== null && i.purgedAt === null));
  assert.ok(vault.items.some((i) => i.purgedAt !== null));
  assert.ok(vault.envs.some((e) => e.deletedAt !== null));
  assert.ok(vault.items.some((i) => i.history.length > 0));

  const vk = await generateVaultKey();
  const opened = await decryptVault(await encryptVault(vault, vk), vk, vault.vaultId);
  assert.deepEqual(opened, vault);
});

test('AC11 FR21 an empty vault round-trips', async () => {
  const vault = createVault(newVaultId());
  const vk = await generateVaultKey();
  assert.deepEqual(await decryptVault(await encryptVault(vault, vk), vk, vault.vaultId), vault);
});

test('AC11 FR21 a ~1 MB vault round-trips', async () => {
  const vault = bigVault(newVaultId(), 1024 * 1024);
  assert.ok(JSON.stringify(vault).length >= 1024 * 1024);
  const vk = await generateVaultKey();
  assert.deepEqual(await decryptVault(await encryptVault(vault, vk), vk, vault.vaultId), vault);
});
