# Implementation Summary — Server: D1, xác thực và API vault

**Epic ID:** `KM-005`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `plan.md`

---

## 1. Branch and PR

| | |
|---|---|
| Branch | `feat/KM-005-server` |
| PR | Chưa mở: máy này không có `gh` (giống KM-004). Mở tay tại https://github.com/delete101020/keymesh/compare/master...feat/KM-005-server |

## 2. Progress

> *One row per batch. A session in a batched run reads this first; rows marked
> done are not redone.*

Run này không chạy theo batch (recipe `native-full`): cả plan làm trong một phiên.

| Batch | Plan steps | Commits | Tests run | State |
|---|---|---|---|---|
| 1 | 1–9 | `813156a`…`c67183c` (cộng commit `implement.md`) | `npm run test:server` 70/70; `npm test` 223 pass, 5 skip, 0 fail; `npm run test:browser` 216/216; `npm run test:e2e` 89/89; `npm run vectors` | done |

## 3. What was built

> *Per plan step: what changed, in which files.*

| Plan step | Change | Files |
|---|---|---|
| 1 | `wrangler` ghim 4.156.0, Node 24.22.1, 6 bảng; harness chạy `wrangler pages dev` thật, sửa dữ liệu bằng `node:sqlite`, dò log khi dừng | `package.json`, `package-lock.json`, `.nvmrc`, `src/wrangler.toml`, `src/migrations/0001_init.sql`, `testkit/wrangler-server.mjs`, `testkit/dev-server.mjs`, `test/ui-static.test.js` (Amendment 1) |
| 2 | Điểm vào duy nhất theo thứ tự Origin, route, token, id, handler; mọi response qua một hàm; đếm byte body thật; `404` JSON | `src/functions/api/[[route]].js`, `_http.js`, `test/server/routing-headers.server.js` |
| 3 | Prelogin, salt giả HMAC, đăng ký bằng `batch()`, kiểm tra hình dạng và kích thước dòng | `_validate.js`, `_secrets.js`, `_auth.js`, `test/server/account.server.js` |
| 4 | Đăng nhập constant-time với hash giả, xác thực và gia hạn trong một câu `UPDATE … RETURNING`, đăng xuất | `_auth.js`, `test/server/login.server.js`, `session.server.js` |
| 5 | Đếm lần sai bằng một câu upsert hai dòng; IPv6 /64, IPv4-mapped; dọn bản ghi qua `waitUntil` | `_rate-limit.js`, `_auth.js`, `test/server/rate-limit.server.js` |
| 6 | Liệt kê + `ETag`, tạo, đọc (`since`), ghi compare-and-swap, chủ sở hữu xét trước body | `_vaults.js`, `test/server/vaults.server.js` |
| 7 | Hai thiết bị đi hết 3.1, tài khoản do lõi KM-001 tạo, dò đĩa và log, phân lớp; đủ 12 status và 15 mã lỗi | `test/server/flow.server.js`, `privacy.server.js`, `layering.server.js`, `routing-headers.server.js` |
| 8 | p95 và chênh lệch thời gian; AC54, AC55 | `test/server/perf.server.js` |
| 9 | Tài liệu khớp spec | `docs/02`–`06`, `KM-005.md`, `KM-006.md`, `KM-008.md`, `KM-009.md`, `README.md`, `.claude/CLAUDE.md` |

**Lý do đổi quy ước (`CLAUDE.md` yêu cầu ghi):** Node 24.22.1 do originator chốt ở plan Quyết định 1: `wrangler` cần Node ≥ 22, và `node:sqlite` của harness không cần cờ ở bản này. `test:server` tách khỏi `npm test` (Quyết định 2) để `npm test` vẫn chạy khi chưa cài gì; đã kiểm trên bản clone không có `node_modules`.

## 4. Proofs executed

> *The real command and its real output, per acceptance criterion. Never a claim
> without output.*

Các dòng `✔` trích từ lần chạy 2 của AC54 (bản clone sạch của commit `c67183c`). Số đo AC56 từ `npm run test:server` trong repo, cùng mã nguồn.

**Kiểm chính bộ test:** 18 lỗi cố ý cấy vào `src/functions` (bỏ điều kiện `NOT EXISTS`, ghi không so version, đọc không lọc chủ, bỏ kiểm `security_stamp`, tin `X-Forwarded-For`, lưu username thô, ghi blob ra log, đăng ký không nguyên tử, thoát sớm khi username không tồn tại, …): 18/18 bị test đúng tiêu chí bắt, mã đã khôi phục sau mỗi lần. Chạy một lần trước commit `bec8342`, không có trong repo.

### `KM-005-AC01`

```
$ node --test --test-name-pattern="AC01" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC01 FR34 register, a second device, list, create, read, write, conflict, logout (1815.349875ms)
```

### `KM-005-AC02`

```
$ node --test --test-name-pattern="AC02" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC02 FR14 keys and vault made by the core register as they are and open on another device (215.524084ms)
```

### `KM-005-AC03`

```
$ node --test --test-name-pattern="AC03" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC03 an operation not delivered yet is a JSON 404, with and without a token (52.5ms)
```

### `KM-005-AC04`

```
$ node --test --test-name-pattern="AC04" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC04 an Origin outside the list, null, or another port is refused first (199.939625ms)
```

### `KM-005-AC05`

```
$ node --test --test-name-pattern="AC05" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC05 an allowed Origin, or none, goes on; no CORS header ever (8.562792ms)
```

### `KM-005-AC06`

```
$ node --test --test-name-pattern="AC06" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC06 with no origin list configured every Origin is refused, and none still goes on (1773.188958ms)
```

### `KM-005-AC07`

```
$ node --test --test-name-pattern="AC07" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC07 FR03 all twelve kinds of response carry no-store and nosniff (66.077125ms)
```

### `KM-005-AC08`

```
$ node --test --test-name-pattern="AC08" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC08 FR04 every error is { error, message }, with a message fixed per code and free of input (70.360584ms)
```

### `KM-005-AC09`

```
$ node --test --test-name-pattern="AC09" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC09 the body limit counts received bytes: 2 000 001 is refused, 2 000 000 is not (41.709625ms)
✔ KM-005 AC09 a body of exactly 2 000 000 bytes padded with spaces is accepted end to end (21.527ms)
✔ KM-005 AC09 FR05 D1 refusing a value as too big is 413, not 500 (5.567583ms)
✔ KM-005 AC09 FR05 a write within the body limit whose row would not fit is 413, not 500 (66.186708ms)
```

### `KM-005-AC10`

```
$ node --test --test-name-pattern="AC10" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC10 a username outside the rule is 400 at prelogin and register; 64 characters are taken (1782.887375ms)
✔ KM-005 AC10 login refuses a username outside the rule; a bad body is 400 bad_request (1764.629709ms)
```

### `KM-005-AC11`

```
$ node --test --test-name-pattern="AC11" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC11 a real username gets its stored kdf, in any case (10.786291ms)
```

### `KM-005-AC12`

```
$ node --test --test-name-pattern="AC12" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC12 an unknown username gets a stable fake kdf, indistinguishable in shape (15.247792ms)
```

### `KM-005-AC13`

```
$ node --test --test-name-pattern="AC13" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC13 without the server secret prelogin is 500 for real and unknown usernames alike (1733.554875ms)
```

### `KM-005-AC14`

```
$ node --test --test-name-pattern="AC14" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC14 a wrong, missing or unconfigured registration token is one 403, before any content check (5297.706541ms)
```

### `KM-005-AC15`

```
$ node --test --test-name-pattern="AC15" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC15 the kdf is checked with a valid token, boundaries included (27.279667ms)
```

### `KM-005-AC16`

```
$ node --test --test-name-pattern="AC16" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC16 a username taken, in another case, is 409 and creates nothing (11.380667ms)
```

### `KM-005-AC17`

```
$ node --test --test-name-pattern="AC17" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC17 a vault id taken is 409; the same username then registers with another id (8.668334ms)
```

### `KM-005-AC18`

```
$ node --test --test-name-pattern="AC18" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC18 NFR06 storage failing in the middle of registering is 500 with no token; a retry works (18.092625ms)
```

### `KM-005-AC19`

```
$ node --test --test-name-pattern="AC19" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC19 an unknown username and a wrong authKey give byte-identical 401s (16.089ms)
```

### `KM-005-AC20`

```
$ node --test --test-name-pattern="AC20" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC20 two devices log in with one authKey: different tokens and sessions, both work (19.430541ms)
```

### `KM-005-AC21`

```
$ node --test --test-name-pattern="AC21" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC21 the 5th failure is still 401; then 429 with Retry-After, even with the right authKey (1801.769292ms)
```

### `KM-005-AC22`

```
$ node --test --test-name-pattern="AC22" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC22 an unknown username goes through the same sequence of codes (20.441541ms)
```

### `KM-005-AC23`

```
$ node --test --test-name-pattern="AC23" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC23 a different case does not split the counter (19.5505ms)
```

### `KM-005-AC24`

```
$ node --test --test-name-pattern="AC24" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC24 20 failures from one IP lock that IP on any username; another IP is unaffected (79.613958ms)
```

### `KM-005-AC25`

**Một phần, theo Concern 4.** Bằng chứng cục bộ: đổi `X-Forwarded-For`, `X-Real-IP`, `True-Client-IP`, `Forwarded` mỗi lần vẫn bị khoá. Local tin `CF-Connecting-IP` do client đặt nên phần đó chưa chứng minh được; đã chuyển vào `KM-006.md`.

```
$ node --test --test-name-pattern="AC25" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC25 (local half) forwarding headers a client sets are not the address (74.830667ms)
```

### `KM-005-AC26`

Giới hạn: local luôn tự đặt IP khi thiếu header, nên nhánh "không xác định được" được kiểm bằng giá trị rác (cùng nhánh mã), không phải bằng request thật sự thiếu header.

```
$ node --test --test-name-pattern="AC26" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC26 two IPv6 addresses of one /64 share a counter, in any spelling; garbage shares one too (220.18875ms)
```

### `KM-005-AC27`

```
$ node --test --test-name-pattern="AC27" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC27 attempts during a lock do not extend it: the original end still opens the door (37.190459ms)
```

### `KM-005-AC28`

```
$ node --test --test-name-pattern="AC28" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC28 once a lock is over the counter is back at zero (40.669ms)
```

### `KM-005-AC29`

```
$ node --test --test-name-pattern="AC29" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC29 failures older than the window start a new one instead of locking (22.157167ms)
```

### `KM-005-AC30`

```
$ node --test --test-name-pattern="AC30" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC30 a correct login clears the username counter, not the IP counter (33.814542ms)
```

### `KM-005-AC31`

```
$ node --test --test-name-pattern="AC31" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC31 a request refused with 400 is not counted (23.787458ms)
```

### `KM-005-AC32`

```
$ node --test --test-name-pattern="AC32" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC32 a lock stops logins only: a live session and prelogin still work (32.588208ms)
```

### `KM-005-AC33`

```
$ node --test --test-name-pattern="AC33" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC33 every way a token can be bad gives one and the same 401, before content is looked at (1938.158209ms)
```

### `KM-005-AC34`

```
$ node --test --test-name-pattern="AC34" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC34 using a token renews it for 30 days from then; at the expiry instant it is refused (10.812083ms)
```

### `KM-005-AC35`

```
$ node --test --test-name-pattern="AC35" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC35 logging out ends only that session; the same token then gets 401, even to log out (18.255834ms)
```

### `KM-005-AC36`

```
$ node --test --test-name-pattern="AC36" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC36 each account lists only its own vaults, with the right size and no blob (1759.830667ms)
```

### `KM-005-AC37`

```
$ node --test --test-name-pattern="AC37" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC37 If-None-Match gets 304 until the list changes, in strong and weak form (27.605708ms)
```

### `KM-005-AC38`

```
$ node --test --test-name-pattern="AC38" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC38 creating a vault gives 201 at version 1; another device sees it (12.534875ms)
```

### `KM-005-AC39`

```
$ node --test --test-name-pattern="AC39" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC39 an id already in use, by anyone, is 409 and the vault stays as it was (12.443625ms)
```

### `KM-005-AC40`

```
$ node --test --test-name-pattern="AC40" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC40 register refuses a malformed blob with invalid_envelope and stores nothing (13.443667ms)
✔ KM-005 AC40 a malformed blob is invalid_envelope on create and write, and nothing changes (101.076ms)
```

### `KM-005-AC41`

```
$ node --test --test-name-pattern="AC41" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC41 meta or wrappedVaultKey with extra fields, or by other than account, is bad_request (39.349292ms)
```

### `KM-005-AC42`

```
$ node --test --test-name-pattern="AC42" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC42 a blob written is read back identical (8.938792ms)
```

### `KM-005-AC43`

```
$ node --test --test-name-pattern="AC43" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC43 since: equal is 304, anything else 200, garbage 400 (57.780541ms)
```

### `KM-005-AC44`

```
$ node --test --test-name-pattern="AC44" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC44 writing at the current version stores the blob and adds exactly 1 (31.698792ms)
```

### `KM-005-AC45`

```
$ node --test --test-name-pattern="AC45" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC45 writing from any other version is version_conflict with the current state, changing nothing (52.421875ms)
```

### `KM-005-AC46`

```
$ node --test --test-name-pattern="AC46" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC46 NFR05 10 parallel writes from one version: exactly one wins and the version adds 1 (41.947542ms)
```

### `KM-005-AC47`

```
$ node --test --test-name-pattern="AC47" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC47 FR31 someone else's vault and no vault at all are byte-identical 404s; the owner's data is untouched (30.278083ms)
```

### `KM-005-AC48`

```
$ node --test --test-name-pattern="AC48" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC48 FR32 an id of the wrong form is invalid_id once the token has passed (38.678708ms)
```

### `KM-005-AC49`

```
$ node --test --test-name-pattern="AC49" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC49 FR33 after the whole chain, failures and overwrites, snapshots and audit are empty; counters are not (1801.883333ms)
```

### `KM-005-AC50`

```
$ node --test --test-name-pattern="AC50" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC50 NFR01 nothing readable is on disk: no password, plaintext, key or token, in any form (131.133792ms)
```

### `KM-005-AC51`

```
$ node --test --test-name-pattern="AC51" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC51 NFR02 failed attempts leave neither the username nor the IP, not even as a raw hash (23.932334ms)
```

### `KM-005-AC52`

Ngoài test này, `stop()` của harness dò log ở **mọi** server của mọi tệp test và làm tệp đó đỏ nếu có rò rỉ.

```
$ node --test --test-name-pattern="AC52" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC52 NFR03 the scan of server output sees the output and finds no secret or blob (1793.120708ms)
```

### `KM-005-AC53`

```
$ node --test --test-name-pattern="AC53" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC53 NFR05 20 parallel failures on one username: exactly 5 are 401, the rest 429 (46.133333ms)
```

### `KM-005-AC54`

Bản clone sạch, chưa cài gì, rồi `npm ci`; `HOME` tạm, không token Cloudflare, `sandbox-exec` chặn mạng ra ngoài trừ localhost. `curl exit 6` là đối chứng: trong sandbox không tới được Cloudflare.

```
$ zsh ac54.sh
--- run 1: HOME temp, no Cloudflare token, outbound blocked except localhost
exit 0
ℹ tests 70
ℹ pass 70
ℹ fail 0
--- run 2: HOME temp, no Cloudflare token, outbound blocked except localhost
exit 0
ℹ tests 70
ℹ pass 70
ℹ fail 0
same results in both runs
--- control: inside the sandbox an outside request fails
000
curl exit 6
```

### `KM-005-AC55`

Chạy trên commit `c67183c`. 5 test bị bỏ qua ở `npm test` là test IndexedDB, có từ trước, chạy trong `test:browser`.

```
$ npm test; npm run test:browser; npm run vectors; npm run test:e2e
ℹ tests 228
ℹ pass 223
ℹ fail 0
ℹ skipped 5
tests 216  pass 216  fail 0  (14812 ms)
vectors exit 0   # 3 dòng ok, không dòng lỗi
e2e exit 0
ℹ tests 89
ℹ pass 89
ℹ fail 0
$ git status --short
(rỗng)
$ node -e "…package.json"
dependencies {} devDependencies {"wrangler":"4.156.0"}
```

`git diff master -- src/public testkit/vectors.js testkit/serve.mjs test/e2e` rỗng: lõi và vector không đổi.

### `KM-005-AC56`

Số đo ở cuối mục này.

```
$ node --test --test-name-pattern="AC56" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC56 NFR07 each of the 8 operations stays under 200 ms at p95 with a 200 KB blob (5306.522667ms)
```

```
ℹ prelogin: p50 1.9 ms, p95 2.7 ms, max 3.3 ms
ℹ register: p50 4.9 ms, p95 7.5 ms, max 8.6 ms
ℹ login: p50 3.2 ms, p95 4.7 ms, max 6.3 ms
ℹ logout: p50 2.3 ms, p95 3.4 ms, max 5.3 ms
ℹ list: p50 2.2 ms, p95 3.8 ms, max 5.6 ms
ℹ create: p50 5 ms, p95 7.8 ms, max 10.8 ms
ℹ read: p50 5.9 ms, p95 8.4 ms, max 12.3 ms
ℹ write: p50 5.2 ms, p95 7.2 ms, max 42.1 ms
ℹ median wrong authKey 3.04 ms, unknown username 3.09 ms, gap 0.05 ms
```

Ngưỡng 200 ms, blob 200 KB, 100 lần tuần tự. Dòng `median` là đo NFR04: ngưỡng 5 ms, 200 lần mỗi nhánh, xen kẽ. Số này không nói gì về Cloudflare thật (Concern 5).

### `KM-005-AC57`

Phần máy kiểm được ở dưới. Reviewer vẫn cần đọc nhánh username không tồn tại trong `src/functions/api/_auth.js`.

```
$ node --test --test-name-pattern="AC57" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC57 NFR10 src/functions imports only itself and core/ (3.008416ms)
✔ KM-005 AC57 NFR11 no path, flag or branch for tests in production code (1.656125ms)
✔ KM-005 AC57 NFR10 the server never calls a decrypting or unwrapping operation of core (0.708084ms)
✔ KM-005 AC57 NFR04 the unknown-username branch hashes and compares like the real one (0.572292ms)
```

### `KM-005-AC58`

Sửa theo FR36, FR37; verifier đọc lại. Soát bằng lệnh:

```
$ rg -n 'mọi endpoint' docs/epics/KM-005/KM-005.md
rg exit 1
$ rg -n 'KM-005 (ghi|lưu) (snapshot|nhật ký)' docs/0*.md docs/epics/KM-00{5,6,8,9}/*.md
rg exit 1
```

`rg exit 1` nghĩa là không còn dòng nào khớp.

### `KM-005-AC59`

```
$ node --test --test-name-pattern="AC59" test/server/*.server.js   # trích từ npm run test:server
✔ KM-005 AC59 FR35 a login removes stale rows, keeps live ones, and survives a failing cleanup (115.098208ms)
```


## 5. Deviations from the plan

> *Anything done differently, and why. If nothing, say so explicitly.*

1. **Amendment 1, sửa `test/ui-static.test.js`**, trong khi plan ghi không đụng `test/*.test.js`. `KM-003 NFR06` đòi `devDependencies` rỗng, nên NFR09 và NFR10 không thể cùng đạt. Assert mới: chỉ có `wrangler`, ghim đúng phiên bản. Đã ghi trong `plan.md` §2. **Người duyệt nên xác nhận thay đổi này.**
2. **Commit không khớp từng bước:** bước 2 và 3 chung một commit (`5d2c697`), vì AC09 cần một route thật để đọc body. Test bước 8 nằm trong commit bước 7 (`a62bb71`).
3. **AC34 viết ở bước 6, không phải bước 4:** cần một thao tác có token mà không huỷ phiên. AC09 phần `413` theo kích thước dòng cũng ở `vaults.server.js`, vì khi đăng ký body luôn lớn hơn dòng nên ca này chỉ xảy ra ở `PUT`.
4. **`--binding` thay vì tệp cho harness, đúng plan, nhưng có thêm phát hiện:** `--env-file` không có tác dụng với `pages dev`. `--binding` được wrangler in là `(hidden)` nên không lộ qua log; AC52 dò cả hai bí mật này.
5. **`wrangler` không phải lúc nào cũng thoát khi nhận SIGTERM:** plan không lường trước. Harness chạy server trong process group riêng, SIGKILL sau 3 giây, và không giữ runner sống nếu test đỏ.

## 6. Discovered work

> *Found but deliberately not done, and where it went — a plan amendment, a new
> intent, an issue.*

| Item | Where it went |
|---|---|
| Phần còn lại của AC25; binding trên Cloudflare; `too big` thật; `ETag` khi nén; số đo CPU; header thật; điều kiện trước khi đưa secret thật | `KM-006.md` (đúng plan §7) |
| `docs/09-core-api.md` vẫn ghi lõi chạy trên "Node ≥ 20": đây là tuyên bố về tính khả chuyển của lõi, không phải phiên bản của repo. Plan chỉ đổi `CLAUDE.md`, `README.md` nên không sửa | Không làm gì; ghi ở đây để reviewer quyết |
| `/api/register` không có giới hạn số lần thử token | Đã chấp nhận ở Concern 9; ghi trong `docs/04` |

## 7. Known gaps

> *What a reviewer should look at hardest.*

- **AC25 chưa chứng minh trọn:** ai tự đặt `CF-Connecting-IP` có qua được Cloudflare thật không thì chỉ KM-006 trả lời được. Toàn bộ khoá theo IP dựa vào điều này.
- **Không test nào chạy trên Cloudflare thật.** Số đo AC56 là trên máy dev, không cho biết giới hạn 10 ms CPU có đủ không; mỗi request có token còn tốn một lần ghi để gia hạn (Concern 5).
- **Nhánh `too big`** trong `[[route]].js` dựa vào câu lỗi đoán trước (`too big|TOOBIG`), mới kiểm bằng trigger giả cùng câu lỗi.
- **`ROW_OVERHEAD_BYTES = 256`** trong `_validate.js` là ước lượng rộng tay, không phải cách D1 tính kích thước dòng. Dòng sát 2 000 000 byte có thể lệch; nhánh `too big` là lớp đỡ phía sau.
- **Đăng nhập đúng đua với lần khoá:** một đăng nhập đúng đã qua bước kiểm khoá vẫn thành công dù request sai song song vừa khoá username. Không làm tăng số lần đoán sai được tính; AC53 chỉ nói về lần sai.
- **Đọc `src/functions/api/_auth.js`, hàm `login`:** nhánh username không tồn tại (AC57), và `_rate-limit.js`, câu upsert `recordFailure`: đây là phần dễ sai nhất.
- **Harness giữ bí mật test trên dòng lệnh** của tiến trình `wrangler`: chỉ là giá trị ngẫu nhiên của lần chạy, không phải cấu hình thật.
- `sandbox-exec` đã bị Apple đánh dấu deprecated; AC54 dựa vào nó trên máy này.

---

Status: done
