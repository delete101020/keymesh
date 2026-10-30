# 09 · Hợp đồng lõi (`src/public/js/core/`)

Lõi là các ES module thuần, chạy y hệt trên trình duyệt, Node ≥ 20 và Workers: không DOM, không lưu trữ, không mạng, không ghi console, không giữ khoá hay plaintext ở trạng thái chung. Thời gian và `deviceId` luôn do bên gọi đưa vào. Tài liệu này là thứ các epic sau dựa vào; đổi chữ ký hay hành vi của một thao tác thì sửa tài liệu này trong cùng thay đổi.

Định dạng dữ liệu (schema vault, envelope, AAD, tham số cố định) nằm ở [03-data-model.md](03-data-model.md) §1–2; tài liệu này không chép lại mà chỉ nói thao tác nào đọc/ghi định dạng nào.

| Module | Nội dung | Import từ |
|---|---|---|
| `errors.js` | `KeymeshError`, `ERROR_CODES` | mọi module |
| `bytes.js` | base64 chặt, hex, UTF-8, `randomBytes`, `zeroize` | `crypto`, `model` |
| `model.js` | Schema vault v2, id, mẫu field, thao tác sửa có đồng hồ/lịch sử/tombstone, `validateVault` | `errors`, `bytes` |
| `crypto.js` | Dẫn xuất khoá, bọc/mở khoá, envelope vault/meta, tạo tài khoản, mở khoá trọn chuỗi | `errors`, `bytes`, `model` |

Client import bằng `./js/core/<module>.js`; server (KM-005) import bằng `../../public/js/core/<module>.js`. `crypto.js` còn export `_internal` — chỉ dành cho test (KAT, vector IV cố định), **không** thuộc hợp đồng.

## Lỗi

Mọi lỗi lõi ném ra là `KeymeshError` với `code` thuộc bốn giá trị dưới đây. `message` là chuỗi cố định, có thể kèm **tên** trường hay API (`kdf.iter`, `CompressionStream`), không bao giờ kèm giá trị do bên gọi đưa vào, password, byte khoá hay plaintext. Lỗi không gắn `cause`.

| `code` | Khi nào | Bên gọi nên |
|---|---|---|
| `decrypt-failed` | AES-GCM từ chối: sai password/khoá, sai ngữ cảnh (`vaultId`, loại envelope), bị sửa bất kỳ byte nào. Mọi trường hợp đều ra **cùng** một lỗi | Báo "sai mật khẩu hoặc dữ liệu hỏng"; không phân biệt |
| `format` | Envelope sai cấu trúc (thiếu trường, base64 hỏng, `iv` ≠ 12B, khoá bọc ≠ 48B), gzip/JSON hỏng sau giải mã, `vaultId` trong plaintext khác `vaultId` dùng để mở | Coi là dữ liệu hỏng |
| `unsupported` | `format` ≠ `keymesh`, `v` ≠ 2, `alg` ≠ `AES-GCM-256`, `by` ≠ `account`, `kdf.name` ≠ `PBKDF2-SHA256`, `kdf.iter` < 600 000 hoặc > 6 000 000 (`KDF_MAX_ITER`; `kdf` do server trả về nên không tin cậy); nền tảng thiếu `crypto.subtle`, `getRandomValues`, `CompressionStream`, `DecompressionStream`, `TextEncoder`/`TextDecoder` | Báo cần bản app mới hơn / trình duyệt khác |
| `invalid` | Bên gọi truyền sai: loại item lạ, `kind` lạ, `file` trên `kind` không cho phép, id không tồn tại, `ctx` thiếu, handle khoá sai vai trò | Lỗi lập trình hoặc dữ liệu form chưa kiểm |

`format` và `unsupported` luôn được báo **trước** khi thử giải mã.

## Khoá là handle mờ

`encKey`, `prfKey`, `accountKey`, `vaultKey` được trả dưới dạng đối tượng mờ: không có thuộc tính riêng nào, `JSON.stringify` ra `{}`, chỉ có getter `kind` (`'enc' | 'prf' | 'account' | 'vault'`). `CryptoKey` bên trong nằm ở private field, chỉ code trong `crypto.js` đọc được, nên không ai `exportKey` được `accountKey`/`vaultKey` dù chúng là extractable (để bọc lại được). Truyền handle sai vai trò → `invalid`. Ngoại lệ duy nhất ở dạng byte là `authKey` (`Uint8Array` 32B) để gửi server.

"Khoá app" = bên gọi bỏ mọi tham chiếu tới handle và vault plaintext; lõi không giữ gì để xoá thêm.

## `crypto.js`

Mọi thao tác dưới đây là `async` trừ `assertSupported`, `newKdf`, `newVaultId`. Thao tác nào cũng gọi `assertSupported()` trước.

| Thao tác | Vào | Ra | Lỗi |
|---|---|---|---|
| `assertSupported()` | — | — | `unsupported` (nêu tên API thiếu) |
| `newKdf()` | — | `{ name: 'PBKDF2-SHA256', iter: 600000, salt: <b64 16B> }` | — |
| `deriveFromPassword(password, kdf)` | `string`, `kdf` đã lưu | `{ encKey, authKey: Uint8Array(32) }` | `unsupported` (`kdf.name`, `kdf.iter` ngoài [`KDF_MIN_ITER`, `KDF_MAX_ITER`]) trước PBKDF2; `format` (`kdf`, `kdf.salt`); `invalid` |
| `deriveFromPrf(prfBytes)` | `Uint8Array(32)` đầu ra PRF | `prfKey` | `invalid` |
| `generateAccountKey()` | — | `accountKey` (32B ngẫu nhiên) | — |
| `generateVaultKey()` | — | `vaultKey` (32B ngẫu nhiên) | — |
| `newVaultId()` | — | 16 hex chữ thường | — |
| `wrapAccountKey(accountKey, encKey \| prfKey)` | | `{ iv, ct }` (`ct` 48B), IV mới mỗi lần | `invalid` |
| `unwrapAccountKey(wrapped, encKey \| prfKey)` | | `accountKey` | `format`, `decrypt-failed` |
| `wrapVaultKey(vaultKey, accountKey, vaultId)` | | `{ by: 'account', iv, ct }` | `invalid` |
| `unwrapVaultKey(wrapped, accountKey, vaultId)` | | `vaultKey` | `format`, `unsupported` (`by`), `decrypt-failed` |
| `encryptVault(vault, vaultKey)` | vault v2 (dùng `vault.vaultId` làm AAD) | `{ format, v, alg, iv, ct }` — JSON → gzip → AES-GCM, IV mới mỗi lần | `invalid`, `unsupported` |
| `decryptVault(envelope, vaultKey, vaultId)` | `vaultId` mong đợi | vault | `format`, `unsupported`, `decrypt-failed`; `format` nếu `vaultId` bên trong khác |
| `encryptVaultMeta(meta, vaultKey, vaultId)` | `{ name, color, order }` | `{ iv, ct }` | `invalid` |
| `decryptVaultMeta(envelope, vaultKey, vaultId)` | | `meta` | `format`, `decrypt-failed` |
| `createAccount(password, { meta }?)` | `meta` mặc định `DEFAULT_VAULT_META` (`name: ''`) | xem dưới | `invalid` |
| `unlockWithPassword(password, kdf, wrappedAccountKey, records)` | | `{ accountKey, vaults }` | `decrypt-failed` khi sai password (không mở vault nào); lỗi `kdf` như trên |
| `unlockWithAccountKey(accountKey, records)` | | `{ accountKey, vaults }` | `invalid` nếu `records` không phải mảng; lỗi từng vault nằm trong kết quả |

**Bản ghi vault (`record`)** — dạng lưu ở IndexedDB/server, cũng là dạng `unlock*` đọc:

```jsonc
{ "vaultId": "3f9c…", "wrappedVaultKey": { "by": "account", "iv": "…", "ct": "…" }, "meta": { "iv": "…", "ct": "…" }, "envelope": { "format": "keymesh", … } }
```

`meta` là tuỳ chọn. **Kết quả mở** cho từng vault, theo đúng thứ tự `records`:

```jsonc
{ "vaultId": "…", "ok": true,  "vault": { … }, "meta": { … } | null, "vaultKey": <handle> }
{ "vaultId": "…", "ok": false, "error": <KeymeshError> }   // vault này hỏng; các vault khác vẫn mở
```

**`createAccount`** trả phần cần lưu và phần giữ trong bộ nhớ:

```jsonc
{
  "kdf": { … }, "authKey": Uint8Array(32), "wrappedAccountKey": { "iv", "ct" },
  "records": [ <record của vault mặc định> ],
  "accountKey": <handle>,
  "vaults": [ { "vaultId", "ok": true, "vault": <vault rỗng>, "meta", "vaultKey": <handle> } ]
}
```

Hằng export: `KDF_NAME`, `KDF_MIN_ITER`, `KDF_MAX_ITER`, `ENVELOPE_FORMAT`, `ENVELOPE_VERSION`, `ENVELOPE_ALG`, `DEFAULT_VAULT_META`.

## `model.js`

Thao tác sửa **thay đổi vault tại chỗ** và trả về thực thể vừa sửa. Mọi thao tác có `ctx = { now: <ms>, deviceId: <string> }`; thiếu → `invalid`. Muốn bản sao thì bên gọi tự `structuredClone`.

| Thao tác | Ghi chú |
|---|---|
| `VAULT_VERSION = 2`, `HISTORY_MAX = 20`, `ITEM_TYPES`, `FIELD_KINDS`, `FILE_KINDS`, `ITEM_TEMPLATES` | Hằng, đều `Object.freeze`. `ITEM_TEMPLATES[type]` là danh sách `{ label, kind, file? }` theo đúng bảng *Mẫu field theo loại item* ở 03 §1 |
| `newId(kind)` | `kind ∈ project, env, item, field, device` → `p_ e_ i_ f_ d_` + 16 hex |
| `isId(s)` | Chấp nhận cả id có tiền tố (`[pefid]_`) lẫn 16 hex trần; không suy loại từ tiền tố |
| `createVault(vaultId)` | `{ v: 2, vaultId, projects: [], envs: [], items: [] }` |
| `addProject(vault, { name, order }, ctx)` / `updateProject(vault, id, patch, ctx)` / `deleteProject(vault, id, ctx)` | `order` mặc định = số project còn sống. Xoá project đặt `deletedAt` cho project và mọi env của nó |
| `addEnv(vault, projectId, { name, order, color }, ctx)` / `updateEnv` / `deleteEnv` | Project phải tồn tại và chưa xoá |
| `newField({ label, kind, v, file? }, ctx)` | `file` chỉ cho `multi`/`secret-multi`, chuỗi không rỗng |
| `createItem(vault, type, init, ctx)` | Field lấy từ mẫu của `type` (hoặc `init.fields`); `init` có thể có `title`, `notes`, `tags`, `favorite`, `expires`, `scopes`, `forkedFrom`. Loại lạ → `invalid` |
| `updateItem(vault, itemId, draft, ctx)` | Xem dưới |
| `trashItem` / `restoreItem` | Đặt / bỏ `deletedAt`, cập nhật `clock.deletedAt`; nội dung giữ nguyên |
| `purgeItem(vault, itemId, ctx)` | Đặt `purgedAt` (và `deletedAt` nếu chưa có), xoá trắng nội dung. Xem dưới |
| `validateVault(vault)` | `{ ok: true }` hoặc `{ ok: false, errors: [{ path, code, message }] }` |

**Một lần lưu.** Với mọi thực thể: chỉ giá trị thật sự khác mới tính là đổi; nếu có đổi thì đồng hồ của đúng giá trị đó thành `{ at: ctx.now, dev: ctx.deviceId }`, `rev + 1`, `updatedAt = ctx.now`. Một lần lưu không đổi gì thì không tăng `rev`. Thao tác sửa hoặc thành công trọn vẹn, hoặc ném `KeymeshError` mà không để lại thay đổi nào trên vault: bên gọi không cần làm việc trên bản sao.

**`updateItem` — nộp bản nháp.** `draft` chỉ chứa các thuộc tính bên gọi muốn đặt: `type`, `title`, `notes`, `favorite`, `expires`, `forkedFrom`, `fieldOrder`, `tags`, `scopes`, `fields`. Riêng `fields` là trạng thái mới của **các field còn sống**:

- `{ id, label?, kind?, v?, file? }` với `id` đã có: sửa field đó; phần không ghi giữ nguyên; `file: null` bỏ `file`. `at`/`dev` của field chỉ đổi khi `label`/`kind`/`v`/`file` khác.
- Không có `id`: field mới.
- Field còn sống không có mặt trong `fields`: bị xoá (`field.deletedAt = ctx.now`).
- Nếu `draft` không có `fieldOrder` thì `fieldOrder` theo thứ tự của `fields`.

Đổi `title`, `type`, `fields`, `notes`, `expires` hoặc `scopes` thì bản **trước** lần lưu được đẩy vào đầu `history` dưới dạng `{ at, rev, dev, reason: 'edit', title, type, fields, notes, expires, scopes }`, với `rev` là `rev` của bản cũ và `at`/`dev` là thời điểm và thiết bị đã thay bản đó; `history` cắt còn `HISTORY_MAX`. Đổi `favorite`, `fieldOrder`, `tags` không tạo bản lịch sử. Item trong thùng rác hoặc đã purge không sửa được (`invalid`).

**Purge.** Tombstone giữ đủ khoá của schema item để vẫn hợp lệ, nhưng chỉ `id`, `deletedAt`, `purgedAt` còn mang nghĩa: `title = ''`, `fields = []`, `fieldOrder = []`, `notes = ''`, `history = []`, `tags = []`, `scopes = []`, `favorite = false`, `expires = null`, `forkedFrom = null`, `conflict = null`. `type`, `rev`, `createdAt`, `updatedAt`, `clock` được giữ (không bí mật).

**`validateVault`.** `code` của vi phạm: `version`, `required`, `type`, `enum`, `file-kind`, `duplicate-id`, `dangling-ref` (env trỏ tới project không tồn tại), `history-max`. `path` dạng `items[1].fields[0].file`. Item có `scopes = []` hoặc trỏ tới env đã xoá là hợp lệ.

## Bộ vector cố định

`testkit/vectors.js`, sinh bằng `node testkit/gen-vectors.mjs` (chỉ dùng `node:crypto`/`node:zlib`, độc lập với lõi), gồm: password + salt → `masterKey`/`encKey`/`authKey`; PRF → `prfKey`; `accountKey` bọc bằng `encKey` và bằng `prfKey`; `vaultKey` bọc; meta; envelope vault (kiểm hai lớp vì gzip không tất định giữa các nền tảng). `test/vectors.test.js` kiểm lõi theo các vector này. Chạy `npm run vectors` để tính lại và so với bản đã commit; **không** ghi đè (`--write`) để cho test pass — đổi vector là đổi định dạng trên đĩa, phải ghi lý do.

## Epic nào dùng thao tác nào

| Epic | Cần từ lõi | Thao tác |
|---|---|---|
| KM-002 (merge) | Đồng hồ theo thuộc tính/field, lịch sử, tombstone, hình dạng vault | `clock` của project/env/item, `field.at`/`dev`, `history`, `HISTORY_MAX`, `deletedAt`/`purgedAt`, `updateItem` (cách một lần lưu ghi đồng hồ/lịch sử), `validateVault` cho kết quả gộp |
| KM-003 (app cục bộ) | Tạo tài khoản và vault mặc định, mở khoá offline, sửa và lưu, tạo item theo loại | `createAccount`, `unlockWithPassword`, `encryptVault`, `encryptVaultMeta`, `createItem`, `ITEM_TEMPLATES`, `ITEM_TYPES`, `FIELD_KINDS`, `newField`, `updateItem`, `add*`/`update*`/`delete*`, `trashItem`/`restoreItem`/`purgeItem`, `newId('device')` |
| KM-005 (server) | `authKey` để gửi, các envelope để lưu nguyên dạng, tham số `kdf` | `newKdf`, `deriveFromPassword` → `authKey`; dạng `wrappedAccountKey`, `record` (`wrappedVaultKey`, `meta`, `envelope`) ở trên; server chỉ lưu, không gọi thao tác giải mã nào |
| KM-007 (passkey) | `prfKey` bọc trực tiếp `accountKey` | `deriveFromPrf`, `wrapAccountKey`, `unwrapAccountKey`, `unlockWithAccountKey` |
| KM-008 (đổi mật khẩu, xoay khoá) | Bọc lại cùng `accountKey` dưới khoá mới; khoá mới | `newKdf`, `deriveFromPassword`, `wrapAccountKey`, `generateAccountKey`, `generateVaultKey`, `wrapVaultKey` |

## Lưu ý cho epic sau

- **KM-002:** project/env không có `clock.deletedAt` (03 §1 không định nghĩa) và `docs/05-sync.md` chưa có quy tắc gộp việc xoá project/env. Hai bên cùng xoá thì lấy `deletedAt` nhỏ hơn; chỉ một bên đổi thì bên đó thắng. Nếu sau này thêm đồng hồ thì thiếu được coi là `{ at: 0 }`.
- **KM-003:** `DEFAULT_VAULT_META.name` là chuỗi rỗng; app tự đặt tên hiển thị khi gọi `createAccount`. Id hex trần (không tiền tố) được chấp nhận khi kiểm tra; lõi không có bộ đọc file v1.
- **Password** được đưa vào PBKDF2 dưới dạng byte UTF-8, **không chuẩn hoá Unicode**. Cùng một mật khẩu gõ trên hai bàn phím cho ra dạng NFC/NFD khác nhau sẽ là hai mật khẩu khác nhau; muốn chuẩn hoá thì phải quyết trước khi có dữ liệu thật (đổi là đổi định dạng).
