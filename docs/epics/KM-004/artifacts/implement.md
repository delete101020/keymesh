# Implementation Summary — PWA và giao diện mobile

**Epic ID:** `KM-004`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-01`
**Traces to:** `plan.md`

---

## 1. Branch and PR

| | |
|---|---|
| Branch | `feat/KM-004-pwa` |
| PR | Chưa mở: máy này không có `gh`. Mở tay tại https://github.com/delete101020/keymesh/compare/master...feat/KM-004-pwa |

## 2. Progress

> *One row per batch. A session in a batched run reads this first; rows marked
> done are not redone.*

| Batch | Plan steps | Commits | Tests run | State |
|---|---|---|---|---|
| 1 | 1–2 | `db42afd`, `9b160ce` | `npm test`, `test:e2e`, `test:browser` trên 3 trình duyệt | done |
| 2 | 3–4 | `fafd9b3`, `f19064a` | `npm test`, `test:e2e` (69/69) | done |
| 3 | 5–6 | `6b96773` | `npm test`, `mobile.e2e.js`, `lock.e2e.js` | done |
| 4 | 7–8 | `9289661` | `npm test`, `test:e2e` (88/88) | done |
| 5 | 9–11 | `d3ecb32` và commit tài liệu | Cả bốn lệnh test; giả lập Android | **một phần:** bước 9 xong; bước 10 còn iOS và năm mục KM-003; bước 11 ghi theo kết quả hiện có, phải cập nhật sau bước 10 |
| 6 | 10 (iOS), 11 | `63ad742`, `5a09f64` và commit tài liệu | Cả bốn lệnh test; giả lập iOS 18.6 | **một phần:** phần iOS xong, tìm và sửa 2 lỗi; còn năm mục KM-003, copy bằng tay trên Safari và Firefox desktop |
| 7 | 10, 11 | Commit này và `baae3c9` | Safari 216/216; giả lập iOS 18.6 cho ô OTP | **một phần:** ghi hai quyết định của originator, mở KM-012; ô OTP không chặn được; còn năm mục KM-003, copy bằng tay trên Safari và Firefox desktop |

## 3. What was built

> *Per plan step: what changed, in which files.*

| Plan step | Change | Files |
|---|---|---|
| 1 | `BROWSER_APP=Safari\|Firefox`; đã cài Firefox bằng brew; báo khi trang bị ẩn | `testkit/browser/run.mjs`, `index.html` |
| 2 | `_headers` là nguồn header duy nhất; server cục bộ đọc từ đó và không phục vụ chính nó | `src/public/_headers`, `testkit/serve.mjs` |
| 3 | Manifest, icon sinh bằng Chrome, thẻ cài đặt | `manifest.webmanifest`, `icons/*`, `index.html`, `testkit/gen-icons.mjs` |
| 4 | SW chỉ precache, bỏ qua `/api/*` và khác origin; `VERSION`, `SHELL` tính từ nội dung file; banner bản mới, có nháp thì hỏi trước | `sw.js`, `js/pwa.js`, `testkit/sw-version.mjs`, `app.js`, `ui/shell.js`, `driver.mjs`, `test/sw.test.js`, `test/e2e/pwa.e2e.js`, `sweep.e2e.js` (AC46) |
| 5 | Settings cục bộ, giá trị hỏng về mặc định | `js/settings.js`, `store.js`, `test/settings.test.js`, `test/store.test.js` |
| 6 | Khoá theo thời gian ở nền, che nội dung kể cả dialog, dialog Cài đặt, tách listener passive | `idle.js`, `app.js`, `ui/settings-dialog.js`, `ui/shell.js`, `styles.css`, `test/idle.test.js`, `test/e2e/mobile.e2e.js` |
| 7 | Back theo `history`, vuốt từ mép trái, Back đóng dialog, Back có nháp thì hỏi, URL không đổi | `ui/nav-history.js` |
| 8 | Gần đây, Yêu thích, tab env, nút sao, đưa nút phụ xuống dưới field ở màn hẹp, `autocapitalize`, input 16 px, safe area | `ui/home.js`, `nav.js`, `list.js`, `detail.js`, `edit.js`, `icons.js`, `vault-query.js`, `styles.css` |
| 9 | Firefox 159 tự che `textarea.masked`, không cần sửa CSS (ảnh ở `evidence/`) | Không đổi mã |
| 10 | Kiểm trên Safari, Firefox, giả lập Android và iOS; còn phần ở §7. Sửa 2 lỗi chỉ thấy trên WebKit: xoá clipboard và copy OTP (`63ad742`), vuốt mép gây khoá (`5a09f64`) | `evidence/*`, `clipboard.js`, `app.js`, `ui/nav-history.js`, `test/clipboard.test.js`, `test/e2e/mobile.e2e.js`, `docs/04` |
| 11 | Tài liệu ghi đúng trạng thái hiện tại, M2 ghi là **chưa đạt** | `docs/02`, `03`, `04`, `07`, `08`, `README.md`, `KM-004.md`, `KM-005.md` |

## 4. Proofs executed

> *The real command and its real output, per acceptance criterion. Never a claim
> without output.*

**Bảng kết quả.** "Giả lập Android" là AVD `Xperia_1V_API_35`, Android 15, Chrome 124, điều khiển bằng `adb` và CDP. "Giả lập iOS" là iPhone 16, iOS 18.6, Xcode 16.4, điều khiển bằng XCUITest.

| Criterion | Kết quả | Còn thiếu |
|---|---|---|
| `KM-004-AC01` | Một phần: luồng chính đạt; copy bằng chạm thật đạt trên Safari iOS; đã đo được một nguyên nhân gây treo | Copy bằng tay trên Safari desktop |
| `KM-004-AC02` | Một phần | Copy bằng cử chỉ thật trên Firefox |
| `KM-004-AC03` | **Chưa chạy** | Cả năm mục, cần originator |
| `KM-004-AC04` | Đạt trên cả hai | Android: ở standalone offline mới tới màn khoá, mở khoá offline đã kiểm ở tab Chrome. iOS: đủ cả mật khẩu sai và đúng ở standalone |
| `KM-004-AC05` | Đạt, cả trên iOS | Không có |
| `KM-004-AC06` | Đạt theo tiêu chí đã đổi: khoá nền đạt trên cả hai giả lập. Màn đa nhiệm lộ secret trên cả hai, originator chấp nhận cho M2 (2026-11-01) | Không có; tự che lại ở KM-012 |
| `KM-004-AC07` | Đạt | Không có |
| `KM-004-AC08` | Đạt trên Chrome, Android, iOS | Android: vuốt mép chỉ thử bằng touch giả lập. iOS: vuốt mép và 3 lần chạm đều thật, sau khi sửa lỗi |
| `KM-004-AC09` | Một phần | Tài liệu đúng với hiện tại, phải cập nhật lần cuối sau bước 10 |
| `KM-004-AC10` | Đạt | Cú pháp trên Cloudflare chuyển KM-005 |
| `KM-004-AC11` | Đạt | Không có |
| `KM-004-AC12` | Đạt | Không có |

### Toàn epic

```
$ npm test
ℹ tests 221
ℹ pass 216
ℹ fail 0
ℹ skipped 5

$ npm run test:e2e
ℹ tests 88
ℹ pass 88
ℹ fail 0

$ npm run test:browser
HeadlessChrome/156.0.0.0
tests 209  pass 209  fail 0  (14925 ms)

$ BROWSER_APP=Safari npm run test:browser
Version/27.2 Safari/605.1.15
tests 209  pass 209  fail 0  (16506 ms)

$ BROWSER_APP=Firefox npm run test:browser
Firefox/159.0
tests 209  pass 209  fail 0  (13320 ms)

$ npm run vectors
ok       envelope.ct is AES-GCM over the committed vaultGzip
ok       every other key and the file header match node:crypto byte for byte

$ git diff master --stat -- testkit/vectors.js src/public/js/core
(rỗng)
```

Các test KM-004 (`npm test`, lọc theo tên):

```
✔ KM-004 AC06 touch: 59 seconds in the background stays open, 60 locks
✔ KM-004 AC06 timers stopped while in the background: coming back locks before anything shows
✔ KM-004 AC06 time before going to the background and after coming back does not add up
✔ KM-004 AC06 computers have no background lock: switching tab for an hour alone does not lock past the idle rule
✔ KM-004 AC06 the idle rule still applies on a touch device, and to a computer in another tab
✔ KM-004 AC07 a changed timeout takes effect on the running timer
✔ KM-004 AC07 defaults: 10 minutes idle, 60 seconds in the background
✔ KM-004 AC07 a damaged value falls back to the default rather than weakening the lock
✔ KM-004 AC07 valid choices are kept, including locking at once
✔ KM-004 AC12 recents from disk: only non-empty strings, no repeats, at most 5
✔ KM-004 AC12 pushRecent puts the id first, moves a repeat, keeps at most 5, leaves the input alone
✔ KM-004 AC06 AC07 touch uses the background rule, computers the idle rule (F-AUTH-11)
✔ KM-004 touch is decided by input type, and a browser without matchMedia counts as a computer
✔ KM-004 sw.js is in step with src/public (else: npm run sw-version)
✔ KM-004 AC11 the shell has no /api, no secret-looking file, and nothing is cached at runtime
✔ KM-004 AC10 _headers carries exactly the CSP of docs/04, the other headers, and allows only the camera
✔ KM-004 AC04 manifest: standalone, relative start and scope, icons exist at their stated size
✔ KM-004 the page opts out of browser translation, which would send what is on screen to a third party
✔ KM-004 AC12 recents keep their order and drop ids that are gone, trashed or purged
✔ KM-004 AC12 favourites: starred live items by title
```

`node --test test/e2e/pwa.e2e.js test/e2e/mobile.e2e.js test/e2e/lock.e2e.js`, lọc theo tên:

```
✔ KM-004 AC06 AC07 a computer: another tab does not lock or cover anything; the setting is the idle time, and it works
✔ KM-004 the driver really presents a touch device
✔ KM-004 AC06 in the background the content is covered, including an open dialog; 59 s comes back open
✔ KM-004 AC06 60 s in the background: locked before anything shows, nothing of the vault in the DOM
✔ KM-004 AC07 the time can be changed on this device, holds after lock and reload, and takes effect
✔ KM-004 AC08 Back steps through the panes; the URL never changes
✔ KM-004 AC08 the on-screen back button and history stay in step
✔ KM-004 AC08 Back with an open dialog closes only the dialog
✔ KM-004 AC08 Back with unsaved edits asks; keeping them stays on the form with history intact
✔ KM-004 AC08 swiping from the left edge goes back; a swipe from the middle does not
✔ KM-004 AC08 after locking, Back shows nothing of the vault
✔ KM-004 AC08 a reload deep in the panes comes back to the bottom of history
✔ KM-004 AC08 AC12 unlock, tap a recent item, tap copy: three taps at 360×640, with the value on the clipboard
✔ KM-004 AC12 Back from an item opened on the home screen returns straight home
✔ KM-004 AC12 recents hold only ids on disk, at most 5, and an id with no item shows nothing
✔ KM-004 AC12 a star puts the item under Yêu thích and survives locking
✔ KM-004 AC08 a project opens its envs as tabs, which move between them in one tap
✔ KM-004 AC08 secret fields do not autocorrect; 16 px boxes so iOS does not zoom; every target 44 px, no sideways scroll
✔ KM-004 AC12 at 1280 px on a computer: no Gần đây, no Yêu thích, no star, no tabs, and one column set as before
✔ KM-004 AC04 Chrome finds nothing against installing; the manifest is read as written
✔ KM-004 AC10 real responses carry the headers of _headers; _headers itself is not served
✔ KM-004 AC11 /api/* goes straight to the server under the Service Worker, and is not cached
✔ KM-004 AC04 with no server: the app opens, a wrong password fails, the right one works, data is there, /api fails
✔ KM-004 AC05 a new version is announced, nothing reloads by itself; the button moves to it
✔ KM-004 AC05 unsaved edits ask first: Huỷ stays on the form, confirming reloads
ℹ pass 30
ℹ fail 0
```

### `KM-004-AC01` và `KM-004-AC02`

Luồng chính chạy bằng script một lần trong iframe cùng origin, dùng `el.click()` và đặt `value`, không phải tay người. CSP giống production trừ `frame-ancestors 'self'`. Nút copy bị từ chối là đúng dự kiến vì không có cử chỉ thật, **nên clipboard trên hai trình duyệt này chưa được kiểm**. Cột `computed=` rỗng là do script đọc sau khi form đã đóng, không có ý nghĩa.

```
$ node run.mjs Firefox     (Firefox/159.0; Safari/27.2 cho kết quả giống hệt từng dòng)
ok   setup: lập tài khoản
ok   tạo project và env
ok   tạo item login
ok   giá trị che; hiện được khi bấm
ok   secret nhiều dòng: có che khi sửa — CSS.supports=true, computed=
ok   copy không có cử chỉ thật (chỉ để biết, không phải kiểm clipboard) — Không copy được: trình duyệt đã từ chối.
ok   khoá: DOM không còn dữ liệu
ok   sai mật khẩu bị từ chối
ok   đúng mật khẩu: thấy dữ liệu
ok   Service Worker cài và điều khiển trang — keymesh-shell-1cb9d1256bd0f9f4
ok   tải lại: về màn khoá, mở lại được
ok   Cài đặt: đổi thời gian tự khoá, còn sau khoá và mở
```

Secret nhiều dòng trên Firefox được che: `evidence/firefox-secret-multi-mask.png` (`firefox --headless --screenshot`, dùng `styles.css` thật). Lần treo Safari của KM-003 không tái hiện, tính cả ba lần chạy ở `plan.md` §1 và hai lần ở đây.

### `KM-004-AC03`

Chưa chạy. Năm mục cần người và phần cứng thật: `AC06` tắt Wi-Fi, `AC10` ngủ máy 11 phút, `AC32` camera thật, `AC33` từ chối camera bằng hộp thật, `AC36` clipboard bị từ chối vì mất focus.

### `KM-004-AC04`

```
Page.getInstallabilityErrors trên Chrome 124 Android: {"installabilityErrors":[]}
Menu Chrome → Install app → Install → Add to home screen; mở icon KeyMesh:
  topResumedActivity=.../org.chromium.chrome.browser.webapps.WebappActivity
  display-mode: ["standalone"]

Tab Chrome, adb reverse --remove tcp:8787 (không tới được server), rồi tải lại:
  offline: /api: failed
  offline: lock screen: true
  offline: wrong pw: true
  offline: data: true

Standalone, force-stop Chrome, adb reverse --remove, mở lại từ icon:
  display-mode: ["standalone"]
  viewport: [360,792,"http://localhost:8787/","KeyMesh\nĐã khoá\n\nMở khoá diễn ra trên má"]
```

Ảnh: `evidence/android-standalone-offline.png`. AVD không có Play Store nên có thể không phải WebAPK; icon vẫn mở ở standalone.

**iOS, app thêm bằng Share → Add to Home Screen, mở từ icon (không có thanh trình duyệt).** Tắt server thật, thoát hẳn app, mở lại từ icon. Ảnh: `evidence/ios-standalone-offline.png`.

```
server rc=7                (curl không kết nối được)
sai mật khẩu:  label 'Sai mật …', vẫn ở màn khoá
đúng mật khẩu: pane: Vault mặc định → pane: Sửa, thấy 'appuser'
```

iOS tách dữ liệu của app đã cài khỏi tab Safari: cài xong phải tạo tài khoản lại, vault ở Safari không sang.

### `KM-004-AC05`

Xem `pwa.e2e.js` ở trên. Trên giả lập Android cũng thấy banner, bấm "Tải lại" thì cache đổi sang `keymesh-shell-fc6f9c182d929dd7`.

### `KM-004-AC06`

Khoá nền đạt, với `visibilitychange` và đồng hồ thật, phím Home thật:

```
hidden: ["hidden",true,"hidden"]            (visibility, có #shield, root visibility)
back after ~8 s [vis, shield, unlocked]: ["visible",false,true]
back after 65 s [vis, unlocked, title in DOM, lock text]: ["visible",false,false,true]
```

**Màn đa nhiệm lộ (giới hạn đã chấp nhận, xem intent §6):** ảnh hiện rõ giá trị thử `ANDROIDSECRET` đang được bấm hiện, cả ở tab và standalone (`evidence/android-standalone-switcher.png`). Khi mở màn đa nhiệm trang không nhận được sự kiện nào:

```
in switcher: ["visible",true,false]         (visibility, hasFocus, có #shield)
```

**iOS: kết quả tương tự.** Đo lại trên bản đã sửa, sau khi mở khoá và bấm hiện secret, ở standalone:

```
revealed before leaving: 1
short bg  revealed: 1 locked: 0
after 65 s  locked: 2 secret: 0 title: 0      (số dòng khớp trong cây giao diện)
```

Tab Safari cho cùng kết quả. Màn đa nhiệm lộ cả khi đã rời app rồi mới mở, và **ảnh vẫn còn secret sau 65 giây**, dù quay lại thì app đã khoá (`evidence/ios-safari-switcher-65s.png`, `evidence/ios-standalone-switcher.png`).

### `KM-004-AC07`

Xem `test/settings.test.js`, `mobile.e2e.js`, `lock.e2e.js` ở trên.

### `KM-004-AC08`

Phím Back thật, sau chạm thật bằng `adb shell input tap`:

```
after tap: ["detail",{"km":2},"active","H2","ime","false"]
back 1: ["list",{"km":1},...]
back 2: ["nav",{"km":0},...]
(back 3 rời app)
```

Ba lần chạm thật từ màn khoá ở 360×736 CSS px, nút nào cũng trong tầm nhìn:

```
Partner X in view: true
Copy in view: true
taps counted: 3
toast: Đã copy. Sẽ xoá khỏi clipboard sau 30 giây.
```

Trên Android chỉ thấy toast, không đọc lại được giá trị (`clipboard: read refused: NotAllowedError`). Giá trị đúng đã kiểm ở e2e Chrome.

**iOS, ở standalone:** từ màn khoá, chạm Mở khoá, chạm item ở Gần đây, chạm Copy Password:

```
toast: Đã copy. Sẽ xoá khỏi clipboard sau 30 giây nếu trình duyệt cho phép.
clipboard: [APPSECRET456]        (xcrun simctl pbpaste)
```

**Lỗi 1, clipboard trên WebKit (rủi ro ở plan §4, đã sửa).** Trước khi sửa, ở tab Safari:

```
after copy: [IOSSECRET123]
t+33: [IOSSECRET123]             (không xoá, toast vẫn nói "Sẽ xoá")
after return: [IOSSECRET123]     (quay lại app cũng không xoá)
after lock: []                   (bấm Khoá là cử chỉ thật nên xoá được)
copy OTP: "Không copy được: trình duyệt đã từ chối."
```

Sau khi sửa:

```
otp: [488895]   expected otp now: 488895       (tính độc lập bằng Python)
pw: [IOSSECRET123]
t+32: [IOSSECRET123]   toast: Trình duyệt chưa cho xoá clipboard. Chạm vào app để xoá.
after tap: []          toast: Đã xoá khỏi clipboard.
```

**Lỗi 2, vuốt mép gây khoá vault (đã sửa).** Tái hiện 2/2 lần ở standalone. Log từ bản sao có gắn ghi sự kiện, không vào repo:

```
touchend x=260
popstate {"km":0}
pagehide persisted=false
load nav=navigate                (cả trang tải lại, vault khoá)
```

Sau khi sửa, không còn khoá, ở cả standalone và tab Safari:

```
pane: Sửa → pane: Thêm item → pane: Vault mặc định
```

Lần đo ở standalone chạy trên bản thật: bật lại server thì không có banner, tức SW đang chạy trùng với `sw.js` trên server.

Test cuối trên code hiện tại:

```
$ npm test                          tests 228  pass 223  fail 0  skipped 5
$ npm run test:e2e                  tests 89   pass 89   fail 0
$ npm run test:browser              tests 216  pass 216  fail 0
```

Số 209 của Safari và Firefox ở phần đầu là trước khi thêm test clipboard. Số mới: Firefox 216/216, Safari 216/216 (lần chạy đối chứng ở dưới).

**Lần treo ở Safari: đã đo được nguyên nhân, trong điều kiện hôm nay.** Máy đang khoá màn hình trong lúc chạy, trang báo `hidden` từ đầu, và timer gần như dừng:

```
$ swift -e '... CGSessionCopyCurrentDictionary ...'
locked= 1

15 start hidden focus=false  Version/27.2 Safari/605.1.15
ran 11 ok ...      (rồi không chạy tiếp)
ticks seen: 6      (setInterval 1 giây, trong 25 giây)

trang đo riêng, tab hidden: 2 nhịp setTimeout(0) trong 24 giây
```

Firefox trong cùng điều kiện vẫn xong nhưng chậm: 81 giây so với 13 giây. Lần treo 180 giây ở KM-003 không có log nên chưa thể khẳng định cùng nguyên nhân, chỉ có khả năng. `testkit/browser/run.mjs` giờ tự báo lý do:

```
Timed out after 180 s waiting for http://127.0.0.1:60477/testkit/browser/index.html
The page was hidden during the run, so its timers were held back. Unlock the screen, keep the window visible and run again.
```

Lần chạy đối chứng, màn hình đã mở khoá (`IOConsoleLocked = No`), cùng commit `57813f5`:

```
$ BROWSER_APP=Safari npm run test:browser
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15
tests 216  pass 216  fail 0  (61113 ms)
```

Khoá màn hình thì không xong, mở khoá thì xong: một lần đo, nhưng khớp với nguyên nhân trên. Lần này mất 61 giây, so với 16 giây của bản 209 test; chưa rõ vì sao, và không đo trạng thái hiển thị của cửa sổ trong lần chạy này.

**Một điểm chưa giải thích:** ở lần chạy đầu, dùng click bằng script, lần bấm Back đầu tiên không chuyển màn (`Back key from detail →: detail`). Không lặp lại khi chạm thật. Có thể phím Back bị bàn phím ảo hoặc Chrome giữ lại, nhưng chưa xác nhận.

### `KM-004-AC09`

`git diff master -- docs/08-roadmap.md docs/epics/KM-004/KM-004.md`: M2 ghi là chưa đạt, kèm điều kiện về điện thoại thật.

### `KM-004-AC10`

Xem `test/sw.test.js` và `pwa.e2e.js` ở trên. QR dưới `camera=(self)`:

```
$ node --test test/e2e/fields.e2e.js
✔ KM-003 AC32 FR35 fake camera reads the QR, fills the field and stops; closing without a read stops too
✔ KM-003 AC32 AC33 FR36 image with a QR fills the field; an image without one says so and keeps the value
✔ KM-003 AC33 FR35 FR37 camera refused, or no QR reader: a clear message and pasting still works
```

### `KM-004-AC11`

Xem `test/sw.test.js` và `pwa.e2e.js` ở trên: server thấy `/api/x`, cache không có, không có server thì `fetch` thất bại.

### `KM-004-AC12`

Xem `test/settings.test.js`, `test/vault-query.test.js`, `mobile.e2e.js` ở trên. Ảnh: `evidence/home-360.png`.

## 5. Deviations from the plan

> *Anything done differently, and why. If nothing, say so explicitly.*

1. Bước 7 và 8 gộp một commit, vì đều đổi `app.back()` và `detail.js`.
2. Thêm `notranslate` (amendment 1 trong `plan.md` §8).
3. Cách xử lý dự kiến cho màn đa nhiệm (`blur`) đã thử, không có tác dụng, đã bỏ (amendment 2).
4. Luồng Safari và Firefox dùng script một lần thay vì đi tay, và script không vào repo (amendment 3). Nó không thay được phần copy.
5. Plan ghi `#shield` che bằng lớp phủ. Thực tế còn ẩn mọi phần tử khác bằng `visibility`, vì dialog nằm ở top layer, trên mọi `z-index`.
6. `detail.js` chọn vị trí nút theo `matchMedia` lúc vẽ, và vẽ lại khi đổi ngưỡng, vì CSS không chuyển được nút xuống dưới field mà giữ nguyên desktop.
7. Không chạy `/verify` trước mỗi commit theo hướng dẫn chung của công cụ: trong repo này đó là bước verify độc lập của pipeline (giống KM-003).
8. PR chưa mở vì không có `gh`.
9. Thêm test và sửa 2 lỗi WebKit (amendment 4, 5 trong `plan.md` §8). Câu toast đổi thành "... nếu trình duyệt cho phép".
10. iOS chạy bằng bộ điều khiển XCUITest một lần thay vì đi tay (amendment 6). Bộ này không kiểm được copy trên Safari desktop.
11. **Sự cố lúc kiểm, lỗi của script, không phải của app.** Một lần chạm trượt vào thanh địa chỉ của Safari nên chuỗi thử `JBSWY3DPEHPK3PXP` bị gõ vào đó và đi tới gợi ý tìm kiếm của Google. Đây là chuỗi mẫu công khai, không phải secret. Đã thêm chặn chạm ngoài vùng trang. Ngoài ra Simulator đồng bộ clipboard với máy Mac, nên clipboard Mac có thể đã bị ghi đè bằng giá trị thử trong lúc kiểm.
12. `testkit/browser/run.mjs` và `index.html` thêm báo trang bị ẩn khi hết giờ, để lần treo sau tự giải thích. Thuộc bước 1, thêm sau khi đo được nguyên nhân.
13. Không chặn được đề nghị Strong Password ở ô OTP dù originator đã đồng ý; không đổi code (amendment 9, kết quả đo ở §6). Tiêu chí `AC06` đổi theo quyết định của originator (amendment 8).

## 6. Discovered work

> *Found but deliberately not done, and where it went — a plan amendment, a new
> intent, an issue.*

| Item | Where it went |
|---|---|
| Màn đa nhiệm lộ nội dung; web không có cách chặn đã biết | Originator chấp nhận cho M2 (intent §6); tự che lại ở `docs/epics/KM-012/KM-012.md` |
| Chrome đề nghị lưu master password vào Google Password Manager (thấy trên giả lập, sau khi mở khoá) | Originator quyết giữ nguyên (2026-11-01), để ai dùng trình quản lý mật khẩu vẫn dùng được |
| Trên trang chủ hẹp, "Tất cả" vẫn tô như đang chọn dù chưa vào list | Chưa làm; nhỏ, có từ KM-003 |
| iOS đề nghị tạo và lưu "Strong Password" ở ô master password và cả ô secret, ô OTP của item; sau khi mở khoá hỏi "Save Password?". Cùng loại với việc của Chrome ở trên | Master password: giữ nguyên. Ô OTP: originator muốn chặn, **chưa có cách làm được** (bảng dưới) |
| Trên màn khoá iOS, bàn phím tự bật che banner "Tải lại" nên phải ẩn bàn phím mới thấy | Chưa làm; nhỏ |
| Trên WebKit, rời app trước khi chạm lại thì secret còn trong clipboard, không có cách xoá từ web | Ghi ở `docs/04`; xem xét cùng khi kiểm máy thật |
| Kiểm `_headers` trên Cloudflare | `docs/epics/KM-005/KM-005.md` |

**Đo việc chặn Strong Password ở ô OTP (giả lập iOS 18.6, Safari tab, chạm thật, thoát Safari giữa các lần).** Originator đồng ý chặn, nhưng không cách nào dưới đây vừa chặn được vừa che được secret trong item Login, nên code giữ nguyên, không đổi gì:

| Cách thử | Kết quả |
|---|---|
| `autocomplete="one-time-code"`, vẫn `type=password` | Sheet vẫn hiện |
| `type=text` che bằng `-webkit-text-security`, có ô Password trong form, chạm OTP (2 lần) | Sheet vẫn hiện |
| Như trên, chạm URL thay vì OTP | Không hiện: chỉ ô đã che mới gây sheet |
| Như trên, đã xoá ô Password khỏi form | Không hiện, nhưng item Login mặc định có ô Password |
| Như trên, bỏ che (`type=text`, không che) | Không hiện, nhưng secret lộ trên màn hình |
| Như trên, tách ô khỏi form bằng `form=""` | Sheet vẫn hiện |
| Che bằng CSS cả ô Password lẫn ô OTP, chạm Password; chạm OTP | Sheet vẫn hiện ở cả hai lần thử |

`type=text` còn có cái giá riêng: mất cam kết bàn phím không học nội dung ô như với `type=password`. Mỗi cách chỉ đo trên iOS 18.6 giả lập.

## 7. Known gaps

> *What a reviewer should look at hardest.*

- **Màn đa nhiệm vẫn lộ secret đang hiện, trên cả Android và iOS.** Originator chấp nhận cho M2 vì chỉ dùng dữ liệu thử (intent §6), nên tiêu chí `AC06` đã đổi chứ lỗ hổng không biến mất. Phải xem lại trước khi cất secret thật trên điện thoại (KM-012).
- **iOS vẫn đề nghị Strong Password ở ô OTP của item có ô Password.** Sheet có "Not Now" và mỗi lần tải trang chỉ hiện một lần. "Save & Fill" chưa thử nên chưa biết nó điền vào ô nào.
- **Bản sửa clipboard mới kiểm trên iOS và Chrome.** Chưa kiểm lại trên giả lập Android và Safari, Firefox desktop bằng tay. Giá trị đọc lại khi copy trên Android vẫn chưa xác nhận.
- **`ui/nav-history.js` nhận diện iOS bằng `'standalone' in navigator`.** E2E chỉ giả lập thuộc tính này trên Chrome; hành vi thật đã kiểm một lần trên iOS 18.6.
- **`AC03`: năm mục KM-003 chưa chạy.**
- `ui/nav-history.js` là chỗ dễ sai nhất: `history.go` bất đồng bộ, được giữ khớp bằng bộ đếm `popping`.
- Khoá nền trong e2e dùng `visibilityState` giả và `Date.now` giả; bản thật chỉ chạy trên giả lập Android và iOS.
- Bộ chọn file đưa app ra nền quá thời gian đã đặt thì khoá và mất nháp. Đã chấp nhận ở plan, chưa thử.
- Tài khoản và item thử trên AVD chỉ là dữ liệu thử; AVD chạy với `-no-snapshot-save`.

---

Status: continue
