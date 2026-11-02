# Implementation Plan — Backup, bản sao file và export Bitwarden

**Epic ID:** `KM-010`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `spec.md`

---

## 1. Approach

Epic chỉ thêm ở client và testkit; `src/functions/`, `src/migrations/`, `merge.js`, vector, CSP, `Permissions-Policy` không đổi (NFR10). Có bốn phần, xếp từ ít phụ thuộc tới nhiều phụ thuộc:

- **Lõi import.** Thêm hai thao tác thuần vào `core/model.js`: `importVault(vault, incoming, ctx)` cho vault đang có (FR12–FR15) và `adoptVault(incoming, newVaultId, ctx)` cho vault mới (FR11, FR15). Cả hai trả số đếm. Con số xem trước (FR09) là kết quả chạy `importVault` trên bản `structuredClone`, nên không thể lệch với thao tác thật. Kết quả là một lần lưu bình thường trong `session.mutate`, nên `merge.js` không đổi (FR16).
- **Định dạng file.** `backup-file.js` và `bitwarden-export.js` là hàm thuần ngoài `core/`, chạy được trên Node. `buildBackup` chỉ ghép các trường đã mã hoá của `meta.account` và dòng vault. Nó không cần khoá, nên vault hỏng vẫn vào file (FR04) và bản sao vẫn ghi được sau khi khoá (FR24).
- **Bản sao.** `mirror.js` không cầm khoá và không có API đọc file (FR21). `store.js` có một móc `onChange`, gọi sau mọi transaction ghi đã commit. Khi tới hạn, mirror dựng file, băm SHA-256 phần ổn định (bỏ `exportedAt`) rồi so với `fingerprint` đã lưu. Khác thì ghi, giống thì thôi. Một cơ chế này phủ mọi nguồn thay đổi ở FR20 (lưu, nhận từ đồng bộ, đổi tên vault, đổi mật khẩu), phủ "đẩy lên thành công mà không có gì đổi" (0 lần ghi) và phủ ghi bù khi đóng tab (FR24).
- **Giao diện.** Mở từ Cài đặt, nhóm "Dữ liệu". Thao tác import đi qua `session` vì chỉ `session` được cầm `accountKey`. Nội dung file đã giải mã nằm trong một biến của `app.js` và bị bỏ ở `lock()`.

**Phương án bị loại:**

1. **Gọi `merge()` với file làm `remote`.** Concern 1 (a), (b), (c) đã chứng minh cách này làm mất dữ liệu hoặc vô tác dụng.
2. **Gọi mirror ở từng điểm ghi (`change()`, `applyRemote`, đổi mật khẩu…).** KM-008, KM-009 còn thêm đường ghi, quên một chỗ thì bản sao âm thầm cũ đi. Móc ở `store.js` chỉ có một chỗ.
3. **Đọc file bản sao để so.** Cấm bởi FR21. So bằng `fingerprint` lưu ở `meta.mirror`.
4. **Giữ id vault của file khi import.** Đụng `409 vault_exists` (Concern 2).

### Kết quả chạy thử (2026-11-02, trên Windows, trong scratchpad, không vào repo)

**A. Nguyên mẫu `importVault` trên `merge.js`, `model.js` thật (Concern 1, phần còn "chưa chạy thử").**

| Ca | Kết quả |
|---|---|
| Mọi ô FR12: sống, thùng rác, xoá trắng, vắng mặt | Vault hợp lệ; hai chiều gộp ra cùng nội dung; số đếm đúng |
| Import lại cùng file sau mỗi ca | 0 thay đổi (AC14), với điều kiện ở hàng dưới |
| File ở thùng rác, hiện tại sống, khác nội dung | Phải kiểm "nội dung file đã có trong `history`" trước khi thêm, nếu không thì mỗi lần import lại thêm một bản |
| Item sống lại từ xoá trắng (có lần gộp thật) | Badge `purgedAt`, đúng KM-009 Amendment 1 |
| B sửa cùng field, sớm hơn và muộn hơn | Bản muộn thắng, chỉ field đó có đánh dấu, đủ ba giá trị |
| B chuyển X vào thùng rác, hoặc xoá trắng X | X sống với nội dung import, đánh dấu `deletedAt` / `purgedAt` |
| Giá trị file bằng `base`, B có sửa chờ | Import không đổi gì, bản B hiện ra |
| Hai máy cùng import | Giống nhau, 0 đánh dấu, lịch sử có bản trùng giá trị |
| 15 + 15 bản lịch sử | 20 bản, bản "Khôi phục" đứng đầu, vault hợp lệ |

Mẫu này chưa có FR14 (project, env) và FR15 khi gộp; hai phần đó được test ở bước 3.

**B. Trả lời Concern 5, Concern 16: đã import thật vào Vaultwarden** (`vaultwarden/server` 1.37.5, Docker, web vault và `@bitwarden/cli` cùng 2026.10.1, tài khoản và tổ chức thử, dữ liệu thử; container đã xoá). Client là CLI, cùng thư viện import với web vault. **Chưa thử qua giao diện web;** AC47 làm việc đó.

| Câu hỏi | Kết quả | Hệ quả |
|---|---|---|
| File có `organizationId: null`, id collection và id item là UUID ngẫu nhiên, nhận không? | **Nhận.** Tổ chức đích do người import chọn | App không cần biết id tổ chức |
| Item 2 `collectionIds`, env trống, "Chưa gán" | Đúng 2 collection; collection trống và "Chưa gán" được tạo | FR30 làm được |
| Project có `/`: `A/B` + `c` và `A` + `B/c` | Hai collection cùng tên `A/B/c`, tách riêng, item vào đúng | Không cần xử lý thêm |
| OTP so cùng chu kỳ, KeyMesh và Bitwarden | Khớp với base32, base32 có dấu cách, URI `digits=8&period=60`, URI `algorithm=SHA256` | Truyền nguyên giá trị đã `trim` vào `login.totp` |
| Notes | **Tối đa 7 439 byte UTF-8** (2 479 ký tự 3 byte qua, 2 480 không; khớp công thức: 10 000 ký tự sau mã hoá) | `BW_NOTES_MAX_BYTES = 7439` |
| Tên item, username, password, URI, totp, nhãn field, giá trị field (cả hai loại), tên collection | **Đều nhận 65 536 ký tự.** Chưa đo cao hơn | Dùng 65 536 byte làm trần cho mọi giá trị khác |
| Một item vượt giới hạn | **Hỏng cả file**, không item nào vào | FR36 là bắt buộc |
| **Tên item rỗng** | **Hỏng cả file** ("Data is not formatted correctly") | Quyết định 3 |
| Tổng lượng: 500 item × 20 KB | Nhận | Không cần chia file |
| CRLF, nhãn rỗng, giá trị rỗng, `totp` rác | Đều nhận. Đọc lại thấy CRLF, nhãn rỗng, giá trị rỗng còn nguyên; `totp` rác chỉ kiểm là không làm hỏng file | |
| Cần gì để chạy | Docker. CLI **từ chối `http://`, kể cả `localhost`**, nên cần TLS (chứng chỉ tự ký, `ROCKET_TLS`, `NODE_TLS_REJECT_UNAUTHORIZED=0` riêng cho lệnh `bw`). Đăng ký qua `/identity/accounts/register/send-verification-email` rồi `/finish` | `testkit/vaultwarden-check.mjs`; Docker trên Mac kiểm ở bước 1 |

**C. Trả lời Concern 17: Chrome 156 headless với đúng `_headers` của repo.** CSP và `Permissions-Policy` hiện tại không chặn gì: tải file bằng `<a download>` qua Blob ra file thật, có `showSaveFilePicker`, không có vi phạm nào trong log. **Không cần nới.** Handle lưu được qua IndexedDB. `writable.abort()` giữ nguyên nội dung cũ (FR22). Gọi picker không có thao tác người dùng thì `SecurityError`, nên phải gọi thẳng trong sự kiện click.

**Phát hiện mới: trên OPFS, `createWritable()` vào file đã xoá vẫn thành công và tạo lại file, không ném lỗi.** Nếu đĩa thật cũng vậy thì dòng "file bị xoá → báo lỗi" ở spec §3.2 và AC29 không làm được: phát hiện file đã mất cần `getFile()`, mà FR21 và NFR06 cấm đọc. Bước 1 đo trên đĩa thật; xem Risks.

**D. Concern 15: chưa trả lời.** Máy này không có giả lập. Bước 1 là cổng, thiếu môi trường nào thì dừng và báo originator trước khi viết mã.

### Trả lời Concern 12

`importVault` được viết độc lập trong `model.js` (nó cần thêm item vắng mặt, ghi bản file vào lịch sử, xử lý thùng rác, những việc `restoreSnapshot` của KM-009 không làm). Nếu KM-009 đã merge, phần "sống lại từ xoá trắng" dùng chung một hàm nội bộ; chưa thì KM-009 hoà vào sau. FR18 và AC23 không cần mã riêng: lần đẩy bình thường đã tạo bản cũ.

### Quyết định spec chưa nói, originator đã duyệt

Originator duyệt cả 11 quyết định dưới đây ngày 2026-11-02, không đổi quyết định nào.

1. **Hạn ghi là 14 giây, không phải 15.** Chờ 10 giây từ lần lưu cuối, nhưng không quá 14 giây từ lần lưu đầu chưa ghi. Để dành 1 giây cho dựng file và ghi, nên "≤ 15 giây" đo trên file vẫn đúng.
2. **`meta.mirror` thêm `name` và `fingerprint`** (SHA-256 của ciphertext đã có trong file, không có secret). Sửa 03. Không đổi phiên bản IndexedDB.
3. **Item không có tiêu đề** sang Bitwarden với tên `(không có tiêu đề)` và được nêu ở màn báo, vì tên rỗng làm hỏng cả file. Giao diện hiện đã bắt buộc tiêu đề, nên ca này chỉ đến từ dữ liệu import.
4. **Field `otp` đầu tiên không `parseOtp` được:** thành custom field ẩn, đếm ở FR35, thay vì đưa rác vào `login.totp`. FR32 ghi "field `otp` đầu tiên" mà không nói ca này.
5. **FR36 chỉ tác động lên Notes và giá trị trên 65 536 byte.** AC39 ghi "`notes` và field dài hơn giới hạn đã đo": field tới 64 KB hiện vẫn sang, chỉ có notes bị thay. Sẽ ghi Amendment vào `spec.md`.
6. **"Vault đang chờ xoá" (FR04):** plan KM-008 xoá ngay sau khi server xác nhận, không có trạng thái chờ. `buildBackup` chỉ bỏ dòng có `deletedAt` khác null; đối chiếu với mã thật ở bước 1.
7. **64 MB là 64 × 1024 × 1024 byte** (FR05, AC04).
8. **Trần body khi kiểm FR10:** kích thước JSON của body `PUT`/`POST` thật cộng 1 000 byte dự phòng, so với 2 000 000 byte ở 06.
9. **Tên vault có hậu tố vẫn trong 64 ký tự** của `KM-008-FR15`: cắt phần tên gốc trước khi thêm " (import)".
10. **Lệnh `npm run test:sync` của KM-006** được tính thêm vào danh sách ở NFR10, AC43.
11. **Con số xem trước có thể cũ** nếu đồng bộ chạy xen giữa lúc xem và lúc xác nhận. Thao tác chạy lại trên dữ liệu mới nhất trong `mutate` và thông báo kết quả theo số thật, không chặn; thao tác vẫn không làm mất gì.

### Originator đã chốt: giá trị Notes quá dài

Số đo cho thấy chỉ Notes bị giới hạn, còn custom field nhận được 64 KB, nên có phương án chuyển Notes quá dài sang custom field. **Originator chốt 2026-11-02: giữ theo FR36.** Notes quá dài được thay bằng một dòng báo, giá trị chỉ còn ở KeyMesh, và được liệt kê trước khi tải.

## 2. Files

Tên hàm, tệp của KM-006, KM-008, KM-009 lấy từ `plan.md` của các epic đó vì chưa có trên `master`; bước 1 đối chiếu với mã thật. Không thêm thư mục gốc, không có migration.

| Path | Change | Why |
|---|---|---|
| `src/public/js/core/model.js` | Sửa: `importVault`, `adoptVault`, hằng thời hạn thùng rác (dùng `TRASH_DAYS` của KM-008) | FR11–FR16 |
| `src/public/js/backup-file.js` | Mới, thuần: `BACKUP_MAX_BYTES`, `buildBackup(account, rows, now)`, `backupFileName(now)`, `parseBackup(text)` trả lý do cụ thể; kiểm `kdf.iter` bằng `KDF_MIN_ITER`, `KDF_MAX_ITER` trước khi hỏi mật khẩu | FR01, FR02, FR04, FR05 |
| `src/public/js/bitwarden-export.js` | Mới, thuần: `buildBitwardenExport(vault, newUuid)` trả `{ file, report }`; `BW_NOTES_MAX_BYTES`, `BW_VALUE_MAX_BYTES`. Dùng `parseOtp` từ `otp.js`, `itemLiveEnvs` từ `vault-query.js` | FR27, FR30–FR36 |
| `src/public/js/mirror.js` | Mới: `createMirror({ store, now, timers, isSupported })`; `enable(handle)`, `disable()`, `regrant()`, `resume()`, `status()`; lịch 10/14 giây; `fingerprint`; `createWritable`, `write`, `close`, `abort`. **Không gọi `getFile`** | FR19–FR26 |
| `src/public/js/store.js`, `testkit/memory-store.mjs` | Sửa: `onChange`; `commitImport({ newRows, updates })` một transaction; `readMirror`, `writeMirror`, `clearMirror` | FR10, FR20, FR25 |
| `src/public/js/session.js` | Sửa: `openBackup(parsed, password)`, `previewImport`, `commitImport` (trên hàng đợi của `mutate`, qua phép chặn lệch giờ của KM-008, dựng vault mới bằng `accountKey`), `backupParts()` | FR06–FR11, FR17 |
| `src/public/js/vault-query.js` | Sửa: đếm cho FR29 (lịch sử, thùng rác, fork của item sống) | FR29 |
| `src/public/js/app.js` | Sửa: action tải backup, import, export, bản sao; biến `importDraft` bỏ ở `lock()`; `mirror.resume()` sau mở khoá; vùng vẽ `mirror` | FR01, FR05–FR10, FR19, FR23, FR27, NFR02 |
| `src/public/js/auth.js` | Sửa nếu cần: `replaceAccount` gỡ `meta.mirror` cùng transaction (FR13 của KM-006 đã yêu cầu; bước 1 kiểm) | FR25 |
| `src/public/js/ui/dom.js`, `ui/detail.js` | Sửa: chuyển `download` của `detail.js` thành `saveBlob` dùng chung, thu hồi URL sau khi tải | FR01, FR27, FR37 |
| `src/public/js/ui/backup-dialog.js` | Mới: chọn vault, tải, câu FR03, cảnh báo FR04 | FR01–FR04 |
| `src/public/js/ui/import-dialog.js` | Mới: chọn file, mật khẩu, danh sách vault, đích, con số, xác nhận | FR05–FR10, FR17 |
| `src/public/js/ui/mirror-section.js` | Mới: phần trong Cài đặt: bật, tắt, chọn lại file, trạng thái, câu FR26 | FR19, FR22, FR26 |
| `src/public/js/ui/mirror-status.js` | Mới: báo ở màn chính và nút cấp lại quyền | FR22, FR23 |
| `src/public/js/ui/bitwarden-dialog.js` | Mới: nhập mật khẩu (`session.checkPassword` của KM-008), màn báo, tải | FR27–FR29, FR35–FR37 |
| `src/public/js/ui/settings-dialog.js`, `ui/shell.js`, `ui/account-dialogs.js` | Sửa: nhóm "Dữ liệu"; gắn `mirror-status`; câu "file trên đĩa vẫn còn" khi có bản sao | FR19, FR23, FR25 |
| `src/public/styles.css`, `src/public/sw.js` | Sửa CSS; sinh lại bằng `npm run sw-version` (tệp mới vào `SHELL`) | NFR08, KM-004 |
| `testkit/e2e/driver.mjs`, `testkit/sync-devices.mjs` | Sửa: thư mục tải theo trang; `stubSavePicker()` qua CDP trả handle OPFS thật và theo dõi mọi lời gọi file, nằm ngoài `src/` | FR39, NFR06, NFR11 |
| `testkit/backup-fixtures.mjs` | Mới: dựng file hợp lệ, file hỏng, `envvault.html`, file Bitwarden, `v` = 1, `kdf.iter` = 100, 64 MB + 1, vault hỏng 1 byte | AC03, AC04 |
| `testkit/vaultwarden-check.mjs` | Mới: chạy Vaultwarden trong Docker với TLS tự ký, tạo tài khoản, tổ chức, import một file, in collection, item, OTP. Dùng `docker` và `bw` trên máy kiểm, **không vào `package.json`**, không thuộc `npm test` | AC39, AC47, Concern 16 |
| `test/import-vault.test.js`, `test/backup-file.test.js`, `test/bitwarden-export.test.js`, `test/mirror.test.js` | Mới; hai tệp thuần đầu cũng chạy trên `test:browser` | FR39 |
| `test/session.test.js`, `test/store.test.js`, `test/vault-query.test.js`, `test/model.test.js` | Sửa: thêm trường hợp mới | FR10, FR29 |
| `test/ui-static.test.js`, `test/e2e/sweep.e2e.js` | Sửa: bỏ đúng `backup`, `sao lưu`, `import`, `export`; thêm test `mirror.js` không chứa `getFile`, `createReadable`, `.text(` | FR21, FR38 |
| `test/sync/{backup,import,import-merge,mirror,bitwarden,km010-privacy,km010-perf}.sync.js` | Mới: trình duyệt thật trên server cục bộ thật | FR39 |
| `docs/02,03,04,05,07,08,09` | Sửa theo FR41, gồm các quyết định ở §1 | FR41 |
| `docs/epics/KM-010/KM-010.md`, `KM-014/KM-014.md`, `KM-003/artifacts/spec.md`, `KM-008/artifacts/spec.md` | Sửa: phụ thuộc, "Xong khi", FR42, ghi chú FR47, `KM-008-AC70` | FR38, FR41, FR42 |
| `docs/epics/KM-010/artifacts/spec.md` | Sửa: Amendment FR36/AC39; thêm AC29 nếu bước 1 cho kết quả khác | §1 |
| `docs/epics/KM-010/artifacts/implement.md` | Mới: output, số đo, bảng kiểm tay từng mục, từng môi trường | FR40, AC43 |

## 3. Order

Làm trên nhánh `feat/KM-010-backup`, trên Mac.

1. **Cổng, trên Mac.** (a) KM-006, KM-008 đã merge; ghi KM-009 đã merge hay chưa. Đối chiếu tên thật với §2, gồm `replaceAccount` có gỡ `meta.mirror` không. Chạy mọi lệnh test để có mức nền. (b) **Concern 15:** tải một file và chọn một file trên giả lập Android và iOS, cả tab lẫn app đã cài; lấy file ra và đưa file vào (dự kiến `adb pull`, `adb push`; iOS kéo thả vào Simulator và app Files; chưa kiểm). (c) **Đĩa thật trên Chrome desktop:** ghi vào file đã xoá, file đã chuyển chỗ, thư mục đã xoá; `queryPermission` sau khi khởi động lại trình duyệt, kể cả khi đã chọn "cho phép mọi lần". (d) **Concern 16:** Docker trên Mac, chạy lại phép đo của §1 B, thử import qua giao diện web. *Sau bước này:* biết plan còn đúng. **Thiếu phần nào, hoặc (c) không báo lỗi được khi file bị xoá, thì dừng và báo originator, không viết mã.**
2. **Vòng phản hồi.** `driver.mjs`, `backup-fixtures.mjs`, một test khói: tải file, đưa file vào ô chọn, picker giả ghi được vào OPFS. *Sau bước này:* viết được test AC.
3. **Lõi.** `importVault`, `adoptVault`, test mọi ô FR12 và mọi tổ hợp với thay đổi chờ trên `merge.js` thật, sửa 09. *Sau bước này:* AC10–AC17, AC20–AC22 đúng ở mức hàm, trên Node và trình duyệt; `merge.js`, vector không đổi.
4. **Hàm định dạng.** `backup-file.js`, `bitwarden-export.js`, đếm ở `vault-query.js`. *Sau bước này:* AC04, AC35–AC39 đúng ở mức hàm.
5. **Kho và phiên.** `commitImport`, `onChange`, các hàm `meta.mirror`, `openBackup`, `previewImport`. *Sau bước này:* trên Node, import trọn vẹn kể cả khi hỏng lần ghi; app trông như trước, mọi test cũ xanh.
6. **`mirror.js`.** Test với đồng hồ truyền vào và handle giả: lịch 10/14 giây, `fingerprint`, ghi bù, mất quyền, lỗi ghi, `abort`. *Sau bước này:* FR20–FR24 đúng trên Node, chưa nối vào app.
7. **Giao diện backup và import.** Action, `saveBlob`, hai hộp thoại, bỏ từ cấm, `backup.sync.js`, `import.sync.js`, `import-merge.sync.js`. *Sau bước này:* AC01–AC23, AC41 xanh.
8. **Giao diện bản sao.** Nối `mirror`, `mirror-section`, `mirror-status`, câu xác nhận, `mirror.sync.js`. *Sau bước này:* AC24–AC32 xanh, trừ phần cần đĩa thật ở AC46.
9. **Export Bitwarden.** `bitwarden-dialog.js`, `vaultwarden-check.mjs`, `bitwarden.sync.js`. *Sau bước này:* AC33–AC40 xanh; file mẫu qua `vaultwarden-check.mjs`.
10. **Bộ đầy đủ.** `km010-privacy`, `km010-perf`, phép kiểm bàn phím, `sw-version`. *Sau bước này:* AC42–AC44 xanh, có số đo NFR05, NFR07.
11. **Tài liệu.** FR41, FR42, Amendment. *Sau bước này:* AC48 đọc lại được; chạy lại AC43.
12. **Originator kiểm tay** AC45–AC47 trên Mac, ghi từng mục, từng môi trường vào `implement.md`. Lỗi tìm thấy thì sửa kèm test.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — step 1: biết các điều kiện ngoài mã có đạt không. Dừng ở đây nếu không.

**Batch 2** — steps 2–3: có vòng test; thao tác import đúng trên `merge.js` thật; `npm test`, `test:browser` xanh.

**Batch 3** — steps 4–6: định dạng file, kho, phiên, mirror đúng trên Node; app trông như trước, mọi bộ test cũ xanh.

**Batch 4** — step 7: backup và import dùng được từ đầu tới cuối trên hai trình duyệt.

**Batch 5** — step 8: bản sao dùng được trên Chrome.

**Batch 6** — step 9: export Bitwarden dùng được; Vaultwarden nhận file.

**Batch 7** — steps 10–11: toàn bộ test tự động xanh, có số đo, tài liệu khớp.

**Batch 8** — step 12: phần của originator, không phải phiên agent.

## 4. Risks

Phiên này không có công cụ `codegraph`. Phạm vi ảnh hưởng lấy bằng đọc mã và `rg`: `session.*` chỉ được gọi từ `app.js`, `test/session.test.js`, `test/store.test.js`; `download` chỉ nằm trong `detail.js`; `openDialog` đã tự đóng khi khoá nhờ `addDisposer`. Phạm vi của `session.js`, `store.js` phải đo lại ở bước 1 vì KM-006, KM-008 viết lại chúng.

| Risk | Likelihood | What we do about it |
|---|---|---|
| **Ít chắc nhất:** đĩa thật giống OPFS: `createWritable` tạo lại file đã xoá, không có lỗi. AC29 không đạt được nếu không đọc file | Cao, đã thấy trên OPFS | Bước 1 (c) đo. Nếu đúng thì quay lại originator; hướng đề xuất: coi file được tạo lại là đạt, vì người dùng vẫn có bản mới nhất. Không tự thêm `getFile` (FR21) |
| **Ít chắc nhất:** tải và chọn file trên giả lập, nhất là `<a download>` Blob trong app đã cài trên iOS | Trung bình, chưa đo | Bước 1 (b) là cổng. Không đạt thì originator quyết, không tự thu hẹp NFR09. `navigator.share` là phương án để hỏi, chưa nằm trong plan |
| **Khó đảo ngược:** import ghi nhầm vào vault đang có và lan sang máy khác | Thấp | Con số trước khi xác nhận; mọi giá trị còn trong lịch sử; AC18 so kho từng byte ở các nhánh thất bại; bản cũ trên server khi có KM-009. Chỉ có dữ liệu thử |
| **Khó đảo ngược:** file export không mã hoá nằm trên đĩa máy kiểm | Chắc chắn khi kiểm | Chỉ dữ liệu thử; test xoá file trong thư mục tạm; `implement.md` ghi đã xoá (NFR12) |
| Mã KM-006, KM-008 khác plan của chúng | Trung bình | Bước 1 là cổng; lệch thì ghi amendment, không tự đoán |
| Đổi `session.js`, `store.js` làm hỏng màn hình và test đã có | Thấp | Chỉ thêm phương thức. `onChange` gọi sau commit, lỗi của bên nghe không ảnh hưởng lần ghi. Không sửa test cũ để cho xanh |
| `onChange` gọi trong lúc mirror tự ghi `meta.mirror` tạo vòng lặp | Trung bình nếu không để ý | Ghi `meta.mirror` không phát `onChange`; `fingerprint` là lớp chặn thứ hai. Test đếm số lần ghi |
| Bản sao ghi đè file của tài khoản trước, vì lần ghi đang chờ chạy sau khi thay tài khoản | Thấp | Đọc lại `meta.mirror` ngay trước khi ghi; đã gỡ thì không ghi. AC32 so file từng byte |
| Timer bị trình duyệt làm chậm khi tab ở nền, vượt 15 giây | Trung bình | NFR05 đo ở foreground theo spec. Lượt ở nền chỉ nhận thay đổi đồng bộ. Về foreground thì kiểm ngay; ghi kết quả vào `implement.md` |
| Picker giả dùng OPFS không chứng minh hành vi đĩa thật | Chắc chắn | Test tự động cho logic, AC46 và bước 1 (c) cho đĩa thật và khởi động lại trình duyệt |
| Vaultwarden bản khác hành xử khác số đo | Trung bình theo thời gian | Ghi phiên bản; `vaultwarden-check.mjs` chạy lại được; hằng số một chỗ; bước 1 (d) đo lại trên Mac |
| Web vault xử lý khác CLI | Thấp, cùng thư viện, cùng phiên bản | Bước 1 (d), AC47 làm qua giao diện web |
| Thay đổi chờ của máy khác làm con số xem trước sai | Thấp | Quyết định 11 |
| Parse JSON 64 MB treo tab | Thấp | Đã chấp nhận ở Concern 10; không ghi gì. Đo ở `km010-perf`, ghi số |
| Chữ giao diện dính từ còn cấm ở thời điểm merge ("tag", "passkey"…) | Trung bình | `ui-static.test.js` chặn; dùng đúng chữ của spec |

## 5. Proofs

"Node" là `npm test`, "sync" là `npm run test:sync -- <tệp>`, "tay" là originator ở bước 12. Output ghi vào `implement.md`. Mỗi tệp sync kiểm thêm: không vi phạm CSP, không có secret trong log. Test đặt tên `KM-010 ACnn …`. Đếm request bằng CDP.

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-010-AC01` | Hai vault có chuỗi đánh dấu và thay đổi chờ; tải một, tải tất cả; kiểm định dạng 03, số vault, giải mã thấy thay đổi chờ; dò gốc, base64, hex; đếm request = 0; tên file | Node `backup-file`; sync `backup` |
| `KM-010-AC02` | Tải, đổi mật khẩu, import: cũ mở, mới báo sai; có câu FR03. Chạy khi có KM-009, chưa có thì đổi bộ khoá bằng `core/` trong test | sync `backup` |
| `KM-010-AC03` | Sửa 1 byte dòng vault qua IndexedDB; tải tất cả; có câu báo; import: vault đó không chọn được, các vault khác chọn được | sync `backup` |
| `KM-010-AC04` | Mỗi file trong `backup-fixtures`: có câu báo, không có ô mật khẩu; theo dõi `crypto.subtle.deriveBits` = 0; kho không đổi | Node `backup-file`; sync `import` |
| `KM-010-AC05` | File của tài khoản khác: sai rồi đúng; tên vault và số item; kho không đổi; quét mọi kho, console, URL không có mật khẩu file | sync `import` |
| `KM-010-AC06` | Hồ sơ Chrome mới, mật khẩu khác; import vault mới; khoá, mở; so item, env, lịch sử, thùng rác, fork; mật khẩu file không mở được | sync `import` |
| `KM-010-AC07` | File 3 vault: chọn cả 3 thì không có đích "vault đang chọn"; 3 id mới; chọn 1 thì có cả hai đích | Node `session`; sync `import` |
| `KM-010-AC08` | Cùng file vào vault mới ở hai tài khoản đăng ký trên cùng server; đồng bộ; 0 `409`; máy kia mở được | sync `import` |
| `KM-010-AC09` | Tên trùng, khác hoa thường: hậu tố, không gộp, `scopes` trỏ đúng; tên 64 ký tự vẫn hợp lệ | Node `import-vault`; sync `import` |
| `KM-010-AC10` | Sửa X sau lúc tải, import, đồng bộ hai máy: bản file ở cả hai, đầu lịch sử có nhãn "Khôi phục", env giữ, không đánh dấu | Node `import-vault`; sync `import-merge` |
| `KM-010-AC11` | Bảng mọi ô FR12: trạng thái và số đếm khớp; không item sống nào biến mất | Node `import-vault`; sync `import-merge` |
| `KM-010-AC12` | Hai ca thùng rác: trạng thái giữ, bản file trong lịch sử | Node `import-vault` |
| `KM-010-AC13` | Item thêm sau, giống hệt, xoá trắng trong file: so từng byte trước và sau | Node `import-vault` |
| `KM-010-AC14` | Import lại: báo không có gì, không có nút xác nhận, `store.writes` không đổi, 0 `PUT` | Node `session`; sync `import-merge` |
| `KM-010-AC15` | 15 + 15: 20 bản, thứ tự, không trùng khoá, bản vừa bị thay có mặt; thêm ca bản file có `at` ở tương lai | Node `import-vault` |
| `KM-010-AC16` | Bốn ca project, env; item trở lại đúng chỗ qua `queryItems` | Node `import-vault`; sync `import-merge` |
| `KM-010-AC17` | 40 ngày và 5 ngày, `now` truyền vào; chạy `purgeExpired` của KM-008 ngay sau; item còn, số ngày còn đúng | Node `import-vault`; sync `import-merge` |
| `KM-010-AC18` | Store hỏng lần ghi; vault vượt 2 000 000 byte; khoá trước xác nhận; sửa `X-Server-Time` qua CDP: mỗi ca có báo, so dump kho từng byte | Node `session`; sync `import` |
| `KM-010-AC19` | CDP offline và đóng trang ngay sau xác nhận; mở lại, có mạng: SQLite có kết quả, đúng một version mới | sync `import-merge` |
| `KM-010-AC20` | Mọi tổ hợp thay đổi chờ, hai thứ tự đồng hồ, hai chiều gộp; thêm bản hai máy thật | Node `import-vault`; sync `import-merge` |
| `KM-010-AC21` | B chuyển vào thùng rác, xoá trắng; A chưa có item; so với bảng 05; có badge `purgedAt` khi có gộp thật | Node `import-vault`; sync `import-merge` |
| `KM-010-AC22` | Hai máy CDP offline cùng import, có mạng: giống nhau, 0 đánh dấu, không item đôi | Node `import-vault`; sync `import-merge` |
| `KM-010-AC23` | Có KM-009: bản trước import có trong danh sách và khôi phục được. Chưa có: ghi chưa kiểm | sync `import-merge`; `implement.md` |
| `KM-010-AC24` | Picker giả: ghi ngay, file hợp lệ, dò NFR01; picker ném `AbortError`: vẫn tắt; tắt: không ghi, file còn. Đĩa thật ở AC46 | sync `mirror` |
| `KM-010-AC25` | Chrome với `page.phone()` có cảm ứng, và xoá `showSaveFilePicker`: không có tuỳ chọn, có tải backup. Firefox, Safari, giả lập do tay | sync `mirror`; tay |
| `KM-010-AC26` | Đồng hồ truyền vào cho từng ca; thật: 20 lần đo gồm 5 lần sửa mỗi 3 giây, nhận từ máy khác, đổi tên vault, đổi mật khẩu; đồng bộ không đổi gì: 0 lần ghi | Node `mirror`; sync `mirror` |
| `KM-010-AC27` | Sửa, chờ, lấy file từ OPFS, import vào hồ sơ khác bằng mật khẩu file: thấy thay đổi | sync `mirror` |
| `KM-010-AC28` | Theo dõi `getFile`, `createReadable`, `FileReader` qua CDP: 0 lần; đặt nội dung lạ vào file: vault không đổi. Test tĩnh trên `mirror.js` | Node `ui-static`; sync `mirror` |
| `KM-010-AC29` | Picker giả ném `QuotaExceededError`, `NotFoundError`, `NoModificationAllowedError`: báo lỗi và thời điểm; file cũ nguyên; lưu, đồng bộ vẫn chạy; hết lỗi thì ghi được. Xoá file thật: theo kết quả bước 1 (c) | Node `mirror`; sync `mirror`; tay |
| `KM-010-AC30` | Đổi `queryPermission` qua CDP thành `prompt`: có đúng câu và nút, `requestPermission` = 0 lần tới khi bấm; từ chối; cấp thì ghi ngay. Khởi động lại thật ở AC46 | sync `mirror`; tay |
| `KM-010-AC31` | Khoá trước 10 giây: file vẫn được ghi. Đóng trang trước 10 giây, mở khoá: ghi trong ≤ 15 giây | Node `mirror`; sync `mirror` |
| `KM-010-AC32` | Đăng xuất giữ dữ liệu, sửa: vẫn ghi. Thay tài khoản, xoá dữ liệu: có câu báo; so file từng byte; tuỳ chọn tắt; quét `KM-006-NFR04` | sync `mirror` |
| `KM-010-AC33` | Sai mật khẩu; mở bằng passkey trên authenticator ảo; CDP offline; khoá giữa chừng: đúng từng ca; đếm request = 0; thư mục tải rỗng | sync `bitwarden` |
| `KM-010-AC34` | 7, 2, 1 trên màn báo; chưa có file; so kho từng byte | Node `bitwarden-export`; sync `bitwarden` |
| `KM-010-AC35` | Đọc file tải về: `collectionIds`, "Chưa gán", env trống, không có env đã xoá | Node `bitwarden-export`; sync `bitwarden` |
| `KM-010-AC36` | Dò chuỗi đánh dấu; vault chỉ có thùng rác: báo, không có file | Node `bitwarden-export`; sync `bitwarden` |
| `KM-010-AC37` | Bảng ánh xạ login, đổi nhãn, 2 URL, 2 `otp` | Node `bitwarden-export` |
| `KM-010-AC38` | 8 loại × 6 `kind`, nhiều dòng, `expires`; số đếm | Node `bitwarden-export` |
| `KM-010-AC39` | Notes 7 439 byte giữ, 7 440 byte thay, cả ký tự nhiều byte; field 64 KB giữ; trên 65 536 byte thay; màn báo không hiện giá trị; file qua `vaultwarden-check.mjs` | Node `bitwarden-export`; lệnh trên Mac |
| `KM-010-AC40` | Sau khi tải: quét trạng thái, IndexedDB, `localStorage`, Cache Storage; URL Blob đã thu hồi; không có bản ghi export | sync `bitwarden` |
| `KM-010-AC41` | `git diff` hai danh sách cấm chỉ bỏ các từ đó; test dương tính cho từ còn lại | Node `ui-static`; `test:e2e` `sweep`; `git diff` |
| `KM-010-AC42` | Sau chuỗi §3.1: dò file, mọi kho, console, URL, SQLite, tệp dữ liệu server; tên chứa `<img src=x onerror=…>` ở vault, item, project: hiện chữ, 0 phần tử, 0 vi phạm CSP | sync `km010-privacy` |
| `KM-010-AC43` | Chạy `npm test`, `test:browser`, `test:e2e`, `test:server`, `test:sync`, `vectors`; `git diff --stat master -- src/public/js/core/merge.js testkit/vectors.js src/public/_headers src/functions src/migrations` rỗng; `dependencies` rỗng; `rg` không có cờ test; số đo NFR05, NFR07 | Lệnh, dán output; reviewer đọc |
| `KM-010-AC44` | Đi hết các màn mới chỉ bằng phím, kiểm tên, `role`, `status`/`alert`, đo 44 px trên `page.phone()`; trình đọc màn hình do tay | sync `km010-privacy`; tay |
| `KM-010-AC45` | Originator: 3.1 bước 1–3, hai cặp, file tạo ở máy này import ở máy kia | Bước 12, `implement.md` |
| `KM-010-AC46` | Originator: 3.1 bước 4–5 trên Chrome desktop, đĩa thật, khởi động lại trình duyệt thật | Bước 12, `implement.md` |
| `KM-010-AC47` | Originator: Vaultwarden cục bộ trên Mac, import qua giao diện web; "Partner X" trong 2 collection; OTP base32 và URI khớp cùng chu kỳ; item chưa gán có mặt; ghi phiên bản | Bước 12, `implement.md` |
| `KM-010-AC48` | Verifier đọc `KM-010.md`, 02–09, `KM-003`, `KM-014.md` | Bước 11, verifier |

## 6. Feedback loop

Vòng test có sẵn sau KM-006, tất cả chạy trên Mac.

- **Lõi và logic:** `node --test test/import-vault.test.js test/mirror.test.js test/bitwarden-export.test.js`, trên `merge.js` thật, đồng hồ truyền vào, handle giả.
- **Thật:** `npm run test:sync -- <tệp>`, hai hồ sơ Chrome trên `wrangler pages dev` thật; lỗi tạo từ ngoài bằng CDP và SQLite, không có cửa sau trong `src/` (NFR11).
- **Giao diện:** `page.shot()` ở desktop và `page.phone()`.
- **Đĩa thật:** Chrome desktop có giao diện, bằng tay, ở bước 1 và bước 12.
- **Vaultwarden:** `node testkit/vaultwarden-check.mjs <file>`.
- **Giả lập:** `npm run dev:server`, `adb reverse`, `testkit/device-gate.mjs`.
- Hết mỗi batch: chạy mọi lệnh ở AC43, `npm run sw-version` nếu có tệp mới.

## 7. Deliberately not doing

- Không đổi `merge.js`, vector, server, migration, CSP, `Permissions-Policy`. Concern 17 cho thấy không cần nới.
- Không gọi `getFile` để phát hiện file đã xoá, kể cả nếu bước 1 cho thấy cần: việc đó quay lại originator.
- Không thêm `bw`, Docker hay bất cứ thứ gì vào `package.json`; không đưa `vaultwarden-check.mjs` vào `npm test`.
- Không chia nhỏ hay đính kèm giá trị quá dài; không làm item type Card, Identity, SSH key của Bitwarden (spec §7).
- Không tự xoá file export; không lưu lịch sử export.
- Không chuyển giải mã hay parse file sang Web Worker: đo ở `km010-perf`, vượt ngưỡng thì báo originator.
- Không làm `navigator.share` cho tải file trên iOS, trừ khi originator chọn sau bước 1.
- Không sửa testkit cho Windows: máy này chỉ lên plan. Các phép đo ở §1 làm trong scratchpad, không vào repo.
- Không làm mọi mục ở `spec.md` §7 Out of scope, gồm mọi việc Cloudflare thật, thuộc `KM-014` (FR42).
