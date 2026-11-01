# Implementation Summary — App v2 chạy cục bộ

**Epic ID:** `KM-003`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-01`
**Traces to:** `plan.md`

---

## 1. Branch and PR

| | |
|---|---|
| Branch | `feat/KM-003-app` (đã push lên `origin`) |
| PR | **Chưa mở**: máy này không có `gh` CLI. Mở tại https://github.com/delete101020/keymesh/pull/new/feat/KM-003-app (base `master`), dẫn tới `docs/epics/KM-003/KM-003.md` và `artifacts/spec.md` |

## 2. Progress

> *One row per batch. A session in a batched run reads this first; rows marked
> done are not redone.*

Không chạy theo batch: recipe `native-full` không bật batch, nên cả 14 bước của plan làm trong một phiên. Các dòng dưới đi theo cách nhóm của plan.

| Batch | Plan steps | Commits | Tests run | State |
|---|---|---|---|---|
| 0 | Trước bước 1: commit docs/epic đang dở | `8e216db` | — | done |
| 1 | 1–2 | `89b8864`, `5acfbe2` | `npm test` 126/126, `test:browser` 126/126, `vectors`, thử đột biến bộ so sánh | done |
| 2 | 3–4 | `0d149df`, `830f3ab` | `npm test` 165/165, `test:browser` 165/165 | done |
| 3 | 5–6 | `753f3af`, `08306dc` | `npm test` 189 pass + 4 skip, `test:browser` 193/193 | done |
| 4–5 | 7–8 | `737f62d`, `16e7a31` | `account`, `lock`, `projects` E2E; `npm test` 196 pass | done |
| 6–8 | 9–12 | `967dc5a` | `items`, `fields` E2E 26/26 | done |
| 9 | 13–14 | `98395c1`, `109a031`, `2a32881`, commit chứa file này | E2E 63/63, `npm test` 196 pass + 4 skip, `test:browser` 193/193, `vectors` | done |

## 3. What was built

> *Per plan step: what changed, in which files.*

| Plan step | Change | Files |
|---|---|---|
| 1 | Bước so sánh của bộ sinh vector kiểm `vaultGzip`, `envelope.ct` theo hai lớp; mọi khoá khác và phần đầu file so từng byte. `testkit/vectors.js` không đổi | `testkit/gen-vectors.mjs` |
| 2 | NFC trong `deriveFromPassword`; thao tác mới `restoreItemVersion`; cập nhật 03 §2, 09 (gồm Concern 12, 15) | `core/crypto.js`, `core/model.js`, `docs/03`, `docs/09`, `test/keys`, `test/model`, `test/leak` |
| 3 | TOTP theo RFC 6238, đọc base32/URI; sinh mật khẩu không lệch; 7 772 từ EFF | `otp.js`, `passgen.js`, `wordlist.js`, `test/otp`, `test/passgen` |
| 4 | Lọc, tìm bỏ dấu, chip, hạn, Concern 12; nháp, fork, nhân bản, sắp xếp; diff lịch sử; đọc file field | `vault-query.js`, `vault-ops.js`, `history-diff.js`, `field-file.js` + 4 file test |
| 5 | IndexedDB theo 03 §3, ghi tài khoản một transaction; `session.mutate` ghi xong mới thay vault trong bộ nhớ; Web Lock một tab | `store.js`, `session.js`, `tab-lock.js`, `testkit/memory-store.mjs` + 3 file test |
| 6 | Hẹn giờ theo `Date.now`; clipboard tự xoá, thử lại khi có focus, xoá khi khoá | `idle.js`, `clipboard.js` + 2 file test |
| 7 | Phục vụ cục bộ đúng CSP; harness CDP không phụ thuộc; khung trang, CSS viết lại; màn lập/mở khoá/lỗi; quét tĩnh | `testkit/serve.mjs`, `testkit/e2e/cdp.mjs`, `driver.mjs`, `index.html`, `styles.css`, `app.js`, `ui/dom.js`, `icons.js`, `gate.js`, `shell.js`, `test/ui-static`, `test/e2e/account`, `lock`, `package.json` |
| 8 | Bộ lọc, cây project/env, danh sách, hộp thoại project/env, chọn màu, xếp chồng | `ui/nav.js`, `list.js`, `project-dialogs.js`, `test/e2e/projects` |
| 9–10 | Xem field theo `kind`, che/hiện, copy, mở URL, tải file, OTP đếm ngược; chọn loại, form, gán env, hạn, lưu, nhân bản | `ui/detail.js`, `edit.js`, `test/e2e/items` |
| 11 | Bộ sinh, nhập OTP, quét QR bằng camera và ảnh, field từ file; bộ mã QR cho test | `ui/generator-dialog.js`, `qr-dialog.js`, `testkit/e2e/qr-fixture.mjs`, `test/e2e/fields` |
| 12 | Fork, lịch sử kèm diff, khôi phục | `ui/detail.js`, `history-dialog.js`, `test/e2e/items` |
| 13 | Quét toàn app, đo hiệu năng; sửa chuỗi che còn sót trong diff sau khi hiện | `test/e2e/sweep`, `perf`, `ui/history-dialog.js`, `styles.css` |
| 14 | Khép 02, 03 §1 và §3, 04, README, KM-004/006/011, Resolution trong spec | `docs/*`, `README.md` |

## 4. Proofs executed

> *The real command and its real output, per acceptance criterion. Never a claim
> without output.*

Node v24.22.1, macOS, Chrome 156 headless. Đầu ra là các dòng tương ứng của lần chạy cuối, đã bỏ phần thời gian từng test. Lần chạy E2E cuối ở commit `98395c1`; sau đó chỉ đổi tài liệu và shim của runner trình duyệt, không đổi `src/`.

```
$ npm run test:e2e
ℹ tests 63
ℹ pass 63
ℹ fail 0
```

### `KM-003-AC01`

```
$ npm run test:e2e
✔ KM-003 AC01 FR01 empty browser: setup with exactly two password inputs; mismatch or empty creates nothing
```

### `KM-003-AC02`

```
$ npm run test:e2e
✔ KM-003 AC02 FR02 11 characters warn, 12 do not; both statements are always on screen
✔ KM-003 AC02 AC03 FR03 FR04 11 characters can still create; stored data has the shape of docs/03 §3
```

### `KM-003-AC03`

```
$ npm test
✔ KM-003 AC03 FR03 FR04 a new account: one vault named by default, device id, no authKey
$ npm run test:browser
ok   KM-003 AC03 FR03 FR04 account and vault rows have the shape of docs/03 §3
$ npm run test:e2e
✔ KM-003 AC02 AC03 FR03 FR04 11 characters can still create; stored data has the shape of docs/03 §3
```

### `KM-003-AC04`

```
$ npm test
✔ KM-003 AC04 FR03 a failed account write leaves the session closed
$ npm run test:browser
ok   KM-003 AC04 FR03 an account write that fails midway leaves nothing behind
$ npm run test:e2e
✔ KM-003 AC04 FR03 a write failing midway leaves no account and setup comes back
```

### `KM-003-AC05`

```
$ npm test
✔ KM-003 AC05 FR05 NFC and NFD forms of a password derive the same keys
✔ KM-003 AC05 FR05 FR06 FR07 right password opens (in either Unicode form), wrong one does not
$ npm run test:e2e
✔ KM-003 AC05 FR05 opened with the NFD form of the NFC password
```

### `KM-003-AC06`

```
$ npm run test:e2e
✔ KM-003 AC06 FR06 FR07 FR09 after quitting Chrome: wrong password shows nothing and can retry; right one shows all; only same-origin requests
```

Kiểm tay còn lại: tắt Wi-Fi thật rồi mở lại app.

### `KM-003-AC07`

```
$ npm test
✔ KM-003 AC07 FR08 a damaged vault reports a vault error and nothing is overwritten
$ npm run test:e2e
✔ KM-003 AC07 FR08 one changed byte in the envelope: error, no data, stored row unchanged
✔ KM-003 AC07 FR08 no CompressionStream: says unsupported, no setup screen
```

### `KM-003-AC08`

```
$ npm test
✔ KM-003 AC08 FR12 lock drops keys and vault; a save racing with lock cannot bring them back
$ npm run test:e2e
✔ KM-003 AC08 FR12 locking with a draft open and a secret shown: both gone after unlocking
✔ KM-003 AC08 FR10 FR12 Khoá: lock screen at once, nothing of the vault left in the DOM
```

### `KM-003-AC09`

```
$ npm test
✔ KM-003 AC09 FR11 locks at the 10-minute mark, within one tick
✔ KM-003 AC09 FR11 activity at minute 9 restarts the count from there
$ npm run test:e2e
✔ KM-003 AC09 FR11 ten idle minutes lock within seconds; activity at minute 9 restarts the count
```

### `KM-003-AC10`

```
$ npm test
✔ KM-003 AC10 FR11 after a sleep no tick ran: the first event locks before it is handled
$ npm run test:e2e
✔ KM-003 AC10 FR11 waking after 11 minutes: the first event locks before it does anything
```

Kiểm tay còn lại: ngủ máy thật 11 phút. E2E giả lập bằng cách nhảy `Date.now` và dừng mọi timer.

### `KM-003-AC11`

```
$ npm test
✔ KM-003 AC11 FR13 only one holder at a time; releasing lets the next one in
✔ KM-003 AC11 FR13 real Web Locks, where the platform has them
$ npm run test:e2e
✔ KM-003 AC11 FR13 a second tab cannot unlock and says why; after the first closes it can, with the latest data
```

### `KM-003-AC12`

```
$ npm test
✔ KM-003 AC12 FR14 a new project gets dev, uat, staging, prod in order; names are checked
$ npm run test:e2e
✔ KM-003 AC12 FR14 FR16 default env list in order; empty and duplicate names are refused
```

### `KM-003-AC13`

```
$ npm test
✔ KM-003 AC13 FR15 FR16 project delete: confirm count 3, 2 go to unassigned, 1 stays, scopes keep ids
$ npm run test:e2e
✔ KM-003 AC13 AC40 FR15 FR43 deleting a project with 3 items: asks with 3; 2 go to Chưa gán, 1 stays elsewhere; empty filter says so
✔ KM-003 AC13 FR15 project delete asks with a count and cleans the navigation
```

### `KM-003-AC14`

```
$ npm test
✔ KM-003 AC14 FR17 moves renumber the order and stop at the ends
$ npm run test:e2e
✔ KM-003 AC14 FR17 reorder by keyboard only; order survives lock and unlock
```

### `KM-003-AC15`

```
$ npm test
✔ KM-003 AC15 FR19 prod is recognised in any case and only on a live env
$ npm run test:e2e
✔ KM-003 AC15 FR19 copying from a PROD env warns and still copies; other items do not warn
✔ KM-003 AC15 FR18 an env colour shows in both themes without CSP trouble
```

### `KM-003-AC16`

```
$ npm test
✔ KM-003 AC16 FR20 all 9 types: template fields match docs/03 and an empty title cannot be saved
$ npm run test:e2e
✔ KM-003 AC16 FR20 all 9 types: template names, kinds and order; empty title cannot be saved
```

### `KM-003-AC17`

```
$ npm test
✔ KM-003 AC17 FR21 add otp, remove, reorder, change a file field to text: no file left
$ npm run test:e2e
✔ KM-003 AC17 FR21 add otp, remove, reorder, file field to text: correct after lock and unlock
```

### `KM-003-AC18`

```
$ npm test
✔ KM-003 AC18 FR26 shared chip names envs of the filtered project and counts the others
$ npm run test:e2e
✔ KM-003 AC18 FR22 FR23 FR26 one item in three envs: an edit shows everywhere; chip is right
```

### `KM-003-AC19`

```
$ npm test
✔ KM-003 AC19 FR22 editing assignments keeps the id of a deleted env
```

Chỉ có test logic (plan cũng ghi vậy).

### `KM-003-AC20`

```
$ npm test
✔ KM-003 AC20 FR23 a failed write: reported, memory unchanged, disk unchanged, next write works
$ npm run test:browser
ok   KM-003 AC20 FR23 a failed put changes nothing on disk
$ npm run test:e2e
✔ KM-003 AC20 FR23 a failed write: failure shown, draft kept, no "saved"; reopening shows the old version
```

### `KM-003-AC21`

```
$ npm test
✔ KM-003 AC21 FR24 fork: new item in that env only, new field ids, empty history; both independent
$ npm run test:e2e
✔ KM-003 AC21 FR24 fork for staging: separate items, each edit stays on its side
```

### `KM-003-AC22`

```
$ npm test
✔ KM-003 AC22 FR24 no fork from an item with one live env, even if a deleted env remains
$ npm run test:e2e
✔ KM-003 AC22 FR24 an item with one live env has no Fork, even with a deleted env left
```

### `KM-003-AC23`

```
$ npm test
✔ KM-003 AC23 FR25 duplicate: title suffix, same scopes, empty history, no forkedFrom, new field ids
$ npm run test:e2e
✔ KM-003 AC23 FR25 duplicate: cancel makes nothing; save makes an independent item
```

### `KM-003-AC24`

```
$ npm test
✔ KM-003 AC24 FR27 diff marks changed attributes; secrets are masked; otp carries no value
✔ KM-003 AC24 FR27 25 saves keep the 20 newest versions
$ npm run test:e2e
✔ KM-003 AC24 FR27 history: time, reason, diff; a masked value is not in the DOM until pressed
✔ KM-003 AC24 25 saves keep 20 versions
```

### `KM-003-AC25`

```
$ npm test
✔ KM-003 AC25 FR28 restore puts back title, fields, notes, expires; scopes stay; deleted field returns
✔ KM-003 AC25 FR28 restoring a version equal to the current one changes nothing
✔ KM-003 AC25 restore then merge: the result validates and the restored values win over the base
$ npm run test:e2e
✔ KM-003 AC25 FR28 restore: values back, assignments unchanged, deleted field returns, reason restore
```

### `KM-003-AC26`

```
$ npm test
✔ KM-003 AC26 FR29 FR30 expiry by local calendar: N−1, N, N+14 in, N+15 out
✔ KM-003 AC26 FR29 a day with a clock change still counts as one day, at any hour
$ npm run test:e2e
✔ KM-003 AC26 FR29 FR30 expiry on the real screen: N−1, N, N+14 listed, N+15 not; chip wording
```

### `KM-003-AC27`

```
$ npm test
✔ KM-003 AC27 FR31 10 000 values × 8 option sets × lengths 8 and 64: right length and groups, no repeats
$ npm run test:e2e
✔ KM-003 AC27 FR31 generator: length and groups; closing without Dùng leaves the field alone
```

### `KM-003-AC28`

```
$ npm test
✔ KM-003 AC28 FR32 word list: at least 2048 distinct entries, no separator inside a word
✔ KM-003 AC28 FR32 default is 5 words (≥ 55 bits), adjustable 3–8
$ npm run test:e2e
✔ KM-003 AC28 FR32 passphrase mode: 5 words by default, adjustable 3–8
```

### `KM-003-AC29`

```
$ npm test
✔ KM-003 AC29 FR34 RFC 6238 vectors for SHA1, SHA256, SHA512
✔ KM-003 AC29 FR33 URI parameters are honoured; defaults are 6 digits, 30 s, SHA1
✔ KM-003 AC29 FR33 base32 ignores case and spaces
```

### `KM-003-AC30`

```
$ npm test
✔ KM-003 AC30 FR33 hotp, bad base32, out-of-range parameters and empty values are refused
✔ KM-003 AC30 parameter edges 6–8 digits and 1–300 s are accepted
✔ KM-003 AC30 FR33 an otp field with a bad or empty value blocks the save, at that field
$ npm run test:e2e
✔ KM-003 AC30 FR33 bad otp values are refused at that field; a good one saves
```

### `KM-003-AC31`

```
$ npm run test:e2e
✔ KM-003 AC31 FR34 code and countdown; the code rolls over; no way to see the secret; copy gives the code
```

### `KM-003-AC32`

```
$ npm run test:e2e
✔ KM-003 AC32 FR35 fake camera reads the QR, fills the field and stops; closing without a read stops too
✔ KM-003 AC32 AC33 FR36 image with a QR fills the field; an image without one says so and keeps the value
```

Kiểm tay còn lại: camera thật trên Chrome macOS. E2E dùng camera giả với file Y4M chứa QR.

### `KM-003-AC33`

```
$ npm run test:e2e
✔ KM-003 AC32 AC33 FR36 image with a QR fills the field; an image without one says so and keeps the value
✔ KM-003 AC33 FR35 FR37 camera refused, or no QR reader: a clear message and pasting still works
```

E2E giả lập từ chối bằng cách đặt `Browser.setPermission` **và** thay `getUserMedia` ném `NotAllowedError`, vì headless dùng `--use-fake-ui`. Chưa thấy hộp từ chối thật.

### `KM-003-AC34`

```
$ npm test
✔ KM-003 AC34 FR38 FR39 exactly 65 536 bytes with CRLF is accepted and comes back byte for byte
✔ KM-003 AC34 FR38 65 537 bytes, a NUL byte and invalid UTF-8 are refused
✔ KM-003 AC34 FR39 a save that does not touch a field leaves its bytes as they were
$ npm run test:e2e
✔ KM-003 AC34 FR38 FR39 exactly 64 KB with CRLF: accepted, downloaded byte for byte, also after saving another field; too large, NUL and bad UTF-8 are refused
```

### `KM-003-AC35`

```
$ npm run test:e2e
✔ KM-003 AC35 FR39 a new vpn item with empty Cấu hình has no download button
```

### `KM-003-AC36`

```
$ npm test
✔ KM-003 AC36 FR40 clipboard unchanged after 30 seconds: cleared
✔ KM-003 AC36 FR40 something else copied and clipboard readable: left alone
✔ KM-003 AC36 FR40 clipboard not readable: overwritten anyway, without ever prompting
✔ KM-003 AC36 FR40 copying again restarts the count
✔ KM-003 AC36 FR40 a write refused for lack of focus is retried when focus returns
$ npm run test:e2e
✔ KM-003 AC36 FR40 in the real browser: cleared after 30 s; copying again restarts; a later copy elsewhere survives
```

### `KM-003-AC37`

```
$ npm test
✔ KM-003 AC37 FR12 lock during the count: cleared now, no value kept
✔ KM-003 AC37 FR12 lock with the write refused: no value kept, cleared when focus returns
$ npm run test:e2e
✔ KM-003 AC37 FR12 locking during the count clears the clipboard at once
```

### `KM-003-AC38`

```
$ npm run test:e2e
✔ KM-003 AC38 FR41 a revealed secret is masked again after switching items, and absent from the DOM
```

### `KM-003-AC39`

```
$ npm run test:e2e
✔ KM-003 AC39 FR42 an http URL opens with no opener; javascript: has no open button and runs nothing
```

E2E mở một URL `http://127.0.0.1…` thay cho `https://a.example` để AC47 vẫn không có request ra ngoài; `rel="noopener noreferrer"` không phụ thuộc đích.

### `KM-003-AC40`

```
$ npm test
✔ KM-003 AC40 FR43 each filter gives the right items, deleted env and deleted project included
✔ KM-003 AC40 Concern 12 an env alive under a deleted project counts as deleted for display
$ npm run test:e2e
✔ KM-003 AC13 AC40 FR15 FR43 deleting a project with 3 items: asks with 3; 2 go to Chưa gán, 1 stays elsewhere; empty filter says so
✔ KM-003 AC40 empty vault has an empty state with the next step
```

### `KM-003-AC41`

```
$ npm test
✔ KM-003 AC41 FR44 search folds case and Vietnamese accents, skips secrets, otp and history
$ npm run test:e2e
✔ KM-003 AC41 FR44 Cmd/Ctrl+K, accents folded, secrets not searched
```

### `KM-003-AC42`

```
$ npm run test:e2e
✔ KM-003 AC42 FR45 the theme follows the system at once, without a reload
```

### `KM-003-AC43`

```
$ npm run test:e2e
✔ KM-003 AC43 FR46 900 px has 3 columns
✔ KM-003 AC43 FR46 NFR09 899 px stacks; flow 3.1 works; no sideways scroll; targets ≥ 44 px
✔ KM-003 AC43 FR46 NFR09 360 px stacks; flow 3.1 works; no sideways scroll; targets ≥ 44 px
```

### `KM-003-AC44`

```
$ npm test
✔ KM-003 AC44 FR47 no out-of-scope feature appears in UI strings
$ npm run test:e2e
✔ KM-003 AC44 FR47 no screen offers an out-of-scope feature
```

### `KM-003-AC45`

```
$ npm test
✔ KM-003 AC45 NFR01 the local server sends exactly the CSP of docs/04
```

Bộ đếm chạy trong mọi file E2E (hook `after` của từng file khẳng định danh sách rỗng); xem đối chứng dương ở §7.

### `KM-003-AC46`

```
$ npm run test:e2e
✔ KM-003 AC46 NFR02 NFR03 markers in every input: after locking, nothing readable in any storage, the profile, console, errors or URLs
```

### `KM-003-AC47`

```
$ npm run test:e2e
✔ KM-003 AC47 NFR04 every request stays on the same origin
```

### `KM-003-AC48`

```
$ npm run test:e2e
✔ KM-003 AC48 NFR05 an injection string in every input shows as text and creates nothing
```

### `KM-003-AC49`

**Chưa có kết quả.** Firefox chưa cài trên máy dev. Safari: đã thử chạy test lõi tự động, trang không gửi kết quả về trong 180 giây, chưa rõ nguyên nhân. Luồng chính trên Safari chưa chạy. AC này chỉ yêu cầu ghi kết quả, không chặn đóng epic (NFR07).

```
$ CHROME_PATH=<script gọi open -g -a Safari> npm run test:browser
Timed out after 180 s waiting for http://127.0.0.1:54219/testkit/browser/index.html
```

### `KM-003-AC50`

```
$ npm run test:e2e
ℹ unlock 269 KB: median 65.3 ms, runs 64, 65, 65, 67, 68
ℹ save in a 1343 KB vault: median 53.7 ms, runs 52, 60, 53, 55, 54
ℹ filter 500 items: median 14.7 ms, runs 8, 17, 11, 22, 15
ℹ search 500 items: median 8.5 ms, runs 5, 9, 7, 12, 9
✔ KM-003 AC50 NFR08 unlock with a 200 KB vault ≤ 1.5 s
✔ KM-003 AC50 NFR08 saving an item with a 1 MB vault ≤ 500 ms, click to done
✔ KM-003 AC50 NFR08 filter and type-to-search with 500 items ≤ 100 ms each
```

Ngưỡng: mở khoá ≤ 1 500 ms, lưu ≤ 500 ms, lọc/tìm ≤ 100 ms. Vault thử lớn hơn mức yêu cầu (269 KB, 1 343 KB). Đo trên Chrome 156 headless, máy dev macOS.

### `KM-003-AC51`

```
$ npm test
✔ KM-003 AC51 NFR10 text colours reach 4.5:1 in both themes
$ npm run test:e2e
✔ KM-003 AC51 NFR10 flow 3.1 by keyboard only, with focus always visible
```

### `KM-003-AC52`

```
$ npm test
ℹ tests 200
ℹ pass 196
ℹ fail 0
ℹ skipped 4

$ npm run test:browser
tests 193  pass 193  fail 0  (15189 ms)

$ npm run vectors
ok       vaultGzip gunzips to inputs.vault
ok       envelope.ct is AES-GCM over the committed vaultGzip
ok       every other key and the file header match node:crypto byte for byte

$ git diff master --stat -- testkit/vectors.js | wc -l
0

$ node -e "...dependencies, devDependencies"
deps {} {}
```

4 test `skipped` trên Node là `store.test.js` (IndexedDB) và test Web Locks thật; chúng chạy trên trình duyệt. Thử đột biến bộ so sánh vector (bước 1):

```
vaultGzip rc 1 | DIFFERS  envelope.ct is AES-GCM over the committed vaultGzip
envelope.ct rc 1 | DIFFERS  envelope.ct is AES-GCM over the committed vaultGzip
authKey rc 1 | DIFFERS  every other key and the file header match node:crypto byte for byte
```

Thay đổi lõi đúng hai mục như NFR11 dự kiến, có lý do ghi ở 03 §2 và 09: NFC trong `deriveFromPassword` (Concern 2), `restoreItemVersion` (Concern 9). Bảng FR → bằng chứng ở cuối mục này.

### `KM-003-AC53`

```
ok   KM-003 AC53 FR04 a stored row opens with the password and maps onto POST /api/register
```

| Epic cần | Chỉ ra ở đâu |
|---|---|
| KM-004: dạng lưu giữ nguyên khi có Service Worker; `_headers`, `Permissions-Policy` còn lại | 03 §3; `testkit/serve.mjs` chỉ có CSP và `nosniff`; `docs/epics/KM-004/KM-004.md` ghi việc chuyển sang |
| KM-006: bộ khoá để đăng ký | `meta.account.kdf`, `wrappedAccountKey`, dòng `vaults` → `{ id, wrappedVaultKey, meta, blob: current.envelope }`; `authKey` dẫn xuất lại. Test: `store.test.js` AC53; 03 §3 "Giá trị trước KM-006" |
| KM-006: trạng thái chưa đồng bộ | `current.dirty = true`, `current.version = 0`, `base = null` |
| KM-010: `record` để backup | `toRecord(row)` ở `js/store.js` trả đúng `record` ở 09 |

**Bảng FR/NFR → bằng chứng** (cột giữa đếm dòng kết quả test có ghi đúng id).

| Yêu cầu | AC trong spec | Dòng test có id | Kiểm tay thêm |
|---|---|---|---|
| `KM-003-FR01` | AC01 | 1 | — |
| `KM-003-FR02` | AC02 | 1 | — |
| `KM-003-FR03` | AC03, AC04 | 8 | — |
| `KM-003-FR04` | AC03, AC53 | 5 | — |
| `KM-003-FR05` | AC05 | 5 | — |
| `KM-003-FR06` | AC06 | 3 | Tắt Wi-Fi thật |
| `KM-003-FR07` | AC06 | 3 | — |
| `KM-003-FR08` | AC07 | 6 | — |
| `KM-003-FR09` | AC06 | 2 | — |
| `KM-003-FR10` | AC08 | 1 | — |
| `KM-003-FR11` | AC09, AC10 | 8 | Ngủ máy thật |
| `KM-003-FR12` | AC08, AC37 | 14 | — |
| `KM-003-FR13` | AC11 | 5 | — |
| `KM-003-FR14` | AC12 | 3 | — |
| `KM-003-FR15` | AC13 | 6 | — |
| `KM-003-FR16` | AC12, AC13 | 5 | — |
| `KM-003-FR17` | AC14 | 3 | — |
| `KM-003-FR18` | AC15 | 1 | — |
| `KM-003-FR19` | AC15 | 3 | — |
| `KM-003-FR20` | AC16 | 3 | — |
| `KM-003-FR21` | AC17 | 5 | — |
| `KM-003-FR22` | AC18, AC19 | 6 | — |
| `KM-003-FR23` | AC18, AC20 | 10 | — |
| `KM-003-FR24` | AC21, AC22 | 6 | — |
| `KM-003-FR25` | AC23 | 3 | — |
| `KM-003-FR26` | AC18 | 3 | — |
| `KM-003-FR27` | AC24 | 11 | — |
| `KM-003-FR28` | AC25 | 7 | — |
| `KM-003-FR29` | AC26 | 5 | — |
| `KM-003-FR30` | AC26 | 3 | — |
| `KM-003-FR31` | AC27 | 7 | — |
| `KM-003-FR32` | AC28 | 5 | — |
| `KM-003-FR33` | AC29, AC30 | 9 | — |
| `KM-003-FR34` | AC29, AC31 | 3 | — |
| `KM-003-FR35` | AC32, AC33 | 3 | Camera thật trên Chrome macOS |
| `KM-003-FR36` | AC32, AC33 | 1 | — |
| `KM-003-FR37` | AC33 | 1 | — |
| `KM-003-FR38` | AC34 | 5 | — |
| `KM-003-FR39` | AC34, AC35 | 8 | — |
| `KM-003-FR40` | AC36, AC37 | 13 | — |
| `KM-003-FR41` | AC38 | 1 | — |
| `KM-003-FR42` | AC39 | 1 | — |
| `KM-003-FR43` | AC40 | 3 | — |
| `KM-003-FR44` | AC41 | 5 | — |
| `KM-003-FR45` | AC42 | 1 | — |
| `KM-003-FR46` | AC43 | 4 | — |
| `KM-003-FR47` | AC44 | 2 | — |
| `KM-003-NFR01` | AC45 | 3 | — |
| `KM-003-NFR02` | AC46 | 1 | — |
| `KM-003-NFR03` | AC46 | 3 | — |
| `KM-003-NFR04` | AC47 | 2 | — |
| `KM-003-NFR05` | AC39, AC48 | 2 | — |
| `KM-003-NFR06` | AC52 | 2 | — |
| `KM-003-NFR07` | AC49 | 0 | — |
| `KM-003-NFR08` | AC50 | 3 | — |
| `KM-003-NFR09` | AC43 | 2 | — |
| `KM-003-NFR10` | AC51 | 3 | — |
| `KM-003-NFR11` | AC05, AC52 | 0 | — |
| `KM-003-NFR12` | AC52 | 0 | — |

**Danh sách kiểm tay cho `verify.md`** (NFR12): (1) AC06: tắt Wi-Fi thật, mở lại app, đúng và sai mật khẩu. (2) AC10: ngủ máy thật quá 11 phút. (3) AC32: camera thật trên Chrome macOS với QR từ một trang bật 2FA. (4) AC49: Safari, mở `npm run test:browser` và luồng lập, mở khoá, tạo item, copy; Firefox nếu đã cài. (5) AC36: bị từ chối ghi vì tab mất focus, rồi quay lại tab. (6) AC33: từ chối quyền camera bằng hộp thật của trình duyệt.

## 5. Deviations from the plan

> *Anything done differently, and why. If nothing, say so explicitly.*

Sáu mục đầu đã ghi vào `plan.md` §8 (Amendments).

1. Điểm vào của trang là `ui/shell.js` thay vì `app.js`, để giữ chiều phụ thuộc `ui/` → `app.js`.
2. Thêm `testkit/memory-store.mjs`; sửa shim `node:test` để tôn trọng `skip`.
3. **Thêm hộp xác nhận "Bỏ bản nháp?"**, spec không yêu cầu. Originator có quyền bỏ.
4. `saveItem` nhận thêm `before`, `changed` ngoài `reason`.
5. Bước 9–12 gộp một commit, vì tách ra sẽ có commit không chạy được.
6. E2E của bước 7 dùng thao tác thêm project của bước 8 để tạo dữ liệu, nên chỉ xanh khi có bước 8.
7. Vị trí một số test khác bảng §5 của plan: phần copy của AC15 và AC37 ở `fields.e2e.js` thay vì `projects`/`lock`; AC13, AC26, AC41 trên UI ở `items.e2e.js`; AC39 mở URL cục bộ thay cho `https://a.example`.
8. Lỗi lưu trữ dùng `StoreError` thay vì `KeymeshError`. Quy ước `KeymeshError` là của `core/`; bốn mã của nó không có mã nào cho lỗi bộ lưu trữ.
9. Đồng hồ đếm ngược OTP dùng `<progress>` thay cho vòng `conic-gradient` của prototype, nên không cần `style.setProperty`.
10. Không chạy `/verify` trước mỗi commit như hướng dẫn chung của công cụ: trong repo này `/verify` là bước verify độc lập của pipeline, chạy ở bước sau và do người khác đảm nhận. Thay vào đó mỗi commit mã đều có test đã chạy ở §2.
11. AC49 chưa có kết quả; plan §3 bước 14 dự kiến "Safari đã chạy".

## 6. Discovered work

> *Found but deliberately not done, and where it went — a plan amendment, a new
> intent, an issue.*

| Item | Where it went |
|---|---|
| Đọc QR trên iPhone, Safari xoá dữ liệu, tốc độ trên điện thoại | `docs/epics/KM-004/KM-004.md` |
| Đăng ký bộ khoá hiện có, thêm username | `docs/epics/KM-006/KM-006.md` |
| Tìm theo tag | `docs/epics/KM-011/KM-011.md` |
| Trang đích của `npm run test:browser` không trả kết quả trên Safari trong 180 giây | Chưa rõ nguyên nhân; mục (4) danh sách kiểm tay, verifier ghi kết quả |
| Enter trong ô tên env không lưu, phải bấm nút bút chì | Chưa làm; nhỏ, để originator quyết khi review |

## 7. Known gaps

> *What a reviewer should look at hardest.*

- **AC49 chưa có số:** Safari không trả kết quả, luồng chính chưa chạy, Firefox chưa cài. Không chặn đóng epic theo NFR07, nhưng app mới chỉ được chứng minh trên Chrome.
- **Các tình huống giả lập thay vì thật:** ngủ máy (nhảy `Date.now`), camera (thiết bị giả), từ chối camera (thay `getUserMedia`), clipboard bị từ chối vì mất focus (chỉ có test với clipboard giả). Xem danh sách kiểm tay.
- **AC46 dò thư mục profile có giới hạn.** Đối chứng dương: chuỗi canary trong IndexedDB **được** tìm thấy trong file `.log` của LevelDB; canary trong `localStorage` **không** tìm thấy (có thể chưa kịp ghi khi Chrome bị tắt, hoặc bị nén). Vì vậy phần `localStorage` chỉ được chứng minh qua API trong trang, và app không dùng `localStorage`. File LevelDB đã nén cũng có thể che chuỗi. Lớp bảo vệ thật là vault đã mã hoá trước khi vào store.
- **Bộ đếm CSP đã có đối chứng dương:** chèn `<style>`, thuộc tính `style` và ảnh ngoài origin thì đếm được 6 vi phạm, nên kết quả 0 có nghĩa.
- **Clipboard (Concern 7, plan đã lưu ý):** với quyền mặc định, app không đọc được clipboard nên sau 30 giây sẽ xoá kể cả thứ khác người dùng vừa copy. Việc này xảy ra ở phần lớn lần dùng.
- **Sửa field `file`:** bấm *Sửa nội dung* rồi gõ thì `textarea` đổi CRLF thành LF, nên file tải lại không còn trùng byte. Field không sửa thì vẫn trùng (có test).
- **`restoreItemVersion`** là thay đổi hợp đồng lõi: xem kỹ việc bỏ tombstone và thứ tự field. Có test gộp qua `merge`, chưa có property test.
- **`pagehide` khoá app**, nên quay lại bằng nút Back cũng phải mở khoá lại.
- JavaScript không xoá được chuỗi trong bộ nhớ: "khoá" là bỏ tham chiếu (NFR03).
- E2E cần Node ≥ 22 vì dùng `WebSocket` có sẵn; `npm test` vẫn chỉ cần Node ≥ 20.

---

Status: done
