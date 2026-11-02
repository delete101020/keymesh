# Verification Report — Server: D1, xác thực và API vault

**Epic ID:** `KM-005`
**Verifier:** Verifier (independent)
**Status:** Draft
**Created:** `2026-11-02`
**Verified against:** `spec.md`, `plan.md`

---

## 1. Verdict

Verdict: pass

59/59 tiêu chí có bằng chứng từ lần chạy của verifier, trên nhánh `feat/KM-005-server`. Không có `fail`, không có `untested`. Hai tiêu chí (AC25, AC26) chỉ kiểm được một phần ở môi trường cục bộ, đúng như spec đã chấp nhận ở Concern 4; phần còn lại nằm ở `KM-006.md` (xem §6).

Checklist được dựng từ `spec.md` và `plan.md` trước khi đọc `implement.md`. `implement.md` chỉ đọc sau cùng để đối chiếu AC54 và AC56.

## 2. Acceptance criteria

Mọi dòng test trích dưới đây là từ `npm run test:server` do verifier chạy (72 test, 0 lỗi). Kiểm tự động: với mỗi AC01–AC59, tìm dòng `✔ KM-005 ACnn` và không có dòng `✖`; chỉ AC54, AC55, AC58 không có test riêng, vì chúng được kiểm bằng lệnh ở §3.

| Id | Criterion | Verdict | Evidence |
|---|---|---|---|
| `KM-005-AC01` | Chuỗi 3.1 trên hai thiết bị, không sửa server | pass | `✔ AC01 FR34 register, a second device, list, create, read, write, conflict, logout` |
| `KM-005-AC02` | Bộ khoá của lõi KM-001 đăng ký, đọc lại, mở được | pass | `✔ AC02 FR14 keys and vault made by the core register as they are and open on another device` |
| `KM-005-AC03` | 10 thao tác chưa giao trả `404` JSON, có/không token | pass | `✔ AC03 an operation not delivered yet is a JSON 404, with and without a token` |
| `KM-005-AC04` | Origin lạ, `null`, khác port → `403 forbidden_origin` | pass | `✔ AC04 an Origin outside the list, null, or another port is refused first` |
| `KM-005-AC05` | Origin hợp lệ hoặc không có đi tiếp, không có header CORS | pass | `✔ AC05 an allowed Origin, or none, goes on; no CORS header ever` |
| `KM-005-AC06` | Danh sách origin rỗng → mọi Origin bị từ chối | pass | `✔ AC06 with no origin list configured every Origin is refused, and none still goes on` |
| `KM-005-AC07` | 12 loại response đều có `no-store` và `nosniff` | pass | `✔ AC07 FR03 all twelve kinds of response carry no-store and nosniff` |
| `KM-005-AC08` | Mọi lỗi dạng `{ error, message }`, không lộ đầu vào | pass | `✔ AC08 FR04 every error is { error, message }, with a message fixed per code and free of input` |
| `KM-005-AC09` | 2 000 001 byte → `413`; 2 000 000 byte được nhận | pass | `✔ AC09 the body limit counts received bytes…`, `✔ AC09 a body of exactly 2 000 000 bytes padded with spaces is accepted`, `✔ AC09 FR05 D1 refusing a value as too big is 413`, `✔ AC09 FR05 a write within the body limit whose row would not fit is 413` |
| `KM-005-AC10` | Username sai dạng → `400`; 64 ký tự được nhận | pass | `✔ AC10 a username outside the rule is 400 at prelogin and register; 64 characters are taken`; `✔ AC10 login refuses a username outside the rule` |
| `KM-005-AC11` | Prelogin username có thật trả đúng `kdf`, không phân biệt hoa/thường | pass | `✔ AC11` trong `test/server/account.server.js` (không có `✖`) |
| `KM-005-AC12` | Salt giả ổn định, `iter` 600 000, username khác ra salt khác | pass | `✔ AC12` trong `account.server.js` |
| `KM-005-AC13` | Thiếu bí mật salt giả → `500` cho cả hai loại username | pass | `✔ AC13 without the server secret prelogin is 500 for real and unknown usernames alike` |
| `KM-005-AC14` | Token đăng ký sai/thiếu/ngắn → cùng `403 registration_closed` | pass | `✔ AC14 a wrong, missing or unconfigured registration token is one 403, before any content check` |
| `KM-005-AC15` | Biên `iter`, `name`, salt → `400 invalid_kdf` | pass | `✔ AC15` trong `account.server.js` |
| `KM-005-AC16` | Username trùng khác hoa/thường → `409`, không tạo gì | pass | `✔ AC16` trong `account.server.js` |
| `KM-005-AC17` | Id vault trùng khi đăng ký → `409 vault_exists`, đăng ký lại được | pass | `✔ AC17` trong `account.server.js` |
| `KM-005-AC18` | Lỗi kho giữa đăng ký → `500` không token; gửi lại thành công | pass | `✔ AC18 NFR06 storage failing in the middle of registering is 500 with no token; a retry works` |
| `KM-005-AC19` | Sai authKey và username không tồn tại giống từng byte | pass | `✔ AC19 an unknown username and a wrong authKey give byte-identical 401s` |
| `KM-005-AC20` | Hai thiết bị: token và `sessionId` khác nhau, cùng dùng được | pass | `✔ AC20 two devices log in with one authKey: different tokens and sessions, both work` |
| `KM-005-AC21` | Lần 5 `401`, lần 6 `429` + `Retry-After` 1–900 | pass | `✔ AC21 the 5th failure is still 401; then 429 with Retry-After, even with the right authKey` |
| `KM-005-AC22` | Username không tồn tại: cùng chuỗi mã | pass | `✔ AC22 an unknown username goes through the same sequence of codes` |
| `KM-005-AC23` | Đổi hoa/thường không tách bộ đếm | pass | `✔ AC23 a different case does not split the counter` |
| `KM-005-AC24` | 20 lần sai từ một IP khoá IP đó, IP khác không bị | pass | `✔ AC24 20 failures from one IP lock that IP on any username; another IP is unaffected` |
| `KM-005-AC25` | Header chuyển tiếp IP do client đặt không có tác dụng | pass (một phần, xem §6 #1) | `✔ AC25 (local half) forwarding headers a client sets are not the address`; `✔ AC25 (simulated edge) a spoofed CF-Connecting-IP that gets overwritten changes nothing: locked by the real address`; `✔ AC25 (boundary) reached without an edge, a changing CF-Connecting-IP is believed and never locks`. Việc Cloudflare có ghi đè thật không chưa kiểm được, đã chuyển sang `KM-006.md` |
| `KM-005-AC26` | /64 chung bộ đếm; IP không xác định chung bộ đếm | pass (một phần, xem §6 #2) | `✔ AC26 two IPv6 addresses of one /64 share a counter, in any spelling; garbage shares one too`. Request hoàn toàn không có IP không tạo được ở local, nên kiểm bằng giá trị rác |
| `KM-005-AC27` | Lần thử lúc khoá không kéo dài khoá | pass | `✔ AC27 attempts during a lock do not extend it: the original end still opens the door` |
| `KM-005-AC28` | Hết khoá, bộ đếm về 0 | pass | `✔ AC28 once a lock is over the counter is back at zero` |
| `KM-005-AC29` | Lần sai quá 15 phút mở cửa sổ mới | pass | `✔ AC29 failures older than the window start a new one instead of locking` |
| `KM-005-AC30` | Đăng nhập đúng xoá bộ đếm username, giữ bộ đếm IP | pass | `✔ AC30 a correct login clears the username counter, not the IP counter` |
| `KM-005-AC31` | Request `400` không bị đếm | pass | `✔ AC31 a request refused with 400 is not counted` |
| `KM-005-AC32` | Đang khoá thì phiên có sẵn và prelogin vẫn chạy | pass | `✔ AC32 a lock stops logins only: a live session and prelogin still work` |
| `KM-005-AC33` | Mọi dạng token xấu → cùng `401`, trước kiểm nội dung | pass | `✔ AC33 every way a token can be bad gives one and the same 401, before content is looked at` |
| `KM-005-AC34` | Dùng token gia hạn 30 ngày; đúng thời điểm hết hạn bị từ chối | pass | `✔ AC34 using a token renews it for 30 days from then; at the expiry instant it is refused` |
| `KM-005-AC35` | Đăng xuất chỉ huỷ phiên đó; dùng lại → `401` | pass | `✔ AC35 logging out ends only that session; the same token then gets 401, even to log out` |
| `KM-005-AC36` | Mỗi bên chỉ thấy vault của mình, không blob, `size` đúng | pass | `✔ AC36 each account lists only its own vaults, with the right size and no blob` |
| `KM-005-AC37` | `ETag` và `If-None-Match` → `304`, kể cả dạng `W/` | pass | `✔ AC37 If-None-Match gets 304 until the list changes, in strong and weak form` |
| `KM-005-AC38` | Tạo vault → `201`, version 1, thiết bị khác thấy | pass | `✔ AC38 creating a vault gives 201 at version 1; another device sees it` |
| `KM-005-AC39` | Id trùng → `409 vault_exists`, vault cũ không đổi | pass | `✔ AC39 an id already in use, by anyone, is 409 and the vault stays as it was` |
| `KM-005-AC40` | Blob sai dạng → `400 invalid_envelope`, không đổi gì | pass | `✔ AC40 a malformed blob is invalid_envelope on create and write, and nothing changes` |
| `KM-005-AC41` | `meta`/`wrappedVaultKey` thừa trường hoặc `by` lạ → `400` | pass | `✔ AC41 meta or wrappedVaultKey with extra fields, or by other than account, is bad_request` |
| `KM-005-AC42` | Blob ghi rồi đọc lại giống hệt | pass | `✔ AC42 a blob written is read back identical` |
| `KM-005-AC43` | 5 giá trị `since` ra đúng 5 mã | pass | `✔ AC43 since: equal is 304, anything else 200, garbage 400` |
| `KM-005-AC44` | Ghi đúng `baseVersion` → version +1 | pass | `✔ AC44 writing at the current version stores the blob and adds exactly 1` |
| `KM-005-AC45` | `baseVersion` lệch → `409` kèm bản hiện tại | pass | `✔ AC45 writing from any other version is version_conflict with the current state, changing nothing` |
| `KM-005-AC46` | 10 lần ghi song song: 1 `200`, 9 `409` | pass | `✔ AC46 NFR05 10 parallel writes from one version: exactly one wins and the version adds 1` |
| `KM-005-AC47` | Vault người khác và không tồn tại: cặp `404` giống từng byte | pass | `✔ AC47 FR31 someone else's vault and no vault at all are byte-identical 404s; the owner's data is untouched` |
| `KM-005-AC48` | Id sai dạng → `400 invalid_id` sau token | pass | `✔ AC48 FR32 an id of the wrong form is invalid_id once the token has passed` |
| `KM-005-AC49` | Snapshot và nhật ký rỗng, bộ đếm có dữ liệu | pass | `✔ AC49 FR33 after the whole chain, failures and overwrites, snapshots and audit are empty; counters are not` |
| `KM-005-AC50` | Dò dữ liệu đã lưu: 0 trùng với secret | pass | `✔ AC50 NFR01 nothing readable is on disk: no password, plaintext, key or token, in any form` |
| `KM-005-AC51` | Bộ đếm không lộ username/IP, kể cả băm thô | pass | `✔ AC51 NFR02 failed attempts leave neither the username nor the IP, not even as a raw hash` |
| `KM-005-AC52` | Đầu ra `console` của server không lộ gì | pass | `✔ AC52 NFR03 the scan of server output sees the output and finds no secret or blob` |
| `KM-005-AC53` | 20 lần sai song song: tối đa 5 `401`, còn lại `429` | pass | `✔ AC53 NFR05 20 parallel failures on one username: exactly 5 are 401, the rest 429` |
| `KM-005-AC54` | Chạy hai lần liên tiếp, không tài khoản Cloudflare, không ra mạng | pass | Xem §3: hai lần với `HOME` tạm, 72/72 mỗi lần; một lần nữa dưới `sandbox-exec` chặn mạng ngoài (`curl` tới Cloudflare thoát `exit=7`), 72/72 |
| `KM-005-AC55` | Bốn lệnh test xanh, `dependencies` rỗng, `git status` sạch | pass | Xem §3 và §4 |
| `KM-005-AC56` | p95 ≤ 200 ms với blob 200 KB cho 8 thao tác | pass | `✔ AC56 NFR07 each of the 8 operations stays under 200 ms at p95 with a 200 KB blob`; p95 lớn nhất 8,4 ms (`write`) ở lần chạy đầu, 8,0 ms (`create`) ở lần sau |
| `KM-005-AC57` | Không có nhánh test, không import ngoài `core/`, không có nhánh bỏ qua băm | pass | `layering.server.js`: 5 test `✔`. Verifier đọc `_auth.js:login`: nhánh username không tồn tại tính `fake` bằng `labeledHmac`, rồi cùng `hashAuthKey` + `safeEqual` như nhánh thật, chỉ rẽ ở `if (!user \|\| !same)` sau phép so. `prelogin` cũng tính HMAC trước khi truy vấn. NFR04 đo: `median wrong authKey 3.33 ms, unknown username 3.34 ms, gap 0.01 ms` |
| `KM-005-AC58` | Tài liệu khớp FR36, FR37 | pass | Verifier đọc `git diff master` của 02–06, `KM-005/006/008/009.md`, `CLAUDE.md`. FR36: `KM-005.md` ghi "8 trong 18 thao tác"; `KM-006.md` nhận header thật, phần còn lại của AC25, binding, gói Free, giới hạn dòng D1, `ETag`, username, điều kiện Concern 18; `KM-008.md`/`KM-009.md` ghi phần API nhận về, `KM-009.md` ghi việc xem lại Concern 7. FR37: 03 §`sys_auth_attempt` ghi khoá là HMAC có bí mật; 04 ghi hai rủi ro Concern 1, 2 và mục "Điều kiện trước khi đưa secret thật lên server"; 02 thêm `SERVER_SECRET`; 06 có username, 2 000 000 byte, `vault_exists` khi đăng ký, `since`, cột epic. `rg -n -i 'snapshot\|nhật ký\|audit'` ở 02–06: mọi chỗ nhắc đều ghi "từ KM-009" hoặc nằm trong mục thao tác KM-009; không còn câu nào nói KM-005 ghi snapshot hay nhật ký |
| `KM-005-AC59` | Dọn bản ghi quá hạn khi đăng nhập, bản còn hiệu lực giữ nguyên | pass | `✔ AC59 FR35 a login removes stale rows, keeps live ones, and survives a failing cleanup` |

## 3. Promised proofs

Mọi proof trong bảng §5 của `plan.md` đều có lệnh chạy bởi verifier.

| Proof | Executed | Result |
|---|---|---|
| `npm run test:server` (AC01–AC53, AC56, AC57, AC59) | có, 4 lần | 72 tests, 72 pass, 0 fail |
| AC54: chạy `test:server` hai lần với `HOME` tạm, không token Cloudflare, `WRANGLER_SEND_METRICS=false` | có | `ℹ tests 72 / pass 72 / fail 0`, hai lần liên tiếp |
| AC54: chặn mạng ngoài bằng `sandbox-exec` (cho phép localhost) | có | `curl https://api.cloudflare.com` thường: `301`; trong sandbox: `exit=7`. `test:server` trong sandbox: `ℹ tests 72 / pass 72 / fail 0` |
| AC55: `npm test`, `test:browser`, `test:e2e`, `vectors`, `git status`, `dependencies` | có | Xem §4 |
| AC56: `perf` | có | p95 từng thao tác (ms): prelogin 3,1; register 7,7; login 4,4; logout 3,4; list 4,0; create 8,0; read 7,5; write 6,9 |
| AC57: `layering` + đọc mã `_auth.js` | có | 5/5 `✔`; đọc mã khớp |
| AC58: đọc diff + `rg` | có | Xem dòng `AC58` ở §2 |
| Đo NFR04 (trung vị 200 lần mỗi nhánh) | có | gap 0,01 ms so với ngưỡng 5 ms |
| AC25 trên Cloudflare thật | không, theo plan §4 và §7 | Chuyển sang `KM-006.md` có quy trình cụ thể |

## 4. Regressions

```
$ npm test
ℹ tests 228
ℹ pass 223
ℹ fail 0
ℹ skipped 5        # 5 test KM-003/KM-004 "IndexedDB exists only in the browser runner"

$ npm run test:browser
tests 216  pass 216  fail 0  (15351 ms)

$ npm run test:e2e
ℹ tests 89
ℹ pass 89
ℹ fail 0

$ npm run vectors
ok       every other key and the file header match node:crypto byte for byte
(không báo lệch; không sinh lại vector)

$ npm run test:server
ℹ tests 72
ℹ pass 72
ℹ fail 0

$ git status --short        # sau toàn bộ các lần chạy ở trên
 M .aidlc/runs/KM-005.json
 M docs/epics/KM-005/state.json
# chỉ hai tệp của AIDLC; không có tệp bí mật hay dữ liệu cục bộ

$ node -e "console.log(JSON.stringify(require('./package.json').dependencies))"
undefined          # không có khoá dependencies → rỗng; devDependencies chỉ có "wrangler": "4.156.0"
```

5 test bị bỏ qua có từ trước KM-005, chạy ở `test:browser` (216/216 xanh).

## 5. Out-of-scope check

Đối chiếu với §7 của spec:

- **10 thao tác còn lại của 06:** không ship. AC03 cho thấy chúng trả `404` JSON. `src/functions/api/` chỉ có `_auth`, `_http`, `_rate-limit`, `_secrets`, `_validate`, `_vaults`, `[[route]]`.
- **Giữ bản cũ và ghi nhật ký:** không ship. AC49 xác nhận hai bảng rỗng sau toàn bộ chuỗi.
- **Deploy, app nói chuyện với server, passkey, CORS, giới hạn dung lượng:** không có. `src/public/**` không đổi (`git diff master --stat -- src/public` không có dòng nào cho `src/public/js`); `layering` xác nhận không có header CORS và không import ngoài `core/`.
- **Mã hoá lại hoặc giải mã ở server:** không có. Test `layering` quét tên hàm giải mã: 0.
- **Thêm so với spec, đã được phê duyệt ở plan:** lệnh `npm run dev:server`, `SERVER_SECRET` bắt buộc cho đăng nhập (plan quyết định 3 và 4), `.nvmrc`, Node 24.22.1. Không phải hành vi ngoài phạm vi.

## 6. Findings

| # | Finding | Severity | Where |
|---|---|---|---|
| 1 | AC25 chỉ chứng minh được một nửa: server chỉ tin `CF-Connecting-IP`, và proxy mô phỏng cho thấy nếu Cloudflare ghi đè header đó thì khoá theo IP thật. Việc Cloudflare ghi đè thật chưa kiểm được. Spec (Concern 4) và plan (§4) đã chấp nhận và chuyển cho `KM-006.md` kèm quy trình. Không chặn epic này, nhưng KM-006 không được bỏ | thấp (đã chấp nhận) | `test/server/rate-limit.server.js`, `docs/epics/KM-006/KM-006.md` |
| 2 | AC26, nhánh "không xác định được IP": local luôn tự đặt IP, nên request hoàn toàn thiếu header không tạo được; kiểm bằng giá trị rác dùng cùng nhánh mã. Plan §4 đã ghi trước | thấp (đã chấp nhận) | `test/server/rate-limit.server.js` |
| 3 | AC54 dựa vào `sandbox-exec`, Apple đã đánh dấu deprecated. Verifier chạy lại được trên máy này, nhưng cách chặn mạng này có thể mất | thấp | `implement.md` đã ghi; không phải lỗi của sản phẩm |
| 4 | Các kiểm chứng chỉ có ý nghĩa trên môi trường cục bộ (CPU 10 ms của gói Free, lỗi `too big` thật của D1, `ETag` dạng yếu, binding trong `wrangler.toml`, header thật) chưa kiểm được. Spec Concern 5, 11, 12, 16 đã hoãn có chủ và `KM-006.md` đã nhận đủ | thông tin | `docs/epics/KM-006/KM-006.md` |
| 5 | Về vòng lặp: mọi tiêu chí kiểm được bằng `npm run test:server`; không có tiêu chí nào không thể kiểm. Chỉ AC25 cần hạ tầng thật để kết luận trọn vẹn | thông tin | plan §6 |

Không có phát hiện mức cao hay trung bình.

## 7. Shortest path to pass

Không áp dụng: verdict là pass. Việc còn lại không thuộc epic này: KM-006 phải chạy quy trình AC25 trên Cloudflare thật và các mục đã chuyển sang `KM-006.md`.
