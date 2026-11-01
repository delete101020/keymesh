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

## 3. What was built

> *Per plan step: what changed, in which files.*

| Plan step | Change | Files |
|---|---|---|
| 1 | `BROWSER_APP=Safari\|Firefox`; đã cài Firefox bằng brew | `testkit/browser/run.mjs` |
| 2 | `_headers` là nguồn header duy nhất; server cục bộ đọc từ đó và không phục vụ chính nó | `src/public/_headers`, `testkit/serve.mjs` |
| 3 | Manifest, icon sinh bằng Chrome, thẻ cài đặt | `manifest.webmanifest`, `icons/*`, `index.html`, `testkit/gen-icons.mjs` |
| 4 | SW chỉ precache, bỏ qua `/api/*` và khác origin; `VERSION`, `SHELL` tính từ nội dung file; banner bản mới, có nháp thì hỏi trước | `sw.js`, `js/pwa.js`, `testkit/sw-version.mjs`, `app.js`, `ui/shell.js`, `driver.mjs`, `test/sw.test.js`, `test/e2e/pwa.e2e.js`, `sweep.e2e.js` (AC46) |
| 5 | Settings cục bộ, giá trị hỏng về mặc định | `js/settings.js`, `store.js`, `test/settings.test.js`, `test/store.test.js` |
| 6 | Khoá theo thời gian ở nền, che nội dung kể cả dialog, dialog Cài đặt, tách listener passive | `idle.js`, `app.js`, `ui/settings-dialog.js`, `ui/shell.js`, `styles.css`, `test/idle.test.js`, `test/e2e/mobile.e2e.js` |
| 7 | Back theo `history`, vuốt từ mép trái, Back đóng dialog, Back có nháp thì hỏi, URL không đổi | `ui/nav-history.js` |
| 8 | Gần đây, Yêu thích, tab env, nút sao, đưa nút phụ xuống dưới field ở màn hẹp, `autocapitalize`, input 16 px, safe area | `ui/home.js`, `nav.js`, `list.js`, `detail.js`, `edit.js`, `icons.js`, `vault-query.js`, `styles.css` |
| 9 | Firefox 159 tự che `textarea.masked`, không cần sửa CSS (ảnh ở `evidence/`) | Không đổi mã |
| 10 | Kiểm trên Safari, Firefox, giả lập Android; còn phần ở §7 | `evidence/*` |
| 11 | Tài liệu ghi đúng trạng thái hiện tại, M2 ghi là **chưa đạt** | `docs/02`, `03`, `04`, `07`, `08`, `README.md`, `KM-004.md`, `KM-005.md` |

## 4. Proofs executed

> *The real command and its real output, per acceptance criterion. Never a claim
> without output.*

**Bảng kết quả.** "Giả lập Android" là AVD `Xperia_1V_API_35`, Android 15, Chrome 124, điều khiển bằng `adb` và CDP.

| Criterion | Kết quả | Còn thiếu |
|---|---|---|
| `KM-004-AC01` | Một phần | Copy bằng cử chỉ thật trên Safari. Lần treo: không tái hiện được, chưa rõ nguyên nhân |
| `KM-004-AC02` | Một phần | Copy bằng cử chỉ thật trên Firefox |
| `KM-004-AC03` | **Chưa chạy** | Cả năm mục, cần originator |
| `KM-004-AC04` | Đạt trên Android | iOS chưa kiểm. Ở standalone offline mới tới màn khoá; mở khoá offline đã kiểm ở tab Chrome |
| `KM-004-AC05` | Đạt | Không có |
| `KM-004-AC06` | **Fail một nửa:** khoá nền đạt, màn đa nhiệm lộ secret | Quyết định của originator; iOS chưa kiểm |
| `KM-004-AC07` | Đạt | Không có |
| `KM-004-AC08` | Đạt trên Chrome và Android | Vuốt mép chỉ thử bằng touch giả lập; iOS chưa kiểm |
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

Ảnh: `evidence/android-standalone-offline.png`. AVD không có Play Store nên có thể không phải WebAPK; icon vẫn mở ở standalone. **iOS chưa kiểm vì máy chưa có Xcode.**

### `KM-004-AC05`

Xem `pwa.e2e.js` ở trên. Trên giả lập Android cũng thấy banner, bấm "Tải lại" thì cache đổi sang `keymesh-shell-fc6f9c182d929dd7`.

### `KM-004-AC06`

Khoá nền đạt, với `visibilitychange` và đồng hồ thật, phím Home thật:

```
hidden: ["hidden",true,"hidden"]            (visibility, có #shield, root visibility)
back after ~8 s [vis, shield, unlocked]: ["visible",false,true]
back after 65 s [vis, unlocked, title in DOM, lock text]: ["visible",false,false,true]
```

**Màn đa nhiệm fail:** ảnh hiện rõ giá trị thử `ANDROIDSECRET` đang được bấm hiện, cả ở tab và standalone (`evidence/android-standalone-switcher.png`). Khi mở màn đa nhiệm trang không nhận được sự kiện nào:

```
in switcher: ["visible",true,false]         (visibility, hasFocus, có #shield)
```

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

## 6. Discovered work

> *Found but deliberately not done, and where it went — a plan amendment, a new
> intent, an issue.*

| Item | Where it went |
|---|---|
| Màn đa nhiệm lộ nội dung; web không có cách chặn đã biết | Chờ originator, §7 |
| Chrome đề nghị lưu master password vào Google Password Manager (thấy trên giả lập, sau khi mở khoá) | Chưa làm; originator quyết có đổi `autocomplete` không |
| Trên trang chủ hẹp, "Tất cả" vẫn tô như đang chọn dù chưa vào list | Chưa làm; nhỏ, có từ KM-003 |
| Kiểm `_headers` trên Cloudflare | `docs/epics/KM-005/KM-005.md` |

## 7. Known gaps

> *What a reviewer should look at hardest.*

- **`AC06` chưa đạt: màn đa nhiệm lộ secret đang hiện trên Android.** Đây là tiêu chí ở intent §5, nên epic không đóng được cho tới khi originator chọn: chấp nhận và đổi tiêu chí, thêm tự che lại secret sau vài giây (giảm chứ không hết, vì tiêu đề và username vẫn hiện), hoặc giữ tiêu chí và để M2 mở. Đề xuất của engineer: chấp nhận cho M2 vì chỉ dùng dữ liệu thử, và mở intent riêng cho việc tự che lại.
- **Chưa có gì trên iOS.** Cần cài Xcode rồi kiểm cài, offline, khoá nền, màn đa nhiệm, 3 lần chạm, Back. Rủi ro clipboard trên WebKit (`plan.md` §4) vẫn chưa được kiểm.
- **`AC03`: năm mục KM-003 chưa chạy.**
- `ui/nav-history.js` là chỗ dễ sai nhất: `history.go` bất đồng bộ, được giữ khớp bằng bộ đếm `popping`.
- Khoá nền trong e2e dùng `visibilityState` giả và `Date.now` giả; bản thật chỉ chạy trên giả lập Android.
- Bộ chọn file đưa app ra nền quá thời gian đã đặt thì khoá và mất nháp. Đã chấp nhận ở plan, chưa thử.
- Tài khoản và item thử trên AVD chỉ là dữ liệu thử; AVD chạy với `-no-snapshot-save`.

---

Status: continue
