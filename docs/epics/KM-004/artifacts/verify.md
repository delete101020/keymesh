# Verification Report — PWA và giao diện mobile

**Epic ID:** `KM-004`
**Verifier:** Verifier (independent)
**Status:** Draft
**Created:** `2026-11-01`
**Verified against:** `spec.md` (không có: recipe `native-quick`, tiêu chí lấy từ `intent.md` §5 và đánh số `AC01`–`AC12` ở `plan.md` §5), `plan.md`

---

## 1. Verdict

Verdict: pass

Ngày 2026-11-01 originator tách khỏi epic này năm mục kiểm tay của KM-003 và phần copy bằng cử chỉ thật trên Safari, Firefox desktop sang KM-013 (`plan.md` §8 amendment 10, `intent.md` §5–§6). Báo cáo này kiểm theo tiêu chí đã đổi; mọi hàng đều có kết quả pass, không còn fail hay untested. Bản đầu của báo cáo này là `fail` vì `AC01`–`AC03` và `AC09`.

## 2. Acceptance criteria

Tôi chạy trên nhánh `feat/KM-004-pwa`, Chrome 156 headless. Tôi không có quyền điều khiển Safari, Firefox desktop, giả lập Android hay iOS trong lần này, nên phần chỉ kiểm được ở đó được ghi theo `implement.md` và gắn nhãn "chưa tự kiểm".

| Id | Criterion | Verdict | Evidence |
|---|---|---|---|
| `KM-004-AC01` | Safari: kết quả lõi và luồng chính; ghi nhận về lần treo (copy cử chỉ thật → KM-013) | pass | `BROWSER_APP=Safari npm run test:browser` (Safari 27.2, tôi chạy lại): `tests 216  pass 216  fail 0  (16505 ms)`. Luồng UI qua iframe và copy chạm thật trên Safari iOS: theo `implement.md`, chưa tự chạy lại (script một lần, không nằm trong repo). Copy cử chỉ thật trên Safari desktop → KM-013 |
| `KM-004-AC02` | Firefox: kết quả lõi; secret nhiều dòng được che (copy cử chỉ thật → KM-013) | pass | `BROWSER_APP=Firefox npm run test:browser` (Firefox 159, tôi chạy lại): `tests 216  pass 216  fail 0  (12812 ms)`. Đã xem `evidence/firefox-secret-multi-mask.png`: textarea nhiều dòng hiện toàn dấu chấm. Copy cử chỉ thật → KM-013 |
| `KM-004-AC03` | Năm mục KM-003 trên máy thật | **bỏ khỏi epic** | Chuyển sang `docs/epics/KM-013/KM-013.md` theo quyết định của originator (2026-11-01). Không tính vào verdict của KM-004 |
| `KM-004-AC04` | Cài và offline trên hai giả lập | pass (phần e2e) | `test:e2e`: `✔ KM-004 AC04 Chrome finds nothing against installing; the manifest is read as written`; `✔ KM-004 AC04 with no server: the app opens, a wrong password fails, the right one works, data is there, /api fails`. Phần giả lập: 4 ảnh trong `evidence/` (`android-standalone-offline.png`, `ios-standalone-offline.png`...), chưa tự kiểm |
| `KM-004-AC05` | Báo bản mới, tự chọn lúc tải | pass | `✔ KM-004 AC05 a new version is announced, nothing reloads by itself; the button moves to it`; `✔ KM-004 AC05 unsaved edits ask first: Huỷ stays on the form, confirming reloads` |
| `KM-004-AC06` | Khoá khi chuyển nền (tiêu chí đã đổi 2026-11-01: màn đa nhiệm lộ được chấp nhận) | pass (phần e2e) | `✔ AC06 60 s in the background: locked before anything shows, nothing of the vault in the DOM`; `✔ ... 59 s comes back open`; `✔ ... a computer: another tab does not lock`. Khoá nền thật trên giả lập: chưa tự kiểm |
| `KM-004-AC07` | Chỉnh tự khoá, còn sau khoá và mở | pass | `✔ KM-004 AC07 the time can be changed on this device, holds after lock and reload, and takes effect`; `npm test` có `KM-004 AC07 settings ...` nhưng test đó bị skip (cần IndexedDB), phần này do e2e đảm nhiệm |
| `KM-004-AC08` | 3 lần chạm và nguyên tắc § Mobile, kể cả Back | pass (phần e2e) | `✔ AC08 AC12 unlock, tap a recent item, tap copy: three taps at 360×640, with the value on the clipboard`; 7 test Back/vuốt mép; `✔ secret fields do not autocorrect; 16 px boxes...; every target 44 px, no sideways scroll`. Back trên Android thật và iOS: chưa tự kiểm |
| `KM-004-AC09` | Tài liệu M2 và `KM-004.md` ghi đúng "đạt trên giả lập kèm điều kiện", trỏ tới KM-013 | pass | `git diff master -- docs/08-roadmap.md docs/epics/KM-004/KM-004.md`: roadmap ghi "**Trạng thái M2 (KM-004, 2026-11-01): đạt trên giả lập**", kèm "**chưa kiểm trên điện thoại thật thì chưa cất secret thật trên điện thoại**" và trỏ KM-013; `KM-004.md` có mục "Việc chuyển sang KM-013" |
| `KM-004-AC10` | `_headers` có CSP và `Permissions-Policy` | pass | `src/public/_headers` có `default-src 'none'; script-src 'self'; ...` và `Permissions-Policy: camera=(self), ...`. `✔ KM-004 AC10 real responses carry the headers of _headers; _headers itself is not served`; `✔ KM-003 AC47 every request stays on the same origin` |
| `KM-004-AC11` | SW không cache `/api/*` | pass | `sw.js:80` bỏ qua `/api/`; `grep cache.put\|cache.add sw.js` rỗng; `✔ KM-004 AC11 /api/* goes straight to the server under the Service Worker, and is not cached` |
| `KM-004-AC12` | Gần đây và Yêu thích trên trang chủ mobile | pass | `✔ AC12 recents hold only ids on disk, at most 5, and an id with no item shows nothing`; `✔ AC12 a star puts the item under Yêu thích and survives locking`; `✔ AC12 at 1280 px on a computer: no Gần đây, no Yêu thích...`; đơn vị: `✔ KM-004 AC12 recents keep their order and drop ids that are gone...` |

## 3. Promised proofs

| Proof | Executed | Result |
|---|---|---|
| `npm test` | Có | 228 tests, 223 pass, 0 fail, 5 skipped (cần IndexedDB, chỉ chạy trong `test:browser`) |
| `npm run test:browser` (Chrome) | Có | 216 pass, 0 fail |
| `npm run test:e2e` | Có | 89 pass, 0 fail |
| `npm run vectors` + `git diff master -- testkit/vectors.js` rỗng | Có | Mọi dòng `ok`, diff 0 dòng, working tree không đổi |
| `BROWSER_APP=Safari`/`Firefox npm run test:browser` | Có | Cả hai 216/216 (xem `AC01`, `AC02`) |
| Kiểm tay năm mục KM-003 (`AC03`) | Chuyển KM-013 | Originator tách epic, 2026-11-01 |
| Copy bằng cử chỉ thật trên Safari/Firefox desktop | Chuyển KM-013 | Originator tách epic, 2026-11-01 |
| Giả lập Android/iOS (cài, offline, nền, Back, 3 chạm) | Không tự chạy | Có 7 ảnh `evidence/` và bảng ở `implement.md`, chưa tự kiểm |

## 4. Regressions

```
$ npm test
ℹ tests 228  ℹ pass 223  ℹ fail 0  ℹ skipped 5
$ npm run test:browser
tests 216  pass 216  fail 0  (15418 ms)
$ npm run test:e2e
ℹ tests 89  ℹ pass 89  ℹ fail 0  (134 s)
$ npm run vectors; git diff master -- testkit/vectors.js | wc -l
0
```

Không có hồi quy: các test KM-003 (kể cả `AC08`–`AC10`, `AC44`, `AC46`, `AC47`) đều xanh cùng SW.

## 5. Out-of-scope check

Không thấy gì từ `intent.md` §6 hoặc plan §7 được làm: không có `wrangler.toml`, không có đồng bộ, không có `beforeinstallprompt` ở mức tôi đã xem qua `git diff --stat` và `sw.js`. Tôi chưa duyệt từng dòng diff toàn bộ nên đây là kiểm ở mức cấu trúc, không phải kiểm kỹ.

## 6. Findings

| # | Finding | Severity | Where |
|---|---|---|---|
| 1 | Năm mục KM-003, copy cử chỉ thật trên Safari/Firefox desktop và kiểm lại bản sửa clipboard bằng tay chưa chạy; đã chuyển sang KM-013, không chặn epic này | Medium (nợ được ghi nhận) | `KM-013.md` |
| 2 | Luồng UI trên Safari/Firefox và phần giả lập (`AC04`, `AC06`, `AC08`) dựa vào `implement.md` và ảnh; không có lệnh chạy lại được trong repo | Medium | `plan.md` §6 |
| 3 | Hai tài liệu trước đó ghi "chưa đạt"; đã đổi sau khi tách epic | Info | `docs/08-roadmap.md`, `KM-004.md` |
| 4 | Màn đa nhiệm vẫn lộ secret trên cả hai giả lập; đã được originator chấp nhận (intent §6) và chuyển KM-012 — ghi nhận, không tính fail | Info | `implement.md` §7 |
| 5 | Vòng phản hồi: `AC01`–`AC03` và phần giả lập của `AC04`/`AC06`/`AC08` không có lệnh chạy lại được, chỉ có kiểm tay và ảnh; phần lớn dựa vào lời kể trong `implement.md` | Medium | `plan.md` §6 |
| 6 | Bản sửa clipboard chưa kiểm lại trên Android, Safari, Firefox desktop; secret còn trong clipboard nếu rời app trước khi chạm lại | Medium | `implement.md` §7 |
| 7 | `nav-history.js` nhận diện iOS bằng `'standalone' in navigator`; e2e chỉ giả lập thuộc tính này | Low | `implement.md` §7 |
| 8 | `implement.md` kết thúc bằng `Status: continue`, tức chính engineer coi batch chưa xong; khớp với verdict fail | Info | `implement.md` |

## 7. Shortest path to pass

Không áp dụng: verdict là pass. Việc còn lại nằm ở `docs/epics/KM-013/KM-013.md`.
