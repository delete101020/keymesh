# Implementation Plan — Bảo mật tài khoản: đổi mật khẩu, thiết bị, snapshot

**Epic ID:** `KM-009`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `spec.md`

---

## 1. Approach

Epic gồm bốn phần, dùng chung một migration và một module server cho nhật ký. **Server** thêm 6 thao tác và bắt đầu ghi `dt_vault_snapshot`, `dt_audit_log`. Mọi việc phải trọn vẹn đều nằm trong một `batch()`, gồm cả dòng nhật ký (FR37), nên test tạo lỗi bằng trigger SQLite được, không cần cửa sau. **Lõi** thêm một thao tác thuần `restoreSnapshot` trong `model.js`; `merge.js` và vector không đổi. **Client** đặt đổi mật khẩu vào `session.js`, vì đây là nơi duy nhất được cầm khoá (quy tắc của plan KM-006). `sync.js` chỉ nhận thêm móc nối, không cầm khoá. **Giao diện** có bốn hộp thoại mới, mở từ Cài đặt.

**Phụ thuộc thật:** `api.js`, `auth.js`, `sync.js`, `session.js` nhiều vault và `meta.session` chưa có trong mã. Chúng là sản phẩm của KM-006, còn `meta.passkey` của KM-007. Hai epic đang ở `implement`, nên mọi tên trong plan này lấy từ `plan.md` của chúng, không phải từ mã. Bước 1 là cổng chặn: chưa merge thì không làm, và phải đối chiếu lại tên thật. Máy Windows chỉ lên plan, implement và kiểm tay chạy trên Mac.

**Phương án bị loại:**

- **Khôi phục bằng endpoint riêng trên server.** Trái Concern 1 (d): khôi phục là một lần lưu trên máy, và server không giải mã được. Dòng nhật ký đi kèm lần `PUT` mang kết quả.
- **Endpoint riêng để báo dòng `snapshot_restore`.** Có thêm một đường có thể mất giữa hai request, trong khi FR37 cần "đi kèm lần đẩy". Thay bằng trường `restoredFrom` của `PUT`, ghi cùng `batch()`.
- **Giữ `accountKey` trong `state` để đổi mật khẩu.** Trái `KM-007-NFR02`. Người dùng vừa nhập mật khẩu hiện tại, nên mở lại `accountKey` vào biến cục bộ của đúng lần đổi là đủ.
- **Tra tên thiết bị của bản cũ qua `dt_session`.** Phiên có thể đã mất (FR23), nên tên được chép vào dòng.

### Kết quả chạy thử (2026-11-02, `merge.js` và `model.js` thật)

Item đã xoá trắng sống lại với id cũ, máy B có thay đổi chờ ở một item khác. `merge` đi vào `mergePurge`, nên W có `conflict.attrs = ['purgedAt']`. Item trong thùng rác quay lại thì không có đánh dấu. Hai chiều gộp cho cùng nội dung, không mất gì. Chiều A nhận `409` rồi gộp cũng ra đánh dấu đó.

**Điều này trái `KM-009-FR31` và câu `merge(b, b, r) == r` ở `docs/05-sync.md` dòng 157.** Câu ở 05 chưa từng bị trái vì model hiện không có đường sống lại từ `purgedAt`. Máy không có thay đổi chờ không gặp, vì 05 ghi `local = base = remote`, không gọi `merge`.

**Originator chốt (2026-11-02): giữ id, nhận badge.** Chỉ đúng item sống lại từ xoá trắng có badge, chỉ khi có lần gộp thật, bấm "Đã xử lý" là hết. FR31 thêm ngoại lệ hẹp này (Amendment 1, ghi vào `spec.md` ở bước 12, cùng 05 và 09). Không đổi `merge.js`.

### Cách làm cho các mục spec hoãn tới build-plan

| Concern | Cách làm |
|---|---|
| **6** (thiết bị của bản cũ) | Migration `0002`: `dt_vault.updated_by_device`, `dt_vault_snapshot.device_name`, `dt_vault_snapshot.size`. Mỗi lần ghi vault chép tên thiết bị của phiên vào `updated_by_device`; lúc bị thay, tên đó và `updated_at` của version này theo sang dòng bản cũ. `created_at` của bản cũ là lúc **bản đó được ghi** (FR23), không phải lúc bị thay như 05 đang ghi. `size` là cột riêng vì `length(blob)` phải đọc cả blob |
| **8** (đăng nhập sai không lộ username) | Chỉ khi username có thật và `recordFailure` đã qua: `waitUntil(ghi dòng)`, rồi ném `invalid_credentials` như cũ. Lỗi ghi chỉ log tên lỗi. Lần bị chặn không tới dòng này. Đo lại theo NFR03 |
| **10** (báo khôi phục) | `PUT /api/vaults/:id` nhận thêm `restoredFrom: [version…]`, tối đa 10 số nguyên dương. Mỗi số một dòng `snapshot_restore` trong cùng `batch()`, chỉ khi lần ghi thành công. Trên máy, `row.restoredFrom` được ghi cùng transaction với kết quả khôi phục, và chỉ xoá khi nhận `200` hoặc khi `dirty` được xoá vì bản đã lên server. Mất phản hồi rồi gửi lại thì trùng dòng, spec đã chấp nhận |
| **13** (ghi nhớ "chưa xác nhận") | Khoá mới `meta.passwordChange = { salt: <salt cũ>, at }`, không có mật khẩu hay khoá, không đổi phiên bản IndexedDB. Ghi **trước** khi gửi; xoá cùng transaction khi có kết quả. Đầu mỗi lượt của `sync.js`, nếu có marker thì gọi `prelogin`: salt như cũ thì mật khẩu cũ còn hiệu lực; salt khác thì đặt `needsLogin` và báo. Chỉ chạy khi đang mở khoá, nên màn khoá vẫn 0 request (`KM-006-FR15`) |
| **15** (mã lỗi sai mật khẩu hiện tại) | `403 wrong_password`, mã mới, câu cố định. Không dùng `401` vì client hiểu là mất phiên. Quá ngưỡng thì `429` kèm `Retry-After` |
| **24** (nối thiết bị, cắt mạng) | Dùng lại kết quả bước 1 của KM-006: `adb reverse` cho Android, `testkit/device-gate.mjs` cho iOS. Thiếu phần nào thì báo originator (FR41) |

### Quyết định spec chưa nói, cần originator duyệt cùng plan

1. **AC07 và AC08 không phân biệt được chỉ bằng `fetch`:** server tắt và phản hồi bị cắt đều ra `TypeError`. Vì vậy trước `POST` luôn gọi `GET /api/prelogin`. Lần này lỗi nghĩa là request chưa đi, báo "mật khẩu cũ vẫn có hiệu lực", không ghi marker (AC07). Qua được rồi mà `POST` lỗi hoặc `5xx` thì là "chưa xác nhận" (AC08, AC09). Salt trả về khác salt trên máy thì dừng, xử lý như đã đổi ở máy khác.
2. **Đang "chưa xác nhận" thì không có thao tác đổi mật khẩu.** Nếu server đã đổi mà thử lại bằng mật khẩu cũ, lần đó bị tính là sai và có thể khoá đăng nhập 15 phút.
3. **Lần thắng được nhận biết bằng stamp mới.** Mọi câu trong `batch()` đổi mật khẩu đều kèm điều kiện `security_stamp = <stamp mới của request này>`. Lần thua không tạo phiên, không xoá phiên, không ghi nhật ký, và nhận `401` (FR16).
4. **Phiên cũ bị xoá hẳn khi đổi mật khẩu,** không chỉ vô hiệu qua stamp. `GET /api/sessions` vẫn lọc theo stamp và `expires_at` vì AC22 đặt sẵn phiên như vậy trong kho.
5. **FR10 dùng hai lớp.** `store.markNeedsLogin(tokenUsed)` chỉ ghi nếu token trong kho vẫn là token của request bị `401`, trong một transaction. Trong lúc `POST` đổi mật khẩu đang chạy, `sync.js` tạm không xử lý `401`, chờ có kết quả rồi xét lại.
6. **Lần ghi kết quả đổi mật khẩu vẫn chạy khi app vừa khoá.** Closure chỉ giữ bản bọc, `kdf` và token, không giữ khoá, nên không cần `state`. Như vậy khoá app ngay sau khi server ghi vẫn ra đủ bộ mới. Đóng app thì còn đủ bộ cũ kèm marker (AC11).
7. **Item sống lại từ xoá trắng lấy nội dung, env, tag, `fieldOrder` và cả `history` của bản cũ,** mọi đồng hồ là đồng hồ mới, `rev` nối tiếp tombstone. FR28c không nói về `history`; giữ vì đây là dữ liệu duy nhất còn lại của item.
8. **Thu hồi chính phiên đang dùng qua API** xoá phiên, trả `204`, không ghi dòng (Concern 9).
9. **Id phiên sai dạng hay `:version` không phải số** đều ra `404 not_found`, cùng byte với id không tồn tại (AC26).
10. **Nhật ký thêm cột `failed`** (`0`/`1`) để cắt 1 000 dòng và ẩn nhóm sai bằng index, không quét danh sách `action`. `deviceName` nằm trong `meta` JSON của dòng. Phân trang bằng `before=<id>`, vì `at` có thể trùng. Tên hành động: `login`, `login_fail`, `password_fail`, `session_revoke`, `password_change`, `snapshot_restore`.
11. **Tên thiết bị** có dạng `Mac · Chrome`, `Android · Chrome`, `iPhone · Safari`, suy từ `navigator.userAgent` truyền vào hàm thuần. Không nhận ra thì không gửi, và phiên hiện "Thiết bị không rõ".

## 2. Files

Không thêm thư mục gốc. Không đổi phiên bản IndexedDB. Không có thay đổi dưới đây chạm `merge.js`, `testkit/vectors.js`, `_headers`.

| Path | Change | Why |
|---|---|---|
| `src/migrations/0002_security_history.sql` | Mới: ba cột ở Concern 6; `dt_audit_log.failed`; thay index cũ bằng `(user_id, id)` và `(user_id, failed, id)`. KM-008 lấy số `0002` trước thì đổi số | FR22, FR23, FR38 |
| `src/functions/api/_audit.js` | Mới: tạo câu ghi dòng kèm câu cắt theo nhóm; `GET /api/audit` | FR34–FR39 |
| `src/functions/api/_sessions.js` | Mới: `GET`, `DELETE /api/sessions` | FR17, FR19, FR21 |
| `src/functions/api/_snapshots.js` | Mới: danh sách và một bản, kiểm chủ vault trước | FR24, FR25 |
| `src/functions/api/_account.js` | Mới: `POST /api/account/password` | FR04–FR07, FR16 |
| `src/functions/api/_auth.js` | Sửa: `authenticate` trả thêm `device_name`; `login` ghi nhật ký; `register` ghi `updated_by_device` | FR34, FR36, FR37 |
| `src/functions/api/_vaults.js` | Sửa: `writeVault` thành `batch()` giữ bản cũ, cắt còn 30, `restoredFrom`; `createVault` ghi `updated_by_device` | FR22, FR23, FR37 |
| `src/functions/api/_validate.js` | Sửa: `checkExactKdf` (đúng 600 000), `checkRestoredFrom` | FR07 |
| `src/functions/api/_http.js` | Sửa: thêm `wrong_password` | FR06 |
| `src/functions/api/[[route]].js` | Sửa: thêm 6 route; `match` trả tham số theo tên, chỉ route vault mới kiểm id vault | 06 |
| `src/public/js/core/model.js` | Sửa: thêm `restoreSnapshot(vault, snapshot, ctx)`, trả số đếm | FR25, FR27–FR30 |
| `src/public/js/device-name.js` | Mới: hàm thuần | FR18 |
| `src/public/js/store.js`, `testkit/memory-store.mjs` | Sửa: `commitPasswordChange`, `commitRelogin`, đọc/ghi/xoá `meta.passwordChange`, `markNeedsLogin(tokenUsed)`, `restoredFrom` trên dòng vault | FR05, FR09, FR10, FR14, FR27 |
| `src/public/js/session.js` | Sửa: `changePassword`, `openSnapshot`, `restoreSnapshot`, kiểm bộ khoá mới mở được mọi vault | FR02, FR05, FR14, FR25, FR27 |
| `src/public/js/api.js` | Sửa: 6 thao tác; `putVault` nhận `restoredFrom`; `deviceName` khi đăng ký, đăng nhập | FR18, 06 |
| `src/public/js/auth.js` | Sửa: nhánh cùng `userId` khác bộ khoá; giải quyết marker | FR09, FR14 |
| `src/public/js/sync.js` | Sửa: móc kiểm marker đầu lượt; giữ `401` khi đang đổi; so token; gửi và xoá `restoredFrom` | FR09, FR10, FR37 |
| `src/public/js/app.js` | Sửa: action đổi mật khẩu, thiết bị, bản cũ, nhật ký; bỏ bản đang xem khi khoá | FR01, FR25, NFR02 |
| `src/public/js/ui/password-dialog.js` | Mới | FR01–FR03, FR08 |
| `src/public/js/ui/devices-dialog.js` | Mới | FR17, FR19–FR21 |
| `src/public/js/ui/snapshots-dialog.js` | Mới: danh sách, xem chỉ đọc, xác nhận khôi phục | FR24–FR27 |
| `src/public/js/ui/audit-dialog.js` | Mới | FR39 |
| `src/public/js/ui/detail.js` | Sửa nếu cần: export phần vẽ field chỉ đọc (che secret, OTP chỉ hiện mã) để màn xem dùng lại, không chép logic | FR25 |
| `src/public/js/ui/settings-dialog.js` | Sửa: nhóm "Bảo mật" dẫn tới bốn hộp thoại | FR01, FR17, FR24, FR39 |
| `src/public/js/ui/gate.js` | Sửa: gợi ý và lối đăng nhập điền sẵn username sau khi sai mật khẩu | FR15 |
| `src/public/js/ui/sync-status.js` | Sửa: hiện trạng thái "chưa xác nhận" và kết quả FR09 | FR08, FR09 |
| `src/public/styles.css`, `src/public/sw.js` | Sửa CSS nếu cần; sinh lại `sw.js` | NFR10, KM-004 |
| `testkit/wrangler-server.mjs` | Sửa nếu cần: helper đặt dòng, trigger từ chối ghi nhật ký | AC22, AC44, AC45 |
| `test/model.test.js`, `test/store.test.js`, `test/session.test.js`, `test/sync-engine.test.js`, `test/auth.test.js` | Sửa: thêm trường hợp mới | FR05, FR10, FR14 |
| `test/restore-snapshot.test.js`, `test/device-name.test.js`, `test/password-change.test.js` | Mới, chạy cả trên `test:browser` nếu không đụng DOM | FR27–FR33, FR18 |
| `test/server/{password,sessions,snapshots,audit}.server.js`; `perf.server.js`, `privacy.server.js`, `routing-headers.server.js` | Mới và sửa | FR04–FR07, FR17–FR23, FR34–FR38 |
| `test/sync/{password,relogin,devices,snapshots,restore,audit,security-privacy}.sync.js` | Mới, hai trình duyệt thật trên server cục bộ thật | FR40 |
| `test/ui-static.test.js`, `test/e2e/sweep.e2e.js` | Sửa: bỏ đúng "đổi mật khẩu" | FR43, AC51 |
| `docs/03,04,05,06,07,08,09`; `docs/02` nếu cây tệp đổi | Sửa theo FR42–FR44 | `CLAUDE.md` |
| `docs/epics/KM-009/KM-009.md`, `KM-006/KM-006.md`, `KM-014/KM-014.md`; ghi chú KM-003 | Sửa theo FR42, FR43, FR45 | §5 Tài liệu khớp |
| `docs/epics/KM-009/artifacts/spec.md` | Sửa: Amendment 1 cho FR31 | §1 |
| `docs/epics/KM-009/artifacts/implement.md` | Mới: output, số đo, bảng AC49 | FR41, NFR06, NFR07 |

## 3. Order

Làm trên nhánh `feat/KM-009-account-security`, trên Mac.

1. **Cổng phụ thuộc.** Xác nhận KM-006 và KM-007 đã merge vào `master`. Đối chiếu tên thật của `store`, `session`, `api`, `auth`, `sync`, `sync-status`, `account-dialogs`, `passkey-settings` với §2; lệch thì ghi amendment. Kiểm KM-008 đã lấy số migration chưa và `rotate` của nó có ghi `updated_by_device` không. Chạy năm lệnh hiện có cộng `test:sync` để có mức nền. *Sau bước này:* biết plan còn đúng với mã thật. **Chưa merge thì dừng và báo originator.**
2. **Migration và ghi bản cũ.** `0002`, `writeVault`, `register`, `createVault`, test. *Sau bước này:* mỗi lần ghi giữ đúng 30 bản, có tên thiết bị, có `size`, và p95 đo được.
3. **Đọc bản cũ.** Refactor `match`, route, `_snapshots.js`, test. *Sau bước này:* AC27, AC28, AC29 ở mức API xanh; route vault cũ không đổi hành vi.
4. **Thiết bị.** `_sessions.js`, test. *Sau bước này:* AC22, AC24, AC26 ở mức API xanh.
5. **Nhật ký.** `_audit.js`, nối vào `login`, thu hồi, `restoredFrom`, test. *Sau bước này:* AC41–AC45 ở mức server xanh, NFR03 đạt.
6. **Đổi mật khẩu trên server.** `_account.js`, test. *Sau bước này:* AC04, AC12, AC13, AC14 và phần server của AC44 xanh.
7. **Lõi.** `restoreSnapshot`, test trên `merge.js` thật gồm mọi tổ hợp AC32–AC39, 09. *Sau bước này:* FR28–FR33 đúng trên Node và trình duyệt; `merge.js` và vector không đổi.
8. **Kho và phiên.** Hàm mới của `store.js`, `memory-store.mjs`, `session.changePassword`, kiểm bộ khoá. *Sau bước này:* đổi mật khẩu, đăng nhập lại và mọi điểm gián đoạn chạy được trên Node với API giả.
9. **`api`, `auth`, `sync`, `device-name`.** *Sau bước này:* FR09, FR10, FR14 có test Node; đồng bộ gửi và xoá `restoredFrom` đúng; tên thiết bị được gửi.
10. **Giao diện đổi mật khẩu, màn khoá.** `password-dialog.js`, `gate.js`, `sync-status.js`, bỏ từ cấm, `password.sync.js`, `relogin.sync.js`. *Sau bước này:* AC01–AC21 xanh trên hai trình duyệt.
11. **Giao diện còn lại.** `devices-dialog.js`, `snapshots-dialog.js`, `audit-dialog.js`, `settings-dialog.js`, test sync tương ứng, `security-privacy.sync.js`, `sw-version`. *Sau bước này:* AC22–AC47 và AC51 xanh, có số đo NFR06, NFR07.
12. **Tài liệu.** FR42–FR45, Amendment 1. *Sau bước này:* AC50 đọc lại được; chạy lại AC48.
13. **Originator kiểm tay AC49** trên từng cặp. Ghi kết quả vào `implement.md`. Lỗi tìm thấy thì sửa kèm test.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — step 1: biết plan còn đúng với mã thật. Dừng ở đây nếu KM-006, KM-007 chưa merge.

**Batch 2** — steps 2–4: bản cũ và thiết bị trên server; `test:server` xanh.

**Batch 3** — steps 5–6: nhật ký và đổi mật khẩu trên server; `test:server` xanh, NFR03 đạt.

**Batch 4** — step 7: thao tác khôi phục ở lõi; `npm test`, `test:browser` xanh.

**Batch 5** — steps 8–9: logic client trên Node; `npm test` xanh, chưa có gì hiện ra giao diện.

**Batch 6** — step 10: đổi mật khẩu và đăng nhập lại chạy thật; AC01–AC21 xanh.

**Batch 7** — step 11: toàn bộ test tự động xanh, có số đo.

**Batch 8** — step 12: tài liệu khớp.

**Batch 9** — step 13: phần của originator, không phải phiên agent.

## 4. Risks

Phiên này không có công cụ `codegraph`. Phần ảnh hưởng lấy từ đọc mã và `rg`: `match` chỉ được dùng trong `[[route]].js`; `authenticate` được mọi route có `auth` gọi; `writeVault` chỉ có một route; `checkKdf` dùng ở `register`, giữ nguyên. Phần client chỉ đọc được trên `plan.md` của KM-006, KM-007.

| Risk | Likelihood | What we do about it |
|---|---|---|
| **Ít chắc nhất:** mã KM-006, KM-007 khác plan của chúng. Ví dụ KM-006 ghi giữ `accountKey` trong session, KM-007 cấm | Trung bình | Bước 1 đối chiếu. `changePassword` không dựa vào `accountKey` trong `state`. Lệch thì ghi amendment trước khi viết |
| **Khó đảo ngược:** bị khoá ngoài khi đổi mật khẩu hoặc đăng nhập lại | Thấp nếu làm đúng, nghiêm trọng nếu sai | Ghi trọn vẹn một transaction; luôn còn bộ cũ hoặc bộ mới; AC08–AC11, AC20 cắt ở mọi điểm qua CDP và đóng trang |
| **Khó đảo ngược:** nhận bộ khoá của server độc | Thấp | FR14 kiểm mở khoá **mọi** vault trên máy trước khi ghi; AC19 |
| `writeVault` thành `batch()` làm đổi hành vi hoặc chậm (blast radius: `PUT`, mọi lần đồng bộ của KM-006) | Trung bình | `vaults.server.js` và `flow.server.js` chạy lại không sửa; đo p95 với blob 200 KB (NFR06). Vượt ngưỡng thì báo originator |
| Refactor `match` làm một route vault mất kiểm id (`400 invalid_id`) | Thấp | `routing-headers.server.js` chạy lại không sửa, thêm route mới vào bảng |
| Dòng đăng nhập sai làm lộ username qua thời gian | Trung bình | Ghi qua `waitUntil`; AC43 đo 200 lần mỗi nhánh. Không đạt thì báo originator |
| `restoredFrom` bị mất khi `commitPull`, `applyRemote` của KM-006 ghi đè dòng | Trung bình | Test Node: khôi phục, nhận `409`, gộp, đẩy; AC40 đóng trang giữa chừng |
| Trùng migration và trùng sửa `docs/04`, `docs/03` với KM-008 đang song song | Trung bình | Bước 1 kiểm; rebase trước batch 6 và batch 8. Epic đóng sau chạy lại test xoá vault, xoay khoá trên bản cũ thật (Concern 20) |
| KM-008 `rotate` không đặt `updated_by_device`, nên bản cũ hiện sai thiết bị | Trung bình nếu KM-008 đóng trước | Bước 1 kiểm; thêm một dòng vào câu lệnh của nó nếu cần, ghi amendment |
| Badge ở item sống lại từ xoá trắng làm người dùng lo | Thấp | Originator đã chấp nhận; câu chữ có sẵn của `conflict.attrs` ở `detail.js`. Kiểm trong AC49 |
| Ghi 2 bản blob và nhật ký làm tăng lượng ghi trên gói Free | Chưa đo | Chuyển `KM-014` (FR45), không đặt ngưỡng ở đây |
| Chữ giao diện dính từ còn cấm ("chọn vault", "thùng rác") | Cao nếu không để ý | Dùng "Vault", "đã xoá" (Concern 18); `ui-static.test.js` chặn |
| Bộ đếm IP dùng chung `127.0.0.1` làm test đăng nhập sai khoá lẫn nhau | Cao nếu chung server | Mỗi tệp test một server, như KM-006 |
| Giả lập không tách mạng được đúng lúc `POST` đổi mật khẩu đang chạy | Trung bình | Tự động dùng CDP trên Chrome; trên giả lập dùng `adb reverse --remove` và `device-gate`, không đúng khoảnh khắc thì originator quyết (AC49) |

## 5. Proofs

"Node" là `npm test`, "server" là `npm run test:server`, "sync" là `npm run test:sync`. Output ghi vào `implement.md`. Test đặt tên `KM-009 ACnn …`. Mỗi tệp sync kiểm thêm: không vi phạm CSP, không có secret trong log.

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-009-AC01` | Sai mật khẩu hiện tại, hai ô khác nhau, trùng cũ dạng NFC/NFD: mỗi ca một câu, đếm request `/api/` = 0 | Node `password-change`; sync `password` |
| `KM-009-AC02` | Ba trạng thái: không có form, có câu nêu việc cần làm | sync `password` |
| `KM-009-AC03` | Mật khẩu Yếu: có cảnh báo, đổi được; có câu chưa đặt lại được | sync `password` |
| `KM-009-AC04` | So SQLite trước và sau: salt đổi, `iter` 600 000, mọi blob, khoá, meta, bản cũ giống từng byte; đăng nhập cũ `401`, mới mở đúng dữ liệu | server `password`; sync `password` |
| `KM-009-AC05` | A có thay đổi chờ, đổi, khoá, mở; token cũ `401`, token mới dùng được; mật khẩu cũ báo sai | sync `password` |
| `KM-009-AC06` | CDP giữ một `GET` đang chạy, đổi xong mới thả với `401`: không có "Cần đăng nhập lại", lượt sau chạy. Thêm ca `401` về trong lúc `POST` đang chạy | Node `sync-engine`; sync `password` |
| `KM-009-AC07` | CDP offline; tắt server; `400` thật: báo mật khẩu cũ, không có marker, kho và SQLite không đổi | sync `password` |
| `KM-009-AC08` | CDP cắt phản hồi `200`: "chưa xác nhận", mở bằng mật khẩu cũ; có mạng thì tự báo; đăng nhập mật khẩu mới, thay đổi chờ lên server | sync `password` |
| `KM-009-AC09` | CDP trả `500` không chuyển tiếp, và chặn request: chuyển sang mật khẩu cũ còn hiệu lực, phiên còn dùng | sync `password` |
| `KM-009-AC10` | Đóng trang khi đang "chưa xác nhận", mở offline, rồi online; quét IndexedDB không có mật khẩu, khoá chưa bọc | sync `password` |
| `KM-009-AC11` | Khoá, và đóng trang, ngay sau khi server ghi; `store` hỏng lần ghi ở mức Node: đủ bộ mới, hoặc đủ bộ cũ kèm marker | Node `password-change`; sync `password` |
| `KM-009-AC12` | `POST` trực tiếp bằng `authKey` sai 5 lần: `403` rồi `429`, phiên còn; `login` cũng bị khoá; có dòng `password_fail` | server `password`; sync `password` |
| `KM-009-AC13` | `iter` 600 001, salt trùng, thiếu trường, thừa trường: `400`, SQLite không đổi | server `password` |
| `KM-009-AC14` | Hai `POST` song song: một `200`, một `401`; đúng một bộ khoá, đúng một dòng nhật ký; máy thua còn dữ liệu | server `password`; sync `relogin` |
| `KM-009-AC15` | Authenticator ảo trên `localhost`: chuỗi passkey, đổi, mở, đăng nhập lại, mở; so `meta.passkey` từng byte; quét mọi body request | sync `relogin` |
| `KM-009-AC16` | B có thay đổi chờ, A đổi: chấm đỏ, sửa được, đếm request = 0, offline mở bằng mật khẩu cũ | sync `relogin` |
| `KM-009-AC17` | B đăng nhập mật khẩu mới: A nhận, không có đánh dấu ở phần không đổi; khoá B, cũ sai, mới mở | sync `relogin` |
| `KM-009-AC18` | Mật khẩu cũ: đúng câu `KM-006-FR06`, kho B không đổi, cũ vẫn mở | sync `relogin` |
| `KM-009-AC19` | CDP thay `wrappedAccountKey` bằng bản bọc khoá khác dưới cùng mật khẩu: kho không đổi, 0 `PUT`, token vừa tạo bị từ chối, có lỗi | Node `auth`; sync `relogin` |
| `KM-009-AC20` | CDP cắt và đóng trang giữa lúc đăng nhập lại; store hỏng ở Node: còn đủ bộ cũ, đăng nhập lại được | Node `auth`; sync `relogin` |
| `KM-009-AC21` | B khoá, gõ mật khẩu mới: câu và lối đăng nhập điền sẵn, đếm request = 0 trước khi chọn; thêm ca đã đăng xuất giữ dữ liệu | sync `relogin` |
| `KM-009-AC22` | Đặt phiên hết hạn và phiên lệch stamp trong SQLite: danh sách chỉ có phiên hiệu lực, thứ tự, đánh dấu | server `sessions`; sync `devices` |
| `KM-009-AC23` | Bảng UA ở mức hàm; tên có thẻ HTML đặt qua `POST` hiện đúng dạng chữ; Android, iOS kiểm tay | Node `device-name`; sync `devices`; bước 13 |
| `KM-009-AC24` | A thu hồi B, phiên thứ ba vẫn chạy; request kế của B `401`; dữ liệu B còn; đủ chữ FR20 | server `sessions`; sync `devices` |
| `KM-009-AC25` | B đăng xuất khi CDP offline; A thấy và thu hồi được phiên còn sót | sync `devices` |
| `KM-009-AC26` | Dòng máy này không có nút; `DELETE` chính mình như logout; id của tài khoản khác và id không có: so hai body từng byte | server `sessions`; sync `devices` |
| `KM-009-AC27` | 35 lần ghi xen `409`, `413`, `400`: đúng 30 dòng liên tiếp, blob khớp từng version đã ghi | server `snapshots` |
| `KM-009-AC28` | Hai phiên ghi, thu hồi phiên A: bản V có thời điểm T, tên A, đúng `size`; có câu "giữ được từ…" | server `snapshots`; sync `snapshots` |
| `KM-009-AC29` | Hai tài khoản: danh sách và một bản đều cùng `404`; vault thứ hai tạo qua API, chọn theo tên; trạng thái trống; offline | server `snapshots`; sync `snapshots` |
| `KM-009-AC30` | So IndexedDB trước và sau, đếm request ghi = 0; số đếm khớp; khoá app thì màn xem đóng | sync `snapshots` |
| `KM-009-AC31` | Sửa `blob` trong SQLite; cắt bớt khỏi 30 bản: lỗi riêng, không có nút; bản khác vẫn xem được | sync `snapshots` |
| `KM-009-AC32` | Mức hàm trên `merge` thật, rồi hai máy thật: giá trị cũ hiện ra, đầu lịch sử có nhãn, env giữ nguyên, không đánh dấu | Node `restore-snapshot`; sync `restore` |
| `KM-009-AC33` | Y trong thùng rác và W đã xoá trắng: hiện lại đủ; W có env cũ; khoá, mở không xoá lại. W có badge `purgedAt` chỉ khi có lần gộp thật (Amendment 1) | Node `restore-snapshot`; sync `restore` |
| `KM-009-AC34` | Z, item đã xoá ở bản cũ, item giống hệt: không đổi, không thêm lịch sử; xem được ở màn xem trước | Node `restore-snapshot`; sync `restore` |
| `KM-009-AC35` | Env, project đã xoá sống lại với item đúng chỗ; project đổi tên giữ tên hiện tại; env mới còn | Node `restore-snapshot`; sync `restore` |
| `KM-009-AC36` | B sửa field khác và item khác: cả hai còn, không đánh dấu | Node `restore-snapshot`; sync `restore` |
| `KM-009-AC37` | Đồng hồ truyền vào sớm hơn và muộn hơn: bản muộn hiện, hai giá trị còn lại trong lịch sử, chỉ field đó có đánh dấu, hai chiều gộp giống nhau | Node `restore-snapshot`; sync `restore` |
| `KM-009-AC38` | B chuyển X vào thùng rác và xoá trắng: bên sửa thắng theo bảng 05, nội dung khôi phục còn | Node `restore-snapshot` |
| `KM-009-AC39` | 25 lần sửa rồi khôi phục: giá trị vừa bị thay còn, tối đa 20 bản; khôi phục bản trước đó về đúng giá trị | Node `restore-snapshot`; sync `restore` |
| `KM-009-AC40` | Đóng trang và CDP offline ngay sau khi bấm: kết quả còn, lên server, ≥ 1 dòng; thêm ca `409` giữa chừng; bản giống hệt: 0 ghi, 0 dòng | Node `sync-engine`; sync `restore` |
| `KM-009-AC41` | Tạo từng hành động FR34: đúng loại, thời gian, thiết bị; `PUT`, `409`, logout, tạo vault: 0 dòng | server `audit` |
| `KM-009-AC42` | Sau chuỗi §3.1, quét mọi cột `dt_audit_log` ở dạng gốc, base64, hex; thử sai với mật khẩu làm dấu ở ô username | server `audit`; sync `security-privacy` |
| `KM-009-AC43` | Đếm dòng 1, 0, 0; so phản hồi từng byte; 200 lần mỗi nhánh, chênh trung vị ≤ 5 ms | server `audit` |
| `KM-009-AC44` | Trigger SQLite `RAISE(ABORT)` trên `dt_audit_log`: đăng nhập đúng, thu hồi, đổi mật khẩu `500`, không đổi gì; đăng nhập sai vẫn `401` | server `audit` |
| `KM-009-AC45` | Đặt 1 500 dòng sai và 10 dòng khác; thêm một lần sai: đúng 1 000 và 10; chiều ngược lại cũng vậy | server `audit` |
| `KM-009-AC46` | 120 dòng: 50 dòng, xem thêm, ẩn nhóm sai, tài khoản khác không thấy, thẻ HTML hiện chữ, ghi chú tự khai, tên vault, trống, offline | server `audit`; sync `audit` |
| `KM-009-AC47` | Chuỗi §3.1: quét SQLite, tệp dữ liệu server, mọi kho trình duyệt, console, URL, body lỗi | sync `security-privacy` |
| `KM-009-AC48` | Chạy `npm test`, `test:browser`, `test:e2e`, `test:server`, `test:sync`, `vectors`; `git diff --stat master -- src/public/js/core/merge.js testkit/vectors.js src/public/_headers` rỗng; `dependencies` rỗng; `rg` không có cờ test; số đo NFR06, NFR07 | Lệnh, dán output; reviewer đọc |
| `KM-009-AC49` | Originator kiểm trên Mac, hai cặp; bảng từng mục kèm bằng chứng, gồm NFR10, NFR11, NFR14; mục không làm được do originator quyết | Bước 13, `implement.md` |
| `KM-009-AC50` | Verifier đọc `KM-009.md`, 03–09, `KM-006.md`, KM-003, `KM-014.md`; `rg -n "bản .remote" docs/05-sync.md` rỗng | Bước 12, verifier |
| `KM-009-AC51` | Diff hai danh sách cấm chỉ bỏ "đổi mật khẩu"; test chạy trên mã mới | Node `ui-static`; `test:e2e` `sweep`; `git diff` |

## 6. Feedback loop

- **Lõi và logic client:** `node --test test/restore-snapshot.test.js test/password-change.test.js`, chạy `merge.js` thật, API giả và đồng hồ truyền vào.
- **Server:** `node --test test/server/<tệp>`, `wrangler pages dev` thật; đọc, sửa kho và đặt trigger qua `server.sql`, `server.exec`.
- **Hai máy:** `node --test test/sync/<tệp>`, hai hồ sơ Chrome trên server thật; gián đoạn qua CDP `Fetch` và `Network`, không có cờ test trong mã (NFR13).
- **Giao diện:** ảnh qua `KEYMESH_SHOTS`, xem cả desktop và `page.phone()`.
- **Giả lập:** `npm run dev:server`, `adb reverse`, `testkit/device-gate.mjs`, theo cách KM-006 đã xác nhận.
- Hết mỗi batch: chạy cả các lệnh ở AC48, `npm run sw-version` nếu có tệp mới. Vòng này chỉ có trên Mac.

## 7. Deliberately not doing

- Không đổi `merge.js`, vector, CSP; không thêm phụ thuộc (FR32, NFR12). Badge ở item sống lại đã được originator chấp nhận, nên không có lý do mở lại.
- Không làm `POST /api/account/rotate`, đặt lại mật khẩu, chặn mật khẩu cũ trên máy chưa đăng nhập lại, xoá từ xa (spec §7).
- Không có `keepCurrentSession`: luôn giữ phiên của máy đổi (Concern 19).
- Không gieo `updated_by_device` cho dòng cũ trong migration: server chưa có dữ liệu thật, thiếu thì hiện "Thiết bị không rõ".
- Không kiểm `restoredFrom` có khớp bản cũ nào không: dòng này do client khai (Concern 10), và server không biết nội dung.
- Không tách `detail.js` thành module mới; chỉ export phần cần dùng lại nếu cần.
- Không làm test thời gian thật cho hết hạn phiên: đặt `expires_at` trong SQLite như KM-005.
- Không sửa testkit để chạy trên Windows: implement chạy trên Mac.
- Không chạy `KM-014` hay bất cứ việc nào trên Cloudflare thật.
