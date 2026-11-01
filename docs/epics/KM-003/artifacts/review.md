# Review Report — App v2 chạy cục bộ

**Epic ID:** `KM-003`
**Reviewer:** Reviewer (policy)
**Status:** Draft
**Created:** `2026-11-01`
**Reviewed against:** `CLAUDE.md` (toàn cục và dự án), `docs/02`, `docs/04`, `docs/09`, workspace SDLC standard

---

## 1. Verdict

Verdict: hold

Một blocker: `verify.md` đang `fail` vì `KM-003-AC49` chưa có kết quả nào (Safari, Firefox). Về mã thì tôi không thấy lỗi chặn: không có `innerHTML`, `console.`, `eval`, `style=`, `localStorage`, `fetch`; lõi `core/` vẫn thuần; vector KM-001 không đổi. Còn một lỗi nhỏ tôi chưa chắc (finding 2) và vài ghi chú.

## 2. Scope reviewed

| | |
|---|---|
| Base | `master` (merge-base `6a14869`) |
| Head | `feat/KM-003-app` (`6f3a421`), cộng `verify.md` chưa commit |
| Files changed | 78 (+8433 / −107) |
| Read in full | file-by-file. Đọc hết: `src/public/js/**` trừ `wordlist.js` (chỉ kiểm 7772 từ, không trùng, toàn chữ thường), diff của `core/`, `package.json`, `index.html`, `testkit/serve.mjs`, `testkit/e2e/cdp.mjs`, `testkit/memory-store.mjs`, `testkit/gen-vectors.mjs`, diff của `docs/02`, `04`, `08`, `09`. **Không đọc từng dòng:** `test/**` (gồm ~1500 dòng e2e), `testkit/e2e/driver.mjs`, `qr-fixture.mjs`, `styles.css` (chỉ quét `rg` theo mẫu nguy hiểm), các tài liệu epic khác. Test được đánh giá qua `verify.md`, không đọc lại. |

## 3. Policy checklist

| Source | Rule | Honored |
|---|---|---|
| `CLAUDE.md` § Cấu trúc thư mục | Mã sản phẩm trong `src/`, không thêm thư mục gốc | yes |
| `CLAUDE.md` § Cấu trúc thư mục | `envvault.html`, `design/` không sửa, không import | yes |
| `CLAUDE.md` § Ngôn ngữ và phụ thuộc | JS thuần, ES module, không bundler, `dependencies` rỗng | yes |
| `CLAUDE.md` § Ngôn ngữ và phụ thuộc | Import tương đối có `.js`, không bare specifier | yes |
| `CLAUDE.md` § Phân lớp | `core/` thuần, không DOM/IDB/fetch, thời gian do bên gọi truyền | yes (`restoreItemVersion`, NFC trong `crypto.js` đều thuần) |
| `CLAUDE.md` § Phân lớp | `ui/` → `app.js` → `store`/… → `core/` | yes, với lưu ý ở #6 |
| `CLAUDE.md` § Phân lớp | Đổi API `core/` thì cập nhật `09` cùng thay đổi | yes (`restoreItemVersion`, NFC đều có ở `09`) |
| `CLAUDE.md` § Phân lớp | Lỗi ném ra dùng `KeymeshError` | yes trong `core/`; `StoreError`, `LockedError` ngoài `core/` (#6) |
| `CLAUDE.md` § Đặt tên | kebab-case, camelCase, UPPER_SNAKE, tiếng Anh | yes |
| `CLAUDE.md` § Test | Chỉ `node:test` + `node:assert/strict`, `npm test` xanh | yes (`verify.md` §4: 196 pass, 0 fail, 4 skip) |
| `CLAUDE.md` § Test | Vector không sinh lại để cho test pass | yes (`git diff master -- testkit/vectors.js` = 0 dòng); xem #3 về công cụ so sánh |
| `CLAUDE.md` § Bảo mật client | Không `innerHTML`/`insertAdjacentHTML` với dữ liệu người dùng | yes (`h()` chỉ dùng text node, cấm `style`/`on*`) |
| `CLAUDE.md` § Bảo mật client | CSP `'self'`: không inline, không tài nguyên ngoài, không `eval` | yes (`rg` sạch; `serve.mjs` CSP trùng `04`) |
| `CLAUDE.md` § Bảo mật client | Không ghi password/khoá/secret ra console, lỗi, URL | yes (không có `console.`; `StoreError` chỉ mang `reason`) |
| `CLAUDE.md` § Bảo mật client | Service Worker không cache `/api/*` | n-a (không có SW) |
| `docs/04` § Bảo vệ trên client | Ẩn secret mặc định | yes ở màn xem; chỉ che bằng CSS ở form `secret-multi` (#2) |
| `docs/04` § Bảo vệ trên client | Clipboard xoá sau 30 giây, camera chỉ bật khi dialog mở | yes |

## 4. Findings

| # | Severity | Location | Finding | Policy |
|---|---|---|---|---|
| 1 | blocker | `docs/epics/KM-003/artifacts/verify.md` §1, §7; `implement.md` §AC49 | `verify.md` kết luận `fail` chỉ vì `AC49` là `untested`. Safari chạy `test:browser` không trả kết quả sau 180 giây, luồng chính chưa chạy, Firefox chưa cài. NFR07 không đòi Safari/Firefox xanh, chỉ đòi **ghi lại kết quả kể cả lỗi**, nên đây là việc ghi chép, không phải sửa mã. Ship khi verify còn `fail` là mâu thuẫn với cổng trước | `spec.md` NFR07, AC49; `verify.md` §7 |
| 2 | should-fix | `src/public/styles.css:155`, `src/public/js/ui/edit.js:136` | Form sửa `secret-multi` che nội dung bằng `-webkit-text-security: disc`, thuộc tính không chuẩn; nội dung thật vẫn nằm trong `textarea.value`. Không có test nào chạy trên Firefox (AC49 chưa làm), nên không biết trình duyệt đó có che hay không. Nếu không che thì secret nhiều dòng hiện rõ trên màn hình ngay khi mở form sửa, trái với "mặc định che". `type="password"` của ô một dòng không có vấn đề này. Tôi không xác nhận được hành vi Firefox, nên để should-fix chứ không phải blocker | `docs/04` § "Ẩn secret" |
| 3 | should-fix | `testkit/gen-vectors.mjs:121-150` | Lệnh `npm run vectors` trước đây so từng byte với `node:crypto`. Nay `vaultGzip` và `envelope.ct` được phép khác bản sinh mới (lý do: zlib Node 24 trên macOS cho gzip khác). Thay bằng hai lớp: gunzip ra đúng `inputs.vault` và AES-GCM tính lại trên gzip đã commit khớp `ct`. Cách này vẫn kiểm được nội dung, nhưng đây là bộ kiểm độc lập duy nhất của định dạng ổ đĩa và nó vừa yếu đi. `verify.md` §3 ghi "thử đột biến cho `gen-vectors`: không kiểm". Chưa ai chứng minh bản mới vẫn bắt được vector bị sửa | `CLAUDE.md` § Test ("Vector … sinh độc lập rồi commit") |
| 4 | note | `src/public/js/app.js:83-92` | `open()` gộp mọi lỗi của `acquireTabLock` (kể cả `locks.request` ném `SecurityError`) vào `catch(() => null)`, rồi báo "đang mở khoá ở tab khác". Người dùng sẽ đi tìm tab không tồn tại. Lỗi bị nuốt, không có mã nào phân biệt | Always-in-scope (silent failure); `opinion` |
| 5 | note | `src/public/js/app.js:178-181` | Hai trình lắng nghe `touchstart` và `wheel` ở `window`, `capture` và `passive: false`, chạy cho mọi thao tác. Chrome coi đó là chặn cuộn: kéo trên điện thoại hay lăn chuột có thể bị trễ. Việc huỷ sự kiện sau khi hết hạn chỉ cần cho `pointerdown`, `keydown`, `click`. KM-003 chưa nhắm điện thoại, nên chỉ ghi lại cho KM-004 | `opinion` |
| 6 | note | `src/public/js/session.js:10`, `store.js:10`; `ui/*.js` | (a) `StoreError` và `LockedError` extends `Error`. Quy ước "không ném `Error` trần" nằm ở mục `core/` và `implement.md` §5.8 đã ghi lý do, nên tôi không coi là vi phạm, nhưng câu chữ không nói rõ. (b) `ui/` import trực tiếp `vault-query.js`, `vault-ops.js`, `otp.js`, `passgen.js`, `core/model.js` thay vì qua `app.js`; `docs/02` có liệt kê nhóm "logic thuần" này nhưng chuỗi phân lớp của `CLAUDE.md` không có tầng đó | `CLAUDE.md` § Phân lớp (chưa đủ rõ); xem §8 |
| 7 | note | `ui/shell.js:19-21`, `app.js:128-133` | Hộp "Bỏ bản nháp?" không có trong spec. Đã ghi ở `implement.md` §5.3 và `verify.md` §5, không thuộc danh sách cấm. Chờ originator giữ hoặc bỏ | `spec.md` Out of scope (không vi phạm); `opinion` |
| 8 | note | `docs/09-core-api.md` (bảng "dựa vào" và "Lưu ý") | Diff đổi số epic: thùng rác KM-009 → KM-008, đổi mật khẩu KM-008 → KM-009. Không liên quan trực tiếp đến app cục bộ. Tôi không đối chiếu với `docs/08` ngoài diff nên không biết cách đánh số nào đúng; xác nhận rằng đây là chủ ý | `opinion` |
| 9 | note | `src/public/js/clipboard.js:34-47`, `docs/04` dòng Clipboard | Khi không đọc được clipboard (quyền mặc định, đa số lần dùng) thì sau 30 giây app ghi đè bằng chuỗi rỗng, kể cả khi người dùng đã copy thứ khác. Đã được chấp nhận (Concern 7) và ghi ở `04`; nêu để biết, không chặn gì | `docs/04` § Clipboard (honored) |

## 5. Always-in-scope checks

| Check | Result |
|---|---|
| Secrets in code / fixtures / logs | clean. `rg` mẫu khoá (AKIA, PRIVATE KEY, `ghp_`, `sk-`) trong `src`, `test`, `testkit` không ra gì; không có `console.` trong `src/public` (hai dòng `console` trong `driver.mjs` chỉ **đọc** log của trang để đếm) |
| Data handling (PII, retention, boundaries) | clean. Chỉ request cùng origin (AC47); không `localStorage`; sau khoá không còn chuỗi đánh dấu ở IndexedDB, storage, console, URL (AC46); mã OTP hiện trong màn xem nhưng secret không bao giờ vào DOM ở màn xem và lịch sử (`history-diff.js` không mang giá trị cho dòng otp). Lịch sử giữ giá trị cũ của secret tới `HISTORY_MAX`, đúng thiết kế `docs/03` |
| Silent failure (swallowed errors, ignored codes) | finding #4. Các `catch` rỗng khác (`store.js` abort, `clipboard.js`, `qr-dialog.js`, `gen-vectors.mjs`) đều có comment nêu lý do và có đường thay thế |
| Newly reachable surface (API, route, permission) | clean. Không route, không `functions/`, không SW, không `_headers`. Quyền mới duy nhất là camera, chỉ qua `getUserMedia` khi mở dialog quét, dừng track khi đóng; `Permissions-Policy` đã ghi ở `docs/04` cho KM-005. `harness` e2e mở cổng DevTools ngẫu nhiên trên `127.0.0.1` với profile tạm, chỉ khi chạy `test:e2e` |

## 6. Not re-checked

Theo `verify.md`, không chạy lại: `npm test` (196 pass / 4 skip), `test:browser` (193/193), `npm run vectors`, `test:e2e` (63/63 trên Chrome 156), 52 trên 53 tiêu chí AC `pass`, đo hiệu năng NFR08, quét tĩnh `innerHTML`/`eval`/`style=` (tôi chỉ chạy lại bằng `rg` để xác nhận, không chạy test). Sáu mục kiểm tay (Wi-Fi thật, ngủ máy, camera thật, Safari/Firefox, clipboard mất focus, hộp từ chối camera) chưa ai làm; tôi cũng không làm.

## 7. Shortest path to ship

1. Ghi kết quả `AC49` vào `implement.md` §AC49 (hoặc phụ lục `verify.md`): chạy `npm start`, mở trang trên Safari desktop, đi qua lập tài khoản → mở khoá → tạo item → copy, và ghi kết quả từng bước, kể cả khi `test:browser` vẫn không trả về (ghi lệnh đã thử và lỗi). Firefox: nếu cài được thì làm tương tự, nếu không thì ghi "không cài được" cùng lý do. Sau đó chạy lại `/verify` để verdict đổi khỏi `fail` (finding #1).
2. Trong lần chạy Firefox ở bước 1, mở form sửa một item `secret-multi` và ghi xem nội dung có bị che không (finding #2). Nếu không che, đổi cách che trước khi ship; nếu không có Firefox thì ghi rõ là chưa kiểm, và xin originator chấp nhận rủi ro bằng văn bản.

Finding 3 đến 9 không chặn. Finding #3 nên làm trước KM-004, ví dụ sửa một byte của `vectors.js` trong bản nháp để xác nhận `npm run vectors` đỏ.

## 8. Policy amendments

| Proposed rule | Where it belongs | Why |
|---|---|---|
| "Ngoài `core/`, lỗi riêng của lớp (`StoreError`, `LockedError`) được phép là lớp con của `Error` có `name` cố định và không mang giá trị vault; `KeymeshError` dành cho `core/`." | `CLAUDE.md` § Phân lớp, bullet về lỗi | Câu hiện tại nằm dưới `core/` nhưng đọc như áp cho mọi nơi; epic này phải ghi một deviation để giải thích (#6a) |
| "Tầng logic thuần (`vault-query`, `vault-ops`, `otp`, `passgen`, `history-diff`, `field-file`) cho phép `ui/` và `app.js` import trực tiếp; chúng chỉ import `core/` và nhau, không DOM/IDB." | `CLAUDE.md` § Phân lớp, cạnh chuỗi `ui/ → app.js → …` | `docs/02` đã liệt kê nhóm này nhưng `CLAUDE.md` không; `edit.js` import `core/model.js` và nhóm này thẳng từ `ui/` (#6b) |
| "`npm run test:e2e` (Chrome thật, cần Node ≥ 22) cũng phải xanh trước khi đóng epic có UI; file nằm ở `test/e2e/*.e2e.js`." | `CLAUDE.md` § Test | Mục Test chỉ nêu `npm test` và `test:browser`, trong khi `test/<khu-vực>.test.js` là mẫu tên duy nhất; 63 test e2e hiện nằm ngoài quy ước |
| "Đổi công cụ so sánh vector (`gen-vectors.mjs`) phải kèm thử đột biến: sửa một byte của `vectors.js` và lệnh phải đỏ." | `CLAUDE.md` § Test | Công cụ kiểm độc lập vừa yếu đi mà không có bằng chứng nó còn bắt được lỗi (#3) |
| "Che giá trị bí mật trong form phải dùng cách có chuẩn (`type=password`) hoặc không đưa giá trị vào DOM; che bằng CSS thuần không đủ." | `docs/04` § "Ẩn secret" | Làm rõ để #2 có điều khoản cụ thể để trích |
