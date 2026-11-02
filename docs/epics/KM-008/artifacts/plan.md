# Implementation Plan — Thùng rác và quản lý vault

**Epic ID:** `KM-008`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `spec.md`

---

## 1. Approach

Epic xây trên KM-006, không xây lại: `session.js` theo `Map` từng vault, `api.js`, `sync.js`, badge và "Đã xử lý" đều là sản phẩm của KM-006. Bốn phần thay đổi:

- **Server:** thêm `PATCH` và `DELETE /api/vaults/:id` vào `_vaults.js`, thêm header giờ server. Không cần migration, nên không tranh số `0002` với KM-009. Không làm `rotate` (FR34).
- **Lõi:** chỉ thêm hàm thuần: `purgeExpired`, `emptyTrash`, `trashDaysLeft`, `pickVaultMeta`. Quy tắc gộp vault và vector không đổi.
- **Phiên và đồng bộ:** mỗi dòng vault có thêm trạng thái gửi; `sync.js` thêm ba nhánh (metadata, vault mới, vault biến mất) và phép kiểm giờ. `sync.js` vẫn không cầm khoá (nguyên tắc của KM-006): mọi việc cần khoá đi qua `session.js`, trên cùng hàng đợi của `mutate()`. Nhờ vậy "xoá vault chưa gửi" và "bắt đầu gửi" không chồng nhau (AC86).
- **Giao diện:** thùng rác là một bộ lọc `{ k: 'trash' }` của cột giữa, không phải màn riêng, nên điều hướng mobile và nút Back dùng lại được `nav-history.js`. Mọi thao tác ghi đi qua `mutate()`, nên chặn khi lệch giờ chỉ cần đặt ở một chỗ.

**Phương án bị loại:**

1. **Đọc header `Date` làm giờ server.** Không dùng được: đo trên wrangler cục bộ thấy không có header này (bảng dưới).
2. **Đặt `deletedAt` trên dòng vault rồi đồng bộ dần, để xoá vault được khi offline.** Trái FR26, FR27: hai máy offline có thể cùng xoá hai vault cuối.
3. **Gộp metadata theo từng thuộc tính.** Trái Concern 7 và AC35.
4. **Dựa vào `ON DELETE CASCADE` để xoá snapshot.** Local đang bật khoá ngoại, nhưng D1 thật chưa kiểm. Câu `DELETE` tường minh trong cùng `batch()` đúng ở cả hai trường hợp, và cũng không phải xếp thứ tự với KM-009.

### Kết quả chạy thử (2026-11-02, Windows, bản sao trong scratchpad, `wrangler` 4.156.0)

Route xoá thử chỉ nằm trong bản sao, không vào repo. Client là `fetch` của Node, chưa đo trên Chrome.

| Câu hỏi | Kết quả | Hệ quả |
|---|---|---|
| Có `Date` trên `201`, `200`, `304`, `404` không? (Concern 20) | **Không có ở cả bốn** | Thêm header riêng `X-Server-Time`, phải ghi vào `docs/06` |
| Hai `DELETE` song song trên hai vault cuối, dùng `DELETE … WHERE … AND (SELECT count(*) …) > 1 RETURNING id` trong `batch()` | 8/8 lượt: đúng một bên xoá được, còn đúng một vault | Dùng cách này cho FR26. D1 thật kiểm ở `KM-014` |
| `DELETE` kèm body JSON có tới handler không? | Có | Giữ hợp đồng ở 06. Hạ tầng thật kiểm ở `KM-014` (FR37) |
| `PRAGMA foreign_keys` trên D1 local | `1` | Lý do chọn ở phương án 4 |

Concern 6 đã xác nhận bằng đọc mã: `sealVaultMeta` nhận object tuỳ dạng, `decryptVaultMeta` chỉ kiểm là object, nên thêm `at`, `dev` không đụng vector.

### Trả lời Concern 1: thứ tự với KM-006

**Đề xuất: bắt đầu `implement` sau khi KM-006 đã merge vào `master`.** Bước 1 là cổng chặn, như KM-009. Phần server và lõi (batch 2) không cần KM-006, nhưng làm trước cũng không đóng được epic sớm hơn, và phải rebase thêm một lần với `session.js`, `store.js`. KM-007 và KM-009 không chặn epic này: bên đóng sau rebase.

### Đối chiếu với spec, plan KM-006 và các epic song song: cần sửa spec trước khi implement

Concern 1 yêu cầu đối chiếu lại khi KM-006 có `spec.md`. Spec này còn ghi "KM-006 chưa có `spec.md`"; thực tế KM-006, KM-007, KM-009 đều đã có spec và plan đã duyệt. Đối chiếu ra các điểm lệch sau. Bước 1 ghi chúng thành amendment vào `spec.md` **sau khi originator duyệt plan này**:

| # | Lệch | Đề xuất |
|---|---|---|
| A1 | FR38 ghi định kỳ 60 giây; `KM-006-FR16` đổi thành 50 giây | FR38 theo nhịp của KM-006, sửa §1, Concern 1 cho đúng tình trạng hiện tại |
| A2 | `KM-006` Concern 17 ghi "KM-008 thêm đường xoá có xác minh", nhưng FR31 không có xác minh nào. Theo chữ FR31, vault chỉ cần vắng trong danh sách là bị xoá trên máy | Thêm FR31a: xem quyết định 1 bên dưới |
| A3 | Bản tạo lại có version 1. `KM-006` plan, quyết định 1, coi version server thấp hơn máy là lỗi và không gộp, trái dòng "Vault đã xoá được tạo lại…" ở §3.2 | Dòng vault lưu `serverCreatedAt`. `createdAt` đổi thì coi là bản tạo lại và gộp; không đổi thì giữ quyết định của KM-006 |
| A4 | `KM-007-NFR02` ghi phiên không giữ `accountKey`; `KM-006` plan và FR23 đều giữ. KM-007 và KM-009 cùng loại phương án giữ khoá vì lý do này | Ghi vào KM-007 rằng NFR02 đã được thay bằng FR23 (Concern 8). Giữ nguyên việc phải nhập lại mật khẩu khi bật passkey |
| A5 | `KM-009` spec Concern 3 ghi "muốn xoá hẳn thì xoay khoá vault (KM-008)", nhưng xoay khoá đã về KM-011 | Sửa câu đó, và kiểm `docs/04` không hứa điều này. Bên đóng sau làm |
| A6 | FR21, FR28 và 03 nói vault đang chọn nằm trong cài đặt thiết bị; `KM-006` plan đặt `activeVaultId` trong `meta.account` | Dùng chỗ của KM-006, không tạo bản thứ hai. Sửa câu ở 03 (FR36) |

### Quyết định spec để lại hoặc chưa nói, cần originator duyệt cùng plan

1. **Xác minh trước khi xoá theo tín hiệu server (A2).** Vault **đã lên server** chỉ bị coi là đã xoá ở máy khác khi cả ba điều đúng: danh sách trả `200` và không rỗng (server luôn giữ ít nhất một vault); vault không có trong danh sách; `GET /api/vaults/:id` trả `404`. Tốn thêm đúng một request, chỉ khi có vault vắng. Một lần server mất dữ liệu sẽ không xoá dữ liệu trên máy. Lần server mất cả phiên thì ra `401`, không đi vào nhánh này.
2. **Vault "đã gửi nhưng chưa rõ" mà vắng trong danh sách:** gửi lại `POST`, không coi là đã xoá. Nếu máy khác đã thấy và xoá vault đó trong lúc này, vault sẽ quay lại: có thừa nhưng không mất dữ liệu.
3. **Nguồn giờ (Concern 20):** header `X-Server-Time` (mili giây) trên mọi phản hồi API. Hai hàm dựng phản hồi ở `_http.js` là đường ra duy nhất, nên `304` và lỗi đều có. Không thêm request. Thiếu hoặc sai dạng thì bỏ qua lần kiểm đó, không tính là lệch.
4. **Mã lỗi sai mật khẩu (Concern 9):** `403 wrong_password`, đúng mã `KM-009` plan đã chọn. Bên merge sau dùng lại, không thêm mã thứ hai. `429 too_many_attempts` kèm `Retry-After` như đăng nhập.
5. **Thứ tự kiểm ở `DELETE`:** Origin, token, id, chủ vault, body, khoá theo bộ đếm, mật khẩu, rồi mới xoá có điều kiện. Không có cách dò `last_vault` nếu không có mật khẩu đúng. Mật khẩu đúng thì đặt lại bộ đếm, kể cả khi kết quả là `last_vault`.
6. **Lưu trạng thái, không đổi phiên bản IndexedDB:** dòng vault thêm `sent`, `metaDirty`, `serverCreatedAt`; thêm khoá `meta.clockCheck`. `sent` thiếu thì suy từ `base` (có là `server`, không là `never`). `vaults[].deletedAt` giữ nguyên, luôn `null`.
7. **Thay đổi nội dung chưa đẩy (FR31, FR32)** là `current.dirty`, kể cả khi dirty chỉ do tự xoá trắng (Concern 14 đã chấp nhận) hoặc N = 0 (cùng cách làm với `KM-006` plan, quyết định 2).
8. **`PATCH` không đổi `updated_at`:** cột đó thuộc về blob. KM-009 không cần ghi gì cho thao tác này.
9. **Không ghi nhật ký cho xoá vault.** KM-009 Concern 9 đã chốt năm hành động và không gồm việc này.
10. **Dữ liệu cho kiểm tay AC14, AC16, AC21:** `testkit/seed-old-trash.mjs` đẩy lên server cục bộ một bản vault có `deletedAt` cũ, dùng `core/` và mật khẩu thử. Giả lập iOS dùng đồng hồ của Mac, và lùi giờ khi online thì bị chặn bởi chính phép kiểm giờ, nên không kiểm tay được bằng cách chỉnh đồng hồ. Không có cửa sau trong app.

## 2. Files

Tên hàm và tệp của KM-006 lấy từ `plan.md` của epic đó; bước 1 đối chiếu với mã thật. Không thêm thư mục gốc, không có migration, không đổi `testkit/vectors.js`, CSP, quy tắc gộp vault.

| Path | Change | Why |
|---|---|---|
| `src/functions/api/_http.js` | Sửa: `X-Server-Time` ở hai hàm dựng phản hồi; mã `wrong_password`, `last_vault` | FR26, FR25, FR38 |
| `src/functions/api/_auth.js` | Sửa: export `confirmPassword`: bộ đếm, so `auth_hash`, ghi lần sai, trả câu đặt lại bộ đếm | FR30 |
| `src/functions/api/_vaults.js` | Sửa: `updateVaultMeta`, `deleteVault` | FR17, FR26, FR29 |
| `src/functions/api/[[route]].js` | Sửa: thêm hai route | 06 |
| `src/public/js/core/model.js` | Sửa: `TRASH_DAYS`, `trashDaysLeft`, `purgeExpired`, `emptyTrash` | FR03, FR07, FR09 |
| `src/public/js/core/merge.js` | Sửa: export `pickVaultMeta(a, b)`, dùng `clockOf`, `cmp` đã có; thân `merge()` không đổi | FR17, AC36 |
| `src/public/js/vault-meta.js` | Mới: kiểm tên (cắt khoảng trắng, 1–64, NFC, không phân biệt hoa/thường), làm sạch meta đọc từ đĩa, xếp theo `order` rồi id | FR15, FR16, FR19, NFR08 |
| `src/public/js/clock-check.js` | Mới: hàm thuần, nhận giờ máy và giá trị header, trả `ok`, `skewed` hoặc `unknown` | FR38, NFR12 |
| `src/public/js/vault-query.js` | Sửa: `trashItems`, `searchAllVaults` (trả kèm vault, đếm vault bị bỏ qua) | FR03, FR22 |
| `src/public/js/vault-ops.js` | Sửa: `draftAsNew`, `restoreAndCommitDraft` | FR13 |
| `src/public/js/settings.js` | Sửa: `recents` theo vault; danh sách cũ được giữ để gán khi đã biết vault chứa các id | FR21, Concern 16 |
| `src/public/js/store.js`, `testkit/memory-store.mjs` | Sửa: `commitNewVault`, `markSending`, `commitCreated`, `writeVaultMeta`, `commitMeta`, `removeVault` (dòng vault, `activeVaultId`, recents trong một transaction, có điều kiện theo `sent`), đọc/ghi `clockCheck` | FR14, FR17, FR27, FR28, FR38 |
| `src/public/js/session.js` | Sửa: `mutate` nhận vault đích; `setActiveVault`, `vaultList`, `createVault`, `updateVaultMeta`, `applyRemoteMeta`, `checkPassword`, `deriveAuthKey`, `removeVault`, `recreateVault`, `purgeExpiredAll`, chặn ghi khi lệch giờ; vault hỏng không chặn vault khác | FR09, FR14, FR16, FR23, FR27, FR39 |
| `src/public/js/api.js` | Sửa: `patchVaultMeta`, `deleteVault`, `createVault` dùng được cho vault cục bộ; mọi kết quả kèm `serverTime` | FR17, FR18, FR38 |
| `src/public/js/auth.js` | Sửa: chọn vault đưa đi đăng ký khi có nhiều vault; vault còn lại để nhánh đẩy vault mới xử lý | FR18, Concern 12 |
| `src/public/js/sync.js` | Sửa: kiểm giờ đầu lượt và dừng nếu lệch; nhánh metadata; nhánh vault mới; nhánh vault biến mất có xác minh; nhánh bản tạo lại; lời hứa "lần liên lạc đầu tiên" cho tự xoá trắng; tạm bỏ qua vault đang xoá | FR17, FR18, FR31–FR33, FR38–FR40 |
| `src/public/js/app.js` | Sửa: các action thùng rác, vault, xoá vault, lựa chọn khi vault biến mất, tuỳ chọn "mọi vault"; đóng màn chi tiết và hộp thoại khi item hoặc vault không còn; lịch tự xoá trắng; hoãn xử lý vault biến mất khi form đang mở | FR01–FR13, FR19–FR22, FR28, FR31–FR33, FR39, FR40 |
| `src/public/js/ui/trash.js` | Mới: danh sách thùng rác, câu báo FR08, hai bước xác nhận | FR03, FR06–FR08 |
| `src/public/js/ui/vault-picker.js` | Mới: bộ chọn, hộp tạo, đổi tên, đặt màu | FR14–FR16, FR19 |
| `src/public/js/ui/vault-delete-dialog.js` | Mới: hộp xoá, nhập mật khẩu, mọi câu báo lỗi | FR24–FR28 |
| `src/public/js/ui/vault-gone-dialog.js` | Mới: *Tạo lại trên server*, *Bỏ bản trên máy này* | FR32 |
| `src/public/js/ui/clock-banner.js` | Mới: lỗi không tắt được, cảnh báo khi offline, nút kiểm lại | FR39, FR40 |
| `src/public/js/ui/shell.js` | Sửa: gắn banner, tuỳ chọn "mọi vault" ở ô tìm, hộp chọn số phận bản nháp | FR13, FR22, FR39 |
| `src/public/js/ui/nav.js`, `ui/home.js` | Sửa: bộ chọn thay dòng tên vault; lối vào thùng rác kèm số item | FR03, FR19 |
| `src/public/js/ui/list.js` | Sửa: chế độ thùng rác; kết quả "mọi vault" kèm tên và màu vault | FR03, FR22 |
| `src/public/js/ui/detail.js` | Sửa: nút Xoá; chế độ chỉ xem trong thùng rác; ghi chú OTP khi lệch giờ; chỉnh câu `deletedAt`, `purgedAt` KM-006 đã làm cho đúng FR12 | FR01, FR04, FR12, FR39 |
| `src/public/js/ui/edit.js` | Sửa: báo khi lưu bị chặn vì lệch giờ, giữ form | FR39 |
| `src/public/js/ui/history-dialog.js` | Sửa: tham số chỉ xem; tự đóng khi item không còn | FR04, AC27 |
| `src/public/styles.css` | Sửa: bộ chọn, banner, kết quả "mọi vault", vùng chạm 44 px; dùng lại lớp `env-*` cho màu | FR16, NFR05, NFR09 |
| `src/public/sw.js` | Sinh lại bằng `npm run sw-version` (tệp mới vào `SHELL`) | NFR07 |
| `testkit/seed-old-trash.mjs` | Mới: xem quyết định 10 | AC14, AC16, AC21 |
| `testkit/e2e/driver.mjs` | Sửa: đặt `Date` của trang lệch bằng script chạy trước tài liệu; sửa header `X-Server-Time` qua CDP `Fetch` | AC87–AC95 |
| `test/server/vault-manage.server.js`; `test/server/routing-headers.server.js`, `test/server/privacy.server.js` | Mới và sửa | FR17, FR26, FR29, FR30, FR34, FR38 |
| `test/model.test.js`, `test/merge.test.js`, `test/session.test.js`, `test/store.test.js`, `test/settings.test.js`, `test/vault-query.test.js`, `test/vault-ops.test.js`, `test/sync-engine.test.js`, `test/auth.test.js`, `test/perf.test.js` | Sửa: thêm trường hợp mới | FR09, FR13, FR17, FR18, FR21, FR27 |
| `test/vault-meta.test.js`, `test/clock-check.test.js` | Mới | FR15, FR38 |
| `test/ui-static.test.js`, `test/e2e/sweep.e2e.js` | Sửa: bỏ "thùng rác", "chọn vault", `^xoá item$`; thêm phép dò AC13 | FR08, FR35 |
| `test/sync/{trash,trash-conflict,vault-meta,vault-switch,vault-delete,vault-gone,clock,km008-privacy,km008-perf}.sync.js` | Mới: trình duyệt thật trên server cục bộ thật, theo khung của KM-006 | §5 |
| `docs/03,04,05,06,07,08,09`; `docs/02` cho cây tệp | Sửa theo FR36, kèm `X-Server-Time`, `wrong_password` | FR36 |
| `docs/epics/KM-008/KM-008.md`, `KM-014/KM-014.md` | Sửa theo FR36, FR37 | FR36, FR37 |
| `docs/epics/KM-008/artifacts/spec.md`, `KM-007/artifacts/spec.md`, `KM-009/artifacts/spec.md` | Sửa: amendment A1–A6 | Concern 1 |
| `docs/epics/KM-008/artifacts/implement.md` | Mới: output, số đo, bảng kiểm tay từng cặp | §5 |

## 3. Order

1. **Cổng phụ thuộc, trên Mac.** Xác nhận KM-006 đã merge. Đối chiếu tên thật của `session`, `store`, `api`, `sync`, `sync-status` với §2; lệch thì ghi amendment. Kiểm KM-007, KM-009 đã merge chưa, đã có `wrong_password` chưa. Chạy mọi lệnh test để có mức nền. Ghi A1–A6 vào spec. *Sau bước này:* biết plan còn đúng với mã thật. **Chưa merge thì dừng và báo originator.**
2. **Server.** Header giờ, hai mã lỗi, `confirmPassword`, `updateVaultMeta`, `deleteVault`, hai route, test server. *Sau bước này:* AC38, AC56, AC58, AC63–AC66, AC69 xanh ở mức server, gồm trường hợp có snapshot được gieo.
3. **Lõi.** Ba hàm thùng rác, `pickVaultMeta`, test chạy cả trên `test:browser`, sửa 09. *Sau bước này:* hạn 30 ngày và AC36 có test với `now` truyền vào; vector không đổi.
4. **Hàm thuần phía client.** `vault-meta.js`, `clock-check.js`, `vault-query`, `vault-ops`, `settings`. *Sau bước này:* FR13, FR15, FR21, FR22 và phép so giờ có test đơn vị. App chưa đổi.
5. **Kho và phiên.** Trạng thái gửi, thao tác vault, chặn ghi, vault hỏng không chặn. *Sau bước này:* trên Node, session tạo, đổi tên, xoá vault, tự xoá trắng được, kể cả khi hỏng lần ghi; mọi test và E2E cũ xanh, app trông như trước.
6. **Đồng bộ.** `api.js`, `auth.js`, các nhánh mới của `sync.js`, test bằng API giả và đồng hồ truyền vào. *Sau bước này:* metadata hội tụ, vault mới lên server, vault biến mất xử lý đúng, lệch giờ dừng lượt, ở mức logic.
7. **Thùng rác.** Action, `ui/trash.js`, `nav`, `home`, `list`, `detail`, `edit`, `history-dialog`, lịch tự xoá trắng, bỏ từ cấm. *Sau bước này:* AC01–AC27 xanh bằng hai trình duyệt.
8. **Vault.** Bộ chọn, chuyển vault, tìm mọi vault, hộp xoá, lựa chọn khi vault biến mất. *Sau bước này:* AC28–AC68, AC82–AC86 xanh.
9. **Kiểm giờ trên giao diện.** Banner, form, ghi chú OTP, kiểm lại. *Sau bước này:* AC87–AC95 xanh.
10. **Bộ đầy đủ.** Riêng tư, hiệu năng, offline có Service Worker, `sw-version`, `seed-old-trash.mjs`. *Sau bước này:* AC73–AC81 xanh, có số đo.
11. **Tài liệu.** FR36, FR37; nếu KM-009 đã đóng thì chạy lại test xoá vault trên snapshot thật (KM-009 Concern 20). *Sau bước này:* AC71, AC72 đọc lại được.
12. **Originator kiểm tay** các AC "từng cặp" trên Mac, ghi từng mục, từng cặp vào `implement.md`.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — step 1: biết plan còn đúng với mã thật, spec đã có amendment. Dừng ở đây nếu KM-006 chưa merge.

**Batch 2** — steps 2–3: server và lõi xong, `test:server`, `npm test`, `test:browser` xanh.

**Batch 3** — steps 4–5: hàm thuần, kho, phiên nhiều thao tác vault; app trông như trước, mọi bộ test cũ xanh.

**Batch 4** — step 6: đồng bộ đúng trên Node, chưa có giao diện mới.

**Batch 5** — step 7: thùng rác dùng được từ đầu tới cuối trên hai trình duyệt.

**Batch 6** — step 8: quản lý vault dùng được từ đầu tới cuối trên hai trình duyệt.

**Batch 7** — steps 9–10: kiểm giờ xong, toàn bộ test tự động xanh, có số đo.

**Batch 8** — step 11: tài liệu và `KM-014` khớp.

**Batch 9** — step 12: phần của originator, không phải phiên agent.

## 4. Risks

Phiên này không có công cụ `codegraph`. Phạm vi ảnh hưởng lấy bằng đọc mã và `rg`: `vaultName` chỉ dùng ở `app.js`, `ui/nav.js`; `_http.js` được mọi handler dùng nhưng chỉ qua hai hàm; `settings.recents` dùng ở `app.js`, `ui/home.js`, `test/settings.test.js`. Phạm vi của `session.js`, `store.js` phải đo lại ở bước 1 vì KM-006 viết lại chúng.

| Risk | Likelihood | What we do about it |
|---|---|---|
| Mã thật của KM-006 khác tên hoặc cách làm trong plan của nó | Trung bình | Bước 1 là cổng chặn; lệch thì ghi amendment, không tự đoán |
| Đổi `session.js`, `store.js` làm hỏng màn hình và test của KM-006, KM-007, KM-009 | Trung bình | Getter hiện có giữ nguyên; bước 5 chỉ xong khi test cũ xanh, không sửa test cũ để cho xanh. Bên đóng sau rebase |
| **Khó đảo ngược:** xoá nhầm dữ liệu trên máy theo tín hiệu server | Thấp sau quyết định 1 | Ba điều kiện xác minh; test: danh sách rỗng, `GET` trả `200`, `GET` lỗi mạng đều không xoá. Thay đổi chưa đẩy đi đường giữ lại |
| **Khó đảo ngược:** tự xoá trắng sớm vì đồng hồ sai | Trung bình khi offline | Chờ phép kiểm giờ khi có mạng; không xoá khi `deletedAt` ở tương lai hoặc lần kiểm cuối là lệch. Rủi ro còn lại đã chấp nhận (Concern 3), ghi `docs/04` |
| **Khó đảo ngược:** xoá vault mất dữ liệu | Thấp | Server xác nhận rồi mới xoá trên máy, một transaction, có mật khẩu. Đóng app giữa chừng thì lần sync sau xử lý như máy kia. Chỉ có dữ liệu thử |
| Lỗi phân nhánh trạng thái gửi tạo vault mồ côi trên server | Trung bình | `markSending` nằm trong transaction, chạy trước khi gửi. Có test cho AC84–AC86, cắt phản hồi bằng CDP |
| Mất phản hồi `POST /api/register`, rồi xoá vault tưởng là chưa gửi: vault quay lại sau khi đăng nhập | Thấp | Không mất dữ liệu nên chấp nhận; không đổi luồng đăng ký của KM-006. Ghi vào `implement.md` nếu gặp |
| Lệch giờ chặn nhầm người dùng hoặc làm hỏng kiểm tay vì giả lập lệch giờ thật | Trung bình | Kiểm giờ của Mac và giả lập trước khi kiểm tay. Đã có sẵn nút kiểm lại; không chặn xem và copy |
| Trình duyệt không đọc được `X-Server-Time` trên `304` thật | Thấp, mới đo bằng `fetch` của Node | Cùng origin nên đọc được mọi header. Test Chrome ở bước 6, bước 9 kiểm trực tiếp trên `304` |
| Hộp thoại đang mở vẫn giữ secret khi item bị xoá trắng | Trung bình | `history-dialog` tự đóng; khi vault biến mất thì đóng mọi hộp thoại trừ form đang sửa; AC27 quét DOM gồm cả `dialog` |
| Vẽ lại sau đồng bộ làm mất form | Trung bình | Dùng quy tắc của KM-006; AC68 gõ dở lúc vault bị xoá |
| Năm vault 200 KB vượt 2,5 s khi mở khoá; tìm trên 500 item vượt 100 ms | Trung bình, chưa đo | Đo sớm ở bước 5 và bước 8. Giải mã song song hoặc cache chữ đã gấp nếu cần. Không đạt thì quay lại PO, không tự nới (NFR01) |
| Trùng sửa `[[route]].js`, `_http.js`, `docs/03,04,06` với KM-009 | Cao nếu chạy song song | Hai route tách riêng; dùng chung `wrong_password`. Rebase trước batch 2 và batch 8; không có migration nên không trùng số |
| Bộ đếm IP dùng chung `127.0.0.1` làm test sai mật khẩu khoá lẫn nhau | Cao nếu chung server | Mỗi tệp một server, mỗi test một username và `CF-Connecting-IP` riêng như test KM-005 |
| **Ít chắc nhất:** "9 dòng × 2 cặp" tốn công kiểm tay | Chắc chắn | Có test tự động cả 9 dòng. Originator quyết thu hẹp ở `/verify` (Concern 18), Engineer không tự thu hẹp |
| **Ít chắc nhất:** chỉnh đồng hồ trên giả lập iOS | Cao | Simulator dùng giờ Mac, nên chỉnh giờ Mac ảnh hưởng cả laptop và server. Nếu không kiểm được AC87, AC91, AC92 trên cặp iOS thì mục đó quay lại originator (`intent.md` §5) |

## 5. Proofs

"Node" là `npm test`, "server" là `npm run test:server`, "sync" là `npm run test:sync -- <tệp>`, "tay" là originator kiểm từng cặp ở bước 12. Output ghi vào `implement.md`. Mỗi tệp sync kiểm thêm: không vi phạm CSP, không có secret trong log.

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-008-AC01` | Xoá trên A, đồng bộ; hai máy không còn item trong danh sách, có trong thùng rác | sync `trash`; tay |
| `KM-008-AC02` | Khôi phục trên B; so field, lịch sử, `scopes` với bản trước khi xoá trên cả hai máy | sync `trash`; tay |
| `KM-008-AC03` | Item vừa xoá được tìm trong mọi bộ lọc, bộ đếm, tìm kiếm, *Gần đây*, yêu thích, *Sắp hết hạn* | Node `vault-query`; sync `trash` |
| `KM-008-AC04` | Fork rồi xoá bản gốc; màn của B không còn liên kết, B không đổi | sync `trash` |
| `KM-008-AC05` | Trong thùng rác: không có nút sửa, fork, nhân bản, khôi phục bản lịch sử; xem field và lịch sử được | sync `trash` |
| `KM-008-AC06` | Xoá item, xoá mọi env, khôi phục: ở *Chưa gán*, `scopes` giữ id | Node `model`; sync `trash` |
| `KM-008-AC07` | Thùng rác trống có câu báo, không có nút Dọn | sync `trash` |
| `KM-008-AC08` | Xoá vĩnh viễn, đồng bộ; giải mã vault trong test bằng khoá thử, kiểm mọi trường đã trắng, kể cả giá trị đánh dấu không còn trong DOM | Node `model`; sync `trash`; tay |
| `KM-008-AC09` | Huỷ xác nhận; byte dòng vault không đổi, không có `PUT` | sync `trash` |
| `KM-008-AC10` | Hai vault, dọn X; lời xác nhận có tên và số; Y không đổi | sync `trash`; tay |
| `KM-008-AC11` | Store giả làm hỏng lần ghi của thao tác dọn: action trả lỗi, không item nào đổi | Node `session` |
| `KM-008-AC12` | So đủ ba ý ở ba chỗ, trên một hằng duy nhất và trên DOM | Node `ui-static`; sync `trash` |
| `KM-008-AC13` | Dò chuỗi giao diện theo danh sách cụm cấm | Node `ui-static` |
| `KM-008-AC14` | Biên 30 ngày + 1 ms với `now` truyền vào; bản đầu cuối dùng `seed-old-trash.mjs`, máy kia hội tụ | Node `model`, `session`; sync `trash`; tay |
| `KM-008-AC15` | Đúng 30 ngày: còn nguyên, hiện 0 ngày | Node `model`, `session` |
| `KM-008-AC16` | Item quá hạn ở vault chưa từng chọn trên máy; mở khoá, kiểm dòng vault đó đã đổi | Node `session`; sync `trash` |
| `KM-008-AC17` | `deletedAt` ở tương lai: còn nguyên, hiện 30 ngày | Node `model`; sync `trash` |
| `KM-008-AC18` | Không có item quá hạn: `store.writes` = 0, `dirty` không đổi | Node `session` |
| `KM-008-AC19` | Hỏng lần ghi ở bước tự xoá: mở khoá thành công, lần sau xoá được | Node `session` |
| `KM-008-AC20` | Đồng hồ truyền vào qua mốc hạn giữa phiên; mở thùng rác: item không hiện, đã xoá trắng | Node `session`; sync `trash` |
| `KM-008-AC21` | Từng dòng bảng xoá ở 05, tạo bằng thao tác thật với hai máy offline; so với kết quả đã ghi | sync `trash-conflict`, 9 trường hợp; tay |
| `KM-008-AC22` | Kiểm item sống, badge, câu "đã bị xoá ở thiết bị khác", bản lịch sử mang câu đó | sync `trash-conflict` |
| `KM-008-AC23` | Item sống với nội dung của B, badge, câu "đã bị xoá vĩnh viễn ở thiết bị khác" | sync `trash-conflict` |
| `KM-008-AC24` | Bấm "Đã xử lý" ở một máy; đồng bộ; hai máy mất đánh dấu | sync `trash-conflict` |
| `KM-008-AC25` | Form mở, A xoá, B đồng bộ, lưu, chọn *Khôi phục và lưu*: item sống với nội dung vừa sửa; chưa chọn thì draft còn | Node `vault-ops`; sync `trash-conflict` |
| `KM-008-AC26` | Như trên với xoá trắng, chọn *Lưu thành item mới*: có item mới, tombstone giữ nguyên | Node `vault-ops`; sync `trash-conflict` |
| `KM-008-AC27` | Secret đang hiện, cả khi mở hộp lịch sử; xoá trắng từ A; quét DOM kể cả `dialog`: không có giá trị | sync `trash-conflict` |
| `KM-008-AC28` | Phiên B mở; A tạo vault có màu; B thấy đúng tên, màu, không mở khoá lại | sync `vault-meta`; tay |
| `KM-008-AC29` | Bảng tên sai ở mức hàm; trên form, 64 ký tự được, các trường hợp còn lại bị từ chối | Node `vault-meta`; sync `vault-meta` |
| `KM-008-AC30` | CDP offline: tạo vault, thêm item, đổi tên vault khác; online; server và máy kia có đủ | sync `vault-meta` |
| `KM-008-AC31` | Chưa đăng ký, hai vault; đăng ký; thiết bị trống đăng nhập thấy đủ | Node `auth`; sync `vault-meta` |
| `KM-008-AC32` | CDP cắt phản hồi `201` của `POST`; lần sau `vault_exists`, kiểm id có trong danh sách, không lỗi, không bản trùng | Node `sync-engine`; sync `vault-meta` |
| `KM-008-AC33` | Hai máy offline đổi tên, cho đẩy theo cả hai thứ tự: hai máy hiện tên của B | Node `sync-engine`; sync `vault-meta`; tay |
| `KM-008-AC34` | Như AC33 với màu | sync `vault-meta`; tay |
| `KM-008-AC35` | A đổi tên, B đổi màu: hội tụ về nguyên bản muộn hơn | Node `merge`; sync `vault-meta` |
| `KM-008-AC36` | `pickVaultMeta` cùng `at`, khác `dev`, theo cả hai chiều | Node `merge`, cả `test:browser` |
| `KM-008-AC37` | Đổi tên offline, tải lại trang, có mạng: `PATCH` được gửi | Node `store`; sync `vault-meta` |
| `KM-008-AC38` | Đọc SQLite: `version` không đổi, `meta_version` tăng; version cũ ra `409` kèm bản hiện tại | server `vault-manage` |
| `KM-008-AC39` | Đặt dấu trong X, chuyển sang Y, quét toàn bộ chữ trên màn | sync `vault-switch`; tay |
| `KM-008-AC40` | Form có thay đổi, chuyển vault: hỏi; chọn ở lại thì form còn | sync `vault-switch` |
| `KM-008-AC41` | Khoá, mở, tải lại: vẫn Y; máy kia không đổi vault | sync `vault-switch` |
| `KM-008-AC42` | Mở, copy ở X và Y: *Gần đây* đúng vault, tối đa 5; danh sách cũ gán đúng vault | Node `settings`; sync `vault-switch` |
| `KM-008-AC43` | Bật "mọi vault", tìm, có tên và màu, chọn thì chuyển vault và mở item | Node `vault-query`; sync `vault-switch`; tay |
| `KM-008-AC44` | Có thùng rác và tombstone ở mọi vault: 0 kết quả | Node `vault-query` |
| `KM-008-AC45` | Giá trị chỉ trong field `secret`: 0 kết quả | Node `vault-query` |
| `KM-008-AC46` | Có bộ lọc project, bật "mọi vault": không bị giới hạn; khoá, mở: tuỳ chọn tắt | sync `vault-switch` |
| `KM-008-AC47` | Làm hỏng một dòng vault qua `READ_DB`; hai vault kia dùng được; vault hỏng không chọn, không xoá; báo bỏ qua 1 | Node `session`; sync `vault-switch` |
| `KM-008-AC48` | Sau `lock()`: mọi getter trả rỗng, thao tác ném `LockedError` | Node `session` |
| `KM-008-AC49` | Sai mật khẩu: vẫn ở hộp, không ở màn đăng nhập, dòng không đổi | sync `vault-delete`; tay |
| `KM-008-AC50` | Đúng mật khẩu: vault mất, chuyển sang vault còn lại | sync `vault-delete`; tay |
| `KM-008-AC51` | Gieo snapshot bằng SQL; xoá; dò mọi bảng theo id và theo chuỗi `ct`. KM-009 đã đóng thì chạy thêm với snapshot thật | server `vault-manage`; tay |
| `KM-008-AC52` | Máy kia không dirty, đang mở vault: có báo tên, chuyển vault, mất dòng | Node `sync-engine`; sync `vault-gone`; tay |
| `KM-008-AC53` | Máy kia dirty: vault còn, có báo, vault khác vẫn `PUT` được, không có `PUT` cho vault này | sync `vault-gone`; tay |
| `KM-008-AC54` | *Tạo lại*: `POST` đủ dữ liệu; máy đã xoá thấy như vault mới, mở được; máy thứ ba vẫn gộp đúng (A3) | Node `sync-engine`; sync `vault-gone`; tay |
| `KM-008-AC55` | *Bỏ* và xác nhận: dòng mất, SQLite không đổi | sync `vault-gone`; tay |
| `KM-008-AC56` | Giao diện từ chối, không hỏi mật khẩu; gọi trực tiếp ra `409 last_vault` | server `vault-manage`; sync `vault-delete`; tay |
| `KM-008-AC57` | Vault kia hỏng: từ chối ngay trên máy | Node `session`; sync `vault-delete` |
| `KM-008-AC58` | `Promise.all` hai `DELETE`, nhiều lượt: một `204`, một `last_vault`, còn một vault | server `vault-manage` |
| `KM-008-AC59` | CDP offline và trả `500`: báo cần có mạng, dòng và server không đổi | sync `vault-delete` |
| `KM-008-AC60` | Chưa đăng ký: đúng thì xoá, sai thì không, đếm request `/api/` = 0 | Node `session`; sync `vault-delete` |
| `KM-008-AC61` | CDP cắt phản hồi `204`; thử lại ra `404`; coi như xong, dòng mất | sync `vault-delete` |
| `KM-008-AC62` | Đọc `meta.account`, `meta.settings` qua `READ_DB`: không còn id vault, item | Node `store`; sync `vault-delete` |
| `KM-008-AC63` | User khác và id không tồn tại, body đúng và sai: phản hồi giống hệt | server `vault-manage` |
| `KM-008-AC64` | Đọc, ghi, đổi metadata bằng phiên chủ cũ: `not_found` | server `vault-manage` |
| `KM-008-AC65` | 5 lần sai; lần 6 đúng và đăng nhập mới đều `429`; phiên đang có vẫn đọc, ghi được | server `vault-manage` |
| `KM-008-AC66` | 4 lần sai qua đăng nhập, 1 lần qua xoá: bị khoá | server `vault-manage` |
| `KM-008-AC67` | Máy chỉ có Y, cắt ngay sau khi nhận X bằng tải lại trang: không lúc nào 0 dòng | Node `sync-engine`; sync `vault-gone` |
| `KM-008-AC68` | Form mở lúc vault bị xoá: lưu thì đi AC53, huỷ thì đi AC52 | sync `vault-gone` |
| `KM-008-AC69` | `POST …/rotate` ra `404`; không có chữ xoay khoá trên giao diện | server `routing-headers`; Node `ui-static` |
| `KM-008-AC70` | Hai test đã sửa xanh, các từ còn lại vẫn bị chặn; có test dương tính | `npm test`, `npm run test:e2e` |
| `KM-008-AC71` | Đọc lại các tài liệu ở FR36; `rg -n "rotate\|xoay khoá"` trong phạm vi epic | Bước 11, verifier |
| `KM-008-AC72` | Đọc lại `KM-014.md`, đủ mục FR37 | Bước 11, verifier |
| `KM-008-AC73` | Đo theo NFR01, NFR02, trung vị 5 lần; ghi số | sync `km008-perf`; `verify.md` |
| `KM-008-AC74` | Sau chuỗi AC: dò SQLite, tệp dữ liệu, mọi body qua CDP, ở dạng gốc, base64, hex | sync `km008-privacy`; server `privacy` |
| `KM-008-AC75` | Chuỗi đánh dấu trong password, tên vault, tiêu đề; theo dõi console, lỗi, URL | sync `km008-privacy` |
| `KM-008-AC76` | Tên chứa `<img src=x onerror=…>` ở ba nơi: hiện nguyên văn, 0 vi phạm CSP, 0 thực thi | sync `km008-privacy` |
| `KM-008-AC77` | Store giả làm hỏng từng lần ghi của tạo vault, dọn, tự xoá; mở lại mọi vault | Node `session`, `store` |
| `KM-008-AC78` | Service Worker cài rồi, CDP offline: đi hết thao tác NFR07 | sync `vault-switch`; tay |
| `KM-008-AC79` | Meta `{ name, color, order }` không có `at`: mở, đổi tên, bản có thời điểm thắng; `npm run vectors` không đổi | Node `merge`, `session`; lệnh |
| `KM-008-AC80` | Đo vùng chạm trên `page.phone()`; đi bằng bàn phím; Back trên Android | sync `vault-switch`; tay |
| `KM-008-AC81` | Chạy `npm test`, `test:browser`, `test:e2e`, `test:server`, `test:sync`; `dependencies` rỗng; test tĩnh chặn `Date.now` trong `core/` | Lệnh, dán output |
| `KM-008-AC82` | Đăng ký rồi, offline, tạo N, thêm item, xoá: 0 request; có mạng lại: N không có trên server, máy kia | sync `vault-delete`; tay |
| `KM-008-AC83` | Vault chưa gửi, sai mật khẩu: không xoá, ở lại hộp | Node `session`; sync `vault-delete` |
| `KM-008-AC84` | CDP giữ `POST` rồi cắt mạng: `sent` là chưa rõ, xoá bị từ chối, tải lại vẫn vậy | Node `store`; sync `vault-delete` |
| `KM-008-AC85` | Server đã nhận qua AC84; có mạng, xoá: server không còn vault | server `vault-manage`; sync `vault-delete` |
| `KM-008-AC86` | Chạy song song xoá và đợt đẩy trên hàng đợi, hai thứ tự, ở mức session với API giả; kết quả chỉ một trong hai | Node `sync-engine`, `session` |
| `KM-008-AC87` | Sửa `X-Server-Time` qua CDP ±61 phút: lỗi hiện cả hai chiều. Trên giả lập: chỉnh đồng hồ | Node `clock-check`; sync `clock`; tay |
| `KM-008-AC88` | ±59 phút: không lỗi | Node `clock-check`; sync `clock` |
| `KM-008-AC89` | Đang lệch, thử từng thao tác: có lý do, dòng không đổi, 0 `PUT`, `POST`, `PATCH`, `DELETE` | sync `clock`; tay |
| `KM-008-AC90` | Đang lệch: mở khoá, xem, hiện, copy, khoá được; OTP có ghi chú | sync `clock`; tay |
| `KM-008-AC91` | Lệch, có thay đổi chờ và form mở; hết lệch: lỗi mất, form còn, lưu được, thay đổi lên server | sync `clock`; tay |
| `KM-008-AC92` | `Date` của trang nhanh 40 ngày, item xoá cách đây 1 ngày: không bị xoá trắng, có lỗi | sync `clock`; tay |
| `KM-008-AC93` | Lần kiểm cuối là lệch, tải lại, CDP offline: có cảnh báo, sửa được, không tự xoá | Node `session`; sync `clock` |
| `KM-008-AC94` | Offline và chưa đăng ký, kiểm cuối không lệch, item quá hạn: xoá trắng, 0 request ở nhánh chưa đăng ký | Node `session`; sync `clock` |
| `KM-008-AC95` | Trả giờ giả qua CDP: giải mã vault không có giá trị đó; không item nào bị xoá trắng vì nó | Node `sync-engine`; sync `clock` |

## 6. Feedback loop

Dùng lại vòng của KM-006, tất cả chạy trên Mac:

- **Logic:** `npm test`, gồm `sync-engine` với API giả và đồng hồ truyền vào.
- **Server:** `npm run test:server -- test/server/vault-manage.server.js`, đọc SQLite qua `server.sql`.
- **Thật:** `npm run test:sync -- <tệp>`, hai hồ sơ Chrome trên `wrangler pages dev` thật. Tạo lỗi từ bên ngoài bằng CDP (`Fetch`, `Network`) và SQLite, không có cửa sau trong `src/`.
- **Giao diện:** `page.shot()` ở desktop và `page.phone()`.
- **Giả lập:** `npm run dev:server`, `adb reverse`, `testkit/device-gate.mjs`; `testkit/seed-old-trash.mjs` cho dữ liệu quá hạn.
- Hết mỗi batch: chạy lại mọi lệnh test, `npm run sw-version` nếu có tệp mới.

## 7. Deliberately not doing

- Xoay khoá vault: `POST /api/vaults/:id/rotate` vẫn `404` (FR34). Câu trong `docs/06` chuyển về KM-011.
- Không đổi quy tắc gộp vault, không đổi vector, không có migration, không đổi phiên bản IndexedDB, không đổi CSP.
- Không dùng `vaults[].deletedAt`, không xoá trường đó khỏi dòng cũ: không có lợi gì mà phải đụng dữ liệu đang có.
- Không thêm nhật ký cho thao tác vault; không dọn `dt_audit_log` khi xoá vault (dòng nhật ký không chứa blob, meta hay khoá).
- Không thêm thao tác đổi `order`, xoá vault hỏng, chuyển item giữa các vault, tìm trong thùng rác, hoàn tác, hành động hàng loạt ngoài *Dọn*.
- Không dùng giờ server để tính hạn 30 ngày hay ghi vào vault (NFR12); không phát hiện đồng hồ sai khi offline.
- Không làm Web Worker cho giải mã nhiều vault trừ khi NFR01 không đạt, và khi đó quay lại PO trước.
- Không sửa testkit cho Windows: máy này chỉ lên plan.
- Mọi việc Cloudflare thật, gồm `X-Server-Time`, `DELETE` kèm body, xoá snapshot trên D1 thật, thuộc `KM-014` (FR37).
