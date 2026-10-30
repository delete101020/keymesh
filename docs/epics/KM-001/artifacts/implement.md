# Implementation Summary — Lõi mật mã và model vault v2

**Epic ID:** `KM-001`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-10-30`
**Traces to:** `plan.md`

---

## 1. Branch and PR

| | |
|---|---|
| Branch | `feat/KM-001-core` (đã push lên `origin`) |
| PR | **Chưa mở**: máy này không có `gh` CLI. Mở tại https://github.com/delete101020/keymesh/pull/new/feat/KM-001-core (base `master`), dẫn chiếu `docs/epics/KM-001/artifacts/spec.md` và file này |

## 2. Progress

Không chạy theo batch: cả 7 bước của plan làm trong một phiên (revision 1). Revision 2 là lô sửa theo review (`review.md`, verdict `hold`), thêm ở hàng 5.

| Batch | Plan steps | Commits | Tests run | State |
|---|---|---|---|---|
| 1 | 1–3 | `5d583f4`, `8905b29`, `83bc999` | `npm test` 24/24, `npm run test:browser` 24/24 | done |
| 2 | 4 | `ff1b71e` | `npm test` 45/45, `npm run test:browser` 45/45 | done |
| 3 | 5–6 | `1965f44`, `1774cc6` | `npm test` 72/72, `npm run test:browser` 72/72, `npm run vectors`, thử đột biến AC24 | done |
| 4 | 7 | `c836343` | `npm test` 73/73, `npm run test:browser` 73/73, `npm run vectors` | done |
| 5 (rev 2, sửa theo review) | review #1 (blocker), #2 (should-fix) | `604bccf`, `186457e` | `npm test` 75/75, `npm run test:browser` 75/75, `npm run vectors`, thử đột biến cho cả hai test mới | done |

Trước bước 1 có thêm commit `c174d44` (xem §5, mục 1).

## 3. What was built

| Plan step | Change | Files |
|---|---|---|
| 1 | Khung dự án không dependency; `KeymeshError` với 4 mã; base64 chặt, hex, UTF-8, `randomBytes`, `zeroize`; vòng test trình duyệt: import map ánh xạ `node:test`/`node:assert/strict` sang shim, server `node:http` chỉ trên `127.0.0.1`, Chrome headless, kết quả `POST` về, mã thoát 0/1. Đã thử một test cố tình fail để chắc chắn runner báo đúng (thoát 1) | `package.json`, `src/public/js/core/errors.js`, `src/public/js/core/bytes.js`, `test/primitives.test.js`, `testkit/browser/{index.html,node-test-shim.js,assert-shim.js,run.mjs}` |
| 2 | Wrapper PBKDF2 / HKDF / AES-GCM / gzip, `assertSupported`; KAT RFC 5869 TC1–3, RFC 7914 §11, GCM TC13–16 (các giá trị hex đã đối chiếu với `node:crypto` trước khi viết vào test); bảng "Tham số cố định" ở `docs/03` §2 | `src/public/js/core/crypto.js`, `test/primitives.test.js`, `docs/03-data-model.md` |
| 3 | `KeyHandle` (CryptoKey trong private field), `newKdf`, `deriveFromPassword`, `deriveFromPrf`, sinh/bọc/mở `accountKey` và `vaultKey` qua `wrapKey`/`unwrapKey`, `newVaultId`; cache dẫn xuất trong testkit | `src/public/js/core/crypto.js`, `test/keys.test.js`, `testkit/helpers.js` |
| 4 | Toàn bộ model: hằng, id, mẫu 9 loại, project/env/item/field, `updateItem` kiểu "nộp bản nháp" (đồng hồ theo giá trị, lịch sử 20 bản), thùng rác/khôi phục/purge, `validateVault` trả danh sách `{ path, code, message }` | `src/public/js/core/model.js`, `test/model.test.js` |
| 5 | Envelope vault (JSON → gzip → AES-GCM) và meta, kiểm `format`/`unsupported` trước khi giải mã, kiểm `vaultId` bên trong; `createAccount`, `unlockWithAccountKey` (lỗi theo từng vault), `unlockWithPassword` | `src/public/js/core/crypto.js`, `test/envelope.test.js` |
| 6 | Bộ sinh vector độc lập (chỉ `node:crypto`/`node:zlib`, không import `src/`), `testkit/vectors.js` đã commit; test vector, round-trip, rò rỉ, hiệu năng; `t.diagnostic` cho shim để số đo hiện cả trên trình duyệt; `bigVault` trong helpers | `testkit/gen-vectors.mjs`, `testkit/vectors.js`, `test/{vectors,roundtrip,leak,perf}.test.js`, `testkit/helpers.js`, `testkit/browser/{node-test-shim.js,run.mjs}` |
| rev 2 · review #1 | Cận trên `KDF_MAX_ITER = 6 000 000` (10× mức tối thiểu, owner chọn 2026-10-30). `readKdf` ném `KeymeshError('unsupported', 'kdf.iter')` khi `iter` > cận, trước khi chạy PBKDF2, nên `2**40` không còn ra `TypeError` trần và server xấu không làm treo máy khách quá vài giây. Ghi vào `docs/03` § Tham số cố định và `docs/09` § Lỗi, thao tác, hằng export | `src/public/js/core/crypto.js`, `test/keys.test.js`, `docs/03-data-model.md`, `docs/09-core-api.md` |
| rev 2 · review #2 | `updateItem` chụp bản sao item trước khi sửa và khôi phục tại chỗ (giữ nguyên tham chiếu item) nếu draft ném lỗi giữa chừng; phần thân cũ thành `saveItem`. `patchClocked` (`updateProject`, `updateEnv`) kiểm hết giá trị rồi mới ghi. `docs/09` § Một lần lưu thêm quy tắc: thao tác sửa hoặc thành công trọn vẹn, hoặc ném lỗi mà không đổi gì | `src/public/js/core/model.js`, `test/model.test.js`, `docs/09-core-api.md` |
| 7 | Hợp đồng lõi (thao tác, đầu vào/ra, lỗi, handle, quy tắc lưu, purge, vector, bảng epic → thao tác, lưu ý cho KM-002/KM-003); README thêm dòng 09 và lệnh test; test FR23 | `docs/09-core-api.md`, `README.md`, `test/model.test.js`, `testkit/helpers.js` |

## 4. Proofs executed

Mọi lệnh chạy ở gốc repo, Node v24.22.1, Windows 11. Trừ khi ghi khác, đầu ra là các dòng tương ứng của **cùng một lần chạy cuối** `npm test` (sau commit `c836343`), tổng kết:

```
$ npm test
> node --test "test/**/*.test.js"
...
ℹ tests 73
ℹ suites 0
ℹ pass 73
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3430.7662
```

Cả bộ chạy 3,4 s (NFR09: ≤ 60 s).

### `KM-001-AC01`

```
$ npm test
✔ AC01 HKDF-SHA256: RFC 5869 Test Case 1 (7.7453ms)
✔ AC01 HKDF-SHA256: RFC 5869 Test Case 2 (long inputs) (0.7942ms)
✔ AC01 HKDF-SHA256: RFC 5869 Test Case 3 (empty salt and info, as keymesh uses) (0.4762ms)
✔ AC01 PBKDF2-HMAC-SHA256: RFC 7914 §11 (c = 1 and c = 80 000) (27.2818ms)
✔ AC01 AES-GCM-256: McGrew–Viega Test Cases 13–16 (TC16 with AAD), encrypt and decrypt (3.5142ms)
✔ AC01 AES-GCM-256: TC16 with a wrong AAD is decrypt-failed (0.5856ms)
```

Đối chiếu độc lập các giá trị KAT với `node:crypto` trước khi viết test (script tạm trong scratchpad):

```
$ node kat.mjs
tc1 true
tc2 true
tc3 true
pb1 true
pb2 true
g13 true
g14 true
g15 true
g16 true
```

### `KM-001-AC02`

```
$ npm test
✔ AC02 FR02 deriving twice gives the same authKey; encKey and authKey differ (325.4717ms)
✔ AC02 AC24 NFR08 authKey from the fixed password and salt matches the vector (109.2341ms)
```

### `KM-001-AC03`

Spy trên `crypto.subtle.deriveBits` đếm 0 lần gọi cho hai `kdf` bị từ chối, rồi đếm > 0 cho một lần dẫn xuất thật (để chắc spy có bắt được).

```
$ npm test
✔ AC03 FR01 iter = 599999 or name = Argon2id is unsupported before PBKDF2 runs (86.0972ms)
```

#### Revision 2: cận trên `kdf.iter` (review #1)

Cùng spy `deriveBits`: bốn giá trị `KDF_MAX_ITER + 1`, `2**32`, `2**40`, `Number.MAX_SAFE_INTEGER` đều `unsupported` với 0 lần gọi PBKDF2; đúng `KDF_MAX_ITER` thì dẫn xuất chạy.

```
$ npm test
✔ AC03 FR01 iter = 599999 or name = Argon2id is unsupported before PBKDF2 runs (86.0972ms)
✔ AC03 FR01 kdf.iter above KDF_MAX_ITER (server-supplied) is unsupported before PBKDF2 runs (864.8468ms)
ℹ tests 75
ℹ pass 75
ℹ fail 0
```

Thử đột biến: bỏ `|| kdf.iter > KDF_MAX_ITER` khỏi `readKdf`, chạy lại, rồi hoàn lại:

```
$ node --test test/keys.test.js
✖ AC03 FR01 kdf.iter above KDF_MAX_ITER (server-supplied) is unsupported before PBKDF2 runs (822.8146ms)
ℹ pass 11
ℹ fail 1
```

### `KM-001-AC04`

```
$ npm test
✔ AC04 FR12 createAccount then unlockWithPassword opens the default vault offline (224.5803ms)
✔ AC04 FR10 wrong password: decrypt-failed and nothing returned (103.1969ms)
✔ AC04 FR10 wrong password cannot open the accountKey: decrypt-failed (88.1365ms)
```

### `KM-001-AC05`

Lật lần lượt từng byte của `iv` và `ct` ở cả bốn loại envelope; test còn kiểm số lần thử (`accountKey`, `vaultKey`: 12 + 48 = 60 mỗi loại).

```
$ npm test
✔ AC05 FR10 flipping any single byte of iv or ct in any envelope is decrypt-failed (160.912ms)
```

### `KM-001-AC06`

```
$ npm test
✔ AC06 FR06 FR08 vault A blob or wrappedVaultKey opened under vault B id is decrypt-failed (2.7062ms)
```

### `KM-001-AC07`

```
$ npm test
✔ AC07 FR09 a meta envelope opened as a vault envelope (same key, same id) is decrypt-failed (1.7516ms)
```

### `KM-001-AC08`

```
$ npm test
✔ AC08 FR11 unsupported format/v/alg/by are reported before decryption (2.062ms)
✔ AC08 FR11 missing ct, 8-byte iv, broken base64 and truncated keys are format errors (2.551ms)
✔ bytes: strict base64 rejects bad alphabet, padding, whitespace and non-zero pad bits (AC08) (0.5581ms)
```

### `KM-001-AC09`

```
$ npm test
✔ AC09 FR03 FR05 one accountKey wrapped under P1, P2 and a PRF key opens the same vault (177.1073ms)
```

### `KM-001-AC10`

```
$ npm test
✔ AC10 FR07 NFR03 10 000 encryptions of the same vault under one key never repeat an IV (2793.7478ms)
```

### `KM-001-AC11`

```
$ npm test
✔ AC11 FR21 a vault with all 9 types, 6 field kinds, 64 KB file field, trash, purge, env tombstone and Unicode round-trips (56.5923ms)
✔ AC11 FR21 an empty vault round-trips (3.3738ms)
✔ AC11 FR21 a ~1 MB vault round-trips (583.6122ms)
```

### `KM-001-AC12`

```
$ npm test
✔ AC12 FR08 authentic ciphertext whose content names vault X, opened as Y, is a format error (2.3907ms)
```

### `KM-001-AC13`

```
$ npm test
✔ AC13 FR12 three vaults, one tampered: the other two open, the bad one reports its vaultId (4.5985ms)
```

### `KM-001-AC14`

```
$ npm test
✔ AC14 FR15 createItem uses the docs/03 template for each of the 9 types (6.9388ms)
✔ AC14 ITEM_TEMPLATES is frozen so callers cannot change the templates (0.1493ms)
```

### `KM-001-AC15`

```
$ npm test
✔ AC15 FR14 new ids carry the right prefix and 16 lowercase hex (27.411ms)
✔ AC15 FR14 bare 16-hex ids validate, and the prefix does not decide the entity type (0.3099ms)
✔ FR04 newVaultId is 16 lowercase hex and random (5.6625ms)
```

### `KM-001-AC16`

```
$ npm test
✔ AC16 FR17 FR18 editing only notes moves only clock.notes, bumps rev, archives the old version (0.7003ms)
✔ AC16 FR18 changing only favorite, order-like fieldOrder or tags bumps rev without history (0.3728ms)
✔ AC16 FR17 editing one field value moves only that field at/dev (0.8549ms)
```

#### Revision 2: sửa thất bại không để lại gì (review #2)

Bốn lần gọi bị từ chối trên cùng một vault: field hợp lệ rồi `type: 'bogus'` (đúng kịch bản của reviewer), field hợp lệ rồi field id lạ, `title` hợp lệ rồi `tags` sai kiểu, `updateProject` với `name` hợp lệ rồi `order` sai. Sau đó `JSON.stringify(vault)` bằng đúng trước, và `vault.items[0]` vẫn là cùng object.

```
$ npm test
✔ FR17 a rejected updateItem or updateProject leaves the vault exactly as it was (0.8269ms)
```

Thử đột biến: `git stash` riêng `model.js` (về bản revision 1), chạy test model, rồi `stash pop`:

```
$ node --test test/model.test.js
✖ FR17 a rejected updateItem or updateProject leaves the vault exactly as it was (2.8447ms)
ℹ pass 22
ℹ fail 1
```

Trình duyệt sau revision 2:

```
$ npm run test:browser
HeadlessChrome/156.0.0.0
tests 75  pass 75  fail 0  (13399 ms)

$ npm run vectors
testkit/vectors.js matches node:crypto
```

### `KM-001-AC17`

```
$ npm test
✔ AC17 FR18 25 title edits keep exactly 20 history entries, newest first (0.4214ms)
```

### `KM-001-AC18`

Cùng 9 file `test/*.test.js`, không cài package nào, chạy trong Chrome headless. Danh sách tên test trên trình duyệt được so với Node bằng `diff` và khớp hoàn toàn (73 = 73).

```
$ npm run test:browser
> keymesh@2.0.0-dev test:browser
> node testkit/browser/run.mjs
ok   AC04 FR12 createAccount then unlockWithPassword opens the default vault offline
...
ok   AC23 NFR06 full unlock (PBKDF2 600k + HKDF + accountKey + vaultKey + 200 KB vault) ≤ 500 ms median
     # AC23 unlock 200 KB: median 90.2 ms, runs 89, 89, 90, 91, 91 ms
ok   AC23 NFR06 encrypting a 1 MB vault ≤ 200 ms median
     # AC23 encrypt 1 MB: median 22.2 ms, runs 21, 22, 22, 23, 23 ms
...
ok   AC24 FR12 the whole chain opens the vector vault from the password alone

Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36
tests 73  pass 73  fail 0  (7606 ms)
browser exit=0

same test names on both: yes
```

Runner báo đúng khi có lỗi (thử ở bước 1 với một test cố tình fail, sau đó đã xoá):

```
$ node testkit/browser/run.mjs
     AssertionError: Expected 1 to equal 2
tests 6  pass 5  fail 1  (29 ms)
exit=1
```

### `KM-001-AC19`

```
$ npm test
✔ AC19 FR19 deleting a project tombstones it and its envs; items keep the env ids (0.8725ms)
✔ AC19 FR19 trash then restore gives the same item except rev, updatedAt, clock.deletedAt (0.7259ms)
✔ AC19 FR19 purge leaves only id, deletedAt and purgedAt meaningful; content is blank (0.6965ms)
```

### `KM-001-AC20`

Kiểm bằng cách đọc lại (verifier). `docs/09-core-api.md` § "Epic nào dùng thao tác nào" có một dòng cho mỗi epic KM-002, KM-003, KM-005, KM-007 (thêm KM-008), đối chiếu với `docs/epics/KM-00x/KM-00x.md`. Ngoài ra có một test máy kiểm rằng mọi export công khai của `crypto.js` và `model.js` đều có tên trong `docs/09`:

```
$ npm test
✔ FR23 docs/09-core-api.md names every public export of crypto.js and model.js (1.1628ms)
```

### `KM-001-AC21`

```
$ npm test
✔ AC21 FR20 a vault with 6 distinct violations reports all 6 with paths (0.8396ms)
✔ FR20 missing fields and wrong types are reported per path (0.7484ms)
```

### `KM-001-AC22`

Chạy 21 đường lỗi (sai password, sửa byte, sai ngữ cảnh, envelope/kdf/model mang marker) với `console.{log,info,warn,error,debug,trace,dir,table}` bị thay bằng bộ đếm; quét `message`, `stack`, `String(err)`, `JSON.stringify(err)` và kết quả vault lỗi tìm password, plaintext, hex/base64 của `accountKey`, `vaultKey`, `authKey`; quét cả báo cáo `validateVault`.

```
$ npm test
✔ AC22 NFR04 error messages, stacks and failed results carry no password, key bytes or plaintext; core never logs (258.5394ms)
```

### `KM-001-AC23`

```
$ npm test
✔ AC23 NFR06 full unlock (PBKDF2 600k + HKDF + accountKey + vaultKey + 200 KB vault) ≤ 500 ms median (758.5889ms)
ℹ AC23 unlock 200 KB: median 93.8 ms, runs 92, 93, 94, 97, 99 ms
✔ AC23 NFR06 encrypting a 1 MB vault ≤ 200 ms median (646.7639ms)
ℹ AC23 encrypt 1 MB: median 23.2 ms, runs 22, 23, 23, 23, 24 ms
```

### `KM-001-AC24`

Vector tính lại độc lập và so với bản đã commit:

```
$ npm run vectors
testkit/vectors.js matches node:crypto
vectors exit=0
```

Thử đột biến 1 — đổi `info` của `encKey` thành `keymesh/enc2`, chạy test vector, rồi hoàn lại:

```
$ sed -i "s|utf8Encode('keymesh/enc')|utf8Encode('keymesh/enc2')|" src/public/js/core/crypto.js
$ node --test test/vectors.test.js
✔ AC02 AC24 NFR08 authKey from the fixed password and salt matches the vector (83.6756ms)
✖ AC24 NFR08 encKey: accountKey wrapped with the fixed IV matches, and the vector unwraps (3.114ms)
✔ AC24 NFR08 prfKey: accountKey wrapped with the fixed IV matches, and the vector unwraps (2.1423ms)
✔ AC24 NFR08 wrappedVaultKey with the fixed IV matches, and the vector unwraps (0.9343ms)
✔ AC24 NFR08 vault meta with the fixed IV matches, and the vector decrypts (1.0188ms)
✔ AC24 NFR08 vault envelope: the vector decrypts to the vault; AES-GCM over the fixed gzip gives its ct (26.2179ms)
✖ AC24 FR12 the whole chain opens the vector vault from the password alone (85.488ms)
ℹ tests 7
ℹ pass 5
ℹ fail 2
$ git checkout src/public/js/core/crypto.js
--- reverted ---
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

Thử đột biến 2 — đổi AAD của vault thành `keymesh/v2/vaults/<vaultId>`:

```
$ node --test test/vectors.test.js
✖ AC24 NFR08 vault envelope: the vector decrypts to the vault; AES-GCM over the fixed gzip gives its ct (1.262ms)
✖ AC24 FR12 the whole chain opens the vector vault from the password alone (99.7596ms)
ℹ tests 7
ℹ pass 5
ℹ fail 2
$ git checkout src/public/js/core/crypto.js
reverted
```

### FR không có AC riêng

```
$ npm test
✔ FR01 newKdf: PBKDF2-SHA256, 600 000 iterations, fresh 16-byte salt (7.8963ms)
✔ FR01 malformed kdf is a format error (0.5404ms)
✔ FR05 wrapped accountKey is { iv: 12B, ct: 48B } with a fresh IV each time (189.6222ms)
✔ FR06 wrapped vaultKey is { by: "account", iv, ct: 48B }; wrong accountKey is decrypt-failed (0.9733ms)
✔ FR07 vault envelope shape; each save uses a new IV (scenario 3.1.3) (5.794ms)
✔ FR09 vault meta round-trips under its own AAD (2.0165ms)
✔ FR03 scenario 3.1.4: a PRF-wrapped accountKey opens every vault like the password does (1.2869ms)
✔ FR13 createVault gives an empty v2 vault that validates (3.1166ms)
✔ FR13 a new item has every schema key with its default and a clock per single attribute (0.2499ms)
✔ FR16 file is only allowed on multi and secret-multi, and must be a non-empty string (0.3967ms)
✔ FR19 FR17 adding a field, removing one (field.deletedAt) and setting/clearing file (0.9254ms)
✔ FR17 FR19 project and env edits move only the changed clocks; deleteEnv tombstones one env (0.6012ms)
✔ FR20 scopes = [] and scopes pointing at a tombstoned env are valid (0.2647ms)
✔ FR22 every model operation takes time and deviceId from ctx; bad ctx is invalid (0.2641ms)
✔ FR22 core sources use no storage, network, DOM or console, and import only within core/ (10.1969ms)
✔ FR22 missing CompressionStream or WebCrypto is unsupported, naming the API (0.6393ms)
✔ NFR05 key handles expose no key bytes and cannot be swapped between roles (0.7624ms)
```

Đếm id trong tên test: mọi `FR01`…`FR23` và mọi AC đều có ít nhất một test, trừ `AC18` (là lần chạy trình duyệt ở trên) và `AC20` (đọc lại), đúng như plan §5.

## 5. Deviations from the plan

1. **Thêm commit `c174d44` trước bước 1.** Lúc bắt đầu, `master` có các thay đổi chưa commit từ các phase trước: `intent.md`, `spec.md`, `plan.md`, phần "Quy ước code" trong `.claude/CLAUDE.md`, cây repo mới ở `docs/02`, và đường dẫn `src/` ở `docs/03` và `design/README.md`. Mã của epic dựa trên các thay đổi này, nên chúng được commit riêng ở đầu nhánh. `state.json`, `pipeline.yaml`, `.aidlc/runs/KM-001.json` do extension quản lý nên vẫn để chưa commit. Lưu ý: nhánh nằm trên `master` cục bộ `5f9ad2d` ("Thiết lập AIDLC Native…"). Trong lúc phiên này đang chạy, commit đó đã được rebase lại từ bên ngoài phiên (gộp một `fixup!` thêm `.claude/hooks/aidlc-approval-gate.py` và `.gitignore`), và chưa từng có trên `origin/master` (`20ccdf8`). Vì vậy PR sẽ gồm cả commit đó.
2. **Chữ ký `createAccount`.** Plan ghi `createAccount(password, ctx)`. Hiện thực là `createAccount(password, { meta })`, vì thao tác này không cần thời gian hay `deviceId` (vault rỗng không có thực thể nào có dấu thời gian), mà cần meta cho vault mặc định. Kết quả trả về tách phần lưu (`kdf`, `wrappedAccountKey`, `records`) khỏi phần giữ trong bộ nhớ (`authKey`, `accountKey`, `vaults`). `records` có đúng dạng mà `unlock*` đọc. `unlock*` trả thêm `meta` đã giải mã nếu bản ghi có meta. `DEFAULT_VAULT_META.name = ''`, vì tên hiển thị là chữ của UI. Tất cả đã ghi ở `docs/09`.
3. **Thêm test FR23** (`docs/09` nêu tên mọi export) và hàm `readRepoFile` trong helpers. Plan chỉ có proof đọc lại cho FR23/AC20, nhưng NFR09 đòi mỗi FR có ít nhất một test.
4. **Chi tiết vòng test trình duyệt.** Logic chạy nằm trong một `<script type="module">` inline ở `testkit/browser/index.html` (chỉ dùng cho test, không bao giờ được phục vụ), thay vì tách thêm file. Danh sách test lấy qua `GET /__tests` của `run.mjs`. Shim có thêm `t.diagnostic` để số đo hiệu năng hiện ở cả hai môi trường. Shim assert có thêm `notDeepEqual`, `doesNotMatch`, `fail` ngoài tập con đã kể trong plan.
5. **Những điểm plan chưa nói, nay đã chốt và ghi lại:**
   - Password đưa vào PBKDF2 là byte UTF-8, không chuẩn hoá Unicode (`docs/03` §2, `docs/09`; xem §7).
   - `history[i].at`/`dev` là thời điểm và thiết bị của lần sửa đã thay bản đó.
   - Một lần lưu không đổi giá trị nào thì không tăng `rev`.
   - `updateItem({ fields })` coi field còn sống mà vắng mặt trong danh sách là bị xoá (`field.deletedAt`), và `file: null` là bỏ `file`.
6. **`KeyHandle` có getter `kind`** (không phải thuộc tính riêng, nên `Object.keys` vẫn rỗng). `_internal` không bao giờ trả `CryptoKey` hay byte khoá. Nó chỉ có `importKey` (tạo handle từ byte cho vector) và các hàm `seal*` nhận IV cố định.

7. **Revision 2 (sửa theo review).** Review #1: cận trên do owner chọn (6 000 000) qua câu hỏi trong phiên, vì reviewer để quyết định này cho owner. Review #2 vốn chỉ là should-fix cho `updateItem`; sửa luôn `patchClocked` vì cùng lỗi (ví dụ `updateProject({ name, order: 'x' })` đã đổi `name` rồi mới ném). Hai commit theo thứ tự finding; ở commit `604bccf` riêng lẻ, test FR23 fail vì `docs/09` chưa nêu `KDF_MAX_ITER` (được cập nhật ở `186457e`). Review #3 (`_internal`) và #4 (`design/README.md`) là note, không sửa.

## 6. Discovered work

| Item | Where it went |
|---|---|
| Chưa mở được PR vì máy không có `gh` | Người dùng mở bằng link ở §1 |
| Có chuẩn hoá Unicode (NFC) cho master password trước PBKDF2 không? Hiện tại là không. Cần quyết trước khi có dữ liệu thật, vì đổi là đổi định dạng | Originator; đã ghi ở `docs/09` § "Lưu ý cho epic sau" |
| `docs/02` dòng 122 (chú thích `model.js` "migrate v1 → v2"), `docs/03` §1 dòng 34/54 và §5, README ("chuyển sang `legacy/`"), KM-003 ("import file v1") vẫn nhắc migrate v1 | Concern 1 của spec, owner originator, hạn trước spec KM-003; không sửa ở đây |
| `npm run vectors` (chế độ so sánh) có thể báo `DIFFERS` trên phiên bản Node có zlib khác, chỉ vì `vaultGzip` khác byte, dù định dạng không đổi | Ghi ở đây; `test/vectors.test.js` không bị ảnh hưởng vì kiểm theo hai lớp |
| Chạy lõi khi wrangler bundle cho Workers | KM-005 (plan §4) |
| Chạy cùng bộ test trên Safari/iOS, Firefox | Concern 6, KM-003/KM-004 |
| `docs/05-sync.md` chưa có quy tắc gộp việc xoá project/env | Đã ghi cho KM-002 ở `docs/09` |
| Review §8 đề xuất thêm vào `CLAUDE.md` § Phân lớp: mọi tham số số từ ngoài lõi phải có cận cả hai phía | Chưa sửa `CLAUDE.md` (quy ước dự án, thuộc owner); quy tắc nguyên tử của model đã vào `docs/09` |
| Nâng `kdf.iter` ở epic sau phải ≤ `KDF_MAX_ITER`; muốn vượt thì phải tăng cận trong lõi trước khi server trả `iter` mới | Đã ghi ở `docs/03` § Tham số cố định |

## 7. Known gaps

- **Cắt ngắn `ct` của envelope vault/meta.** Bảng 3.2 của spec ghi "`ct` bị cắt ngắn → `format`". Lỗi này chỉ phát hiện được bằng cấu trúc khi độ dài cố định (khoá bọc 48B) hoặc khi `ct` ≤ 16B. Một `ct` vault bị cắt nhưng vẫn dài hơn tag thì ra `decrypt-failed`. AC08 không đòi trường hợp này, nhưng reviewer nên xác nhận cách hiểu.
- **Khôi phục `updateItem` dùng bản sao JSON.** Khi thất bại, các object field trong item được thay bằng bản sao (giá trị y hệt, khác tham chiếu); item và vault giữ nguyên tham chiếu. Bên gọi giữ tham chiếu tới một field cụ thể qua một lần lưu thất bại sẽ thấy object cũ. Khi thành công thì không có gì thay đổi so với revision 1.
- **`_internal` là export công khai** (review note #3, không sửa). Nó cho phép mã hoá với IV do bên gọi chọn. Dùng sai (dùng lại IV) thì phá AES-GCM. Hiện chỉ có quy ước "chỉ test" và ghi chú ở `docs/09`. Hướng khác là tách sang module chỉ dành cho test, nhưng khi đó test phải với vào phần private của `crypto.js`.
- **Độ mạnh của handle mờ** dựa vào private field của JS: code cùng realm không đọc được, nhưng devtools hoặc code đã chạy được trong trang thì có. Đây là giới hạn của mọi lõi chạy trong trình duyệt.
- `decryptVault` chỉ kiểm `vaultId` bên trong, **không** gọi `validateVault`. Bên gọi (KM-003) nên tự kiểm sau khi mở.
- `validateVault` không kiểm sâu nội dung từng bản `history` (chỉ kiểm là object và số lượng ≤ 20). Nó cũng không bắt `scopes` trỏ tới env không tồn tại, vì spec chỉ đòi tối thiểu.
- Ngưỡng hiệu năng chỉ áp trên Node của máy dev. Trên trình duyệt chỉ in số đo (Chromium: 90 ms / 22 ms).
- Shim `node:test` chỉ hỗ trợ `test()` phẳng. Epic sau mà dùng `describe` hay subtest thì phải mở rộng shim.

---

Status: done
