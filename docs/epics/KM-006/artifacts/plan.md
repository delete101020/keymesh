# Implementation Plan — Đồng bộ đa thiết bị

**Epic ID:** `KM-006`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `spec.md`

---

## 1. Approach

Toàn bộ thay đổi nằm ở client và testkit; `src/functions/`, `src/migrations/`, `merge.js` và vector không đổi (FR39, AC50). Thêm ba module: `api.js` (gọi HTTP, đổi response thành kết quả có kiểu, không giữ trạng thái), `auth.js` (đăng ký, đăng nhập, đăng xuất, xoá dữ liệu) và `sync.js` (lịch chạy, backoff, trạng thái từng vault). **`sync.js` không bao giờ cầm khoá hay plaintext.** Mọi việc cần khoá đi qua các phương thức mới của `session.js`, chạy trên đúng hàng đợi của `mutate()`. Nhờ vậy kết quả đồng bộ và lần lưu không chồng lên nhau (FR21), và khoá app giữa lượt chỉ làm lần ghi kế tiếp ném `LockedError` (AC40). `session.js` chuyển từ một vault sang `Map` theo vault, mỗi mục giữ `vault`, `baseVault`, `vaultKey`, `meta`; `session.vault` vẫn trả về vault đang hiện, nên các màn hình hiện có không đổi.

Ba điểm dễ mất dữ liệu được giải bằng cách sau:

- **Thay đổi chờ khi đang đẩy (FR18, Concern 12).** Không thêm bộ đếm. Mỗi lần mã hoá có IV ngẫu nhiên, nên lúc nhận `200` chỉ cần một transaction: đọc dòng, ghi `base` là bản đã gửi, và chỉ đặt `dirty = false` nếu `current.envelope` vẫn có đúng IV đã gửi.
- **Đẩy thừa và xung đột giả (FR26, NFR06).** Sau khi gộp, nếu nội dung bản gộp bằng bản server thì xoá `dirty` và không đẩy. Trường hợp máy đã đẩy nhưng mất phản hồi sẽ tự hội tụ: `merge(base, L, L)` ra `L`, không có đánh dấu, không có lần đẩy thêm.
- **Bản nháp (FR22, Concern 13).** `commitDraft` so bản nháp với lúc mở (`draftBaseline` đã có sẵn trong state) rồi dựng patch chỉ gồm thứ người dùng đã đổi, áp lên item mới nhất. `updateItem` đã bỏ qua khoá vắng mặt, nên không phải đổi `core/`.

**Phương án bị loại 1: Web Worker cho đồng bộ và gộp.** Cách đó tránh chặn giao diện, nhưng phải chuyển khoá sang một ngữ cảnh khác, làm hai bản trạng thái, và thêm một đường cho khoá đi trong khi lõi đang chạy tốt ở luồng chính. Giữ luồng chính, đo theo NFR09 (AC49); vượt ngưỡng thì báo originator, không tự đổi.

**Phương án bị loại 2: `indexedDB.deleteDatabase` cho xoá dữ liệu (Concern 16).** Lệnh này bị chặn khi tab khác còn giữ kết nối, mà mọi tab giữ kết nối từ lúc mở. Thay bằng `clear()` cả hai object store trong **một transaction**: trọn vẹn, không bị chặn, kết nối của tab khác vẫn hợp lệ nhưng chỉ đọc thấy rỗng. Tab đang mở khoá giữ Web Lock, nên thao tác xoá phải giành được khoá đó trước. Tab khác đang ở màn khoá không ghi được gì; `BroadcastChannel` đưa nó về màn thiết bị trống, và `unlock` khi không còn tài khoản cũng đi về đó.

**Phương án bị loại 3: test client bằng server giả.** Lõi của `sync.js` có test nhanh với API giả trong `npm test`, nhưng bằng chứng cho AC là hai hồ sơ Chrome thật trên `wrangler pages dev` thật. Lỗi được tạo từ bên ngoài bằng CDP (`Fetch`, `Network.emulateNetworkConditions`) và SQLite, không có cửa sau trong mã (NFR14).

### Trả lời Concern 1 (chạy thử 2026-11-02)

**Phần đã thấy, trên máy Windows** (bản sao trong scratchpad, `wrangler` 4.156.0, Chrome headless):

| Câu hỏi | Kết quả |
|---|---|
| App và API cùng origin trên `wrangler pages dev`? | Được. `isSecureContext` true, Service Worker đăng ký được, CSP và `Cache-Control: no-cache` của `_headers` có trên `/` |
| Origin qua được khi `ALLOWED_ORIGINS` là chính URL đó? | Được. `POST /api/register` từ trang ra `403 registration_closed` (đã qua cổng Origin), `GET /api/vaults` ra `401` |
| Test tách được mạng khỏi server không? | Được. `Network.emulateNetworkConditions` làm `navigator.onLine` false, `fetch` ném `TypeError`, có đủ sự kiện `offline` và `online` |

**Phần chưa thấy: giả lập Android và iOS.** Máy Windows này không có Android SDK và Xcode. Originator chốt (2026-11-02): **máy này chỉ lên plan, implement và kiểm tay chạy trên Mac.** Vì vậy Concern 1 **chưa đóng**: bước 1 ở §3 là cổng chặn, chạy trước khi viết mã, thiếu phần nào thì dừng và báo originator (FR41). Testkit hiện chỉ chạy trên POSIX, và đó là đúng môi trường implement nên plan không sửa. Trên máy Windows, `npm test` đỏ 1 test vì CRLF; đây không phải mức nền của epic.

**Cách dự kiến, bước 1 sẽ xác nhận:** laptop dùng `http://127.0.0.1:8788`; Android qua `adb reverse tcp:8788 tcp:8788` (tiền lệ KM-004), ngắt bằng `adb reverse --remove`; iOS dùng chung loopback của Mac nhưng không có chế độ máy bay và không tách được bằng cách ngắt mạng Mac, nên đi qua một cổng riêng `127.0.0.1:8789` do `testkit/device-gate.mjs` chuyển tiếp TCP. Tắt tiến trình đó thì chỉ giả lập iOS mất server, còn laptop vẫn chạy. `ALLOWED_ORIGINS` liệt kê cả hai origin. Hệ quả: ngắt theo cách này không phát sự kiện `online`, nên hồi phục trên giả lập đi theo backoff (≤ 65 s) hoặc về foreground; nhánh `online` có bằng chứng từ Chrome qua CDP.

### Quyết định spec chưa nói, cần originator duyệt cùng plan

1. **Server có version thấp hơn bản trên máy.** Không ghi đè, không đẩy, báo lỗi riêng vault đó. Nếu theo 05, một lần server bị khôi phục về bản cũ sẽ âm thầm kéo lùi dữ liệu trên máy. Cùng tinh thần Concern 17.
2. **`dirty` còn nhưng N = 0** (sửa rồi sửa về đúng bản chung; đồng hồ và lịch sử vẫn khác). AC42 buộc không đếm. Vẫn đẩy bình thường; thanh trạng thái hiện "Offline" không kèm số; hộp thoại FR12 báo chỉ còn lịch sử sửa sẽ mất. Quyết định xoá dựa trên `dirty`, không dựa trên N.
3. **`401` được ghi xuống máy:** `meta.session` thành `{ token: null, needsLogin: true }`, nên mở lại app không gửi thêm request nào (AC32, NFR10). Không có dòng `session` nghĩa là "Đã đăng xuất". Sửa 03.
4. **Thay thế tài khoản: tải và giải mã xong rồi mới xoá.** Tài khoản mới được ghi đè tài khoản cũ trong một transaction, thay vì xoá trước như thứ tự chữ ở FR09. Kết quả giống hệt, nhưng mất mạng giữa chừng thì A còn nguyên.
5. **Vault hỏng trên thiết bị mới.** FR28 chọn vault có `createdAt` nhỏ nhất; nếu vault đó không mở được thì mở vault kế tiếp mở được, vẫn ghi dòng vault hỏng và báo lỗi riêng. Tất cả hỏng thì máy vẫn trống và báo lỗi.
6. **Lệnh test mới `npm run test:sync`**, tệp `test/sync/*.sync.js`, cần Chrome và `wrangler`, không nằm trong `npm test`. Thêm vào quy ước ở `CLAUDE.md` và vào danh sách lệnh của NFR13, AC50.
7. **Từ cấm còn ở `test/ui-static.test.js:76`**, ngoài `sweep.e2e.js` mà Concern 10 nêu. Bỏ đúng ba từ ở cả hai nơi.
8. **Lịch khi ở nền.** Không hỏi định kỳ và không thử lại khi `hidden` (AC22, NFR10), nhưng lần đẩy đã hẹn 1,5 s vẫn chạy một lần để lưu xong rồi chuyển tab không làm trễ máy kia. Về foreground thì chạy một lượt ngay.
9. **Từ xác nhận là `XOÁ`** ở FR09 và FR12.

## 2. Files

Không thêm thư mục gốc nào. Không đổi phiên bản IndexedDB: `meta.session` đã nằm trong sơ đồ ở 03 §3.

| Path | Change | Why |
|---|---|---|
| `testkit/device-gate.mjs` | Mới: chuyển tiếp TCP cho một giả lập, tắt được riêng | Concern 1, AC51 |
| `testkit/wrangler-server.mjs` | Sửa: `ALLOWED_ORIGINS` tính được từ URL của chính server; `sql`/`exec` đã có | App và API cùng origin trong test |
| `testkit/e2e/driver.mjs` | Sửa: `startApp({ url })` dùng server ngoài; `page.setOffline()`; `page.intercept()` qua CDP `Fetch`; ghi status response; đọc mọi kho của trang | FR40, NFR14 |
| `testkit/sync-devices.mjs` | Mới: hai hồ sơ Chrome trên một server, luồng đăng ký, đăng nhập, ngắt mạng, quét dữ liệu | FR40 |
| `testkit/memory-store.mjs` | Sửa: thêm mọi phương thức mới của store, kèm chế độ hỏng lần ghi | Test `session`, `sync` trên Node |
| `src/public/js/core/model.js` | Sửa: thêm `clearItemConflict(vault, itemId, ctx)`: `conflict = null`, `rev + 1`, `updatedAt`, không thêm lịch sử, không đổi đồng hồ | FR37, Concern 16b |
| `src/public/js/store.js` | Sửa: đọc, ghi, xoá `meta.session`; `updateAccount`; `createAccount` nhận thêm phiên; `addVaultRow`; `commitRegistration`, `commitPush` (so IV), `commitPull`; `replaceAccount`; `wipe`; `hasPasskey` | FR04, FR07, FR09, FR13, FR18, FR21 |
| `src/public/js/session.js` | Sửa: `Map` theo vault, giữ `accountKey`, `baseVault`, vault đang hiện (`activeVaultId` lưu trong `meta.account`); thêm `applyRemote`, `commitPushed`, `addRemoteVault`, `markRegistered`, `pendingCount`; lỗi riêng từng vault khi mở | FR19–FR23, FR27, FR28, FR32 |
| `src/public/js/vault-ops.js` | Sửa: `commitDraft` nhận bản lúc mở, chỉ áp phần đã đổi; thêm thao tác bỏ đánh dấu | FR22, FR37 |
| `src/public/js/vault-diff.js` | Mới: đếm item, project, env khác bản chung, bỏ qua `rev`, `updatedAt`, `clock`, `history` | FR32, Concern 14 |
| `src/public/js/password-strength.js` | Mới: ba mức theo số ký tự sau NFC | FR02 |
| `src/public/js/api.js` | Mới: gọi API, Bearer, timeout 30 s, kết quả theo mã lỗi, `Retry-After`; không giữ gì | FR05, FR06, FR24, FR25 |
| `src/public/js/auth.js` | Mới: kiểm username, đăng ký, đăng nhập (trống, cùng tài khoản, khác tài khoản), đăng xuất, xoá dữ liệu | FR03–FR14 |
| `src/public/js/sync.js` | Mới: máy lịch một lượt, ETag trong bộ nhớ, backoff, trạng thái toàn cục và từng vault; thời gian, mạng, foreground được truyền vào | FR15–FR34 |
| `src/public/js/vault-query.js` | Sửa: đếm item có `conflict` | FR35 |
| `src/public/js/app.js` | Sửa: nối các phần trên; hành động đăng ký, đăng nhập, đăng xuất, "Đồng bộ ngay", "Đã xử lý"; quy tắc vẽ lại sau đồng bộ (không vẽ lại form đang sửa); `BroadcastChannel`; về màn thiết bị trống | FR21, FR22, FR25, Concern 16 |
| `src/public/js/ui/gate.js` | Sửa: lối đăng nhập ở màn trống và màn khoá; thanh độ mạnh | FR01, FR02, FR09 |
| `src/public/js/ui/account-dialogs.js` | Mới: đăng ký, đăng nhập lại, thay thế tài khoản, đăng xuất | FR03, FR09–FR12, FR25 |
| `src/public/js/ui/sync-status.js` | Mới: thanh dưới ở desktop, chấm đầu trang ở mobile, chi tiết từng vault | FR30, FR31, FR33, FR34, NFR11 |
| `src/public/js/ui/shell.js` | Sửa: gắn thanh trạng thái, vẽ vùng `sync`, thêm tham số xác nhận cho `createApp` | FR31 |
| `src/public/js/ui/detail.js` | Sửa: badge dẫn tới lịch sử, tô sáng có ký hiệu ⚠, phần không có dòng ghi bằng chữ, nút "Đã xử lý" | FR35–FR38 |
| `src/public/js/ui/list.js`, `ui/home.js`, `ui/nav.js` | Sửa: badge ⚠ trên dòng item, số item xung đột | FR35 |
| `src/public/js/ui/history-dialog.js` | Sửa: câu "đã bị xoá ở thiết bị khác" khi `note` là `deleted-elsewhere` | FR38 |
| `src/public/styles.css` | Sửa: thanh trạng thái, chấm, badge, tô sáng, thanh độ mạnh | FR31, FR35, FR36 |
| `src/public/sw.js` | Sinh lại bằng `npm run sw-version` (tệp mới vào `SHELL`) | KM-004 test `sw.js` |
| `src/wrangler.toml` | Sửa một comment: id thật do `KM-014` đặt | FR43 |
| `package.json` | Sửa: script `test:sync`; không thêm phụ thuộc | FR40, NFR13 |
| `test/session.test.js`, `test/store.test.js`, `test/vault-ops.test.js`, `test/model.test.js`, `test/vault-query.test.js` | Sửa: thêm trường hợp mới | FR22, FR28, FR37 |
| `test/sync-engine.test.js`, `test/auth.test.js`, `test/vault-diff.test.js`, `test/password-strength.test.js` | Mới: chạy trong `npm test`, không cần cài gì | FR40 |
| `test/ui-static.test.js`, `test/e2e/sweep.e2e.js` | Sửa: bỏ ba từ khỏi danh sách cấm, giữ phần còn lại | FR45, Concern 10 |
| `test/sync/{account,logout,flow,failure,cadence,status,conflict,privacy,stress,perf}.sync.js` | Mới: hai trình duyệt thật trên server cục bộ thật | FR40, §5 |
| `.claude/CLAUDE.md`, `README.md` | Sửa: quy ước `test:sync`; `api.js`, `auth.js` trong phân lớp; cách nối giả lập | `CLAUDE.md` |
| `docs/02,03,04,05,06,07,08,09` | Sửa theo FR44; thêm 02 cho cây tệp | FR44, `CLAUDE.md` |
| `docs/epics/KM-006/KM-006.md`, `KM-008/KM-008.md`, `KM-009/KM-009.md`, ghi chú ở KM-003 | Sửa | FR42, FR45 |
| `docs/epics/KM-014/` (`KM-014.md`, `inputs.json`, `pipeline.yaml`, `state.json`) | Mới, cùng dạng với KM-013 | FR43 |
| `docs/epics/KM-006/artifacts/implement.md` | Mới: bằng chứng, số đo, bảng AC51 | FR41, NFR09 |

## 3. Order

1. **Cổng Concern 1, trên Mac.** `npm ci`, chạy cả năm lệnh hiện có để có mức nền, viết `testkit/device-gate.mjs`, chạy `npm run dev:server`. Từ Chrome, giả lập Android và giả lập iOS, cả tab lẫn app đã cài: kiểm `isSecureContext`, `POST` qua được Origin, ngắt riêng từng thiết bị khi hai thiết bị kia vẫn tới server. *Sau bước này:* Concern 1 có câu trả lời ghi trong `implement.md`. **Thiếu phần nào thì dừng và báo originator, không viết mã.**
2. **Vòng phản hồi.** Sửa `wrangler-server.mjs`, `driver.mjs`, thêm `sync-devices.mjs`, script `test:sync`, một test khói: hai hồ sơ Chrome mở app trên cùng server, một `fetch` từ mỗi bên, ngắt một bên. *Sau bước này:* viết được test AC.
3. **Lõi.** `clearItemConflict`, test, 09. *Sau bước này:* FR37 có thao tác thuần, `test:browser` vẫn xanh.
4. **Kho và phiên.** `store.js`, `memory-store.mjs`, `session.js` nhiều vault. App vẫn chạy như M2. *Sau bước này:* `session` gộp, đánh dấu đã đẩy, thêm vault được, chạy trên Node; mọi test và E2E cũ xanh.
5. **Các hàm thuần.** `commitDraft` theo phần đã đổi, `vault-diff.js`, `password-strength.js`, đếm xung đột. *Sau bước này:* FR22, FR32, FR02 có test đơn vị.
6. **`api.js`, `auth.js`.** Có test với `fetch` giả. *Sau bước này:* mọi nhánh đăng nhập, FR08, FR09, FR13 chạy được ở mức logic.
7. **`sync.js`.** Test bằng API giả và đồng hồ truyền vào: lịch, backoff, 409, FR18, FR23, FR25, FR26, FR27, ETag. *Sau bước này:* máy đồng bộ đúng, chưa nối vào app.
8. **Nối vào `app.js`.** Vòng đời theo mở khoá và khoá, sự kiện, vẽ lại sau đồng bộ, `BroadcastChannel`. *Sau bước này:* hai trình duyệt đồng bộ được với tài khoản tạo sẵn qua test.
9. **Giao diện tài khoản.** `gate.js`, `account-dialogs.js`, bỏ ba từ cấm, test `account.sync.js`, `logout.sync.js`. *Sau bước này:* AC01–AC20 xanh.
10. **Giao diện trạng thái và xung đột.** `sync-status.js`, `detail.js`, `list.js`, `home.js`, `nav.js`, `history-dialog.js`, CSS, `status.sync.js`, `conflict.sync.js`. *Sau bước này:* AC41–AC46 xanh.
11. **Bộ đồng bộ đầy đủ.** `flow`, `failure`, `cadence`, rồi `privacy`, `stress`, `perf`; `sw-version`. *Sau bước này:* AC21–AC40 và AC47–AC50 xanh, có số đo NFR09.
12. **Tài liệu.** FR42–FR45, brief KM-014, `CLAUDE.md`, README. *Sau bước này:* AC52 đọc lại được, chạy lại AC50.
13. **Originator kiểm tay AC51** trên từng cặp, trên Mac. Ghi kết quả từng mục, từng cặp vào `implement.md`.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — steps 1–2: đã biết giả lập nối được hay không, có vòng hai trình duyệt. Dừng ở đây nếu cổng không qua.

**Batch 2** — steps 3–5: lõi, kho, phiên nhiều vault, hàm thuần; app vẫn như M2, mọi bộ test cũ xanh.

**Batch 3** — steps 6–7: `auth.js`, `sync.js` đúng trên Node, chưa nối vào giao diện.

**Batch 4** — steps 8–9: đăng ký, đăng nhập, đăng xuất, xoá dữ liệu chạy thật; AC01–AC20 xanh.

**Batch 5** — step 10: thanh trạng thái và xung đột; AC41–AC46 xanh.

**Batch 6** — step 11: toàn bộ test tự động xanh, có số đo.

**Batch 7** — step 12: tài liệu và KM-014 khớp.

**Batch 8** — step 13: phần của originator, không phải phiên agent.

## 4. Risks

Tìm bằng `rg` vì phiên này không có công cụ `codegraph`: `session.*` chỉ được gọi từ `app.js` và `test/session.test.js`, `test/store.test.js`; `commitDraft` từ `app.js`, `test/vault-ops.test.js`; `memoryStore` từ hai test trên; ngoài `core/` chưa có gì import `merge`.

| Risk | Likelihood | What we do about it |
|---|---|---|
| Giả lập iOS hoặc Android không nối được hoặc không ngắt riêng được | Trung bình, chưa ai thử | Bước 1 là cổng trước khi viết mã. Thiếu phần nào thì originator quyết (FR41) |
| Đổi `session.js` làm hỏng app M2 (blast radius: `app.js` và hai tệp test) | Thấp | Giữ nguyên các getter đang dùng; bước 4 chỉ xong khi `npm test` và `test:e2e` cũ xanh, không sửa test cũ để cho xanh |
| Vẽ lại sau đồng bộ làm mất chữ đang gõ hoặc con trỏ trong form | Cao nếu không chặn | Ở chế độ `edit` và `pick`, đồng bộ không phát vùng `detail`; AC28, AC29 gõ dở lúc nhận thay đổi |
| Hộp thoại đang mở (lịch sử, quản lý project, fork) trỏ tới thực thể vừa đổi | Trung bình | Thao tác thất bại đi qua `change()` và báo lỗi, không ghi hỏng. Không làm cơ chế đóng tự động |
| Lưu bản nháp theo phần đã đổi làm sai thứ tự field, hoặc gặp field máy khác vừa xoá (`applyFields` ném lỗi với field đã xoá) | Trung bình | Test riêng: thêm, xoá, đổi thứ tự, field đã bị xoá. Field đã xoá mà người dùng không đụng thì bỏ qua; có đụng thì giữ bản nháp và báo (FR22) |
| Gộp 200 KB chặn luồng chính quá 300 ms | Thấp, chưa có số đo trên máy dev | Đo ở AC49. Đạt trên máy dev là đủ theo NFR09; vượt ngưỡng thì báo originator, phương án Worker đã loại ở §1 sẽ phải mở lại |
| Đồng hồ giả lập lệch máy chủ làm bản sửa cũ thắng | Trung bình | Là hành vi đã có của quy tắc gộp, bản thua vẫn trong lịch sử. Không sửa; ghi vào `implement.md` nếu gặp khi kiểm tay |
| Bộ đếm IP chống dò dùng chung `127.0.0.1` làm test đăng nhập sai khoá lẫn nhau | Cao nếu chung server | Mỗi tệp `.sync.js` một server, đếm số lần sai trong tệp |
| Test thời gian thật lâu và chập chờn (backoff 142 s, ba lần hỏi 150 s) | Trung bình | Logic chi tiết nằm ở test Node với đồng hồ truyền vào; test thật chỉ chạy một lần mỗi loại, `--test-timeout` riêng, chờ theo điều kiện thay vì ngủ cứng |
| **Khó đảo ngược:** xoá dữ liệu | Thấp | Một transaction; gõ `XOÁ` khi có dữ liệu chưa lên server. Chỉ có dữ liệu thử (NFR15) |
| **Khó đảo ngược:** dạng lưu mới (`meta.session`, `activeVaultId` trong `meta.account`) mà KM-007, KM-008 sẽ đọc | Thấp | Ghi vào 03 trong cùng thay đổi; vẫn là IndexedDB version 1; tài khoản KM-003 thiếu `activeVaultId` thì lấy vault duy nhất |
| KM-007 chạy song song cũng sửa `session.js`, `store.js`, `gate.js` | Trung bình | Dùng đúng khoá `meta.passkey` ở 03, chỉ đọc sự tồn tại để nhắc. Bên đóng sau rebase và thêm test passkey thật (Concern 6) |
| **Ít chắc nhất:** `clear()` không xoá ngay khỏi tệp LevelDB, nên username, token cũ còn trên đĩa tới khi trình duyệt dọn | Trung bình | NFR04 chỉ quét qua API nên vẫn đạt, nhưng intent §5 nói "soi dữ liệu app để lại". Test chạy thêm `grepDir` trên hồ sơ Chrome, ghi kết quả vào `implement.md`. Còn sót thì báo originator; phiên thì đã huỷ khi có mạng |
| **Ít chắc nhất:** "ở nền" trên giả lập iOS có thể treo `fetch` và timer khác Chrome | Trung bình | Timeout 30 s biến request treo thành lỗi mạng; về foreground luôn chạy lại; kiểm trong AC51 |

## 5. Proofs

Test đặt tên theo tiền lệ `KM-006 ACnn …`. "Node" là `npm test`, "sync" là `npm run test:sync`, cả hai đều ghi output vào `implement.md`. Mỗi tệp sync kiểm thêm: không vi phạm CSP, không có secret trong log.

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-006-AC01` | Thiết bị trống, CDP offline, tạo tài khoản, item, khoá, mở; đếm request `/api/` = 0 | sync `account` |
| `KM-006-AC02` | Bảng độ mạnh ở mức hàm; trên cả hai form, không mức nào chặn, mức Yếu ở form đăng ký có cảnh báo | Node `password-strength`; sync `account` |
| `KM-006-AC03` | Đăng ký xong, so từng byte dòng trên máy với SQLite; khoá, mở; máy thứ hai đọc lại | sync `account` |
| `KM-006-AC04` | Username rỗng, 65 ký tự, ký tự lạ, mật khẩu sai: có lỗi, đếm request = 0. Quy tắc username đối chiếu với server | Node `auth`; sync `account` |
| `KM-006-AC05` | CDP ngắt, token sai, username trùng, id vault trùng, `500` do trigger SQLite: thông báo khác nhau, dòng trên máy không đổi, quét kho không có token đăng ký | sync `account` |
| `KM-006-AC06` | CDP cắt phản hồi `201` sau khi server đã ghi, sửa thêm, đăng nhập: không hỏi thay thế, thay đổi lên server, phần không đổi không có `conflict` | sync `account` |
| `KM-006-AC07` | Đăng nhập máy trống, offline, khoá, mở, so dữ liệu, so `deviceId` | sync `account` |
| `KM-006-AC08` | CDP làm hỏng lần tải blob; store giả ở mức Node cho lần ghi; tải lại trang vẫn ở màn trống, đăng nhập lại được | Node `auth`; sync `account` |
| `KM-006-AC09` | So nguyên văn hai câu lỗi; `429` thật sau khi vượt ngưỡng, số phút khớp `Retry-After` | sync `account` |
| `KM-006-AC10` | CDP thay response `prelogin` bằng `iter` 599 999 và 6 000 001; 0 request `POST /api/login` | sync `account` |
| `KM-006-AC11` | A chưa đăng ký hoặc có thay đổi chờ, đăng nhập B, Huỷ: dòng A không đổi, token vừa tạo bị server từ chối, mở A bằng mật khẩu cũ | sync `account` |
| `KM-006-AC12` | Thay thế không có từ xác nhận: nút không làm được; có từ: quét NFR04 không còn A, có B; A đã đăng ký và sạch: một bước | sync `account` |
| `KM-006-AC13` | Từ màn khoá, không nhập mật khẩu A; đăng nhập B đúng thì hỏi; sai thì không hỏi, A nguyên | sync `account` |
| `KM-006-AC14` | Đăng xuất giữ dữ liệu: token cũ `401`, không còn `meta.session`, mở offline được, 0 request đồng bộ, máy kia vẫn chạy | sync `logout` |
| `KM-006-AC15` | Offline, đăng xuất, mở, sửa, online, đăng nhập: có thông báo, máy kia nhận đủ | sync `logout` |
| `KM-006-AC16` | Offline, N đúng trong cảnh báo; Huỷ, giữ dữ liệu, thiếu từ xác nhận đều không mất gì | sync `logout` |
| `KM-006-AC17` | Online: lên server trước, không cảnh báo; CDP cho `500`: có cảnh báo như AC16 | sync `logout` |
| `KM-006-AC18` | Đặt `meta.passkey` trong kho, xoá dữ liệu, quét NFR04, có lời nhắc, máy kia vẫn đồng bộ. Passkey thật theo Concern 6 nếu KM-007 đóng trước. Thêm `grepDir` ở §4 | sync `logout` |
| `KM-006-AC19` | Đặt `meta.passkey`, ghi mọi body request qua CDP: không chứa giá trị; đăng nhập cùng tài khoản và đăng xuất giữ dữ liệu không đổi bản ghi | sync `logout` |
| `KM-006-AC20` | Tab thứ hai ở màn khoá, xoá ở tab đầu: hoàn tất, không treo; tab kia về màn trống; thao tác tiếp, quét không có dữ liệu cũ | sync `logout` |
| `KM-006-AC21` | Đợi lần hỏi của B qua CDP rồi A tạo item gán hai env; đo tới lúc B hiện ở cả hai env ≤ 60 s | sync `flow` |
| `KM-006-AC22` | B khoá, rồi B ở nền: 0 request trong lúc đó; mở khoá hoặc về foreground: hiện ≤ 10 s | sync `flow` |
| `KM-006-AC23` | B offline đổi mật khẩu, online; A nhận; lịch sử có bản cũ | sync `flow` |
| `KM-006-AC24` | Hai máy offline cùng sửa Password, cùng online: cùng nội dung, chỉ field đó có đánh dấu, lịch sử có bản thua, ≤ 2 lần `PUT` | sync `flow` |
| `KM-006-AC25` | Password và Ghi chú: có cả hai, không badge | sync `flow` |
| `KM-006-AC26` | Hai env khác nhau: đủ bốn env ở hai máy, không badge | sync `flow` |
| `KM-006-AC27` | CDP giữ `PUT` đang chạy, lưu mới, thả ra: dòng vẫn `dirty`, lượt sau đẩy, server có cả hai. Thêm ở Node với API giả | Node `sync-engine`; sync `flow` |
| `KM-006-AC28` | Mở form, sửa B, A đổi ở máy kia, chờ nhận, lưu; không có `conflict`; chữ đang gõ còn nguyên | Node `vault-ops`; sync `flow` |
| `KM-006-AC29` | Cùng field, giá trị người dùng thắng, giá trị vừa nhận trong lịch sử | Node `vault-ops`; sync `flow` |
| `KM-006-AC30` | CDP cắt phản hồi `PUT` sau khi server đã ghi; tải lại trang; dữ liệu khớp server, không có đánh dấu mới, không có `PUT` thừa | sync `flow` |
| `KM-006-AC31` | Đồng hồ truyền vào cho dãy 2, 5, 15, 60, 60; một lần thật: đo khoảng cách ±20%, hồi phục ≤ 65 s, `online` ≤ 5 s | Node `sync-engine`; sync `failure` |
| `KM-006-AC32` | Xoá dòng phiên trong SQLite, lượt chạy, vẫn sửa được, chấm đỏ, đếm request = 0 kể cả tải lại trang, đăng nhập lại chỉ bằng mật khẩu, thay đổi lên server | sync `failure` |
| `KM-006-AC33` | CDP trả lần lượt `403`, `400`, `404`, `413`: đúng nguyên nhân, khoảng cách ≥ 60 s, dòng giữ nguyên | Node `sync-engine`; sync `failure` |
| `KM-006-AC34` | Sửa blob trong SQLite thành khối không giải mã được, có và không có thay đổi chờ: dòng không đổi, 0 `PUT`, có lỗi; ghi bản hợp lệ thì hết lỗi | sync `failure` |
| `KM-006-AC35` | Vault thứ hai tạo qua API bằng khoá thật (dẫn xuất trong test bằng `core/`); hỏng một vault, vault kia vẫn đẩy, kéo đúng; chi tiết đúng từng vault; vault đang hiện không đổi | sync `failure` |
| `KM-006-AC36` | Thêm vault id nhỏ hơn: khoá, mở vẫn vault cũ; thiết bị mới mở vault `createdAt` nhỏ nhất | sync `failure` |
| `KM-006-AC37` | Xoá vault khỏi SQLite: dòng trên máy còn, có lỗi riêng; thêm trường hợp server có version thấp hơn (Quyết định 1) | sync `failure` |
| `KM-006-AC38` | Ba lần hỏi thật ~150 s: ba `304`, 0 lần tải blob; máy khác ghi: đúng 1 lần tải | sync `cadence` |
| `KM-006-AC39` | 10 phút bằng đồng hồ truyền vào với hai engine trên API giả; một lần thật 10 phút trên hai trình duyệt (`KEYMESH_LONG=1`), đếm version trong SQLite không đổi, ghi output | Node `sync-engine`; sync `cadence` |
| `KM-006-AC40` | Đặt tự khoá 1 phút, không thao tác, đồng bộ chạy: khoá đúng giờ; khoá giữa `PUT` đang giữ: dòng đọc được, mở lại đồng bộ tiếp | sync `cadence` |
| `KM-006-AC41` | Tạo từng trạng thái, kiểm chữ, lớp màu, thứ tự ưu tiên, `role=status`, ở desktop và `page.phone()`; ảnh chụp ghi vào `implement.md` | sync `status` |
| `KM-006-AC42` | Sửa một item hai lần, thêm một env: "Offline – 2 thay đổi chờ"; về đúng bản chung: hết đếm | Node `vault-diff`; sync `status` |
| `KM-006-AC43` | Chạm, bấm hai lần trong backoff: đủ thông tin, không có dữ liệu item trong DOM, một lượt trong ≤ 1 s; offline báo ngay | sync `status` |
| `KM-006-AC44` | Tạo vault ngay dưới và ngay trên 1 000 000 byte bằng item thử: không có và có cảnh báo, cả hai vẫn đồng bộ | sync `status` |
| `KM-006-AC45` | Đặt `conflict` bằng phép gộp thật trên đủ bốn loại; kiểm danh sách, trang chủ, chi tiết, chỉ phần đó có đánh dấu, ký hiệu ngoài màu, secret vẫn che, câu `deleted-elsewhere` | sync `conflict` |
| `KM-006-AC46` | Bấm "Đã xử lý" ở một máy: mất ở cả hai, nội dung và số bản lịch sử không đổi; sửa không bấm thì còn. Mức lõi có test riêng | Node `model`; sync `conflict` |
| `KM-006-AC47` | Sau chuỗi §3.1 kèm xung đột: dò SQLite và tệp dữ liệu server, mọi kho trình duyệt, console, URL, body lỗi, ở dạng gốc, base64, hex | sync `privacy` |
| `KM-006-AC48` | 100 lần lưu qua giao diện xen kẽ ngắt mạng, tải lại trang, ghi đồng thời; mọi giá trị còn ở vault hoặc lịch sử trừ phần cắt theo `HISTORY_MAX`; hai máy giống nhau theo nội dung | sync `stress` |
| `KM-006-AC49` | Vault 200 KB: đo một lượt có gộp, `longtask` qua `PerformanceObserver`, đăng nhập máy trống; ghi số. Giả lập: originator đo trong AC51 | sync `perf`; ghi vào `implement.md` |
| `KM-006-AC50` | Chạy `npm test`, `test:browser`, `test:e2e`, `test:server`, `test:sync`, `vectors`; `git diff --stat master -- src/functions src/migrations src/public/js/core/merge.js testkit/vectors.js` rỗng; `dependencies` rỗng; không có request tới Cloudflare (`WRANGLER_SEND_METRICS=false`, CDP chỉ thấy `127.0.0.1`) | Lệnh, dán output |
| `KM-006-AC51` | Originator kiểm trên Mac: laptop + giả lập Android, laptop + giả lập iOS; bảng từng mục, từng cặp, kèm bằng chứng; mục không làm được do originator quyết | Bước 13, `implement.md` |
| `KM-006-AC52` | Verifier đọc lại `KM-006.md`, `KM-014.md`, `KM-008.md`, `KM-009.md`, 03–09, KM-003; `rg -n "pages.dev\|deploy"` trong phạm vi KM-006 không còn câu nào nói KM-006 deploy | Bước 12, verifier |
| `KM-006-AC53` | Reviewer đọc mã. `test/ui-static.test.js` chặn `innerHTML`, `eval`, `console.`; `rg` không có cờ test trong `src/public/js`; phân lớp đúng `CLAUDE.md` | `npm test`; reviewer |

## 6. Feedback loop

- **Logic:** `npm test`, chạy dưới 2 phút, gồm `sync-engine` với API giả và đồng hồ truyền vào.
- **Thật:** `npm run test:sync -- <tệp>`, hai hồ sơ Chrome trên `wrangler pages dev` thật; nhìn bằng `KEYMESH_SHOTS=<thư mục>`.
- **Kho:** đọc và sửa SQLite qua `server.sql`, `server.exec`; đọc IndexedDB qua `READ_DB`.
- **Giao diện:** chụp ảnh qua `page.shot()`, xem ở cả desktop và `page.phone()`.
- **Giả lập:** `npm run dev:server`, `adb reverse`, `testkit/device-gate.mjs`, theo cách bước 1 đã xác nhận.
- Hết mỗi batch: chạy cả năm lệnh cũ, `npm run sw-version` nếu có tệp mới. Vòng này chỉ có trên Mac, xem §1.

## 7. Deliberately not doing

- Không đổi server, migration, `merge.js`, vector, CSP (FR39, NFR13). Nếu cần đổi thì dừng và báo originator.
- Không sửa testkit để chạy trên Windows, không thêm `.gitattributes`: originator implement trên Mac. Lỗi `npm test` do CRLF trên Windows không phải việc của epic này.
- Không làm Web Worker cho đồng bộ (§1).
- Không làm bộ lọc "item có xung đột": FR35 chỉ yêu cầu số đếm; muốn có thì mở việc riêng.
- Không xử lý trường hợp cùng `userId` mà `wrappedAccountKey` khác: chỉ xảy ra sau khi có đổi mật khẩu, thuộc KM-009.
- Không làm đóng tự động các hộp thoại khi dữ liệu đổi; thao tác lỗi vẫn được báo.
- Không lưu `ETag` xuống đĩa: mất khi khoá chỉ tốn thêm một phản hồi `200` không kèm blob (FR29 vẫn đạt).
- Không làm cơ chế dọn tệp LevelDB; chỉ đo và báo (§4).
- Không làm mọi mục ở `spec.md` §7 Out of scope, gồm mọi việc Cloudflare, chuyển sang `KM-014`.
