# Implementation Plan — PWA và giao diện mobile

**Epic ID:** `KM-004`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-01`
**Traces to:** `intent.md` (recipe `native-quick`, không có `spec.md`), `docs/07-features.md` §6, `docs/04-security.md`

---

## 1. Approach

Giữ nguyên kiến trúc KM-003 và thêm ba lớp mỏng, không đụng `core/` và không đổi schema IndexedDB. **Lớp PWA** gồm `manifest.webmanifest`, `icons/`, `sw.js`, `js/pwa.js`, `_headers`. Service Worker chỉ precache một danh sách cố định, không cache lúc chạy, và không đụng `/api/*`. Bản mới chỉ kích hoạt khi người dùng bấm tải lại. **Lớp khoá** mở rộng `idle.js` thêm đếm giờ nền, và thêm `settings.js` cùng khoá `meta.settings` mà `docs/03` §3 đã dành sẵn. **Lớp mobile** biến pane `nav` hiện có thành trang chủ (Gần đây, Yêu thích, Dự án), thêm tab env và `ui/nav-history.js` để Back của Android đi theo `history.pushState`.

Phương án bị loại: **viết màn mobile riêng** (`ui/mobile/*`, như prototype). Cách đó tách đôi mã màn hình và phải nhân đôi 63 test e2e. Ba pane của KM-003 đã là stack đúng nghĩa, nên chỉ cần thêm nội dung và lịch sử điều hướng. Phương án cũng bị loại: **ghi tay version của SW**, vì quên một lần là người dùng kẹt ở bản cũ. Thay vào đó `testkit/sw-version.mjs` tính `VERSION` và danh sách shell từ nội dung file, còn `npm test` đỏ nếu `sw.js` lệch. File trong repo vẫn là file chạy trên trình duyệt, nên quy ước "không bước build" được giữ.

**Trả lời hai câu hỏi mở của intent.**

- **Câu 1, phục vụ từ đâu:** từ `testkit/serve.mjs` trên máy dev, không cần Cloudflare, nên không đổi roadmap. Máy giả lập Android vào `http://localhost:8787` qua `adb reverse tcp:8787 tcp:8787`; máy giả lập iOS dùng chung mạng với máy Mac nên vào thẳng `localhost:8787`. Cả hai đều là secure context. Ngày có điện thoại thật: Android dùng được `adb reverse` qua USB, còn iPhone cần HTTPS thật, tức là bản deploy của KM-005 hoặc một tunnel. `serve.mjs` sẽ đọc `_headers`, nên giả lập và production dùng chung một nguồn header. Riêng cú pháp `_headers` trên Cloudflare phải đợi KM-005 mới kiểm được.
- **Câu 2, Safari treo do đâu:** **không tái hiện được; nguyên nhân chính xác vẫn chưa rõ.** Đã chạy `npm run test:browser` trên Safari 27.2 ngày 2026-11-01 ở ba điều kiện, đều **193/193 pass**: foreground (46,8 s), `open -g` khi Safari đã mở (19,1 s), `open -g` khi Safari khởi động nguội (67,4 s). Script của lần KM-003 không được lưu nên không đối chiếu được. Kết luận: lõi không hỏng trên WebKit, và nhiều khả năng lỗi nằm ở cách gọi bộ test, không phải ở app. Bộ test này **không chạy UI**, nên luồng chính trên Safari vẫn chưa có kết quả và vẫn nằm trong bước 10. Khối lượng epic không tăng vì câu hỏi này.

**Các quyết định bản thân tài liệu chưa chốt.**

- *Yêu thích:* làm cùng Gần đây (originator chốt 2026-11-01). Model đã có `favorite`; nút sao và mục Yêu thích chỉ hiện ở màn hẹp.
- *"Mobile" là gì:* `matchMedia('(hover: none) and (pointer: coarse)')`, không dựa vào chiều rộng. Máy cảm ứng dùng khoá theo thời gian ở nền (mặc định 60 giây) và vẫn giữ tự khoá 10 phút không thao tác. Máy tính chỉ có khoá khi không thao tác, chuyển tab không khoá. Cài đặt chỉ hiện dòng đúng với loại thiết bị, đúng F-AUTH-11.
- *Gần đây:* tính theo lần mở hoặc copy trên thiết bị, lưu tối đa 5 `itemId` trong `meta.settings`, không đồng bộ. Id là chuỗi ngẫu nhiên, không có tiêu đề hay giá trị, và `docs/03` đã liệt kê "vault/project/env đang chọn" là dữ liệu cục bộ tương tự. Trước khi mở khoá, ai đọc được IndexedDB sẽ biết số lượng và thứ tự id gần đây, nhưng không biết đó là item gì. Phần này được ghi vào `docs/03` và `docs/04`.

## 2. Files

| Path | Change | Why |
|---|---|---|
| `src/public/_headers` | Thêm | CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (`camera=(self)`, API không dùng thì tắt, không chặn clipboard và passkey); `Cache-Control: no-cache` cho `/sw.js`, `/`, `/index.html` |
| `src/public/manifest.webmanifest` | Thêm | F-PWA-01: `standalone`, `start_url`/`scope` tương đối, icon, màu |
| `src/public/icons/icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png` | Thêm | Icon cài đặt; PNG được commit như vector |
| `src/public/sw.js` | Thêm | F-PWA-02/03: precache, xoá cache cũ khi activate, chờ lệnh `skip-waiting`, bỏ qua `/api/*` và request khác origin |
| `src/public/js/pwa.js` | Thêm | Đăng ký SW, báo bản mới, kích hoạt rồi tải lại theo yêu cầu |
| `src/public/js/settings.js` | Thêm | Thuần: mặc định theo thiết bị, danh sách lựa chọn, kiểm giá trị đọc từ đĩa, `pushRecent` |
| `src/public/js/ui/settings-dialog.js` | Thêm | Dialog chỉnh thời gian tự khoá |
| `src/public/js/ui/nav-history.js` | Thêm | Nối `state.pane` với `history`, xử lý `popstate`, vuốt từ mép trái |
| `src/public/js/ui/home.js` | Thêm | Mục Gần đây, Yêu thích trên trang chủ hẹp |
| `src/public/js/idle.js` | Sửa | Thêm `hidden()`/`visible()`, `setTimeouts()`; giữ `IDLE_MS` và chữ ký cũ |
| `src/public/js/store.js` | Sửa | `readSettings`, `writeSettings` trên `meta.settings`; không tăng `DB_VERSION` |
| `src/public/js/app.js` | Sửa | Nạp và lưu settings, khoá nền, `toggleFavorite`, recents, về thẳng trang chủ khi vào từ recents, trạng thái `updateReady`; tách listener passive (review KM-003 finding 5) |
| `src/public/js/ui/shell.js` | Sửa | Nút Cài đặt, banner bản mới, lớp che `#shield`, gọi `nav-history`, `pwa` |
| `src/public/js/ui/nav.js`, `list.js`, `detail.js`, `edit.js`, `icons.js` | Sửa | Trang chủ, tab env, nút sao, đưa copy lên trong tầm nhìn ở màn hẹp, `autocapitalize="off"` cho field secret, icon mới |
| `src/public/index.html` | Sửa | `manifest`, icon, `theme-color`, thẻ Apple, `viewport-fit=cover`, `#shield` |
| `src/public/styles.css` | Sửa | Safe area, `100dvh`, input 16 px ở màn hẹp (iOS không tự zoom), `overscroll-behavior`, tab env, banner, shield; che `textarea` khi không có `-webkit-text-security` nếu Firefox cần |
| `testkit/serve.mjs` | Sửa | Đọc `_headers`, vẫn export `CSP`; thêm MIME `.webmanifest`, `.png`, `.svg`; không phục vụ `_headers` |
| `testkit/sw-version.mjs`, `package.json` | Thêm, sửa | `npm run sw-version` ghi `VERSION` và danh sách shell vào `sw.js` |
| `testkit/gen-icons.mjs` | Thêm | Render SVG ra PNG bằng Chrome qua CDP có sẵn, không thêm phụ thuộc |
| `testkit/browser/run.mjs` | Sửa | `BROWSER_APP=Safari\|Firefox` mở bằng `open -a`, để lần chạy lặp lại được và ghi được lệnh |
| `testkit/e2e/driver.mjs` | Sửa | `startApp({ root })`, tắt server giữa chừng, giả lập cảm ứng và `visibilityState` |
| `test/settings.test.js`, `test/sw.test.js` | Thêm | Logic settings; `sw.js` khớp nội dung, manifest, kích thước PNG, `_headers` |
| `test/idle.test.js`, `test/store.test.js`, `test/ui-static.test.js` | Sửa | Khoá nền; settings; bỏ `yêu thích`, `thời gian khoá` khỏi danh sách cấm vì giờ nằm trong phạm vi; header |
| `test/e2e/pwa.e2e.js`, `test/e2e/mobile.e2e.js` | Thêm | Cài, offline, bản mới, `/api/*`; 3 lần chạm, Back, tab env, khoá nền, cài đặt |
| `test/e2e/sweep.e2e.js` | Sửa | `AC44` bỏ `yêu thích`, `thời gian khoá`, `cài đặt`. `AC46` hiện assert `caches` rỗng: đổi thành chỉ có cache shell và không chứa chuỗi đánh dấu |
| `docs/02`, `03`, `04`, `07`, `08`, `README.md`, `docs/epics/KM-004/KM-004.md`, `docs/epics/KM-005/KM-005.md` | Sửa | Cây thư mục và lệnh mới, hình dạng `settings`, header và khoá nền, trạng thái tính năng, tiêu chí M2 đạt trên giả lập kèm điều kiện; KM-005 nhận việc kiểm `_headers` trên Cloudflare |
| `docs/epics/KM-004/artifacts/implement.md` | Thêm | Log và bảng kết quả kiểm tay |

## 3. Order

1. **Mốc WebKit và công cụ.** Thêm `BROWSER_APP` vào `run.mjs`; cài Firefox bằng `brew install --cask firefox`; chạy `test:browser` trên Safari và Firefox. *Sau bước này:* có kết quả lõi trên cả ba trình duyệt và lệnh chạy lại được.
2. **Header.** Thêm `_headers`; `serve.mjs` đọc từ đó. *Sau bước này:* app chạy cục bộ dưới đúng header production, quét QR vẫn chạy dưới `camera=(self)`, test CSP của KM-003 vẫn xanh.
3. **Manifest và icon.** Thêm `gen-icons.mjs`, icon, manifest, thẻ trong `index.html`. *Sau bước này:* Chrome đọc được manifest.
4. **Service Worker.** Thêm `sw.js`, `sw-version.mjs`, `pwa.js`, banner bản mới; sửa `driver.mjs` và `AC46`; thêm `pwa.e2e.js`, `sw.test.js`. *Sau bước này:* cài được, tắt server vẫn mở và mở khoá được, bản mới được báo và chỉ tải lại khi bấm (có nháp thì hỏi trước), toàn bộ e2e cũ xanh khi có SW.
5. **Settings.** Thêm `settings.js`, `readSettings`/`writeSettings`. *Sau bước này:* giá trị đọc ghi được, giá trị hỏng rơi về mặc định.
6. **Khoá nền.** Sửa `idle.js`, `app.js`, tách listener passive; thêm `#shield`, `settings-dialog.js`. *Sau bước này:* quá hạn ở nền thì khoá trước khi hiện dữ liệu, lúc ở nền nội dung bị che, thời gian chỉnh được và còn sau khi khoá rồi mở lại.
7. **Điều hướng.** Thêm `nav-history.js`. *Sau bước này:* Back và vuốt mép đi đúng stack, Back có nháp thì hỏi, Back khi dialog mở thì chỉ đóng dialog, khoá xong Back không hiện gì của vault, URL không mang id.
8. **Trang chủ và màn item.** Thêm `home.js`, Gần đây, Yêu thích, tab env, xếp lại nút ở màn hẹp, thuộc tính field secret, CSS mobile. *Sau bước này:* mở khoá → chạm item gần đây → copy là 3 lần chạm ở 360×640, nút copy nằm trong tầm nhìn, giao diện 900 px trở lên không đổi.
9. **Sửa theo Firefox và WebKit.** Kiểm secret nhiều dòng trên Firefox, sửa CSS nếu không che; chạy `npm run sw-version` và cả bốn lệnh test. *Sau bước này:* không còn lỗi đã biết trên ba trình duyệt desktop.
10. **Kiểm tay** (cần originator, xem Risk về Xcode). Chạy luồng chính trên Safari và Firefox; năm mục KM-003 trên máy thật; cài, offline, khoá nền, màn đa nhiệm, 3 lần chạm, Back trên hai máy giả lập. Ghi kết quả từng mục vào `implement.md`. Lỗi phát hiện được sửa kèm test rồi thêm vào plan dưới dạng amendment. *Sau bước này:* mọi mục ở §5 có kết quả.
11. **Khép tài liệu.** Cập nhật `docs/*`, `README.md`, `KM-004.md`, ghi đúng mức đạt trên giả lập và điều kiện "chưa kiểm trên điện thoại thật thì chưa cất secret thật trên điện thoại". *Sau bước này:* tài liệu khớp với kết quả thật.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — steps 1–2: có kết quả lõi trên ba trình duyệt; app chạy dưới `_headers` thật; `npm test` và `test:e2e` xanh.

**Batch 2** — steps 3–4: app cài được, chạy offline, báo bản mới; e2e cũ và `pwa.e2e.js` xanh.

**Batch 3** — steps 5–6: khoá nền, che nội dung, chỉnh tự khoá xong; test đơn vị và e2e xanh.

**Batch 4** — steps 7–8: điều hướng và trang chủ mobile xong; `mobile.e2e.js` xanh ở 360×640 với cảm ứng giả lập.

**Batch 5** — steps 9–11: có kết quả kiểm tay, tài liệu khép lại. Batch này **dừng chờ originator** ở bước 10, không chạy thẳng tới hết được.

## 4. Risks

| Risk | Likelihood | What we do about it |
|---|---|---|
| Có SW làm vỡ e2e hiện có. `sweep.e2e.js` `AC46` assert `caches` rỗng; `ui-static` và `AC44` cấm chuỗi `yêu thích`, `thời gian khoá`, `cài đặt`; mỗi lần tải trang đầu kéo thêm khoảng 35 request | Chắc chắn với các assert đã nêu, thấp với phần còn lại | Sửa các assert đó có chủ đích ở bước 4 và 6, nêu lý do trong commit. `AC46` mạnh hơn trước: quét cả nội dung cache |
| Đổi `idle.js` và `app.js` ảnh hưởng người gọi. `createIdleTimer` có 4 chỗ dùng trong `app.js`, test ở `test/idle.test.js`; `lock` được dùng trong `app.js` | Thấp | Giữ chữ ký và `IDLE_MS`, chỉ thêm; `AC08`–`AC10` phải xanh không sửa |
| Đổi `app.back()` và thêm lịch sử làm `sweep.e2e.js` lệch, vì test đọc `pane` ngay sau khi bấm "Quay lại" | Trung bình | `state.pane` vẫn đổi đồng bộ trong `app.back()`; `nav-history` chỉ đồng bộ `history` theo sau, nên test không cần chờ `popstate` |
| Khoá nền phá việc chọn file trên điện thoại: bộ chọn file đưa app ra nền quá 60 giây thì khoá và mất nháp | Trung bình | Chấp nhận, vì an toàn đi trước và đúng `docs/04`. Ghi vào `implement.md` |
| **Ít chắc nhất: clipboard trên WebKit.** Safari có thể từ chối `writeText` ngoài cử chỉ người dùng, nên việc xoá sau 30 giây và thử lại khi có focus có thể luôn thất bại, trong khi toast vẫn nói "Sẽ xoá". Copy OTP gọi `await totp()` trước khi ghi nên có thể mất cử chỉ | Trung bình đến cao | Kiểm ở bước 10. Nếu đúng thì sửa bằng cách thử xoá ở lần chạm kế tiếp, đổi câu toast cho đúng sự thật, và với OTP dùng `ClipboardItem` nhận promise. Amendment trong plan |
| **Ít chắc: màn đa nhiệm.** iOS có thể chụp ảnh trước khi JS kịp chạy, và giả lập có thể khác máy thật | Trung bình | Kiểm bằng mắt trên giả lập. Nếu lộ thì thêm che theo `blur` trên máy cảm ứng. Không suy kết quả giả lập ra máy thật |
| AVD có sẵn `Xperia_1V_API_35` không có Play Store (`PlayStore.enabled=false`), nên Chrome có thể chỉ tạo shortcut chứ không cài WebAPK | Trung bình | Kiểm ở bước 10. Nếu không mở được standalone thì tạo AVD từ image `android-31/google_apis_playstore` đã có trong SDK |
| Chưa có Xcode, nên chưa có giả lập iOS và chưa thử được gì trên iOS | Chắc chắn | Originator cài Xcode trước batch 5 (đã đồng ý ở intent). Máy còn 166 GB trống. Batch 1–4 không phụ thuộc |
| Bản SW lỗi khó gỡ khỏi máy đã cài | Thấp, hậu quả cao | `sw.js` không tự precache và có `no-cache`, trình duyệt luôn kiểm bản mới; SW không chặn `/api/*` và không cache lúc chạy. Lối thoát: phát hành `sw.js` chỉ xoá cache và tự huỷ đăng ký. Ở M2 mọi cài đặt là giả lập với dữ liệu thử |
| Tab cũ chạy lẫn file mới sau khi tab khác kích hoạt bản mới | Thấp | App không dùng `import()` động trong `ui/`, nên mã đã nạp xong không đổi. Tab khác vẫn thấy banner |
| Giữ danh sách shell đúng khi thêm file `public/` | Trung bình | `npm test` đỏ kèm thông báo gọi `npm run sw-version` |
| `_headers` chưa từng chạy trên Cloudflare | Trung bình | Ngoài phạm vi M2; ghi vào `KM-005.md` để kiểm lúc deploy |
| Khó đảo ngược | Thấp | Không đổi `core/`, vector, `DB_VERSION`. `meta.settings` và thuộc tính `favorite` đều tương thích ngược |

## 5. Proofs

Không có `spec.md`, nên các id dưới đây được đánh số tại plan này. `AC01`–`AC09` theo thứ tự mục 5 của `intent.md`, `AC10`–`AC12` lấy từ phần phạm vi trong `KM-004.md`. Lệnh trong cột cuối được chạy từ gốc repo.

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-004-AC01` Safari: luồng chính có kết quả, biết về lần treo | Kết quả lõi và từng bước lập tài khoản → mở khoá → tạo item → copy; ghi nhận "không tái hiện được" kèm ba lần chạy ở §1 | `BROWSER_APP=Safari npm run test:browser`; `npm start` rồi đi bằng tay |
| `KM-004-AC02` Firefox: luồng chính, secret nhiều dòng được che | Như trên, và ảnh form sửa item `secret-multi` | `BROWSER_APP=Firefox npm run test:browser`; bằng tay |
| `KM-004-AC03` Năm mục KM-003 trên máy thật | Bảng `AC06`, `AC10`, `AC32`, `AC33`, `AC36` với kết quả từng mục | Originator làm theo danh sách ở KM-003 `implement.md:662` |
| `KM-004-AC04` Cài và offline trên hai giả lập | E2E: `Page.getInstallabilityErrors` rỗng, `Page.getAppManifest` đúng; tắt server, tải lại, mở khoá đúng và sai mật khẩu. Tay: ảnh chụp không có thanh trình duyệt, tắt server mở lại vẫn vào được | `npm run test:e2e`; `adb reverse tcp:8787 tcp:8787`, `xcrun simctl` |
| `KM-004-AC05` Báo bản mới, tự chọn lúc tải | E2E: đổi file trong bản copy, gọi `update()`, thấy banner, app chưa tải lại; bấm thì sang bản mới; có nháp thì hỏi trước | `npm run test:e2e` (`pwa.e2e.js`) |
| `KM-004-AC06` Khoá khi chuyển nền; màn đa nhiệm không lộ | Đơn vị: 59 giây chưa khoá, 60 giây khoá, timer ngừng lúc ở nền vẫn khoá khi quay lại, máy tính không khoá theo nền. E2E: cảm ứng giả lập, không còn chuỗi đánh dấu trong DOM. Tay: `visibilitychange` thật và ảnh màn đa nhiệm trên hai giả lập | `npm test`; `test:e2e`; bằng tay |
| `KM-004-AC07` Chỉnh tự khoá, giá trị còn sau khoá và mở | Đơn vị: giá trị hỏng về mặc định. E2E: đổi, khoá, mở, tải lại, giá trị vẫn đúng và có hiệu lực | `npm test`; `test:e2e` |
| `KM-004-AC08` 3 lần chạm và các nguyên tắc § Mobile | E2E ở 360×640: đếm đúng 3 lần `dispatchMouseEvent` tới khi clipboard có giá trị; nút copy trong viewport; tab env; mọi đích ≥ 44 px; không cuộn ngang; thuộc tính field secret; `history` khớp pane; URL không đổi. Tay: `adb shell input keyevent KEYCODE_BACK`, vuốt mép, ảnh màn hình | `test:e2e`; bằng tay |
| `KM-004-AC09` Tài liệu khớp | Diff `docs/08`, `KM-004.md` ghi đạt trên giả lập kèm điều kiện | `git diff master -- docs/08-roadmap.md docs/epics/KM-004/KM-004.md` |
| `KM-004-AC10` `_headers` có CSP và `Permissions-Policy` | Đơn vị: CSP trong `_headers` trùng `docs/04`, có `camera=(self)`. E2E: header thật trên response; test QR `AC32` vẫn xanh; 0 vi phạm CSP | `npm test`; `test:e2e` |
| `KM-004-AC11` SW không cache `/api/*` | Đơn vị: danh sách shell không có `/api`, không có `cache.put`. E2E: request `/api/x` đi thẳng tới server khi SW điều khiển trang và không có trong cache | `npm test`; `test:e2e` |
| `KM-004-AC12` Gần đây và Yêu thích trên trang chủ mobile | Đơn vị: `pushRecent` bỏ trùng, tối đa 5. E2E: mở item, khoá, mở, item ở đầu Gần đây; chỉ có id trong `meta.settings`; item đã xoá không hiện; đánh sao còn sau khi khoá; 1280 px không thấy hai mục này | `npm test`; `test:e2e` |

Toàn epic: `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run vectors` đều xanh và `git diff master -- testkit/vectors.js` rỗng.

## 6. Feedback loop

- **Logic thuần** (`idle`, `settings`, `sw.js` khớp nội dung): `npm test`, vài giây.
- **Hành vi app:** `npm run test:e2e` trên Chrome thật dưới `_headers` thật; `KEYMESH_SHOTS=<thư mục>` để chụp 360, 899, 1280 px, sáng và tối, rồi **nhìn ảnh**, vì lần trước verifier ghi nhận chưa ai xem ảnh.
- **Máy giả lập:** Android đã sẵn (`adb exec-out screencap`, `adb shell input`). iOS từ khi có Xcode (`xcrun simctl openurl`, `simctl io booted screenshot`). Agent chạy được phần lệnh, còn thêm ra màn hình chính và màn đa nhiệm thì làm bằng tay.
- **Safari và Firefox desktop:** `BROWSER_APP=… npm run test:browser` cho lõi; luồng UI đi bằng tay trên `npm start`.

Vòng còn thiếu cần xây ở plan này là bước 1 (`BROWSER_APP`) và phần driver ở bước 4 và 6.

## 7. Deliberately not doing

- Kiểm trên điện thoại thật, ngưỡng tốc độ mở khoá, QR trên iPhone, `navigator.storage.persist()`: intent §6 loại trừ.
- Deploy, `wrangler`, `src/wrangler.toml`: thuộc KM-005.
- Tự động hoá e2e trên Safari hoặc Firefox: cần thêm driver WebDriver, trong khi intent chấp nhận kiểm tay.
- Nút cài đặt riêng trong app (`beforeinstallprompt`): F-PWA-01 chỉ cần cài được; iOS cũng không có API này.
- Cache lúc chạy trong SW: không cần cho app shell, và mỗi thứ không được cache là một thứ không thể lộ.
- Cài đặt khác (thời gian xoá clipboard, sáng/tối, vault đang chọn): ngoài F-AUTH-11.
- Đổi giao diện desktop: nút sao và trang chủ chỉ hiện ở màn hẹp.
- Các finding còn lại của review KM-003: #3 (thử đột biến `gen-vectors`), #4 (`open()` gộp lỗi tab lock), #6–#9. Chỉ làm #2 (che trên Firefox, theo intent) và #5 (listener passive, vì ảnh hưởng trực tiếp tới cuộn trên điện thoại). Hộp "Bỏ bản nháp?" được dùng tiếp, vẫn chờ originator giữ hay bỏ.

## 8. Amendments

Ghi trong lúc implement.

1. **`notranslate` (thêm vào `index.html`, `test/ui-static.test.js`).** Chrome Android đề nghị dịch trang trên giả lập; dịch sẽ gửi nội dung đang hiện ra ngoài. Một dòng, có test.
2. **Rủi ro "màn đa nhiệm": cách xử lý dự kiến không dùng được.** Đã thử che theo `blur` trên giả lập Android: khi mở màn đa nhiệm trang vẫn `visible` và có focus, không có sự kiện nào, ảnh vẫn lộ. Đã bỏ đoạn mã thử, vì không có tác dụng mà có rủi ro kẹt màn hình trắng. Cần originator quyết định (`implement.md` §7).
3. **Bước 10 làm được một phần bằng lệnh, không cần tay:** chạy luồng chính trên Safari và Firefox qua iframe cùng origin (script một lần, không vào repo), và chạy trên giả lập Android qua CDP cùng `adb shell input`. Phần cần tay vẫn còn.
4. **Rủi ro clipboard trên WebKit là thật, sửa theo đúng cách §4 đã định (`clipboard.js`, `app.js`, `test/clipboard.test.js`, `docs/04`).** Trên iOS 18.6, xoá sau 30 giây bị từ chối, quay lại app cũng không xoá được, và copy OTP thất bại hẳn. Giờ: thử xoá ở lần chạm kế tiếp, toast nói "nếu trình duyệt cho phép" và báo khi bị từ chối, OTP đi qua `ClipboardItem` nhận promise. Vẫn còn hở: chưa chạm lại vào app thì secret còn trong clipboard.
5. **Vuốt mép trên iOS (`ui/nav-history.js`, `test/e2e/mobile.e2e.js`), chưa có trong Risks.** Vuốt mép của app chồng lên cử chỉ quay lại của hệ thống: WebKit tải lại cả trang và vault bị khoá. Log sự kiện cho thấy `popstate`, `pagehide`, rồi `load`. Trên iOS giờ để hệ thống xử lý; app nhận `popstate` như một Back bình thường.
6. **Bước 10 trên iOS chạy bằng một bộ điều khiển XCUITest một lần (chạm thật, phím Home, màn đa nhiệm), không vào repo.** Xcode nằm ở `~/Downloads/Xcode.app`, dùng qua `DEVELOPER_DIR`, không đổi `xcode-select`.
7. **`testkit/browser/run.mjs`, `index.html` báo trang bị ẩn khi hết giờ.** Đo được: màn hình khoá thì trang Safari `hidden`, timer gần như dừng, bộ test trông như treo.
8. **Originator chấp nhận việc màn đa nhiệm lộ nội dung cho M2 (2026-11-01).** Tiêu chí ở intent §5 và §6 đã đổi; `KM-004-AC06` ở §5 chỉ còn phần khoá nền, phần ảnh màn đa nhiệm giữ làm giới hạn đã đo. Tự che lại secret chuyển sang KM-012.
9. **Originator đồng ý chặn đề nghị lưu mật khẩu ở ô OTP, nhưng chưa tìm được cách làm được; không đổi code. Originator chấp nhận để nguyên (2026-11-01).** Master password giữ nguyên theo cùng quyết định. Kết quả đo ở `implement.md` §6.

10. **Tách việc kiểm tay sang KM-013 (originator quyết định 2026-11-01).** `KM-004-AC03` bỏ khỏi epic; `AC01`, `AC02` chỉ còn phần chạy bằng lệnh (`test:browser`, luồng qua iframe) — copy bằng cử chỉ thật chuyển KM-013. `AC09` đổi thành: tài liệu ghi M2 đạt trên giả lập kèm điều kiện và trỏ tới KM-013.
