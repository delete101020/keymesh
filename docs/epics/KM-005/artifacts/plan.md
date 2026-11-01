# Implementation Plan — Server: D1, xác thực và API vault

**Epic ID:** `KM-005`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `spec.md`

---

## 1. Approach

Toàn bộ server là một router duy nhất, `src/functions/api/[[route]].js`, cộng vài module cùng thư mục có tên bắt đầu bằng `_`. Mọi request đi qua một đường ống cố định: kiểm Origin, khớp route (đường dẫn lạ trả `404` ở đây, trước token), kiểm token, kiểm id, kiểm chủ sở hữu, đọc body có đếm byte, kiểm nội dung, rồi ghi. Thứ tự này là phần cốt lõi của spec: FR23 đòi token trước nội dung, AC47 đòi vault người khác kèm blob sai vẫn ra `404`. Mọi response đi qua một hàm duy nhất, nên `no-store` và `nosniff` không thể bị sót (FR03). Cloudflare xác nhận `_headers` không áp dụng cho response của Functions, và lần chạy thử cục bộ cũng cho thấy vậy (Concern 12).

Tính nguyên tử dựa vào SQL, không dựa vào khoá trong mã. Ghi vault là một câu `UPDATE … WHERE version = ? RETURNING`; xác thực và gia hạn phiên là một câu `UPDATE dt_session … RETURNING`; đăng ký là một `db.batch()`. Đếm lần sai là **một câu upsert hai dòng** (username và IP) kèm `WHERE NOT EXISTS (… locked_until > now)`: không có dòng trả về nghĩa là đang khoá, nên trả `429` thay vì `401`. Đã chạy thử bản rút gọn của câu này (chưa có phần đặt lại cửa sổ): 20 request song song cho đúng 5 lần vào được bộ đếm, 15 lần bị chặn, bộ đếm IP cũng đúng 5 (AC53). Phương án bị loại: **giữ chỗ trước rồi hoàn lại khi đăng nhập đúng**. Cách đó cũng đạt AC53, nhưng đăng nhập đúng sẽ thoáng bị tính là sai, và phải trừ lại bộ đếm IP để giữ AC30.

Phương án bị loại thứ hai: **test gọi handler trực tiếp trên Node với D1 giả**. Cách đó nhanh, nhưng không kiểm được rollback, thứ tự ghi hay hành vi của workerd, và trái `CLAUDE.md`. Test chạy qua HTTP vào `wrangler pages dev` thật, chỉnh thời gian và gây lỗi kho bằng cách sửa trực tiếp tệp SQLite cục bộ (NFR11), không có cửa sau trong mã. Test server có lệnh riêng `npm run test:server`, theo tiền lệ `test:e2e`: `npm test` vẫn không cần cài gì.

**Kết quả chạy thử trước khi viết plan** (`wrangler` 4.156.0, trong scratchpad, không đụng repo; trả lời Concern 3, 4, 5, 11, 12 và intent §7 câu 2, 3):

| Câu hỏi | Kết quả đã thấy | Hệ quả |
|---|---|---|
| Giả lập IP cục bộ được không? | Được. `CF-Connecting-IP` do client đặt đi thẳng tới Function (kể cả IPv6); không đặt thì là `127.0.0.1`; giá trị rác giữ nguyên | AC24, AC26 kiểm được cục bộ. **AC25 chỉ kiểm được một nửa**, xem §4 |
| Sửa D1 từ ngoài khi server đang chạy? | Được, cả hai chiều. `node:sqlite` mở tệp mất ~1 ms; `wrangler d1 execute` ~0,7 s | Test dùng `node:sqlite` (Concern 3, intent §7 câu 2) |
| Gây lỗi kho không cần cửa sau? | Được. `CREATE TRIGGER … RAISE(ABORT)`: `batch()` lỗi và rollback cả bước trước đó | Dùng cho AC18, NFR06 |
| Local có áp giới hạn dòng 2 MB không? | **Không**: ghi 5 000 000 byte vẫn thành công. Tài liệu D1: tối đa 2 000 000 byte một giá trị hoặc dòng | Server tự kiểm trước khi ghi, xem §4 |
| Đếm byte body không có `Content-Length`? | Được: chunked đếm đúng 2 000 001 | AC09 |
| `pages dev` có đọc binding trong `wrangler.toml`? | **Không**: D1 và `[vars]` đều bị bỏ qua, chưa rõ vì sao. `--d1 DB=<id>` và `--binding` thì có tác dụng; `.dev.vars` có tác dụng; `d1 migrations apply` có đọc toml và dùng chung tệp với `--d1` khi cùng id | Harness truyền hết bằng cờ, xem §4 |
| Lỗi UNIQUE đọc được không? | `UNIQUE constraint failed: <bảng>.<cột>` | Đổi thành `username_taken` / `vault_exists` theo tên cột |
| Import `core/` từ Function? | Bundle được, `crypto.subtle.timingSafeEqual` có sẵn, `_helper.js` không thành route | Cấu trúc tệp ở §2 |
| Nhiều server cùng lúc? | Hai instance chạy song song được; khởi động ~1,5 s | Mỗi cấu hình một server |

**Quyết định spec chưa nói, originator đã duyệt cả 5 (2026-11-02):**

1. **Node.** Cả repo dùng Node 24.22.1 (originator chốt): `engines` thành `>=24.22.1`, thêm `.nvmrc`. Bản này đạt yêu cầu Node ≥ 22 của `wrangler`, và `node:sqlite` không cần cờ. Đổi quy ước "Node ≥ 20" ở `CLAUDE.md` và `README.md`; lý do ghi vào `implement.md`.
2. **Quy ước test đổi.** `CLAUDE.md` thêm: phần server chưa xong khi `npm run test:server` chưa xanh. Bộ test này không nằm trong `npm test`.
3. **Thiếu bí mật server khi đăng nhập.** NFR02 cấm lưu username và IP dạng đọc được, nên không có bí mật thì không tạo được khoá bộ đếm: đăng nhập cũng trả `500 internal`, giống FR10. Đăng ký không cần bí mật nên không bị ảnh hưởng. Bí mật tên `SERVER_SECRET`, dùng HMAC có nhãn riêng cho salt giả, khoá bộ đếm và hash giả.
4. **Lệnh `npm run dev:server`** (thêm so với spec). Vì `pages dev` cần cờ `--d1`, thiếu lệnh này thì người làm KM-006 không chạy được server theo cách trong `docs/02`. Lệnh chỉ áp migration rồi khởi động, đọc bí mật từ `src/.dev.vars`.
5. **`JSON` hỏng khi đăng ký** trả `403 registration_closed`, không phải `400`: token nằm trong body nên JSON hỏng tức là thiếu token (FR12, AC14). Body quá 2 MB vẫn trả `413` trước đó, không lộ gì.

## 2. Files

| Path | Change | Why |
|---|---|---|
| `package.json` | Sửa: `engines` `>=24.22.1`; `wrangler` ghim đúng 4.156.0 ở `devDependencies`; thêm script `test:server`, `dev:server` | NFR09, FR34, Quyết định 1 |
| `.nvmrc` | Mới: `24.22.1` | Quyết định 1 |
| `package-lock.json` | Mới | Ghim cả cây phụ thuộc của `wrangler` (NFR09) |
| `src/wrangler.toml` | Mới: `name`, `compatibility_date`, `pages_build_output_dir`, D1 với id giữ chỗ | Dùng cho migration; KM-006 đặt id thật |
| `src/migrations/0001_init.sql` | Mới: 6 bảng của 03 §4, kể cả `dt_vault_snapshot`, `dt_audit_log` | FR33 |
| `src/functions/api/[[route]].js` | Mới: điểm vào, đường ống, bảng route, bắt lỗi thành `500` | FR01, FR02 |
| `src/functions/api/_http.js` | Mới: tạo response (header bắt buộc), `ApiError`, mã lỗi và câu cố định, đọc body có đếm byte | FR03, FR04, FR05 |
| `src/functions/api/_validate.js` | Mới: username, `kdf`, id, envelope, khoá đã bọc; kiểm kích thước dòng | FR05–07, FR11, FR28, FR32 |
| `src/functions/api/_secrets.js` | Mới: SHA-256, HMAC có nhãn, so sánh constant-time, sinh token | FR09, FR12, FR16, FR22, NFR02 |
| `src/functions/api/_auth.js` | Mới: prelogin, register, login, logout, kiểm phiên | FR08–16, FR22–25 |
| `src/functions/api/_rate-limit.js` | Mới: khoá bộ đếm, chuẩn hoá IP (/64, IPv4-mapped), kiểm khoá, upsert, dọn bản ghi | FR17–21, FR35 |
| `src/functions/api/_vaults.js` | Mới: liệt kê + `ETag`, tạo, đọc, ghi | FR26–31 |
| `testkit/wrangler-server.mjs` | Mới: harness: cổng trống, thư mục tạm, migration, khởi động bằng cờ, chờ sẵn sàng, `db()` qua `node:sqlite`, `seed()`, gom log, quét rò rỉ khi dừng | NFR08, NFR11, AC52 |
| `testkit/dev-server.mjs` | Mới: chạy server tay cho KM-006 | Quyết định 4 |
| `test/server/*.server.js` | Mới: `routing-headers`, `account`, `login`, `rate-limit`, `session`, `vaults`, `flow`, `privacy`, `perf`, `layering` | FR34; đuôi `.server.js` để `npm test` và runner trình duyệt không nhận |
| `README.md` | Sửa: cách cài, `test:server`, `dev:server`, Node | Bỏ câu "không có dependency nào để cài" |
| `.claude/CLAUDE.md` | Sửa: mục Test, Node 24.22.1 | Quyết định 1, 2; quy định phải sửa cùng lúc |
| `docs/02-architecture.md`, `03-data-model.md`, `04-security.md`, `05-sync.md`, `06-api.md` | Sửa theo FR37 | AC58 |
| `docs/epics/KM-005/KM-005.md`, `KM-006/KM-006.md`, `KM-008/KM-008.md`, `KM-009/KM-009.md` | Sửa theo FR36 | AC58 |
| `docs/epics/KM-005/artifacts/implement.md` | Mới ở bước implement: đầu ra test, số đo AC56 | AC56 |

**Không đụng:** `src/public/**` (kể cả `core/`, `sw.js`, `_headers`), `testkit/vectors.js`, `testkit/serve.mjs`, `test/*.test.js` (trừ amendment dưới), `test/e2e/*`.

**Amendment 1 (bước implement, 2026-11-02):** `test/ui-static.test.js` có `KM-003 NFR06` đòi `devDependencies` rỗng, viết lúc "chưa có `wrangler`". Plan bỏ sót test này: NFR09 (thêm `wrangler`) và NFR10 (`npm test` xanh) không thể cùng đạt nếu không sửa nó. Sửa đúng một assert: `devDependencies` chỉ được có `wrangler`, ghim đúng phiên bản. Giữ nguyên ý của test và khớp `CLAUDE.md` ("ngoại lệ duy nhất: `wrangler`").

## 3. Order

1. **Nền chạy được.** `package.json`, lockfile, `wrangler.toml`, migration, harness, một Function tối thiểu. *Sau bước này:* `npm run test:server` khởi động server thật trên dữ liệu trống, thấy đủ 6 bảng, sửa được dữ liệu từ test. `npm test` vẫn xanh khi chưa cài gì.
2. **Đường ống chung.** `_http.js`, `[[route]].js` đầy đủ: Origin, header, dạng lỗi, giới hạn body, `404` JSON. *Sau bước này:* AC03–AC06 và AC09 xanh; AC07, AC08 xanh cho các mã đã có.
3. **Đăng ký và prelogin.** `_validate.js`, `_secrets.js`, phần đầu `_auth.js`. *Sau bước này:* tạo được tài khoản nguyên tử, salt giả ổn định; AC10–AC18 xanh.
4. **Đăng nhập, phiên, đăng xuất** (chưa có khoá). *Sau bước này:* hai thiết bị đăng nhập song song, token hết hiệu lực đúng cách; AC19, AC20, AC33–AC35 xanh.
5. **Giới hạn đăng nhập và dọn bản ghi.** `_rate-limit.js`. *Sau bước này:* AC21–AC32, AC53, AC59 xanh; AC25 xanh phần cục bộ.
6. **API vault.** `_vaults.js`. *Sau bước này:* AC36–AC48 xanh.
7. **Chuỗi đầy đủ và bằng chứng riêng tư.** `flow`, `privacy`, `layering`. *Sau bước này:* AC01, AC02, AC49–AC52, AC57 xanh; AC07, AC08 đủ mọi mã.
8. **Đo và chạy toàn bộ.** `perf`, đo NFR04, AC54, AC55, AC56. *Sau bước này:* số đo và đầu ra nằm trong `implement.md`.
9. **Tài liệu.** FR36, FR37, `README.md`, `CLAUDE.md`, cập nhật theo kết quả đo. *Sau bước này:* AC58 đạt.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — steps 1–2: server thật chạy dưới harness; Origin, header, lỗi và giới hạn body đã đúng cho mọi đường dẫn.
**Batch 2** — steps 3–4: có tài khoản và phiên; đăng ký, đăng nhập, đăng xuất đúng spec, chưa có khoá.
**Batch 3** — step 5: giới hạn đăng nhập đúng, kể cả song song; bản ghi cũ được dọn.
**Batch 4** — step 6: API vault đủ, xung đột và `404` đúng.
**Batch 5** — steps 7–8: toàn bộ bằng chứng end-to-end, riêng tư, đo đạc; bốn lệnh test và `test:server` xanh.
**Batch 6** — step 9: tài liệu khớp spec.

## 4. Risks

| Risk | Likelihood | What we do about it |
|---|---|---|
| **Phần ta ít chắc nhất: AC25 không chứng minh trọn được ở local.** Local tin `CF-Connecting-IP` do client đặt, vì không có Cloudflare đứng trước. Test chỉ chứng minh được server không đọc `X-Forwarded-For`, `X-Real-IP`, `True-Client-IP` | Chắc chắn | Theo Concern 4: báo originator (mục này), kiểm cục bộ phần đó, chuyển phần còn lại vào `KM-006.md`: gửi `CF-Connecting-IP` giả lên Cloudflare thật, bị khoá theo IP thật mới là bằng chứng đủ. Mã chỉ đọc đúng một header này |
| **AC26, nhánh "không xác định được IP".** Local luôn tự đặt IP khi thiếu header, nên không tạo được request thật sự không có IP | Chắc chắn | Kiểm bằng giá trị rác: mọi giá trị không phải IP hợp lệ đều vào chung một bộ đếm. Trường hợp thiếu hẳn header dùng cùng nhánh mã; ghi rõ giới hạn này trong `implement.md` |
| **Vượt sức chứa dòng không xảy ra được ở local** (FR05, Concern 11) | Chắc chắn | Trước khi ghi, server tính tổng byte các cột và trả `413` nếu vượt 2 000 000: chạy giống nhau ở mọi nơi, test được. Lỗi `too big` từ D1 cũng thành `413`, test bằng trigger có cùng câu lỗi; mã lỗi thật của D1 kiểm ở KM-006. AC09 dùng body đúng 2 000 000 byte độn khoảng trắng, để tách khỏi giới hạn dòng |
| `pages dev` bỏ qua binding trong `wrangler.toml`, chưa rõ nguyên nhân | Đã thấy | Local truyền bằng cờ nên không phụ thuộc. Trên Cloudflare thật chưa kiểm được: thêm vào `KM-006.md`. Ghi trong `docs/02`, vì câu "chạy từ `src/`" hiện không đủ |
| Giới hạn CPU 10 ms mỗi request của gói Free. Đo trên Node: parse, regex, stringify 200 KB ~0,7 ms, 2 MB ~6,9 ms, chưa tính băm và phần còn lại | Vừa, với blob lớn | `ct` của blob chỉ kiểm bằng regex, không giải base64 (đủ cho FR28). Không đo được ở local: giữ owner KM-006 (Concern 5), ghi số đo này vào `KM-006.md` |
| `Date.now()`, trigger hay chỉnh tệp SQLite làm test chập chờn; server giữ cache trong lúc sửa | Thấp, đã thử chiều đọc và ghi | Đóng kết nối `node:sqlite` sau mỗi lần sửa. Mỗi tệp test có thư mục dữ liệu riêng; chạy `--test-concurrency=1`. AC54 chạy hai lần liên tiếp |
| `node:sqlite` còn nhãn experimental, có thể đổi | Thấp | Chỉ dùng trong `testkit`, gói trong một hàm `db()`; nếu đổi thì thay bằng `wrangler d1 execute` (đã thử, chậm hơn ~700 lần) |
| Đo NFR04 (≤ 5 ms) chập chờn trên máy bận | Vừa | So trung vị 200 lần mỗi nhánh, xen kẽ hai nhánh. Không có nhánh mã riêng cho "không tồn tại"; reviewer đọc mã ở AC57 |
| **Với mã hiện có (codegraph blast-radius):** `KDF_MIN_ITER`, `KDF_MAX_ITER`, `newKdf`, `ENVELOPE_*` có người gọi trong `core/` và test KM-001 | Thấp | Chỉ import, không sửa. `src/public/` không đổi nên `sw-version` và `test/sw.test.js` không bị động tới. `test/e2e/pwa.e2e.js` dùng server riêng của testkit |
| `npm install` thêm 205 MB; hai gói có postinstall bị npm chặn | Thấp | Đã thử: chạy được khi postinstall bị chặn. `npm test` không phụ thuộc `node_modules`: kiểm bằng cách chạy trên bản sao chưa cài |
| Cloudflare có thể đổi `ETag` thành dạng yếu khi nén response, làm `If-None-Match` không khớp | Vừa, chỉ trên hạ tầng thật | So sánh bỏ tiền tố `W/`; test cả hai dạng. Kiểm thật ở KM-006 |
| **Khó đảo ngược:** tên cột, và `SERVER_SECRET`. Đổi bí mật làm salt giả đổi (Concern 13) | Thấp ở epic này: chưa có dữ liệu thật | Schema theo đúng 03 §4. Ghi "không đổi trừ khi cần" vào 02 |

## 5. Proofs

Test đặt tên `KM-005 ACnn …` theo tiền lệ KM-004. "`S`" là `npm run test:server`; chạy một tiêu chí bằng `node --test --test-name-pattern="AC21" test/server/*.server.js`.

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-005-AC01` | `flow`: hai thiết bị đi hết chuỗi 3.1, kiểm từng mã và giá trị | `S` |
| `KM-005-AC02` | `flow`: `createAccount` của lõi, đăng ký, đọc lại, `unlockWithPassword` ra đúng nội dung | `S` |
| `KM-005-AC03` | `routing-headers`: cả 10 thao tác chưa giao, có và không có token | `S` |
| `KM-005-AC04` | `routing-headers`: origin lạ, `null`, khác port trên mọi thao tác và đường dẫn lạ; đọc DB thấy không đổi | `S` |
| `KM-005-AC05` | `routing-headers`: có và không có `Origin`; không có header `Access-Control-*` | `S` |
| `KM-005-AC06` | `routing-headers`: server riêng không cấu hình origin | `S` |
| `KM-005-AC07` | `routing-headers` + `privacy`: bảng 12 mã, mỗi mã một request thật | `S` |
| `KM-005-AC08` | `routing-headers`: mọi mã lỗi; đầu vào có chuỗi đánh dấu, `message` không chứa nó | `S` |
| `KM-005-AC09` | `routing-headers`: 2 000 001 byte có và không có `Content-Length` (chunked); 2 000 000 byte độn khoảng trắng được nhận; `413` theo kích thước dòng | `S` |
| `KM-005-AC10` | `account`: ký tự lạ, rỗng, 65, 64 ký tự ở cả ba thao tác | `S` |
| `KM-005-AC11` | `account` | `S` |
| `KM-005-AC12` | `account`: gọi lại, đổi hoa/thường, username khác | `S` |
| `KM-005-AC13` | `account`: server riêng không có `SERVER_SECRET` | `S` |
| `KM-005-AC14` | `account`: server không token, token ngắn; token sai kèm username có thật, JSON hỏng; so từng byte | `S` |
| `KM-005-AC15` | `account`: các biên `iter`, `name`, salt | `S` |
| `KM-005-AC16` | `account`; đọc DB thấy không có dòng mới | `S` |
| `KM-005-AC17` | `account`; đăng ký lại với id khác | `S` |
| `KM-005-AC18` | `account`: trigger trên `dt_session`, `500` không token, không dòng nào sót; bỏ trigger, gửi lại thành công | `S` |
| `KM-005-AC19` | `login`: so status, thân, header | `S` |
| `KM-005-AC20` | `login` | `S` |
| `KM-005-AC21` | `rate-limit`: `Retry-After` từ 1 tới 900 | `S` |
| `KM-005-AC22` | `rate-limit`: cùng chuỗi mã, so với AC21 | `S` |
| `KM-005-AC23` | `rate-limit` | `S` |
| `KM-005-AC24` | `rate-limit`: `CF-Connecting-IP` khác nhau cho hai IP | `S` |
| `KM-005-AC25` | **Một phần.** `rate-limit`: đổi `X-Forwarded-For`, `X-Real-IP`, `True-Client-IP` mỗi lần vẫn bị khoá. **Phần `CF-Connecting-IP` giả: chuyển `KM-006.md`** (Concern 4) | `S`; KM-006 trên Cloudflare |
| `KM-005-AC26` | `rate-limit`: hai địa chỉ cùng /64, kể cả viết rút gọn và đầy đủ; giá trị rác dùng chung bộ đếm (xem §4) | `S` |
| `KM-005-AC27` | `rate-limit`: thử khi khoá, lùi `locked_until` trong DB, đăng nhập đúng được | `S` |
| `KM-005-AC28` | `rate-limit`: lùi khoá, sai 4 lần | `S` |
| `KM-005-AC29` | `rate-limit`: lùi `window_start` quá 15 phút | `S` |
| `KM-005-AC30` | `rate-limit`: đọc bộ đếm IP trong DB ra 8 | `S` |
| `KM-005-AC31` | `rate-limit` | `S` |
| `KM-005-AC32` | `rate-limit`: phiên đang có và prelogin khi username đang khoá | `S` |
| `KM-005-AC33` | `session`: từng loại token, kèm id sai dạng và body hỏng; đổi `security_stamp`, `expires_at` trong DB | `S` |
| `KM-005-AC34` | `session`: đọc `expires_at` sau khi dùng; đặt hết hạn thì bị từ chối | `S` |
| `KM-005-AC35` | `session` | `S` |
| `KM-005-AC36` | `vaults`: hai tài khoản, `size` đúng byte | `S` |
| `KM-005-AC37` | `vaults`: gồm cả `W/"…"` | `S` |
| `KM-005-AC38` | `vaults` | `S` |
| `KM-005-AC39` | `vaults`: đọc DB thấy vault cũ không đổi | `S` |
| `KM-005-AC40` | `vaults`: bảng blob hỏng ở cả ba thao tác | `S` |
| `KM-005-AC41` | `vaults` | `S` |
| `KM-005-AC42` | `vaults`: so sâu | `S` |
| `KM-005-AC43` | `vaults`: 5 giá trị `since` | `S` |
| `KM-005-AC44` | `vaults` | `S` |
| `KM-005-AC45` | `vaults` | `S` |
| `KM-005-AC46` | `vaults`: 10 request song song; đọc DB ra version + 1 | `S` |
| `KM-005-AC47` | `vaults`: các cặp so từng byte; vault của chủ không đổi | `S` |
| `KM-005-AC48` | `vaults` | `S` |
| `KM-005-AC49` | `privacy`: đọc số dòng hai bảng rỗng, bộ đếm có dữ liệu | `S` |
| `KM-005-AC50` | `privacy`: tài khoản từ `testkit/vectors.js` (có sẵn `encKey`, `accountKey`, `vaultKey`, `authKey` dạng byte) cộng token; dò gốc, base64, hex trên byte của mọi tệp trong thư mục dữ liệu, kể cả WAL | `S` |
| `KM-005-AC51` | `privacy`: dò username, IP, cả `SHA-256` thô của chúng trong bộ đếm và tệp | `S` |
| `KM-005-AC52` | Harness gom stdout, stderr và log wrangler (`WRANGLER_LOG_PATH`) của mọi server; dò khi dừng ở **mọi** tệp test | `S` |
| `KM-005-AC53` | `rate-limit`: 20 request song song, đếm số `401` và `429` | `S` |
| `KM-005-AC54` | Chạy `S` hai lần với `HOME` tạm, không token Cloudflare, `WRANGLER_SEND_METRICS=false`; thử chặn mạng ra ngoài bằng `sandbox-exec`. Nếu lệnh đó không dùng được thì tắt mạng tay và ghi lại | `S` ×2 |
| `KM-005-AC55` | Chạy cả bốn lệnh, thêm `S`; `git status --short`; đọc `dependencies` | `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run vectors`, `S` |
| `KM-005-AC56` | `perf`: 8 thao tác, 100 lần tuần tự, blob 200 KB; ghi p95 vào `implement.md` | `S` |
| `KM-005-AC57` | `layering`: quét import, chuỗi `test`/cờ lạ trong `src/functions`, tên hàm giải mã. Reviewer đọc nhánh username không tồn tại trong `_auth.js` | `S` + đọc mã |
| `KM-005-AC58` | Verifier đọc theo FR36, FR37; `rg -n 'snapshot\|audit\|nhật ký\|Xong khi' docs/` để soát | Đọc + `rg` |
| `KM-005-AC59` | `session`: đặt bản ghi cũ trong DB, đăng nhập đúng và sai; chờ tới khi dọn xong (chạy qua `waitUntil`); bản ghi còn hiệu lực giữ nguyên. Thêm trigger làm dọn thất bại: đăng nhập vẫn đúng | `S` |

## 6. Feedback loop

Vòng lặp chính là `npm run test:server` trên `wrangler pages dev` thật. Mỗi tệp test tự khởi động server với cổng trống và thư mục dữ liệu tạm, áp migration rồi gọi qua `fetch`. Lúc sửa một phần thì chạy `--test-name-pattern`. Thời gian, lỗi kho và token mất hiệu lực được tạo bằng `node:sqlite` trên tệp cục bộ (đã thử, ~1 ms, server thấy ngay). Bước 1 dựng vòng lặp này trước khi có API nào. Cuối mỗi batch chạy thêm `npm test`.

## 7. Deliberately not doing

- **10 thao tác còn lại của 06, ghi snapshot, ghi nhật ký:** chỉ tạo bảng (FR33, intent §6).
- **Deploy, kiểm trên Cloudflare thật:** chuyển `KM-006.md`, gồm cả các mục mới ở §4 (phần còn lại của AC25, binding trong `wrangler.toml`, lỗi `too big` thật, `ETag` khi nén, số đo CPU).
- **Đưa test server vào `npm test`:** sẽ làm `npm test` cần cài đặt (Quyết định 2).
- **Tìm nguyên nhân `pages dev` bỏ qua toml:** dùng cờ là đủ cho epic này; khi deploy KM-006 sẽ phải kiểm lại.
- **Index mới cho việc dọn bản ghi, bảng cấu hình, framework router:** bảng nhỏ, một người dùng, `dependencies` phải rỗng.
- **Sửa `core/`:** chỉ import các hằng và hàm đã có. `ApiError` nằm trong `_http.js`; `KeymeshError` vẫn dành cho lõi.
