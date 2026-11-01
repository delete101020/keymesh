# Implementation Plan — App v2 chạy cục bộ

**Epic ID:** `KM-003`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-01`
**Traces to:** `spec.md`

---

## 1. Approach

App là các ES module tĩnh trong `src/public/`, chạy thẳng trên trình duyệt, không build, xếp thành bốn lớp đi xuống: `ui/*` (chỉ dựng DOM và gọi hành động) → `app.js` (khởi động, trạng thái màn hình) → `session.js` + `store.js` + các module logic thuần ở `js/` → `core/`. **Mọi thay đổi dữ liệu đi qua một cửa duy nhất, `session.mutate(fn)`:** sao chép vault, chạy `fn` trên bản sao bằng thao tác của `core/model.js`, mã hoá, ghi IndexedDB xong mới thay bản trong bộ nhớ và báo thành công. Nhờ vậy ghi lỗi thì dữ liệu đang hiện không khác dữ liệu trên đĩa và bản nháp còn nguyên (FR23); số đo cho thấy cách này đủ nhanh (19,7 ms với vault 1 MB). Logic không cần DOM (OTP, sinh mật khẩu, lọc, tìm kiếm, diff, fork, đọc file, hẹn giờ khoá, clipboard) nằm trong module thuần nhận phụ thuộc qua tham số, nên test được bằng `node:test` trên cả Node và trình duyệt (NFR12).

**Giữ lõi gần như nguyên.** NFR11 dự kiến chỉ có hai thay đổi lõi, nên chỉ có đúng hai: chuẩn hoá NFC trong `deriveFromPassword` (Concern 2) và thao tác mới `restoreItemVersion` (Concern 9). Khôi phục buộc phải nằm trong lõi vì `saveItem` ghi cứng `reason: 'edit'` và `applyFields` từ chối field đã có tombstone, trong khi AC25 đòi field đã xoá quay lại. `restoreItemVersion` giữ nguyên `field.id` và đóng dấu đồng hồ mới, nên `merge` của KM-002 vẫn gộp đúng. Giữ `fieldOrder` hiện tại, field quay lại nối vào cuối (bản lịch sử không chứa `fieldOrder`), và không làm gì nếu bản đó giống hiện tại. Fork không cần sửa lõi: `createItem` + `updateItem` trên cùng một bản sao của `mutate`.

**Phương án đã bỏ.**

- *Đặt logic mới vào `core/`:* phình hợp đồng 09 mà server không dùng, và trái dự kiến ở NFR11. Các module này nằm ngay trong `js/`, đúng quy ước "các lớp khác".
- *Sửa vault tại chỗ rồi hoàn tác khi ghi lỗi:* dữ liệu đang hiện có thể lệch đĩa trong lúc chờ ghi, và hai lần lưu liên tiếp khó hoàn tác đúng.
- *Playwright cho E2E:* trái NFR06. Thay bằng harness tự viết nói chuyện CDP với Chrome qua `WebSocket` có sẵn của Node.
- *Driver chạy trong trang:* không làm được thẻ tab thứ hai, đổi chủ đề, đổi kích thước hay theo dõi mạng thật.
- *`BroadcastChannel` cho một-tab-mở-khoá:* tab crash thì khoá kẹt. Web Locks tự nhả khi tab chết.

**Quyết định cho phần spec để ngỏ.**

- **Concern 12 (originator chốt 2026-11-01):** env sống dưới project đã xoá được **coi như đã xoá khi hiển thị**: không hiện ở điều hướng, không tính là env sống, item chỉ trỏ tới env đó vào *Chưa gán*. Không ghi gì thêm vào vault. Quy tắc nằm trong `liveEnvs()` ở `vault-query.js`, ghi vào 03 và 09.
- **Concern 13 (spike đã chạy trên Chrome 156 headless, dưới đúng chuỗi CSP ở 04):** không cần nới CSP. Đọc QR từ ảnh bằng `createImageBitmap(File)` (không đụng `img-src`) cho đúng URI; camera giả qua `getUserMedia` → `video.srcObject` → `BarcodeDetector.detect(video)` cho đúng URI trong 231 ms, track `ended` sau khi dừng; tải file bằng `a[download]` với `blob:`, `el.style.setProperty`, Web Locks, IndexedDB đều chạy, **0 vi phạm CSP**. Cách phục vụ cục bộ: `testkit/serve.mjs` chỉ dùng `node:http`, gắn đúng CSP, bind `127.0.0.1` (secure context nên có WebCrypto và camera).
- **Concern 11 (danh sách từ):** EFF Large Wordlist, nguồn `eff.org/files/2016/07/18/eff_large_wordlist.txt`, SHA-256 `addd3553…996b903e`, 7 776 từ khác nhau. Bỏ 4 từ có gạch nối (`drop-down`, `felt-tip`, `t-shirt`, `yo-yo`) để dấu `-` luôn là ký tự nối, còn 7 772 từ, 5 từ ≈ 64,6 bit (≥ 55). Giấy phép CC BY là ghi công, không trái quy ước: ghi nguồn, đoạn đã bỏ và đúng phiên bản giấy phép ở đầu `wordlist.js` và trong `README.md`. Đây là dữ liệu, không phải phụ thuộc mã.
- **NFR08 (đường cơ sở đo trong spike, trung vị 5 lần trên Chrome headless, chưa tính render):** mở khoá vault 200 KB gồm cả `validateVault` **53,6 ms** (ngưỡng 1,5 s); clone + `updateItem` + mã hoá + ghi IndexedDB với vault 1 MB **19,7 ms** (ngưỡng 500 ms). Không cần sửa spec; AC50 đo lại trên UI thật.
- **Clipboard khi tới hạn:** chỉ gọi `readText` khi `permissions.query({ name: 'clipboard-read' })` đã là `granted`; không bao giờ tự bật hộp hỏi quyền, vì nếu người dùng chưa trả lời thì secret vẫn nằm trong clipboard. Mọi trường hợp khác tính là "không đọc được" và ghi đè theo Concern 7. Hệ quả: với quyền mặc định, thứ khác vừa copy cũng bị xoá sau 30 giây. Đây là điều originator đã chấp nhận ở Concern 7, nhưng cần nhìn lại khi duyệt plan vì nó sẽ xảy ra ở phần lớn lần dùng, không phải hiếm khi.
- **Ngoài đó:** field `otp` rỗng tính là giá trị sai, không lưu được. Bộ sinh *Ngẫu nhiên* sinh lại cả chuỗi tới khi đủ nhóm đã chọn, nên phân bố đều trên tập hợp lệ. Sắp xếp project/env/field chỉ dùng nút lên/xuống, không kéo thả. `KM-003.md` ghi "IndexedDB riêng cho từng vault"; plan theo 03 §3: một DB `keymesh`, mỗi vault một dòng trong store `vaults`.

## 2. Files

| Path | Change | Why |
|---|---|---|
| `src/public/js/core/crypto.js` | `deriveFromPassword` chuẩn hoá `password.normalize('NFC')` trước khi lấy byte UTF-8 | FR05, Concern 2 |
| `src/public/js/core/model.js` | Thêm `restoreItemVersion(vault, itemId, entry, ctx)`; `saveItem` nhận thêm `reason` nội bộ. Chữ ký `updateItem` không đổi | FR28, Concern 9 |
| `src/public/index.html` | Mới. Khung trang: stylesheet, một module script, `<link rel="icon" href="data:,">`; không inline gì | FR46, NFR01 |
| `src/public/styles.css` | Mới. Viết lại từ `design/prototype/styles.css`: bỏ `data-theme`, thêm class màu env và kích thước thay cho `style=`, sửa token chưa đạt tương phản, vùng chạm 44 px dưới 900px | FR18, FR45, FR46, NFR09, NFR10 |
| `src/public/js/app.js` | Mới. Kiểm nền tảng, chọn màn lập/khoá/lỗi, trạng thái UI (bộ lọc, item chọn, bản nháp, secret đang hiện, màn đang xem), hành động, khoá | FR01, FR08–FR13, FR47 |
| `src/public/js/session.js` | Mới. `createAccount`, `unlock`, `mutate`, `lock`; giữ khoá và vault trong bộ nhớ; hàng đợi ghi một lần một việc | FR03–FR08, FR12, FR23 |
| `src/public/js/store.js` | Mới. IndexedDB `keymesh` v1, store `meta` + `vaults` theo 03 §3; ghi tài khoản trong một transaction bằng `add`; `readAccount`, `readVaultRows`, `writeVaultCurrent`, `toRecord` | FR03, FR04, FR23 |
| `src/public/js/tab-lock.js` | Mới. Giữ/nhả Web Lock `keymesh-unlocked` với `ifAvailable`; `locks` truyền vào | FR13 |
| `src/public/js/idle.js` | Mới. Hẹn giờ theo `Date.now()` (tính cả lúc máy ngủ), kiểm mỗi giây và ở `visibilitychange`/`focus`/`pageshow`/mọi thao tác; đồng hồ và timer truyền vào | FR11 |
| `src/public/js/clipboard.js` | Mới. Copy, đếm 30 giây, xoá có điều kiện, thử lại khi có focus, xoá ngay khi khoá; không giữ giá trị sau khoá | FR12, FR40 |
| `src/public/js/otp.js` | Mới. `parseOtp` (base32/URI, kiểm tham số, từ chối `hotp`), `totp` bằng WebCrypto HMAC | FR33, FR34 |
| `src/public/js/passgen.js` | Mới. *Ngẫu nhiên* và *Dễ nhớ*, rejection sampling trên `randomBytes` | FR31, FR32 |
| `src/public/js/wordlist.js` | Mới. 7 772 từ, đầu file ghi nguồn, SHA-256, giấy phép, phần đã bỏ | FR32, Concern 11 |
| `src/public/js/vault-query.js` | Mới. `liveProjects`, `liveEnvs` (Concern 12), `orderedFields`, 5 bộ lọc, tìm kiếm có bỏ dấu, chip dùng chung, `daysLeft`, `isProd` | FR16, FR19, FR26, FR29, FR30, FR43, FR44 |
| `src/public/js/vault-ops.js` | Mới. Kiểm tên trống/trùng, thêm project kèm env, đổi thứ tự, đếm item bị ảnh hưởng, `forkItem`, nháp nhân bản, nháp từ mẫu, nháp → `updateItem` | FR14–FR17, FR20–FR22, FR24, FR25 |
| `src/public/js/history-diff.js` | Mới. Diff từng thuộc tính; đánh dấu giá trị cần che; `otp` chỉ có cờ "đã đổi", không mang giá trị | FR27 |
| `src/public/js/field-file.js` | Mới. Đọc byte: ≤ 65 536, không NUL, `TextDecoder` `fatal` + `ignoreBOM`; tạo byte để tải lại | FR38, FR39 |
| `src/public/js/ui/dom.js` | Mới. `h(tag, props, ...children)` chỉ dùng `textContent`, không nhận `style`, `on*` chuỗi hay HTML | NFR01, NFR05 |
| `src/public/js/ui/icons.js` | Mới. Icon dựng bằng `createElementNS`, không `<use>` hay style | NFR01 |
| `src/public/js/ui/gate.js` | Mới. Màn lập, màn khoá, màn lỗi/không hỗ trợ, thông báo tab khác đang mở | FR01, FR02, FR07, FR08, FR13 |
| `src/public/js/ui/shell.js` | Mới. Bố cục 3 cột/xếp chồng, đầu trang, nút Khoá, nút quay lại, toast | FR10, FR46 |
| `src/public/js/ui/nav.js` | Mới. Bộ lọc, cây project/env, ô tìm kiếm, Cmd/Ctrl+K | FR43, FR44 |
| `src/public/js/ui/project-dialogs.js` | Mới. Thêm/đổi tên/xoá/sắp xếp project và env, chọn màu | FR14–FR18 |
| `src/public/js/ui/list.js` | Mới. Danh sách item, dấu dùng chung, trạng thái trống | FR26, FR43 |
| `src/public/js/ui/detail.js` | Mới. Xem field theo `kind`, che/hiện, copy, mở URL, mã OTP + đếm ngược, tên file + tải lại, chip, hạn, liên kết bản gốc | FR26, FR29, FR34, FR39–FR42 |
| `src/public/js/ui/edit.js` | Mới. Chọn loại, form, sửa field, gán env, hạn, lưu, lỗi tại field | FR20–FR23, FR25, FR33, FR38 |
| `src/public/js/ui/generator-dialog.js` | Mới. Dialog bộ sinh mật khẩu | FR31, FR32 |
| `src/public/js/ui/qr-dialog.js` | Mới. Camera và ảnh chụp màn hình, tắt track khi đóng/khoá | FR35–FR37 |
| `src/public/js/ui/history-dialog.js` | Mới. Danh sách, diff, hiện giá trị che, khôi phục | FR27, FR28 |
| `testkit/serve.mjs` | Mới. `startServer()` + CLI: phục vụ `src/public`, đúng CSP ở 04, `nosniff`, `no-store`, `127.0.0.1` | NFR01, NFR04, Concern 4, 13 |
| `testkit/e2e/cdp.mjs` | Mới. Mở Chrome, profile tạm, nối CDP qua `WebSocket` của Node (cần Node ≥ 22 cho riêng E2E) | NFR12, feedback loop |
| `testkit/e2e/driver.mjs` | Mới. Thao tác theo tên trợ năng, chụp màn hình, bộ đếm vi phạm CSP, log console, log mạng, dò dữ liệu lưu | AC45–AC48 |
| `testkit/e2e/qr-fixture.mjs` | Mới. Sinh QR (PNG cho test ảnh, Y4M cho camera giả) vào thư mục tạm; không commit file lớn | AC32, AC33 |
| `testkit/gen-vectors.mjs` | Sửa bước so sánh, xem §4; PBKDF2 nhận `password.normalize('NFC')` để bộ sinh độc lập định nghĩa đúng định dạng mới | AC52, Concern 2 |
| `test/keys.test.js`, `test/model.test.js`, `test/leak.test.js` | Thêm test NFC, `restoreItemVersion`, chuỗi đánh dấu qua restore | AC05, AC25, NFR03 |
| `test/otp.test.js`, `test/passgen.test.js`, `test/vault-query.test.js`, `test/vault-ops.test.js`, `test/history-diff.test.js`, `test/field-file.test.js`, `test/idle.test.js`, `test/clipboard.test.js`, `test/tab-lock.test.js`, `test/session.test.js` | Mới. Logic thuần, tên test có id AC/FR; chạy cả Node và trình duyệt | NFR12 |
| `test/store.test.js` | Mới. IndexedDB thật: Node bỏ qua (`skip`), trình duyệt chạy | AC03, AC04, AC20 |
| `test/ui-static.test.js` | Mới. Quét `src/public` không có `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `eval`, `new Function`, `style=`, `on*=`, `console.`, script/style inline, URL ngoài origin, bare import; CSP trong `serve.mjs` trùng nguyên văn 04; `dependencies` rỗng; chuỗi của FR47 không có trong UI; tương phản token ≥ 4,5:1 | NFR01, NFR05, NFR06, NFR10, FR47 |
| `test/e2e/account.e2e.js`, `lock.e2e.js`, `projects.e2e.js`, `items.e2e.js`, `fields.e2e.js`, `sweep.e2e.js`, `perf.e2e.js` | Mới. Chạy bằng `npm run test:e2e`, không vào `npm test` | Xem §5 |
| `package.json` | Thêm script `start`, `test:e2e`; `dependencies` vẫn rỗng | NFR06 |
| `docs/03-data-model.md` | §2 NFC; §1 bỏ thư viện QR dự phòng, thêm quy tắc env dưới project đã xoá; §3 giá trị trước KM-006 (`userId`, `username` = `null`, `version` = 0, `metaVersion` = 0, `base` = `null`, `dirty` = `true`) | Concern 1, 2, 6, 12, AC53 |
| `docs/09-core-api.md` | NFC; `restoreItemVersion`; sửa KM-008/KM-009 bị đảo ở dòng 128, 193, 197 và "Lưu ý cho epic sau"; thêm quy tắc Concern 12 | Concern 2, 9, 12, 15 |
| `docs/04-security.md` | Sửa dòng Clipboard theo FR40 | Concern 7 |
| `docs/02-architecture.md` | Cập nhật cây repo: `styles.css`, module mới, `testkit/serve.mjs`, `test/e2e/` | Quy ước `CLAUDE.md` |
| `README.md` | Cách chạy (`npm start`, `npm run test:e2e`), ghi công danh sách từ | Concern 11 |
| `docs/epics/KM-006/KM-006.md`, `KM-004/KM-004.md`, `KM-011/KM-011.md` | KM-006: đăng ký bộ khoá đang có, giữ dữ liệu. KM-004: quyết định đọc QR trên iPhone, Safari xoá dữ liệu. KM-011: tìm theo tag | Concern 1, 6, 8, 16 |
| `docs/epics/KM-003/artifacts/spec.md` | Ghi kết quả Concern 11, 12, 13, 15 vào cột Resolution | Quy trình epic |

## 3. Order

Trước bước 1: tạo nhánh `feat/KM-003-app` từ `master`, và commit riêng các thay đổi docs/epic đang chưa commit (đã có từ trước phiên này) để diff của từng bước sạch.

1. **`npm run vectors` xanh trở lại.** Bước so sánh của `gen-vectors.mjs` kiểm `vaultGzip`/`envelope.ct` theo hai lớp. *Sau bước này:* lệnh xanh trên macOS/Node 24, `testkit/vectors.js` không đổi một byte.
2. **Hai thay đổi lõi kèm tài liệu.** NFC, `restoreItemVersion`, 03 §2, 09 (gồm Concern 12, 15). *Sau bước này:* NFC và NFD cùng mở một tài khoản; khôi phục đúng AC25 ở mức lõi; toàn bộ vector và test KM-001/KM-002 vẫn xanh.
3. **OTP và sinh mật khẩu.** `otp.js`, `passgen.js`, `wordlist.js` + test. *Sau bước này:* vector RFC 6238 đúng, AC27–AC30 đạt ở mức logic.
4. **Truy vấn và thao tác trên vault.** `vault-query.js`, `vault-ops.js`, `history-diff.js`, `field-file.js` + test. *Sau bước này:* lọc, tìm, chip, hạn, fork, nhân bản, diff, đọc file đúng ở mức logic, kể cả Concern 12.
5. **Lưu trữ và phiên.** `store.js`, `session.js`, `tab-lock.js` + test. *Sau bước này:* lập → ghi → khoá → mở lại chạy trên IndexedDB thật; ghi lỗi không để lại gì sai; dạng đĩa đúng 03 §3 và đăng ký được theo 06.
6. **Hẹn giờ và clipboard.** `idle.js`, `clipboard.js` + test. *Sau bước này:* mọi nhánh FR11, FR40 đúng với đồng hồ và clipboard giả.
7. **Vòng phản hồi và cổng vào.** `serve.mjs`, `cdp.mjs`, `driver.mjs`, `index.html`, `styles.css`, `app.js`, `ui/dom.js`, `ui/icons.js`, `ui/gate.js`, `ui/shell.js` bản đầu, `test/ui-static.test.js`, `test/e2e/account.e2e.js`, `lock.e2e.js`. *Sau bước này:* mở app được dưới CSP, lập/mở khoá/khoá/tự khoá/một tab chạy thật, chụp màn hình được.
8. **Điều hướng và project/env.** `ui/nav.js`, `ui/list.js`, `ui/project-dialogs.js`, `test/e2e/projects.e2e.js`. *Sau bước này:* quản lý project/env, lọc, tìm chạy trên UI; xếp chồng dưới 900px.
9. **Xem item.** `ui/detail.js`. *Sau bước này:* copy, che/hiện, mở URL, mã OTP, tải file, chip chạy với dữ liệu seed.
10. **Tạo và sửa item.** `ui/edit.js`, `test/e2e/items.e2e.js`. *Sau bước này:* đủ 9 loại, sửa field, gán nhiều env, hạn, lưu, nhân bản; luồng 3.1 tới bước 4.
11. **Bộ sinh, OTP nhập, file, QR.** `ui/generator-dialog.js`, `ui/qr-dialog.js`, phần file và OTP của `ui/edit.js`, `qr-fixture.mjs`, `test/e2e/fields.e2e.js`. *Sau bước này:* FR31–FR39 chạy thật dưới CSP.
12. **Fork, lịch sử, khôi phục.** Nút Fork, `ui/history-dialog.js`, thêm vào `items.e2e.js`. *Sau bước này:* tiêu chí 5 đạt trên UI, trọn luồng 3.1.
13. **Quét toàn app.** `test/e2e/sweep.e2e.js`, `perf.e2e.js`; sửa những gì lộ ra. *Sau bước này:* AC42–AC48, AC50, AC51 có kết quả.
14. **Khép tài liệu.** 02, 03 §1 và §3, 04, README, KM-004/006/011, Resolution trong spec, danh sách kiểm tay cho `verify.md`. *Sau bước này:* AC52, AC53 chỉ ra được; Safari đã chạy, Firefox theo Risks.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — steps 1–2: `npm run vectors` xanh, NFC và `restoreItemVersion` xong kèm 03/09; `npm test`, `test:browser` xanh.

**Batch 2** — steps 3–4: toàn bộ logic thuần của tính năng xong và có test, chưa có UI.

**Batch 3** — steps 5–6: lưu trữ, phiên, khoá một tab, hẹn giờ, clipboard xong; `store.test.js` xanh trên trình duyệt.

**Batch 4** — step 7: app mở được dưới CSP, lập/mở khoá/khoá chạy thật; `npm run test:e2e` có hai file đầu xanh.

**Batch 5** — step 8: project/env, lọc, tìm chạy trên UI.

**Batch 6** — steps 9–10: xem, tạo, sửa item trọn vòng.

**Batch 7** — step 11: bộ sinh, OTP nhập, file, QR xong.

**Batch 8** — step 12: fork, lịch sử, khôi phục xong; luồng 3.1 chạy trọn bằng E2E.

**Batch 9** — steps 13–14: quét toàn app, đo hiệu năng, khép tài liệu, sẵn sàng cho `verify`.

## 4. Risks

| Risk | Likelihood | What we do about it |
|---|---|---|
| `npm run vectors` đang **fail sẵn** trên máy dev: `vaultGzip`, `envelope.ct` lệch vì zlib của Node 24 trên macOS nén khác máy sinh vector. Đã kiểm: chỉ hai khoá này lệch; gunzip `vaultGzip` đã commit ra đúng vault; AES-GCM trên nó ra đúng `envelope.ct`. AC52 sẽ đỏ nếu không xử lý | Đã xảy ra | Originator chốt 2026-11-01: **sửa bộ so sánh, không sinh lại vector.** Bước so sánh kiểm hai lớp trên, mọi khoá khác so từng byte. Thử đột biến: sửa một byte ở `vaultGzip`, `envelope.ct` và một khoá khác đều phải ra đỏ |
| Đổi `deriveFromPassword` lan rộng. `codegraph`: 10 bên gọi (`crypto.js`, `testkit/helpers.js`), test `envelope`, `keys`, `vectors`, `leak` | Thấp | Mật khẩu vector đã kiểm là NFC, chạy lại vector ngay sau khi sửa. Vector lệch thì dừng và báo (Concern 2), không `--write` |
| Đổi `saveItem`. `codegraph`: 1 bên gọi (`updateItem`), test qua `roundtrip`, `leak` và các test khác | Thấp | Tham số `reason` nội bộ, mặc định `'edit'`; `merge` không đọc `reason`. Test khôi phục rồi gộp qua `merge`, và `validateVault` trên kết quả |
| Khó đảo ngược: NFC và dạng IndexedDB v1 là định dạng KM-006 sẽ đọc | Trung bình | Chưa có dữ liệu thật nên giờ là lúc rẻ nhất. `store.test.js` và AC53 kiểm dòng lưu ánh xạ đủ vào `record` ở 09 và `POST /api/register` ở 06 (`id`, `wrappedVaultKey`, `meta`, `blob` = `current.envelope`, `authKey` dẫn xuất lại từ password + `kdf` đã lưu). `authKey` bị xoá ngay sau `createAccount` |
| `textarea.value` đổi CRLF thành LF nên lưu lại làm hỏng file (AC34) | Cao nếu không để ý | Bản nháp chỉ đổi `v` khi có sự kiện `input` trên ô đó; field có `file` hiện tên file, không đổ nội dung vào ô trừ khi bấm sửa. E2E tải lại file CRLF sau khi sửa field khác và so từng byte |
| Render lại làm mất focus, phá AC51 và ô tìm kiếm | Trung bình | Chỉ render lại vùng bị ảnh hưởng; ô tìm và form sửa không bị dựng lại khi gõ; hành động ghi rõ focus chuyển đi đâu. `sweep.e2e.js` đi luồng 3.1 chỉ bằng phím |
| `form-action 'none'` chặn submit, sinh vi phạm CSP | Trung bình | Mọi `<form>` gọi `preventDefault` qua helper chung; bộ đếm vi phạm CSP chạy trong **mọi** test E2E, không chỉ AC45 |
| Tương phản: `--warn`, `--muted` của prototype có thể < 4,5:1 | Trung bình | `ui-static.test.js` tính tương phản từ token cho cả hai chủ đề; sửa token trong `styles.css` |
| Máy ngủ: `setInterval` không chạy và `performance.now` có thể đứng | Trung bình | Dùng `Date.now()`; kiểm lại ở mọi sự kiện thao tác **trước khi** xử lý; `pagehide` cũng khoá (bfcache). AC10 giả lập bằng cách nhảy đồng hồ, kèm một lần ngủ máy thật ở danh sách kiểm tay |
| Clipboard headless thất thường (quyền, focus) | Trung bình | Ưu tiên `clipboard.test.js` với clipboard giả cho mọi nhánh; E2E dùng `Browser.grantPermissions` + giả lập focus; không ổn định thì mục đó chuyển sang kiểm tay (NFR12 cho phép) và ghi rõ |
| Camera thật khác camera giả | Thấp | Fake device đã qua spike; AC32 còn một mục kiểm tay bằng camera thật trên Chrome macOS |
| **Ít chắc nhất:** độ dài E2E và kích cỡ batch, nhất là bước 7 và 13 | Trung bình | Nếu batch vượt nhiều, tách theo ranh giới file `*.e2e.js` và ghi vào `implement.md` |
| Firefox chưa cài trên máy dev (chỉ thấy Safari) | Chắc chắn nếu không cài | AC49 chỉ cần ghi kết quả, không chặn đóng epic. Originator cài Firefox nếu muốn có số; nếu không, `verify.md` ghi "chưa chạy" đúng như vậy |
| Vault giả mạo qua dữ liệu lưu làm UI đổ | Thấp | `session.unlock` chạy `validateVault`; không đạt thì coi như `format` (FR08); số đo cơ sở đã gồm bước này |

## 5. Proofs

"Tự động" chạy bằng `npm test` + `npm run test:browser` (logic) hoặc `npm run test:e2e` (Chrome thật, dưới CSP). "Kiểm tay" đi vào danh sách của `verify.md` theo NFR12. Tên test bắt đầu bằng id AC.

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-003-AC01` | Trình duyệt trống thấy màn lập đúng hai ô; khác nhau/trống thì IndexedDB không có tài khoản | `test/e2e/account.e2e.js` |
| `KM-003-AC02` | 11 ký tự có cảnh báo và tạo được, 12 ký tự không cảnh báo; luôn có hai câu cảnh báo | `account.e2e.js` |
| `KM-003-AC03` | Đọc store: một vault, mở ra "Vault mặc định", `deviceId` hợp lệ, không `authKey`, `username`/`userId` trống | `test/store.test.js`, `account.e2e.js` |
| `KM-003-AC04` | Huỷ transaction giữa lúc ghi rồi mở lại về màn lập | `store.test.js`, `account.e2e.js` (ghi đè `IDBObjectStore.prototype.add` qua CDP) |
| `KM-003-AC05` | NFC/NFD ra cùng `encKey`/`authKey`; lập bằng NFC, mở bằng NFD trên UI; vector KM-001 vẫn xanh | `test/keys.test.js`, `test/vectors.test.js`, `account.e2e.js` |
| `KM-003-AC06` | Tắt Chrome, mở lại cùng profile: đúng mật khẩu thấy đủ, sai không thấy và thử lại được; log mạng chỉ có file cùng origin. Kiểm tay: tắt Wi-Fi thật | `account.e2e.js` + kiểm tay |
| `KM-003-AC07` | Sửa 1 byte envelope: báo lỗi, không dữ liệu, dòng lưu không đổi. Bỏ `CompressionStream` trước khi tải trang: báo không hỗ trợ | `account.e2e.js` |
| `KM-003-AC08` | Bấm Khoá, dò toàn bộ DOM không còn chuỗi đánh dấu; mở lại thì bản nháp và trạng thái hiện đã mất | `test/e2e/lock.e2e.js`, `test/session.test.js` |
| `KM-003-AC09` | Đồng hồ giả: khoá đúng mốc 10 phút, thao tác ở phút 9 tính lại; E2E nhảy đồng hồ, khoá trong ≤ 30 giây | `test/idle.test.js`, `lock.e2e.js` |
| `KM-003-AC10` | Nhảy `Date.now` 11 phút không chạy timer: sự kiện đầu tiên khoá trước khi xử lý. Kiểm tay: ngủ máy thật | `idle.test.js`, `lock.e2e.js` + kiểm tay |
| `KM-003-AC11` | Hai tab qua `Target.createTarget`: B bị từ chối có lý do; khoá/đóng A thì B mở được và thấy dữ liệu mới nhất | `test/tab-lock.test.js`, `lock.e2e.js` |
| `KM-003-AC12` | Mặc định 4 env đúng thứ tự; trống/trùng khác hoa thường bị từ chối | `test/vault-ops.test.js`, `test/e2e/projects.e2e.js` |
| `KM-003-AC13` | Đúng kịch bản 2 env, 3 item: hộp xác nhận báo 3; sau xoá 2 item ở *Chưa gán*, 1 ở project kia, `scopes` còn id | `vault-ops.test.js`, `projects.e2e.js` |
| `KM-003-AC14` | Đổi thứ tự chỉ bằng phím, khoá, mở lại, còn nguyên | `projects.e2e.js` |
| `KM-003-AC15` | Env đỏ đúng màu ở cả hai chủ đề, không vi phạm CSP; copy từ `PROD` có cảnh báo và clipboard có giá trị; item khác không cảnh báo | `test/vault-query.test.js`, `projects.e2e.js` |
| `KM-003-AC16` | Vòng qua 9 loại, so tên/kiểu/thứ tự với bảng 03 §1; tiêu đề trống không lưu được | `vault-ops.test.js`, `test/e2e/items.e2e.js` |
| `KM-003-AC17` | Thêm `otp`, xoá, đổi thứ tự, đổi field `file` sang `text`; khoá, mở lại đúng, không còn `file` | `vault-ops.test.js`, `items.e2e.js` |
| `KM-003-AC18` | Item 3 env, sửa ở một env, mở từ cả ba thấy mới; chip đúng chuỗi khi lọc `PaymentGW` | `vault-query.test.js`, `items.e2e.js` |
| `KM-003-AC19` | Sửa gán khi có env đã xoá trong `scopes`: id vẫn còn | `vault-ops.test.js` |
| `KM-003-AC20` | `put` ném lỗi khi lưu: báo thất bại, nháp còn, không có "đã lưu"; mở lại thấy bản trước | `test/session.test.js`, `items.e2e.js` |
| `KM-003-AC21` | Fork đúng hình dạng; sửa fork không đổi bản gốc và ngược lại | `vault-ops.test.js`, `items.e2e.js` |
| `KM-003-AC22` | Item một env sống (kể cả env còn lại đã xoá) không có nút Fork | `items.e2e.js` |
| `KM-003-AC23` | Huỷ không tạo item; lưu có cùng `scopes`, lịch sử rỗng, `forkedFrom` trống, id field mới | `vault-ops.test.js`, `items.e2e.js` |
| `KM-003-AC24` | Diff che Password đến khi bấm, giá trị không có trong DOM trước đó; `otp` chỉ "đã đổi"; 25 lần còn 20 | `test/history-diff.test.js`, `test/model.test.js`, `items.e2e.js` |
| `KM-003-AC25` | Khôi phục đúng thuộc tính, gán env không đổi, field đã xoá quay lại, có `reason: "restore"`; gộp qua `merge` hợp lệ | `model.test.js`, `items.e2e.js` |
| `KM-003-AC26` | N−1, N, N+14, N+15 với lịch địa phương, gồm ngày đổi giờ mùa hè | `vault-query.test.js` |
| `KM-003-AC27` | 10 000 lần × 8 tổ hợp × độ dài 8 và 64: đúng độ dài, đủ nhóm, không nhóm tắt, không trùng; đóng không *Dùng* thì field không đổi | `test/passgen.test.js`, `test/e2e/fields.e2e.js` |
| `KM-003-AC28` | Mặc định 5 từ, chỉnh 3–8; danh sách ≥ 2048 mục khác nhau, không gạch nối | `passgen.test.js`, `fields.e2e.js` |
| `KM-003-AC29` | Vector RFC 6238 SHA1/256/512; `digits=8&period=60`; `JBSW Y3dp` | `test/otp.test.js` |
| `KM-003-AC30` | `hotp`, base32 sai, `digits=9`, `period=0`: không lưu, báo đúng field | `otp.test.js`, `fields.e2e.js` |
| `KM-003-AC31` | Mã và đếm ngược, đổi trong ≤ 1 giây sau mốc chu kỳ; secret không có trong DOM; copy ra mã | `otp.test.js`, `fields.e2e.js` |
| `KM-003-AC32` | Camera giả và ảnh PNG cho đúng URI; track `ended` sau khi đọc và sau khi đóng. Kiểm tay: camera thật trên Chrome macOS | `fields.e2e.js` + kiểm tay |
| `KM-003-AC33` | `Browser.setPermission` từ chối camera; bỏ `BarcodeDetector`; PNG không có QR: có thông báo, vẫn dán được, field giữ nguyên | `fields.e2e.js` |
| `KM-003-AC34` | 65 536 byte CRLF nhận, tải lại trùng từng byte; 65 537 byte, có NUL, sai UTF-8 bị từ chối | `test/field-file.test.js`, `fields.e2e.js` (đọc file tải về bằng `Browser.setDownloadBehavior`) |
| `KM-003-AC35` | `vpn` mới, *Cấu hình* rỗng: không có nút tải | `fields.e2e.js` |
| `KM-003-AC36` | Mọi nhánh: không đổi, đổi và đọc được, không đọc được, copy lại, bị từ chối ghi rồi có focus | `test/clipboard.test.js`, `fields.e2e.js` |
| `KM-003-AC37` | Khoá trong lúc đếm: clipboard xoá ngay; bị từ chối thì xoá khi có focus; không còn giá trị trong module | `clipboard.test.js`, `lock.e2e.js` |
| `KM-003-AC38` | Hiện, chuyển item, quay lại: che lại, giá trị không có trong DOM | `fields.e2e.js` |
| `KM-003-AC39` | Tab mới có `window.opener === null`; `javascript:alert(1)` không có nút mở | `fields.e2e.js` |
| `KM-003-AC40` | Bảng trạng thái gán env × từng bộ lọc, gồm item chỉ trỏ env đã xoá và env dưới project đã xoá (Concern 12); trạng thái trống | `vault-query.test.js`, `projects.e2e.js` |
| `KM-003-AC41` | Cmd/Ctrl+K; `mat khau`, `da nang` thấy; `zebra` không thấy | `vault-query.test.js`, `projects.e2e.js` |
| `KM-003-AC42` | `Emulation.setEmulatedMedia` đổi `prefers-color-scheme`, màu nền đổi, không tải lại | `test/e2e/sweep.e2e.js` |
| `KM-003-AC43` | 900 px có 3 cột; 899 và 360 px xếp chồng, không cuộn ngang, đo mọi nút hiện ≥ 44×44, làm trọn luồng 3.1; xem ảnh chụp | `sweep.e2e.js` |
| `KM-003-AC44` | Quét tĩnh chuỗi của FR47 và duyệt mọi màn tìm tên trợ năng bị cấm | `test/ui-static.test.js`, `sweep.e2e.js` |
| `KM-003-AC45` | Bộ đếm `securitypolicyviolation` + `Log` CDP trong mọi file E2E, gồm quét QR và tải file: 0; `serve.mjs` trùng 04 | `npm run test:e2e`, `ui-static.test.js` |
| `KM-003-AC46` | Chuỗi đánh dấu ở mọi ô: sau khi khoá, dò IndexedDB, `localStorage`, `sessionStorage`, Cache Storage **và file trong thư mục profile**; dò console, lỗi, URL | `sweep.e2e.js`, `test/leak.test.js` |
| `KM-003-AC47` | `Network.requestWillBeSent` qua mọi luồng: chỉ cùng origin | `sweep.e2e.js` |
| `KM-003-AC48` | Chuỗi chèn ở mọi ô: hiện nguyên văn, không tạo phần tử `img`, không chạy gì | `sweep.e2e.js` |
| `KM-003-AC49` | Safari: `npm run test:browser` mở URL thủ công + luồng chính. Firefox: như vậy nếu đã cài. Ghi kết quả, kể cả "chưa chạy" | Kiểm tay, ghi vào `verify.md` |
| `KM-003-AC50` | UI thật, trung vị 5 lần: mở khoá 200 KB, lưu vault 1 MB, lọc/gõ tìm 500 item | `test/e2e/perf.e2e.js`; số in vào `implement.md` |
| `KM-003-AC51` | Luồng 3.1 chỉ bằng `Input.dispatchKeyEvent`, kiểm focus nhìn thấy; tương phản token | `sweep.e2e.js`, `ui-static.test.js` |
| `KM-003-AC52` | `npm test`, `npm run test:browser`, `npm run vectors` xanh; `git diff master -- testkit/vectors.js` rỗng; bảng FR → test/kiểm tay trong `implement.md` | Chạy lệnh, dán đầu ra |
| `KM-003-AC53` | Bảng ánh xạ KM-004/006/010 → dạng lưu, bộ khoá, `dirty`, `record`; test dòng lưu → `unlockWithPassword` và → payload register | `store.test.js`; verifier đọc lại |

## 6. Feedback loop

- **Logic và lõi:** `npm test` sau mỗi bước, `npm run test:browser` ở cuối mỗi batch (baseline hôm nay: 119/119 cả hai).
- **Định dạng:** `npm run vectors` sau mọi thay đổi chạm `core/` hoặc bộ sinh.
- **App thật:** `testkit/serve.mjs` + harness CDP. `npm run test:e2e` chạy Chrome thật dưới đúng CSP. Bước 7 dựng vòng này trước khi có màn hình nào.
- **Nhìn bằng mắt:** từ bước 7, chụp màn hình ở 1280, 899 và 360 px, cả sáng và tối, vào scratchpad, và xem lại trước khi đóng mỗi batch UI. Test xanh không chứng minh được bố cục đúng.
- **Dữ liệu:** kiểm dạng lưu bằng cách đọc thẳng IndexedDB trong trang qua CDP và dò thư mục profile sau khi khoá.

## 7. Deliberately not doing

- `_headers`, `manifest.webmanifest`, `sw.js`, `icons/`, `Permissions-Policy`: KM-004. `serve.mjs` chỉ gắn CSP và `nosniff`.
- `wrangler.toml`, `functions/`, `migrations/`, `sync.js`, `mirror.js`, `config.js`: chưa epic này nào cần.
- Không gọi `trashItem`/`restoreItem`/`purgeItem`, không có màn thùng rác (KM-008).
- Không kéo thả, không route theo `history.pushState`, không có màn cài đặt.
- Không thư viện QR dự phòng; không tìm hay hiện tag, nhưng tag đã có vẫn được giữ khi fork, nhân bản và lưu.
- Không gộp trong app dù `merge.js` đã có; không gọi `navigator.storage.persist()` (Concern 16).
- Không sửa `envvault.html` và `design/`; không sinh lại `testkit/vectors.js`.
- Không thêm thay đổi lõi nào ngoài hai thay đổi đã nêu. Phát sinh thì ghi amendment vào plan kèm lý do.
