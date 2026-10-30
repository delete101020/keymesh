# Implementation Plan — Lõi mật mã và model vault v2

**Epic ID:** `KM-001`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-10-30`
**Traces to:** `spec.md`

---

## 1. Approach

Repo hiện chưa có mã v2 nào: không có `package.json`, không có test, không có `src/`. Toàn bộ mã cũ nằm trong `envvault.html` (PBKDF2 dẫn xuất thẳng khoá AES, id hex trần) và theo spec §7 thì file này **không bị đụng tới**. Vì vậy đây là thay đổi thêm mới hoàn toàn: không có bên gọi nào đang tồn tại, blast-radius bằng 0. Lõi đặt đúng chỗ trong cây ở `docs/02-architecture.md` § "Cấu trúc repo": `src/public/js/core/crypto.js` và `src/public/js/core/model.js`, là ES module thuần, không có bước build (D5), cùng hai module nhỏ dùng chung là `errors.js` (bốn loại lỗi) và `bytes.js` (base64, hex, UTF-8). Chiều phụ thuộc chỉ đi một hướng, và chỉ trong `core/`: `crypto.js → model.js → errors.js/bytes.js`. `crypto.js` cần `model.createVault` cho thao tác tạo tài khoản; `model.js` không biết gì về mật mã. Vì KM-005 sẽ import `core/` từ `src/functions/` (wrangler bundle cho Workers), lõi chỉ dùng các global có sẵn trên cả trình duyệt, Node ≥ 20 và Workers (`crypto.subtle`, `crypto.getRandomValues`, `CompressionStream`/`DecompressionStream`, `TextEncoder`/`TextDecoder`, `atob`/`btoa`); không import `node:*`, không top-level `await`.

**Khoá là handle mờ, không phải `CryptoKey` trần.** `accountKey` và `vaultKey` phải `extractable` để bọc lại được dưới khoá mới (FR05, KM-008). Nếu trả `CryptoKey` ra ngoài thì bên gọi tự `exportKey` được, trái NFR05. Vì vậy mọi khoá (`encKey`, `prfKey`, `accountKey`, `vaultKey`) được trả dưới dạng đối tượng của một class giữ `CryptoKey` trong private field (`#key`); chỉ các hàm trong `crypto.js` đọc được nó. `authKey` là ngoại lệ duy nhất, trả `Uint8Array` (FR02). `masterKey` chỉ tồn tại cục bộ trong hàm dẫn xuất, được import thành khoá HKDF không extractable, mảng byte trung gian bị ghi đè 0 sau khi dùng.

**Model sửa theo kiểu "nộp bản nháp".** Thay vì một hàm cho từng thao tác nhỏ (`setTitle`, `setFieldValue`…), có một `updateItem(vault, itemId, draft, ctx)`: bên gọi đưa vào trạng thái mới của item, model so với trạng thái hiện tại để biết giá trị nào thật sự đổi, rồi cập nhật đúng đồng hồ của giá trị đó (FR17), tăng `rev`, đẩy bản trước vào `history` nếu có thuộc tính đáng lưu đổi (FR18). Cách này khớp với cách form sửa của KM-003 lưu, và đặt toàn bộ quy tắc đồng hồ/lịch sử ở một chỗ. Các thao tác sửa **thay đổi vault tại chỗ** và trả về thực thể đã sửa; `ctx = { now, deviceId }` luôn do bên gọi truyền vào (FR22). **Phương án đã bỏ:** model bất biến (mỗi thao tác trả về vault mới). Bỏ vì phải sao chép sâu vault tới 1 MB ở mỗi lần gõ phím trên UI, trong khi KM-002 (`merge`) là hàm thuần riêng, không cần model bất biến; bên gọi muốn bản sao thì dùng `structuredClone`.

**Chốt Concern 5 (tham số HKDF).** HKDF-SHA256 dùng **salt rỗng** (theo RFC 5869 §2.2 tương đương HashLen byte 0), `info` là UTF-8 của `keymesh/enc` | `keymesh/auth` | `keymesh/prf`, độ dài đầu ra **L = 32 byte** cho cả ba. Đầu ra PBKDF2 (`masterKey`) dài 32 byte. AAD là UTF-8 của chuỗi AAD. Salt rỗng là đủ vì đầu vào đã là khoá đồng đều (PBKDF2 có salt 16B riêng cho từng user, PRF là đầu ra 32B của authenticator); thêm salt hằng không tăng an toàn. Các giá trị này được ghi vào `docs/03-data-model.md` §2 và đóng băng bằng test vector (NFR08). **Đã được originator xác nhận (2026-10-30)**: sau khi có dữ liệu thật thì không đổi được nữa. Đã cân nhắc và bỏ salt hằng (không tăng an toàn, thêm một giá trị phải đóng băng) và salt ngẫu nhiên riêng cho HKDF (phải lưu thêm trường, không có lợi vì PBKDF2 đã có salt).

### API dự kiến (sẽ thành hợp đồng ở `docs/09-core-api.md`)

| Module | Thao tác |
|---|---|
| `crypto.js` | `assertSupported()`, `newKdf()`, `deriveFromPassword(password, kdf) → { encKey, authKey }`, `deriveFromPrf(prfBytes) → prfKey`, `generateAccountKey()`, `wrapAccountKey(accountKey, encKey\|prfKey)`, `unwrapAccountKey(wrapped, encKey\|prfKey)`, `newVaultId()`, `generateVaultKey()`, `wrapVaultKey(vaultKey, accountKey, vaultId)`, `unwrapVaultKey(wrapped, accountKey, vaultId)`, `encryptVault(vault, vaultKey)`, `decryptVault(envelope, vaultKey, vaultId)`, `encryptVaultMeta(meta, vaultKey, vaultId)`, `decryptVaultMeta(env, vaultKey, vaultId)`, `createAccount(password, ctx)`, `unlockWithPassword(password, kdf, wrappedAccountKey, vaults)`, `unlockWithAccountKey(accountKey, vaults)` |
| `model.js` | Hằng `ITEM_TYPES`, `FIELD_KINDS`, `ITEM_TEMPLATES`, `HISTORY_MAX = 20`; `newId(kind)`, `isId(s)`, `createVault(vaultId)`, `addProject`, `updateProject`, `deleteProject`, `addEnv`, `updateEnv`, `deleteEnv`, `createItem(vault, type, init, ctx)`, `newField(init, ctx)`, `updateItem(vault, itemId, draft, ctx)`, `trashItem`, `restoreItem`, `purgeItem`, `validateVault(vault) → { ok: true } \| { ok: false, errors: [{ path, code, message }] }` |
| `errors.js` | `class KeymeshError extends Error` với `code ∈ { 'decrypt-failed', 'format', 'unsupported', 'invalid' }`; thông điệp là chuỗi cố định, không bao giờ chèn dữ liệu đầu vào (NFR04). Lỗi `unsupported` được phép nêu **tên** trường không hỗ trợ (`kdf.name`, `alg`…) nhưng không nêu giá trị do người dùng đưa vào |

`unlockWith*` trả `{ accountKey, vaults: [{ vaultId, ok: true, vault, vaultKey } | { vaultId, ok: false, error }] }` để một vault hỏng không chặn vault khác (FR12). Mọi thao tác giải mã thất bại ở tầng AES-GCM đều ném cùng một `KeymeshError('decrypt-failed')`, không giữ `cause` gốc (FR10).

## 2. Files

| Path | Change | Why |
|---|---|---|
| `package.json` | Mới. `"type": "module"`, `"private": true`, `engines.node >= 20`, scripts `test`, `test:browser`, `vectors`; **không** có `dependencies`/`devDependencies` | `node --test` đọc `.js` như ESM; NFR01 |
| `src/public/js/core/errors.js` | Mới. `KeymeshError` và 4 mã lỗi | Bên gọi phân biệt loại lỗi (spec §4) |
| `src/public/js/core/bytes.js` | Mới. base64 chặt (từ chối ký tự lạ, padding sai), hex, UTF-8, `randomBytes`, `zeroize` | Dùng chung cho `crypto` và `model`; base64 hỏng phải ra lỗi `format` (AC08) |
| `src/public/js/core/crypto.js` | Mới. KDF, HKDF, handle khoá, bọc/mở khoá, envelope vault/meta, gzip, mở khoá trọn chuỗi, tạo tài khoản; export phụ `_internal` (chỉ cho test: mã hoá với IV cố định, gọi primitive trực tiếp) | FR01–FR12, FR22, NFR03, NFR05 |
| `src/public/js/core/model.js` | Mới. Id, schema vault v2, mẫu field 9 loại, project/env/item, đồng hồ, lịch sử, tombstone, kiểm tra | FR13–FR20, FR22 |
| `test/primitives.test.js` | Mới. KAT RFC 5869 TC1–3, PBKDF2-HMAC-SHA256 (vector RFC 7914 §11), AES-GCM-256 (Test Case 13–16 của tài liệu GCM McGrew–Viega, có AAD) | AC01, NFR10 |
| `test/keys.test.js` | Mới. `kdf`, dẫn xuất, `authKey` tất định, `iter`/`name` không hỗ trợ, bọc lại `accountKey` dưới P1/P2/PRF, handle không lộ byte | AC02–AC04, AC09, NFR05 |
| `test/envelope.test.js` | Mới. Lật từng byte, tráo ngữ cảnh, meta mở như vault, `unsupported`/`format`, 10 000 IV, `vaultId` lệch, 3 vault một hỏng, thiếu API nền tảng | AC04–AC08, AC10, AC12, AC13, FR11 |
| `test/model.test.js` | Mới. Mẫu field, id, đồng hồ, lịch sử 25 lần sửa, tombstone/purge, validate 6 vi phạm, vault rỗng | AC14–AC17, AC19, AC21 |
| `test/roundtrip.test.js` | Mới. Vault đủ 9 loại, 6 kiểu field, `secret-multi` 64 KB có `file`, item thùng rác, item purge, env tombstone, tiếng Việt + emoji, vault ~1 MB | AC11, FR21 |
| `test/vectors.test.js` | Mới. So với vector cố định đã sinh độc lập | AC02, AC24, NFR08 |
| `test/leak.test.js` | Mới. Chạy lại các đường lỗi với password/nội dung có đánh dấu, chặn `console.*`, quét thông điệp lỗi và `JSON.stringify(err)` | AC22, NFR04 |
| `test/perf.test.js` | Mới. 5 lần, lấy trung vị: mở khoá trọn chuỗi với vault 200 KB ≤ 500 ms; mã hoá vault 1 MB ≤ 200 ms | AC23, NFR06 |
| `testkit/helpers.js` | Mới. Cache dẫn xuất khoá theo password (để bộ test không chạy PBKDF2 600k hàng chục lần), dựng vault mẫu, `ctx` cố định | NFR09 (≤ 60 s) |
| `testkit/vectors.js` | Mới, sinh ra rồi commit. Hằng số vector | NFR08 |
| `testkit/gen-vectors.mjs` | Mới. Sinh vector bằng `node:crypto` (`pbkdf2Sync`, `hkdfSync`, `createCipheriv('aes-256-gcm')` có AAD) — một hiện thực **độc lập** với `crypto.js` | Vector không tự xác nhận chính code đang test |
| `testkit/browser/index.html` | Mới. Import map ánh xạ `node:test` và `node:assert/strict` sang shim, nạp đúng các file `test/*.test.js` | AC18: cùng một bộ test chạy trên trình duyệt |
| `testkit/browser/node-test-shim.js` | Mới. `test(name, fn)` tối giản, chạy tuần tự, gom kết quả, gửi `POST /result` | AC18 |
| `testkit/browser/assert-shim.js` | Mới. Tập con `assert` mà các test dùng: `equal`, `notEqual`, `deepEqual`, `ok`, `match`, `throws`, `rejects` | AC18 |
| `testkit/browser/run.mjs` | Mới. HTTP server tĩnh bằng `node:http`, mở Chrome/Edge headless tới trang test, chờ `POST /result`, in kết quả, thoát với mã 0/1 | Vòng phản hồi tự động cho trình duyệt |
| `docs/03-data-model.md` | Sửa §2: thêm đoạn "Tham số cố định" (HKDF salt rỗng, L = 32, encoding `info`/AAD UTF-8, `masterKey` 32B, `ct` của khoá bọc 48B) | Concern 5 |
| `docs/09-core-api.md` | Mới. Hợp đồng lõi: từng thao tác, đầu vào/ra, loại lỗi, bảng "epic nào dùng thao tác nào", chỉ tới `testkit/vectors.js` | FR23, AC20 |
| `README.md` | Thêm dòng 09 vào bảng tài liệu và lệnh `npm test` / `npm run test:browser` | Người làm epic sau tìm được hợp đồng |

**Không đụng:** `envvault.html`, `design/`, `.claude/CLAUDE.md`, `docs/05-sync.md`, `docs/08-roadmap.md`, `.aidlc/validators/ci.mjs` (recipe `native-full` không dùng nó cho implement). Cũng không sửa các chỗ còn nhắc migrate v1 hay `legacy/`, vì Concern 1 thuộc originator: `docs/02-architecture.md` dòng 122 (chú thích `model.js` vẫn ghi "migrate v1 → v2"), `docs/03-data-model.md` dòng 34 (`legacy/envvault.html`), 54 (id hex trần "migrate từ v1") và 410. Riêng `docs/02` dòng 96 nhắc Playwright (bên thứ ba) cho E2E, mâu thuẫn với quy ước "không phụ thuộc bên thứ ba" trong `CLAUDE.md`, nhưng không liên quan KM-001.

Test hỗ trợ nằm ở `testkit/` chứ không ở `test/` vì `node --test` không có đối số tự quét `**/test/**/*.js`; nếu để `run.mjs` hay shim trong `test/` thì chúng bị chạy như test. Cả `test/` và `testkit/` nằm ngoài `src/` nên không bị deploy; test import lõi bằng `../src/public/js/core/<module>.js`.

## 3. Order

1. **Khung và vòng phản hồi.** `package.json`, `errors.js`, `bytes.js` kèm test của `bytes` (base64 chặt, hex) đặt trong `test/primitives.test.js`; `testkit/browser/*`. *Sau bước này:* `npm test` chạy và pass trên Node; `npm run test:browser` chạy **cùng file đó** trong Chromium headless và pass. Vòng phản hồi cho cả hai môi trường có trước khi viết mật mã.
2. **Primitive và KAT.** Trong `crypto.js`: wrapper PBKDF2/HKDF/AES-GCM, `assertSupported`, gzip qua `CompressionStream`. Hoàn tất KAT trong `test/primitives.test.js`. Ghi tham số Concern 5 vào `docs/03-data-model.md` §2. *Sau bước này:* AC01 pass; tham số HKDF đã được ghi lại trước khi có vector nào phụ thuộc vào nó.
3. **Phân tầng khoá.** Handle khoá, `newKdf`, `deriveFromPassword`, `deriveFromPrf`, sinh/bọc/mở `accountKey` và `vaultKey`, `newVaultId`. `test/keys.test.js`. *Sau bước này:* AC02 (phần tất định), AC03, AC09 pass; mở `accountKey` bằng sai password ra `decrypt-failed`.
4. **Model.** Toàn bộ `model.js` và `test/model.test.js`. *Sau bước này:* AC14–AC17, AC19, AC21 pass; có `createVault` cho bước 5.
5. **Envelope và mở khoá trọn chuỗi.** `encryptVault`/`decryptVault`, meta, `createAccount`, `unlockWithPassword`, `unlockWithAccountKey`. `test/envelope.test.js`. *Sau bước này:* luồng 3.1 của spec chạy được đầu–cuối; AC04–AC08, AC10, AC12, AC13 pass.
6. **Bằng chứng tổng hợp.** `testkit/gen-vectors.mjs` → `testkit/vectors.js`; `test/vectors.test.js`, `test/roundtrip.test.js`, `test/leak.test.js`, `test/perf.test.js`. *Sau bước này:* AC02 (vector), AC11, AC22, AC23, AC24 pass; đã thử một lần đổi `info` HKDF và thấy vector fail, rồi hoàn lại.
7. **Hợp đồng và kiểm cuối.** `docs/09-core-api.md`, `README.md`. Chạy `npm test` và `npm run test:browser` trên toàn bộ. *Sau bước này:* AC18 pass; AC20 sẵn sàng cho verifier đọc lại.

Mỗi bước là một commit trên nhánh `feat/KM-001-core`, theo đúng thứ tự trên.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — steps 1–3: khung dự án, vòng test Node + Chromium, primitive có KAT, phân tầng khoá bọc/mở được; tham số HKDF đã ghi vào `docs/03`.
**Batch 2** — step 4: model vault v2 đầy đủ, mọi test model pass (không phụ thuộc mật mã).
**Batch 3** — steps 5–6: envelope, mở khoá trọn chuỗi, vector cố định, round-trip, rò rỉ, hiệu năng đều pass.
**Batch 4** — step 7: hợp đồng `docs/09-core-api.md`, README, toàn bộ bộ test pass trên Node và Chromium.

## 4. Risks

| Risk | Likelihood | What we do about it |
|---|---|---|
| **Bên gọi hiện có bị ảnh hưởng.** Đây là mã mới hoàn toàn; tìm trong repo (`rg` trên `*.js`, `*.html`) không có module nào import `crypto.js`/`model.js`, và `envvault.html` không bị sửa. Blast-radius = 0 | Thấp | Không cần biện pháp. Bên gọi đầu tiên là KM-002/KM-003, ràng buộc bằng `docs/09-core-api.md` |
| **Khó đảo ngược nhất: tham số HKDF, AAD, định dạng envelope.** Một khi có dữ liệu thật thì đổi là phải chuyển đổi dữ liệu | Trung bình | Chốt rõ ở §1, ghi vào `docs/03` ở bước 2 **trước** khi sinh vector (originator đã xác nhận tham số ngày 2026-10-30). Vector sinh bằng `node:crypto` độc lập; AC24 kiểm thật bằng cách cố tình đổi một tham số và thấy test fail |
| **Gzip không tất định giữa Node và Chromium** (byte header, mức nén), nên vector "mã hoá vault với IV cố định ra đúng `ct`" có thể chỉ đúng trên một nền tảng | Trung bình | Vector của envelope vault kiểm theo hai lớp: (a) giải mã vector cố định ra đúng vault mong đợi — tất định trên mọi nền tảng; (b) AES-GCM trên **byte gzip cố định** với IV cố định ra đúng `ct`. Không so `ct` của cả chuỗi gzip+AES. Envelope khoá và meta không nén nên so byte chính xác |
| **Import map không ánh xạ được specifier `node:test`** trên Chromium | Thấp | Thử ngay ở bước 1. Dự phòng: mọi test import từ `../testkit/t.js`, file này dùng top-level `await import()` chọn `node:test` hoặc shim theo môi trường. Đổi ở bước 1 nên chưa có test nào phải sửa |
| **Không tìm thấy Chrome/Edge để chạy headless** | Thấp | `run.mjs` tìm theo `CHROME_PATH`, rồi các đường dẫn chuẩn của Chrome và Edge trên Windows. Nếu không thấy thì in URL để mở tay, và kết quả vẫn được `POST` về server |
| **Bộ test vượt 60 s** do PBKDF2 600k (~100 ms) và 10 000 lần mã hoá (AC10) | Thấp | `testkit/helpers.js` cache khoá theo password; AC05 dẫn xuất một lần rồi lật byte trên cùng khoá; AC10 dùng vault nhỏ. Đo tổng thời gian ở bước 6 |
| **`perf.test.js` không ổn định** (máy bận, chạy song song với test khác) | Trung bình | Lấy trung vị 5 lần, khởi động trước 1 lần. Ngưỡng NFR06 rộng gấp ~4 lần đường cơ sở 2026-10-30. Trên trình duyệt chỉ in số đo, không áp ngưỡng (NFR06 chỉ áp cho Node) |
| **Kém chắc chắn nhất: diễn giải "purge chỉ giữ `id`, `deletedAt`, `purgedAt`"** (FR19, AC19). Nếu xoá hẳn mọi khoá khác thì item purge không còn khớp schema item | Trung bình | Diễn giải đề xuất: giữ đủ khoá schema; xoá trắng mọi nội dung người dùng (`title = ""`, `fields = []`, `fieldOrder = []`, `notes = ""`, `history = []`, `tags = []`, `scopes = []`, `expires = null`, `forkedFrom = null`, `conflict = null`, `favorite = false`); giữ siêu dữ liệu không bí mật (`type`, `rev`, `createdAt`, `updatedAt`, `clock`). `validateVault` chấp nhận dạng này. **Đã được originator xác nhận (2026-10-30).** |
| **Đồng hồ cho `deletedAt` của project/env.** `docs/03` §1 chỉ cho item có `clock.deletedAt`; project/env chỉ có `name`, `order` (và `color` cho env) | Thấp | Làm đúng schema hiện có, không tự thêm trường. Mọi tình huống gộp `deletedAt` của project/env đều giải được mà không cần đồng hồ (hai bên cùng xoá thì lấy `min`; chỉ một bên đổi thì bên đó thắng). Thêm về sau vẫn tương thích ngược (thiếu thì coi là `{ at: 0 }`). `docs/09-core-api.md` ghi lưu ý cho KM-002: `docs/05-sync.md` chưa có quy tắc xoá cho project/env. **Đã được originator xác nhận (2026-10-30).** |
| **Lõi không chạy được khi wrangler bundle cho Workers** ở KM-005 (server import `../../public/js/core/*.js`) | Thấp | Lõi chỉ dùng global chung cho trình duyệt/Node/Workers, không `node:*`, không top-level `await` (§1). Quét `import` ở FR22 giữ ràng buộc này. KM-001 không chạy được thử trên Workers vì chưa có `wrangler`; KM-005 kiểm khi thêm nó |
| **Rò rỉ qua `cause` hoặc stack** của `DOMException` gốc | Thấp | `KeymeshError` không gắn `cause`; `leak.test.js` quét cả `message`, `stack`, `JSON.stringify(err)` |

## 5. Proofs

Mọi lệnh chạy ở gốc repo. `npm test` = `node --test` (quét `test/**/*.test.js`); `npm run test:browser` = `node testkit/browser/run.mjs`. Mỗi test ghi id AC/FR trong tên để tra ngược (NFR09).

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-001-AC01` | KAT: RFC 5869 TC1–3; PBKDF2-HMAC-SHA256 theo RFC 7914 §11; AES-GCM-256 Test Case 13–16 (TC16 có AAD). Giá trị hex đối chiếu thêm với `node:crypto` lúc viết | `npm test` → `test/primitives.test.js` |
| `KM-001-AC02` | Dẫn xuất hai lần cùng đầu vào → `authKey` bằng nhau; khớp `authKey` trong `testkit/vectors.js` | `test/keys.test.js`, `test/vectors.test.js` |
| `KM-001-AC03` | `kdf.iter = 599999` và `kdf.name = "Argon2id"` → `code === 'unsupported'`; spy trên `crypto.subtle.deriveBits` xác nhận PBKDF2 chưa được gọi | `test/keys.test.js` |
| `KM-001-AC04` | `createAccount` → `unlockWithPassword` đúng password ra vault; sai password → `decrypt-failed`, kết quả không có trường `vaults` | `test/keys.test.js`, `test/envelope.test.js` |
| `KM-001-AC05` | Với mỗi loại envelope (vault, meta, `accountKey`, `vaultKey`): lặp qua **từng** byte của `iv` và `ct`, lật 1 bit, mở → luôn `decrypt-failed` | `test/envelope.test.js` |
| `KM-001-AC06` | Blob và `wrappedVaultKey` của A mở dưới `vaultId` của B → `decrypt-failed` | `test/envelope.test.js` |
| `KM-001-AC07` | Envelope meta bọc trong khung `{format, v, alg}` rồi mở bằng `decryptVault` cùng khoá, cùng `vaultId` → `decrypt-failed` | `test/envelope.test.js` |
| `KM-001-AC08` | `format: "envvault"`, `v: 1`, `alg` lạ, `by: "password"` → `unsupported`; thiếu `ct`, `iv` 8B, base64 hỏng → `format` | `test/envelope.test.js` |
| `KM-001-AC09` | Một `accountKey` bọc dưới `encKey(P1)`, `encKey(P2)`, `prfKey(PRF 32B)`; mở cả ba → `wrapVaultKey` của cùng một vault mở được bằng cả ba khoá vừa mở | `test/keys.test.js` |
| `KM-001-AC10` | 10 000 lần `encryptVault` cùng vault, cùng khoá → `Set` các `iv` có đúng 10 000 phần tử | `test/envelope.test.js` |
| `KM-001-AC11` | Vault mẫu đủ các thành phần → `encryptVault` → `decryptVault` → `deepStrictEqual` với bản gốc; thêm một vault ~1 MB | `test/roundtrip.test.js` |
| `KM-001-AC12` | `_internal` mã hoá vault có `vaultId = X` dưới AAD của Y; `decryptVault(…, Y)` → `format` | `test/envelope.test.js` |
| `KM-001-AC13` | 3 vault, sửa 1 byte `ct` của vault 2 → `vaults[0].ok`, `vaults[2].ok`, `vaults[1]` là `{ ok: false, vaultId, error.code: 'decrypt-failed' }` | `test/envelope.test.js` |
| `KM-001-AC14` | Bảng mong đợi chép từ `docs/03` §1 *Mẫu field theo loại item* (label, kind, thứ tự) so với `createItem` cho cả 9 loại; `vpn` có `file = "client.ovpn"`; không field nào `kind = 'otp'`; `wifi` → `invalid` | `test/model.test.js` |
| `KM-001-AC15` | 1 000 id mỗi loại khớp `^[pefid]_[0-9a-f]{16}$` đúng tiền tố; `newVaultId` khớp `^[0-9a-f]{16}$`; vault dùng id hex trần cho item → `validateVault().ok === true` | `test/model.test.js` |
| `KM-001-AC16` | `updateItem` chỉ đổi `notes` với `ctx = { now: T, deviceId: 'd_A' }` → chỉ `clock.notes` đổi, `rev + 1`, `history[0].reason === 'edit'`; chỉ đổi `favorite` → `rev + 1`, `history` không đổi; đổi `v` một field → chỉ `at`/`dev` của field đó đổi | `test/model.test.js` |
| `KM-001-AC17` | 25 lần đổi `title` → `history.length === 20`, `history[0].rev === rev - 1`, `rev` giảm dần | `test/model.test.js` |
| `KM-001-AC18` | Cùng các file `test/*.test.js` chạy qua import map và shim trong Chrome/Edge headless; `run.mjs` thoát mã 0 và in số test pass bằng số test trên Node | `npm run test:browser`; dán đầu ra vào artifact implement |
| `KM-001-AC19` | Project 2 env, item gán cả hai → `deleteProject` → 3 `deletedAt` khác null, `scopes` giữ 2 id; `trashItem` + `restoreItem` → `deepStrictEqual` với bản trước (trừ `rev`, `updatedAt`, `clock.deletedAt`); `purgeItem` → đúng dạng tombstone ở §4 | `test/model.test.js` |
| `KM-001-AC20` | `docs/09-core-api.md` có bảng "epic → thao tác": KM-002 (`clock`, `history`, `HISTORY_MAX`, tombstone, `updateItem`), KM-003 (`unlockWithPassword`, `createAccount`, `createItem`, `ITEM_TEMPLATES`), KM-005 (`authKey`, các envelope, `newKdf`), KM-007 (`deriveFromPrf`, `wrapAccountKey`, `unwrapAccountKey`) | Verifier đọc lại lúc đóng epic |
| `KM-001-AC21` | Vault có đủ 6 lỗi → `errors.length === 6`, mỗi lỗi có `path` đúng chỗ (vd. `items[1].type`, `envs[0].projectId`); vault hợp lệ → `{ ok: true }` | `test/model.test.js` |
| `KM-001-AC22` | Password `PW-MARKER-…`, nội dung `PT-MARKER-…`; chạy lại các đường lỗi; `console.*` bị thay bằng hàm đếm → đếm = 0; không marker và không hex của khoá nào trong `message`/`stack`/`JSON.stringify(err)` | `test/leak.test.js` |
| `KM-001-AC23` | Khởi động 1 lần rồi đo 5 lần; trung vị mở khoá trọn chuỗi (vault 200 KB) ≤ 500 ms, mã hoá vault 1 MB ≤ 200 ms; in số đo | `npm test` → `test/perf.test.js`; dán số đo vào artifact implement |
| `KM-001-AC24` | `test/vectors.test.js` kiểm `encKey` (qua `ct` của `accountKey` bọc với IV cố định), `authKey`, `prfKey` (tương tự), meta, `vaultKey` bọc, vault (theo hai lớp ở §4). Một lần đổi thử `info` thành `keymesh/enc2` → thấy test fail → hoàn lại | `npm test`; ghi lại lần thử fail trong artifact implement |

Các FR không có AC riêng cũng có test ghi id: FR16 (`file` trên `kind` không cho phép, trong `model.test.js`), FR22 (vault rỗng và `ctx` tất định; quét mã nguồn không có `localStorage`, `indexedDB`, `fetch`, `document`, `console` trong `src/public/js/core/`; mọi `import` trong `core/` là đường dẫn tương đối `./*.js` trỏ vào chính `core/`, không có `node:*`), NFR05 (handle không có thuộc tính nào chứa `CryptoKey`/byte; `Object.keys`, `JSON.stringify` của handle rỗng), thiếu `CompressionStream`/`crypto.subtle` → `unsupported` (giả lập bằng cách tạm xoá global trong test).

## 6. Feedback loop

- **Node:** `npm test` (`node --test`, Node v24.22.1 trên máy dev) sau mỗi thay đổi; mỗi bước kết thúc khi toàn bộ pass.
- **Trình duyệt:** `npm run test:browser` — dựng ở bước 1, trước mọi mã mật mã. Server `node:http` phục vụ gốc repo chỉ trên `127.0.0.1` lúc test (để trang test thấy được cả `test/`, `testkit/` và `src/public/js/core/`; không liên quan gì tới thư mục được deploy), Chrome/Edge headless mở `testkit/browser/index.html`, kết quả `POST` về và lệnh thoát với mã 0/1. Chạy ở cuối mỗi batch, không chỉ ở bước 7.
- **Đối chiếu độc lập:** `node testkit/gen-vectors.mjs` tính lại vector bằng `node:crypto`; KAT được đối chiếu với `node:crypto` lúc viết.

## 7. Deliberately not doing

- Migrate v1 → v2 và đọc định dạng `envvault` (spec §7, Concern 1). Không sửa các tài liệu còn nhắc migrate — việc đó thuộc originator, hạn trước spec KM-003.
- Di chuyển hay tách lõi khỏi `envvault.html`: theo `docs/02` nó nằm yên ở gốc repo làm tham chiếu.
- `src/wrangler.toml`, `src/public/index.html`, `_headers`, `src/functions/`, `src/migrations/`: chưa có gì để phục vụ hay deploy (KM-003, KM-005).
- `store.js`, IndexedDB, `meta.account`, `merge.js`, `sync.js`, mọi thứ UI, server, WebAuthn.
- Gộp ba chiều, `history` với `reason: "conflict"`/`"restore"`, đặt `item.conflict` — model chỉ có sẵn các trường.
- Dọn thùng rác tự động sau `TRASH_DAYS` (KM-009); fork, nhân bản, TOTP, `otpauth://` (KM-003).
- Thêm đồng hồ ngoài schema ở `docs/03` §1 (vd. `clock.deletedAt` cho project/env).
- Linter, formatter, TypeScript, CI: không có trong repo và spec không yêu cầu; thêm vào là mở rộng phạm vi.
- Chạy test trên Safari/iOS và Firefox (Concern 6, hoãn sang KM-003/KM-004).
