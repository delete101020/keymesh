# 09 · Hợp đồng lõi (`src/public/js/core/`)

Lõi là các ES module thuần, chạy y hệt trên trình duyệt, Node ≥ 20 và Workers: không DOM, không lưu trữ, không mạng, không ghi console, không giữ khoá hay plaintext ở trạng thái chung. Thời gian và `deviceId` luôn do bên gọi đưa vào. Tài liệu này là thứ các epic sau dựa vào; đổi chữ ký hay hành vi của một thao tác thì sửa tài liệu này trong cùng thay đổi.

Định dạng dữ liệu (schema vault, envelope, AAD, tham số cố định) nằm ở [03-data-model.md](03-data-model.md) §1–2; tài liệu này không chép lại mà chỉ nói thao tác nào đọc/ghi định dạng nào.

| Module | Nội dung | Import từ |
|---|---|---|
| `errors.js` | `KeymeshError`, `ERROR_CODES` | mọi module |
| `bytes.js` | base64 chặt, hex, UTF-8, `randomBytes`, `zeroize` | `crypto`, `model` |
| `model.js` | Schema vault v2, id, mẫu field, thao tác sửa có đồng hồ/lịch sử/tombstone, `validateVault` | `errors`, `bytes` |
| `crypto.js` | Dẫn xuất khoá, bọc/mở khoá, envelope vault/meta, tạo tài khoản, mở khoá trọn chuỗi | `errors`, `bytes`, `model` |
| `merge.js` | Gộp ba chiều `merge(base, local, remote)` theo thực thể, thuộc tính và field | `errors`, `model` |

Client import bằng `./js/core/<module>.js`; server (KM-005) import bằng `../../public/js/core/<module>.js`. `crypto.js` còn export `_internal` — chỉ dành cho test (KAT, vector IV cố định), **không** thuộc hợp đồng.

## Lỗi

Mọi lỗi lõi ném ra là `KeymeshError` với `code` thuộc bốn giá trị dưới đây. `message` là chuỗi cố định, có thể kèm **tên** trường hay API (`kdf.iter`, `CompressionStream`), không bao giờ kèm giá trị do bên gọi đưa vào, password, byte khoá hay plaintext. Lỗi không gắn `cause`.

| `code` | Khi nào | Bên gọi nên |
|---|---|---|
| `decrypt-failed` | AES-GCM từ chối: sai password/khoá, sai ngữ cảnh (`vaultId`, loại envelope), bị sửa bất kỳ byte nào. Mọi trường hợp đều ra **cùng** một lỗi | Báo "sai mật khẩu hoặc dữ liệu hỏng"; không phân biệt |
| `format` | Envelope sai cấu trúc (thiếu trường, base64 hỏng, `iv` ≠ 12B, khoá bọc ≠ 48B), gzip/JSON hỏng sau giải mã, `vaultId` trong plaintext khác `vaultId` dùng để mở | Coi là dữ liệu hỏng |
| `unsupported` | `format` ≠ `keymesh`, `v` ≠ 2, `alg` ≠ `AES-GCM-256`, `by` ≠ `account`, `kdf.name` ≠ `PBKDF2-SHA256`, `kdf.iter` < 600 000 hoặc > 6 000 000 (`KDF_MAX_ITER`; `kdf` do server trả về nên không tin cậy); nền tảng thiếu `crypto.subtle`, `getRandomValues`, `CompressionStream`, `DecompressionStream`, `TextEncoder`/`TextDecoder` | Báo cần bản app mới hơn / trình duyệt khác |
| `invalid` | Bên gọi truyền sai: loại item lạ, `kind` lạ, `file` trên `kind` không cho phép, id không tồn tại, `ctx` thiếu, handle khoá sai vai trò; `merge` nhận vault không hợp lệ hoặc khác vault | Lỗi lập trình hoặc dữ liệu form chưa kiểm |

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
| `deriveFromPassword(password, kdf)` | `string` (chuẩn hoá NFC trước khi lấy byte UTF-8), `kdf` đã lưu | `{ encKey, authKey: Uint8Array(32) }` | `unsupported` (`kdf.name`, `kdf.iter` ngoài [`KDF_MIN_ITER`, `KDF_MAX_ITER`]) trước PBKDF2; `format` (`kdf`, `kdf.salt`); `invalid` |
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
| `restoreItemVersion(vault, itemId, entry, ctx)` | Xem dưới |
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

**`restoreItemVersion` — khôi phục một bản lịch sử** (KM-003, FR28). `entry` là một phần tử của `item.history`. Đặt `title`, `notes`, `expires`, `fields` theo bản đó, như một lần lưu với `reason: 'restore'`. Lý do cần thao tác riêng: `updateItem` ghi cứng `reason: 'edit'` và từ chối field đã có tombstone, trong khi field đã xoá phải quay lại được.

- `scopes` và `type` giữ nguyên: khôi phục `scopes` sẽ gán item lại vào env đã fork đi.
- Field giữ nguyên `id` và nhận đồng hồ mới, nên `merge` vẫn ghép đúng. Field còn sống mà không có trong bản đó bị xoá.
- Bản lịch sử không chứa `fieldOrder`: giữ thứ tự hiện tại, field quay lại nối vào cuối.
- Bản giống hệt hiện tại thì không làm gì (không tăng `rev`, không thêm lịch sử). `entry` sai hình dạng → `invalid`, item không đổi.

**Purge.** Tombstone giữ đủ khoá của schema item để vẫn hợp lệ, nhưng chỉ `id`, `deletedAt`, `purgedAt` còn mang nghĩa: `title = ''`, `fields = []`, `fieldOrder = []`, `notes = ''`, `history = []`, `tags = []`, `scopes = []`, `favorite = false`, `expires = null`, `forkedFrom = null`, `conflict = null`. `type`, `rev`, `createdAt`, `updatedAt`, `clock` được giữ (không bí mật).

**`validateVault`.** `code` của vi phạm: `version`, `required`, `type`, `enum`, `file-kind`, `duplicate-id`, `dangling-ref` (env trỏ tới project không tồn tại), `history-max`. `path` dạng `items[1].fields[0].file`. Item có `scopes = []` hoặc trỏ tới env đã xoá là hợp lệ.

## `merge.js`

| Thao tác | Vào | Ra | Lỗi |
|---|---|---|---|
| `merge(base, local, remote)` | Ba bản của **cùng một vault** đã giải mã. `base` là bản chung gần nhất, có thể là `null`/`undefined` | Vault **mới** `{ v, vaultId, projects, envs, items }` | `invalid` |
| `DELETED_ELSEWHERE = 'deleted-elsewhere'` | Hằng | Giá trị của `note` trên bản lịch sử `conflict` sinh ra khi việc chuyển vào thùng rác thua một lần sửa | — |

Các quy tắc chuẩn nằm ở [05-sync.md](05-sync.md) § "Thuật toán gộp ba chiều theo field". Mục này là hợp đồng mà KM-006 (sync) và KM-008 (thùng rác) dựa vào, gồm cả những chỗ 05 để engineer chọn.

**Đầu vào và lỗi.** `local`, `remote` và `base` (nếu có) phải qua `validateVault`, cùng `v` và cùng `vaultId`. Sai thì ném `KeymeshError('invalid')` với `message` là `Invalid argument: <tên>`, trong đó `<tên>` là một trong `local`, `remote`, `base`, `v`, `vaultId`. Thứ tự kiểm: `local`, `remote`, `base`, rồi `v`, rồi `vaultId`. Không có giá trị nào của vault trong lỗi. Khi ném lỗi thì không có kết quả, và không đầu vào nào bị đổi. `base` vắng thì coi là vault rỗng cùng `vaultId` với `local`.

**Tính thuần.** Không sửa đầu vào; kết quả không chung object nào với đầu vào. Không đọc giờ, không cần `deviceId`, không có nguồn ngẫu nhiên, không ghi console. Cùng ba đầu vào thì cùng kết quả (so sâu) trên Node và trình duyệt. `merge` **không** gọi `validateVault` trên kết quả; tính hợp lệ của kết quả được chứng minh bằng test (property test 500 bộ). Chỉ năm khoá trên có trong vault kết quả, khoá lạ ở cấp vault bị bỏ. Khoá lạ trong một thực thể chỉ còn khi thực thể được lấy nguyên một bên (bước 1 của 05).

**So bằng và thứ tự toàn phần.** "Bằng" là so sâu không phụ thuộc thứ tự khoá: so dạng `canon` (JSON với khoá sắp tăng dần, bỏ `undefined`). Đồng hồ `a` thắng `b` khi `a.at` lớn hơn; hoà thì `dev` lớn hơn (so code unit, không dùng `localeCompare`); hoà cả hai thì chuỗi `canon` của giá trị lớn hơn thắng. Đồng hồ thiếu được coi là `{ at: 0, dev: '' }`.

**`merge3` trên một giá trị.** "Đổi" là khác giá trị trong `base`, không dựa vào đồng hồ. Chỉ khi hai bên cùng đổi và ra hai giá trị khác nhau mới là xung đột thật; bên có đồng hồ thắng lấy giá trị, kèm đồng hồ của nó. Hai bên cùng giữ một giá trị nhưng đồng hồ khác nhau: đồng hồ bên nào còn bằng `base` thì lấy đồng hồ bên kia; nếu không thì lấy đồng hồ thắng. Khi đồng hồ đi tới, quy tắc này cho đúng "đồng hồ muộn hơn" của spec; nó chỉ khác khi lệch giờ, và nhờ vậy `merge(b, b, r) = r` luôn đúng.

**Thứ tự mảng.** Mọi thứ tự đều đối xứng: `merge(b, l, r)` và `merge(b, r, l)` bằng nhau tuyệt đối, kể cả thứ tự `history`.

- `projects`, `envs`, `items`, `item.fields` (dãy id): chỉ một bên đổi dãy thì lấy dãy bên đó, rồi nối các id còn thiếu của bên kia vào cuối. Cả hai cùng đổi thì id của `base` theo thứ tự `base`, sau đó nhóm id mới của từng bên theo thứ tự của bên đó; nhóm có id đầu nhỏ hơn đứng trước.
- `tags`, `scopes`, `conflict.fields`, `conflict.attrs`: chỉ một bên đổi (so như mảng) thì lấy nguyên mảng bên đó. Cả hai cùng đổi thì gộp tập hợp ba chiều theo 05 và **sắp tăng dần**.
- `history`: luôn sắp theo `(at, rev, dev)` giảm dần, hoà nữa thì theo `canon` giảm dần. Chỉ một bên đổi `history` và lần gộp không sinh bản mới nào thì lấy nguyên mảng bên đó.

**Item.**

| Phần | Cách gộp |
|---|---|
| `type`, `title`, `notes`, `expires`, `favorite`, `forkedFrom` | `merge3` với `clock[thuộc tính]`. Xung đột → tên thuộc tính vào `conflict.attrs` |
| `fields` | Theo `field.id`. Có ở một bên thì giữ. Có ở cả hai thì `merge3` trên `{ label, kind, v, file, deletedAt }` với đồng hồ `at`/`dev` của field. Xung đột → id vào `conflict.fields` |
| `fieldOrder` | **Không sinh xung đột.** Chỉ một bên đổi thì lấy bên đó. Cả hai cùng đổi thì giữ các id theo tập hợp ba chiều, theo thứ tự của bên có `clock.fieldOrder` thắng, rồi phần còn lại theo bên kia. Sau đó khớp với `fields` đã gộp: id của field đã xoá bị bỏ, field còn sống mà thiếu thì nối vào cuối |
| `tags`, `scopes` | Tập hợp ba chiều, không bao giờ sinh xung đột |
| `deletedAt`, `purgedAt` | Bảng xoá dưới đây |
| `history`, `conflict` | Xem dưới |

**"Sửa nội dung"** (dùng cho bảng xoá) là có một thuộc tính khác `base` trong `type`, `title`, `notes`, `expires`, `favorite`, `forkedFrom`, `fieldOrder`; hoặc có field mới hay field khác `base` ở phần `{ label, kind, v, file, deletedAt }`; hoặc `tags`/`scopes` khác `base` **về tập hợp**. Đổi `conflict` không tính. Không có `base` thì mọi bên đều tính là đã sửa nội dung.

**Bảng xoá.** "Bên xoá" là bên đổi `deletedAt` so với `base`.

| Trường hợp | Kết quả |
|---|---|
| Một bên chuyển vào thùng rác, bên kia không sửa nội dung | Vào thùng rác, `deletedAt` và `clock.deletedAt` của bên xoá |
| Một bên chuyển vào thùng rác, bên kia sửa nội dung | Bên sửa thắng: `deletedAt` của bên sửa (`null`), nội dung gộp như thường, `conflict.attrs` có `deletedAt`, bên xoá vào `history` với `note: DELETED_ELSEWHERE` |
| Cả hai cùng chuyển vào thùng rác | `deletedAt` nhỏ hơn cùng `clock.deletedAt` của nó; không đánh dấu |
| Một bên khôi phục, bên kia để nguyên trong thùng rác | Bên khôi phục thắng |
| Một bên khôi phục, bên kia khôi phục rồi xoá lại | `clock.deletedAt` quyết định; `conflict.attrs` có `deletedAt`, bên thua vào `history`. Nếu bên thắng là bên xoá mà bên kia đã sửa nội dung thì bên sửa thắng (bên xoá có `note`) |
| Một bên purge, bên kia không sửa nội dung và không khôi phục | Tombstone của bên purge. Nếu bên kia cũng đã chuyển vào thùng rác (đổi `deletedAt` so với `base`) sớm hơn thì lấy `deletedAt` đó |
| Một bên purge, bên kia sửa nội dung hoặc khôi phục | Item của bên kia (nội dung, `history`, `deletedAt`), `purgedAt = null`, `conflict.attrs` có `purgedAt`. Bên purge không sinh bản lịch sử |
| Cả hai cùng purge | Một tombstone: `deletedAt` và `purgedAt` nhỏ hơn, `history = []`, `conflict = null` |
| Xoá field ở một bên, sửa field đó ở bên kia | `merge3` trên field: đồng hồ muộn hơn thắng, bên thua vào `history` |

**Bản lịch sử `conflict`** (FR09). Mỗi bên thua ít nhất một giá trị (thuộc tính, field hay `deletedAt`) có đúng một bản `{ at, rev, dev, reason: 'conflict', note?, title, type, fields, notes, expires, scopes }`, chứa trạng thái của bên đó **trước khi gộp**. `rev` là `rev` của bên đó; `at`/`dev` là đồng hồ muộn nhất của bên đó, xét mọi `clock.*` và `at`/`dev` của mọi field. Khoá này không trùng bản `edit` nào của chính bên đó, và mọi thiết bị gộp cùng ba bản đều sinh cùng một bản.

**Gộp `history`** (FR11). Hợp `local.history`, `remote.history` và các bản `conflict` mới, bỏ trùng theo khoá `(at, rev, dev)`. Trùng khoá mà khác nội dung thì giữ bản có `canon` lớn hơn. Sắp như trên, rồi giữ mọi bản `conflict` vừa sinh (tối đa 2) và lấp phần còn lại bằng các bản mới nhất cho đủ `HISTORY_MAX`. `base.history` không được đưa vào hợp: bản nào của `base` mà cả hai bên đều đã cắt đi thì không quay lại.

**Đánh dấu `conflict`** (FR10). Không có xung đột mới mà `conflict` chỉ đổi ở một bên thì lấy nguyên `conflict` của bên đó. Nếu không, `fields` và `attrs` cũ gộp như tập hợp ba chiều so với `base`, rồi thêm xung đột mới của lần gộp này. Nhờ vậy "Đã xử lý" ở một bên mà bên kia không đổi thì đánh dấu cũ mất. Cả hai tập rỗng thì `conflict = null`. `conflict.at` là `max` của hai nguồn: `at` ở đồng hồ cả hai bên của mọi giá trị xung đột trong lần gộp này (với `purgedAt` thì lấy chính `purgedAt` của bên purge), và `conflict.at` của mỗi bên còn ít nhất một đánh dấu trong kết quả. Tombstone luôn có `conflict = null`.

**Project và env** (FR16, FR17). `name`, `order`, `color` qua `merge3` với `clock`; khi xung đột thì bên thắng lấy giá trị, không ghi lịch sử, không đánh dấu. `deletedAt` không có đồng hồ: chỉ một bên đổi thì bên đó thắng; cả hai cùng xoá thì lấy `deletedAt` nhỏ hơn. Phép gộp không tự tạo thêm lần xoá nào: item vẫn giữ id env đã xoá trong `scopes`, env tạo mới dưới project đã xoá vẫn sống. `projectId` không có đồng hồ và chỉ khác nhau khi hai bên cùng tạo một id; khi đó lấy theo bên có `updatedAt` lớn hơn, hoà thì theo `canon` lớn hơn.

**Hai bên cùng tạo một id** (FR15): gộp như với `base` rỗng. Mọi giá trị khác nhau là xung đột thật, giá trị giống nhau thì không; `tags`/`scopes` lấy hợp.

**`rev`, `updatedAt`, `createdAt`** (FR12, đã sửa theo amendment của originator ngày 2026-11-01). "Nội dung" của kết quả là mọi khoá trừ `rev` và `updatedAt`. Nội dung bằng đúng một bên thì lấy nguyên `rev`/`updatedAt` của bên đó; bằng cả hai bên thì lấy bên có `(rev, updatedAt)` lớn hơn. Còn lại thì `rev = max(l.rev, r.rev) + 1` và `updatedAt = max(l.updatedAt, r.updatedAt, đồng hồ muộn nhất trong kết quả)`. `createdAt` luôn là giá trị nhỏ hơn. Lý do của amendment: model tăng `updatedAt` mà không ghi đồng hồ khi chỉ đổi `tags`/`scopes`, khi `deleteProject` chạm vào env, và khi purge item đã nằm trong thùng rác. Nếu tính `updatedAt` chỉ từ đồng hồ thì `merge(b, b, r) = r` sai.

## Bộ vector cố định

`testkit/vectors.js`, sinh bằng `node testkit/gen-vectors.mjs` (chỉ dùng `node:crypto`/`node:zlib`, độc lập với lõi), gồm: password + salt → `masterKey`/`encKey`/`authKey`; PRF → `prfKey`; `accountKey` bọc bằng `encKey` và bằng `prfKey`; `vaultKey` bọc; meta; envelope vault (kiểm hai lớp vì gzip không tất định giữa các nền tảng). `test/vectors.test.js` kiểm lõi theo các vector này. Chạy `npm run vectors` để tính lại và so với bản đã commit; **không** ghi đè (`--write`) để cho test pass — đổi vector là đổi định dạng trên đĩa, phải ghi lý do.

## Epic nào dùng thao tác nào

| Epic | Cần từ lõi | Thao tác |
|---|---|---|
| KM-002 (merge) | Đồng hồ theo thuộc tính/field, lịch sử, tombstone, hình dạng vault | `clock` của project/env/item, `field.at`/`dev`, `history`, `HISTORY_MAX`, `deletedAt`/`purgedAt`, `updateItem` (cách một lần lưu ghi đồng hồ/lịch sử), `validateVault` cho kết quả gộp |
| KM-006 (sync) | Gộp khi bị 409 và khi pull lúc đang dirty | `merge(base, local, remote)`; lỗi `invalid` nghĩa là một bản hỏng hoặc khác vault, không gộp |
| KM-008 (thùng rác) | Hiện bản lịch sử "đã bị xoá ở thiết bị khác", đánh dấu `deletedAt`/`purgedAt` | `DELETED_ELSEWHERE`, `item.conflict.attrs`, bảng xoá ở § `merge.js` |
| KM-003 (app cục bộ) | Tạo tài khoản và vault mặc định, mở khoá offline, sửa và lưu, tạo item theo loại | `createAccount`, `unlockWithPassword`, `encryptVault`, `encryptVaultMeta`, `createItem`, `ITEM_TEMPLATES`, `ITEM_TYPES`, `FIELD_KINDS`, `newField`, `updateItem`, `restoreItemVersion`, `add*`/`update*`/`delete*`, `validateVault`, `newId('device')`. Không gọi `trashItem`/`restoreItem`/`purgeItem` (KM-008) |
| KM-005 (server) | `authKey` để gửi, các envelope để lưu nguyên dạng, tham số `kdf` | `newKdf`, `deriveFromPassword` → `authKey`; dạng `wrappedAccountKey`, `record` (`wrappedVaultKey`, `meta`, `envelope`) ở trên; server chỉ lưu, không gọi thao tác giải mã nào |
| KM-007 (passkey) | `prfKey` bọc trực tiếp `accountKey` | `deriveFromPrf`, `wrapAccountKey`, `unwrapAccountKey`, `unlockWithAccountKey` |
| KM-009 (đổi mật khẩu, xoay khoá) | Bọc lại cùng `accountKey` dưới khoá mới; khoá mới | `newKdf`, `deriveFromPassword`, `wrapAccountKey`, `generateAccountKey`, `generateVaultKey`, `wrapVaultKey` |

## Lưu ý cho epic sau

- **KM-002 (đã làm):** quy tắc gộp, gồm cả việc xoá project/env, nằm ở § `merge.js` ở trên. Project/env vẫn không có `clock.deletedAt`; nếu sau này thêm thì thiếu được coi là `{ at: 0 }`.
- **KM-003/KM-004:** sau khi gộp có thể có env sống dưới project đã xoá, hoặc item chỉ còn trỏ tới env đã xoá; cả hai đều hợp lệ. Cách hiển thị (KM-003 Concern 12, originator chốt 2026-11-01): env sống dưới project đã xoá được **coi như đã xoá khi hiển thị**: không hiện ở điều hướng, không tính là env sống, item chỉ trỏ tới env đó vào *Chưa gán*. Không ghi gì thêm vào vault. Quy tắc nằm ở `liveEnvs()` của `js/vault-query.js`, không nằm trong lõi.
- **KM-003:** `DEFAULT_VAULT_META.name` là chuỗi rỗng; app tự đặt tên hiển thị khi gọi `createAccount`. Id hex trần (không tiền tố) được chấp nhận khi kiểm tra; lõi không có bộ đọc file v1.
- **Password** được chuẩn hoá NFC rồi đưa vào PBKDF2 dưới dạng byte UTF-8 (KM-003 Concern 2), nên hai dạng NFC/NFD của một mật khẩu mở cùng một tài khoản. Từ đây đổi cách chuẩn hoá là đổi định dạng.
