# Verification Report — Lõi mật mã và model vault v2

**Epic ID:** `KM-001`
**Verifier:** Verifier (independent)
**Status:** Draft
**Created:** `2026-10-30`
**Verified against:** `spec.md`, `plan.md`

---

## 1. Verdict

Verdict: pass

24/24 tiêu chí nghiệm thu pass, kèm đầu ra lệnh chạy lại trong phiên này (nhánh `feat/KM-001-core`, Node v24.22.1, Chrome headless 156). Không có hàng `fail` hay `untested`. Có 4 phát hiện mức thấp ở §6, không chặn. Checklist được lập từ `spec.md` và `plan.md` trước khi đọc `implement.md`.

## 2. Acceptance criteria

| Id | Criterion | Verdict | Evidence |
|---|---|---|---|
| `KM-001-AC01` | KAT RFC 5869, PBKDF2-SHA256, NIST/McGrew–Viega AES-GCM | pass | `npm test`: `✔ AC01 HKDF-SHA256: RFC 5869 Test Case 1 / 2 / 3`, `✔ AC01 PBKDF2-HMAC-SHA256: RFC 7914 §11 (c = 1 and c = 80 000)`, `✔ AC01 AES-GCM-256: McGrew–Viega Test Cases 13–16 (TC16 with AAD)` |
| `KM-001-AC02` | `authKey` tất định và khớp vector cố định | pass | `✔ AC02 FR02 deriving twice gives the same authKey…` (keys.test.js); `✔ AC02 AC24 NFR08 authKey from the fixed password and salt matches the vector`. Vector sinh bằng `node:crypto` trong `testkit/gen-vectors.mjs` (độc lập với `crypto.js`) |
| `KM-001-AC03` | `iter = 599999` hoặc `Argon2id` → `unsupported`, chưa chạy PBKDF2 | pass | `✔ AC03 FR01 iter = 599999 or name = Argon2id is unsupported before PBKDF2 runs`. Test bọc `subtle.deriveBits` và khẳng định `calls === 0` (đã đọc mã test) |
| `KM-001-AC04` | Đúng password mở được vault; sai password → `decrypt-failed`, không trả dữ liệu | pass | `✔ AC04 FR12 createAccount then unlockWithPassword opens the default vault offline`; `✔ AC04 FR10 wrong password: decrypt-failed and nothing returned`; `✔ AC04 FR10 wrong password cannot open the accountKey` |
| `KM-001-AC05` | Lật từng byte `iv`/`ct` của 4 loại envelope → luôn `decrypt-failed` | pass | `✔ AC05 FR10 flipping any single byte of iv or ct in any envelope is decrypt-failed`. Đã đọc mã: đếm số lần thử bằng đúng `12 + 48` cho `accountKey`/`vaultKey` và `12 + len(ct)` cho vault, nên bao phủ đủ mọi vị trí; meta và vault cũng chạy |
| `KM-001-AC06` | Tráo `vaultId` cho blob và `wrappedVaultKey` → `decrypt-failed` | pass | `✔ AC06 FR06 FR08 vault A blob or wrappedVaultKey opened under vault B id is decrypt-failed` |
| `KM-001-AC07` | Envelope meta mở như envelope vault → `decrypt-failed` | pass | `✔ AC07 FR09 a meta envelope opened as a vault envelope (same key, same id) is decrypt-failed` |
| `KM-001-AC08` | `format`/`v`/`alg`/`by` lạ → `unsupported`; thiếu `ct`, `iv` 8B, base64 hỏng → `format` | pass | `✔ AC08 FR11 unsupported format/v/alg/by are reported before decryption`; `✔ AC08 FR11 missing ct, 8-byte iv, broken base64 and truncated keys are format errors`; `✔ bytes: strict base64 rejects bad alphabet, padding, whitespace…` |
| `KM-001-AC09` | Một `accountKey` bọc dưới P1, P2, PRF; cả ba mở ra cùng khoá và cùng vault | pass | `✔ AC09 FR03 FR05 one accountKey wrapped under P1, P2 and a PRF key opens the same vault`; `✔ FR03 scenario 3.1.4: a PRF-wrapped accountKey opens every vault like the password does` |
| `KM-001-AC10` | 10 000 lần mã hoá, không trùng IV | pass | `✔ AC10 FR07 NFR03 10 000 encryptions of the same vault under one key never repeat an IV` |
| `KM-001-AC11` | Vault đủ 9 loại, 6 kiểu field, `secret-multi` 64 KB, thùng rác, purge, tombstone, Unicode → round-trip bằng sâu | pass | `✔ AC11 FR21 a vault with all 9 types, 6 field kinds, 64 KB file field, trash, purge, env tombstone and Unicode round-trips`; `✔ AC11 FR21 an empty vault round-trips`; `✔ AC11 FR21 a ~1 MB vault round-trips` |
| `KM-001-AC12` | `vaultId` bên trong khác AAD → `format` | pass | `✔ AC12 FR08 authentic ciphertext whose content names vault X, opened as Y, is a format error` |
| `KM-001-AC13` | 3 vault, 1 hỏng → 2 vault mở được, vault hỏng báo `decrypt-failed` kèm `vaultId` | pass | `✔ AC13 FR12 three vaults, one tampered: the other two open, the bad one reports its vaultId` |
| `KM-001-AC14` | Field mặc định đúng 03 §1 cho 9 loại; `vpn` có `file`; không `otp`; `wifi` → `invalid` | pass | `✔ AC14 FR15 createItem uses the docs/03 template for each of the 9 types`; `✔ AC14 ITEM_TEMPLATES is frozen…` |
| `KM-001-AC15` | Id mới khớp `^[pefid]_[0-9a-f]{16}$`; `vaultId` 16 hex; id hex trần hợp lệ | pass | `✔ AC15 FR14 new ids carry the right prefix and 16 lowercase hex`; `✔ AC15 FR14 bare 16-hex ids validate, and the prefix does not decide the entity type`; `✔ FR04 newVaultId is 16 lowercase hex and random` |
| `KM-001-AC16` | Đồng hồ theo thuộc tính, `rev`, `history` khi sửa `notes`/`favorite`/`v` của field | pass | `✔ AC16 FR17 FR18 editing only notes moves only clock.notes, bumps rev, archives the old version`; `✔ AC16 FR18 changing only favorite…`; `✔ AC16 FR17 editing one field value moves only that field at/dev` |
| `KM-001-AC17` | 25 lần sửa `title` → `history` đúng 20 bản, mới nhất đầu | pass | `✔ AC17 FR18 25 title edits keep exactly 20 history entries, newest first` |
| `KM-001-AC18` | Cùng bộ test pass 100% trên Chromium, không cài thêm package | pass | `npm run test:browser` → `HeadlessChrome/156.0.0.0 … tests 75  pass 75  fail 0  (14048 ms)`; bằng đúng số test của Node (75). `package.json` không có `dependencies`/`devDependencies` |
| `KM-001-AC19` | Xoá project → 3 tombstone, `scopes` giữ nguyên; trash + restore giữ nội dung; purge còn `id`/`deletedAt`/`purgedAt` | pass | `✔ AC19 FR19 deleting a project tombstones it and its envs; items keep the env ids`; `✔ AC19 FR19 trash then restore…`; `✔ AC19 FR19 purge leaves only id, deletedAt and purgedAt meaningful; content is blank` |
| `KM-001-AC20` | Hợp đồng nêu được mọi thứ KM-002/003/005/007 cần | pass | Đọc `docs/09-core-api.md` §"Epic nào dùng thao tác nào" (dòng 124–132): KM-002 → `clock`, `history`, `HISTORY_MAX`, `deletedAt`/`purgedAt`, `updateItem`; KM-003 → `createAccount`, `unlockWithPassword`, `createItem`, `ITEM_TEMPLATES`; KM-005 → `newKdf`, `deriveFromPassword`→`authKey`, các envelope; KM-007 → `deriveFromPrf`, `wrapAccountKey`, `unwrapAccountKey`. Đối chiếu `export` thực tế của `crypto.js`/`model.js` có đủ các tên đó; `✔ FR23 docs/09-core-api.md names every public export…` |
| `KM-001-AC21` | Vault 6 vi phạm → 6 lỗi có `path`; vault hợp lệ → hợp lệ | pass | `✔ AC21 FR20 a vault with 6 distinct violations reports all 6 with paths` |
| `KM-001-AC22` | Không rò password/khoá/plaintext qua lỗi hoặc console | pass | `✔ AC22 NFR04 error messages, stacks and failed results carry no password, key bytes or plaintext; core never logs`. `rg "console\.\|localStorage\|indexedDB\|fetch\(\|document\." src/public/js/core` → không có kết quả |
| `KM-001-AC23` | Trung vị mở khoá ≤ 500 ms; mã hoá 1 MB ≤ 200 ms | pass | `ℹ AC23 unlock 200 KB: median 120.6 ms, runs 118, 119, 121, 121, 125 ms`; `ℹ AC23 encrypt 1 MB: median 28.3 ms, runs 25, 27, 28, 35, 39 ms` |
| `KM-001-AC24` | Đổi cách dẫn xuất khoá hay định dạng envelope → ít nhất một vector fail | pass | Tự chạy đột biến: `sed` đổi `'keymesh/enc'` → `'keymesh/enc2'` trong `crypto.js` rồi `npm test` → `✖ AC24 NFR08 encKey: accountKey wrapped with the fixed IV matches…`, `✖ AC24 FR12 the whole chain opens the vector vault from the password alone`, `ℹ pass 73 / ℹ fail 2`. Khôi phục file (`git diff --stat -- src` rỗng), chạy lại: `ℹ pass 75 / ℹ fail 0` |

## 3. Promised proofs

| Proof | Executed | Result |
|---|---|---|
| `npm test` → `test/primitives.test.js` (AC01) | Có | pass |
| `test/keys.test.js`, `test/vectors.test.js` (AC02) | Có | pass |
| Spy `subtle.deriveBits` (AC03) | Có, đọc mã và chạy | pass, `calls === 0` |
| Lật từng byte 4 loại envelope (AC05) | Có | pass, số lần thử khớp `12 + 48` / `12 + len(ct)` |
| 10 000 IV (AC10) | Có | pass |
| `_internal` mã hoá dưới AAD của Y (AC12) | Có | pass |
| `npm run test:browser` (AC18) | Có | 75/75 trên Chrome 156 |
| `docs/09` bảng epic → thao tác (AC20) | Có (đọc lại) | pass |
| `perf.test.js` 5 lần, trung vị (AC23) | Có | 120.6 ms và 28.3 ms |
| Thử đổi `info` HKDF rồi hoàn lại (AC24) | Có, tự chạy lại | 2 test fail, hoàn lại thì xanh |
| Quét `core/` không có storage/network/DOM/console, `import` chỉ trong `core/` (FR22) | Có | `✔ FR22 core sources use no storage, network, DOM or console, and import only within core/`; `rg` ngoài test cũng rỗng |
| Thiếu `CompressionStream`/`crypto.subtle` → `unsupported` | Có | `✔ FR22 missing CompressionStream or WebCrypto is unsupported, naming the API` |
| Handle khoá không lộ byte (NFR05) | Có | `✔ NFR05 key handles expose no key bytes and cannot be swapped between roles` |
| Bộ test ≤ 60 s (NFR09) | Có | `real 0m5.554s` trên Node |

## 4. Regressions

Repo chưa có suite nào trước KM-001 (plan §1: không có `package.json`, không có test), nên không có hồi quy theo nghĩa thông thường. `envvault.html` không đổi: `git diff master --stat -- envvault.html` rỗng.

```
$ npm test
ℹ tests 75
ℹ suites 0
ℹ pass 75
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4869.8046

$ npm run test:browser
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36
tests 75  pass 75  fail 0  (14048 ms)
```

## 5. Out-of-scope check

Không có hạng mục Out of scope nào được giao kèm:

- Không có migrate/đọc v1: `rg -i "migrate|envvault|v1" src/public/js/core` không thấy gì ngoài `forkedFrom` (tên trường schema). `envvault.html` không đổi.
- Không có `merge.js`, `store.js`, `sync.js`, UI, server, WebAuthn, TOTP/`otpauth://`, dọn thùng rác tự động, backup `keymesh-backup`, KDF khác PBKDF2: danh sách `export` của `core/` chỉ gồm KDF/HKDF/AES-GCM/model như plan; `src/` chỉ có `public/js/core/`.
- `package.json` không có `dependencies`/`devDependencies` (NFR01).
- `design/README.md`, `docs/02-architecture.md`, `.claude/CLAUDE.md` có khác biệt so với `master`, nhưng đều đến từ các commit trước khi implement (`c174d44` và cũ hơn), không phải từ các commit bước 1–7. Không tính là phạm vi trôi.

## 6. Findings

| # | Finding | Severity | Where |
|---|---|---|---|
| 1 | Review #1 thêm cận trên `KDF_MAX_ITER = 6 000 000` cho `kdf.iter`. Spec FR01 chỉ đòi `iter ≥ 600 000`. Đây là bổ sung có chủ đích (chống `kdf` do server đưa vào gây treo máy khách), đã có test `AC03 FR01 kdf.iter above KDF_MAX_ITER…`, nhưng spec chưa ghi. Hệ quả: nếu sau này muốn nâng `iter` quá 6 triệu thì phải đổi hằng số | Thấp | `src/public/js/core/crypto.js:111`; `spec.md` FR01 |
| 2 | NFR02 yêu cầu Node ≥ 20 LTS, nhưng chỉ chạy được trên Node v24.22.1. Chưa kiểm trên Node 20/22. Mã chỉ dùng global chuẩn nên rủi ro thấp | Thấp | Môi trường kiểm; `package.json` `engines.node >= 20` |
| 3 | AC18 chỉ kiểm trên Chromium (Chrome 156). Safari/Firefox hoãn có chủ đích theo Concern 6 (KM-003/KM-004). Không tính là lỗi | Thông tin | `spec.md` Concern 6 |
| 4 | Khả năng chạy trên Workers (wrangler bundle ở KM-005) chưa kiểm được vì chưa có `wrangler`; plan §4 đã nêu. Lõi không dùng `node:*` và test FR22 chặn việc đó | Thông tin | `plan.md` §4 |

Vòng phản hồi (`Feedback loop` trong plan) kiểm được mọi tiêu chí AC01–AC24; không có tiêu chí nào không kiểm được.

## 7. Shortest path to pass

Không áp dụng, verdict là pass. (Tuỳ chọn, không chặn: ghi `KDF_MAX_ITER` vào `spec.md` FR01 hoặc `docs/04-security.md` cho khớp mã.)
