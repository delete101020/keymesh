# Verification Report — App v2 chạy cục bộ

**Epic ID:** `KM-003`
**Verifier:** Verifier (independent)
**Status:** Draft
**Created:** `2026-11-01`
**Verified against:** `spec.md`, `plan.md`

---

## 1. Verdict

Verdict: fail

Lý do duy nhất: `KM-003-AC49` là `untested` (chưa có kết quả trên Safari hay Firefox), và theo quy tắc `untested` chặn như `fail`. 52 tiêu chí còn lại đều `pass` với đầu ra ở §4. Các mục chỉ kiểm tay được trên máy thật (§3) chưa ai làm; chúng không đổi verdict vì mỗi mục đều có bản kiểm tự động và spec cho phép "test tự động hoặc bằng tay".

## 2. Acceptance criteria

Nhánh `feat/KM-003-app`, Node v24.22.1, Chrome 156 headless. Cột Evidence ghi số dòng test `✔` mang id AC đó, đếm từ log `npm test` (đơn vị) và `npm run test:e2e` (Chrome thật dưới CSP của 04); bảng 4 test bỏ qua trên Node chạy ở `npm run test:browser` (193/193).

| Id | Criterion | Verdict | Evidence |
|---|---|---|---|
| `KM-003-AC01` | Màn lập chỉ hai ô; khác/trống thì không tạo tài khoản | pass | 8 test `AC01` (`account.e2e.js`), e2e 63/63 |
| `KM-003-AC02` | Cảnh báo 11 ký tự, không cảnh báo 12; luôn nói không khôi phục | pass | 5 test `AC02` |
| `KM-003-AC03` | Dữ liệu lưu đúng 03 §3, không `authKey`, `username`/`userId` trống | pass | 5 test `AC03`; `store.test.js` skip trên Node, xanh ở `test:browser` |
| `KM-003-AC04` | Lỗi ghi giữa lúc lập thì mở lại về màn lập | pass | 6 test `AC04` (store + e2e) |
| `KM-003-AC05` | NFC/NFD mở cùng tài khoản; vector KM-001 giữ nguyên | pass | 5 test `AC05`; `npm run vectors` ok; `git diff master -- testkit/vectors.js` = 0 dòng |
| `KM-003-AC06` | Mở lại offline, đúng/sai mật khẩu | pass (tự động) | 3 test `AC06`; tắt Wi-Fi thật chưa kiểm, xem §3 |
| `KM-003-AC07` | Envelope hỏng 1 byte; thiếu `CompressionStream` | pass | 5 test `AC07` |
| `KM-003-AC08` | Khoá: DOM sạch, nháp bỏ | pass | 7 test `AC08` |
| `KM-003-AC09` | Tự khoá 10 phút, thao tác tính lại | pass | 5 test `AC09` |
| `KM-003-AC10` | Máy ngủ 11 phút thì khoá trước khi hiện dữ liệu | pass (giả lập) | 4 test `AC10` (nhảy `Date.now`); ngủ máy thật chưa kiểm, xem §3 |
| `KM-003-AC11` | Một tab mở khoá tại một thời điểm | pass | 7 test `AC11` (hai tab qua CDP) |
| `KM-003-AC12` | 4 env mặc định; tên trống/trùng bị từ chối | pass | 4 test `AC12` |
| `KM-003-AC13` | Xoá project: báo 3 item, 2 vào Chưa gán, `scopes` giữ id | pass | 7 test `AC13` |
| `KM-003-AC14` | Đổi thứ tự bằng bàn phím, còn sau khoá/mở | pass | 5 test `AC14` |
| `KM-003-AC15` | Màu env hai chủ đề; cảnh báo copy từ `PROD` | pass | 7 test `AC15` |
| `KM-003-AC16` | 9 loại đúng field mẫu; tiêu đề trống không lưu | pass | 6 test `AC16` |
| `KM-003-AC17` | Thêm `otp`, xoá, đổi thứ tự, đổi `file` sang `text` | pass | 5 test `AC17` |
| `KM-003-AC18` | Item 3 env sửa một lần, chip "Dùng chung" | pass | 3 test `AC18` |
| `KM-003-AC19` | `scopes` giữ id env đã xoá khi sửa gán | pass | 5 test `AC19` |
| `KM-003-AC20` | Ghi lỗi thì báo thất bại, nháp còn, mở lại thấy bản cũ | pass | 3 test `AC20` (session, store, e2e) |
| `KM-003-AC21` | Fork đúng hình dạng, hai bản độc lập | pass | 4 test `AC21` |
| `KM-003-AC22` | Một env sống thì không có nút Fork | pass | 5 test `AC22` |
| `KM-003-AC23` | Nhân bản: huỷ không tạo, lưu đúng thuộc tính | pass | 5 test `AC23` |
| `KM-003-AC24` | Lịch sử, diff che, `otp` "đã đổi", giữ 20 bản | pass | 12 test `AC24` (kể cả vector `AC24` của KM-001) |
| `KM-003-AC25` | Khôi phục giữ gán env, field đã xoá quay lại, `reason: "restore"` | pass | 5 test `AC25` |
| `KM-003-AC26` | Hạn N−1, N, N+14 vào, N+15 ra; đổi giờ mùa hè | pass | 5 test `AC26` |
| `KM-003-AC27` | Bộ sinh ngẫu nhiên 10 000 lần × tổ hợp × 8/64 | pass | 4 test `AC27` |
| `KM-003-AC28` | Dễ nhớ: 5 từ mặc định, 3–8, ≥ 2048 từ | pass | 5 test `AC28`; `wordlist.js` 788 dòng nguồn, plan ghi 7 772 từ |
| `KM-003-AC29` | Vector RFC 6238, `digits=8&period=60`, `JBSW Y3dp` | pass | 3 test `AC29` |
| `KM-003-AC30` | `hotp`, base32 sai, `digits=9`, `period=0` bị từ chối tại field | pass | 4 test `AC30` |
| `KM-003-AC31` | Mã OTP + đếm ngược, không hiện secret, copy ra mã | pass | 1 test `AC31` (e2e) |
| `KM-003-AC32` | Quét QR camera và ảnh; camera tắt | pass (camera giả) | 2 test `AC32`; camera thật chưa kiểm, xem §3 |
| `KM-003-AC33` | Từ chối camera / không có bộ đọc / QR sai | pass | 2 test `AC33` |
| `KM-003-AC34` | File 65 536 byte CRLF nhận và tải lại trùng byte; 65 537, NUL, sai UTF-8 bị từ chối | pass | 4 test `AC34` |
| `KM-003-AC35` | `vpn` mới, *Cấu hình* rỗng: không nút tải | pass | 1 test `AC35` |
| `KM-003-AC36` | Mọi nhánh xoá clipboard sau 30 giây | pass (clipboard giả) | 6 test `AC36`; từ chối ghi vì mất focus trên trình duyệt thật chưa kiểm, xem §3 |
| `KM-003-AC37` | Khoá trong lúc đếm thì xoá clipboard ngay | pass | 3 test `AC37` |
| `KM-003-AC38` | Secret che lại khi chuyển item | pass | 1 test `AC38` |
| `KM-003-AC39` | URL `https` mở tab `opener` null; `javascript:` không có nút | pass | 1 test `AC39` |
| `KM-003-AC40` | Bộ lọc đúng tập item, trạng thái trống | pass | 4 test `AC40` |
| `KM-003-AC41` | Cmd/Ctrl+K, tìm bỏ dấu, không tìm trong secret | pass | 2 test `AC41` |
| `KM-003-AC42` | Đổi sáng/tối không tải lại | pass | 1 test `AC42` |
| `KM-003-AC43` | 900 px 3 cột; 899/360 px xếp chồng, không cuộn ngang, chạm ≥ 44 px | pass | 3 test `AC43` |
| `KM-003-AC44` | Không có chức năng ngoài phạm vi (FR47) | pass | 2 test `AC44` |
| `KM-003-AC45` | 0 vi phạm CSP | pass | 1 test `AC45`; `testkit/serve.mjs:13` có chuỗi CSP trùng `docs/04-security.md:62` |
| `KM-003-AC46` | Khoá xong không còn chuỗi đánh dấu ở đâu | pass | 1 test `AC46` (IndexedDB, storage, profile, console, URL) |
| `KM-003-AC47` | Chỉ request cùng origin | pass | 1 test `AC47` |
| `KM-003-AC48` | Chuỗi chèn hiện nguyên văn | pass | 1 test `AC48` |
| `KM-003-AC49` | Safari và Firefox: ghi kết quả | **untested** | 0 test. `implement.md` §AC49: Firefox chưa cài; Safari "không gửi kết quả trong 180 giây", luồng chính chưa chạy. Tôi không chạy lại; không có kết quả nào để xác nhận |
| `KM-003-AC50` | Hiệu năng NFR08, trung vị 5 lần | pass | 3 test `AC50` xanh với assert ≤ 1500 / 500 / 100 ms; `implement.md` ghi unlock 65,3 ms, lưu 53,7 ms, lọc 14,7 ms, tìm 8,5 ms (tôi không đọc lại số diagnostic, chỉ thấy assert qua). Lưu ý: ca unlock đo qua lõi trong trang, không đo qua màn khoá |
| `KM-003-AC51` | Luồng 3.1 chỉ bằng bàn phím; tương phản ≥ 4,5:1 | pass | 2 test `AC51` |
| `KM-003-AC52` | Ba lệnh xanh, vector không đổi, `dependencies` rỗng, 09/03 cập nhật, mỗi FR có test hoặc kiểm tay | pass | §4. `package.json` không có khoá `dependencies`; `docs/09-core-api.md:44,118,212`, `docs/03-data-model.md:216`. Bảng FR→test trong `implement.md` chỉ có 0 ở NFR07/NFR11/NFR12 (NFR07 đúng là AC49; hai cái kia được phủ bởi AC52) |
| `KM-003-AC53` | KM-004/006/010 nhận lại được dạng lưu, bộ khoá, `dirty`, `record` | pass | Test `AC53` ở `test:browser`: "a stored row opens with the password and maps onto POST /api/register"; `implement.md:594` có bảng ánh xạ. Tôi chưa đọc lại từng `KM-004.md`/`KM-006.md`/`KM-010.md`, chỉ thấy diff của KM-004/006/011 trong `git diff master --stat` |

## 3. Promised proofs

| Proof | Executed | Result |
|---|---|---|
| `npm test`, `npm run test:browser`, `npm run vectors` | Có | Xanh, §4 |
| `npm run test:e2e` (Chrome thật, đúng CSP, bộ đếm vi phạm CSP) | Có | 63/63 |
| Chụp màn hình 1280/899/360 px, sáng/tối, xem bằng mắt (plan §6) | Không | Tôi không chạy lại và không xem ảnh; chỉ có assert bố cục trong `sweep.e2e.js` |
| Kiểm tay (1): tắt Wi-Fi thật, AC06 | Không | Chưa ai làm |
| Kiểm tay (2): ngủ máy thật 11 phút, AC10 | Không | Chưa ai làm |
| Kiểm tay (3): camera thật Chrome macOS, AC32 | Không | Chưa ai làm |
| Kiểm tay (4): Safari / Firefox, AC49 | Không | Safari không trả kết quả, Firefox chưa cài |
| Kiểm tay (5): clipboard bị từ chối vì mất focus, AC36 | Không | Chỉ có test clipboard giả |
| Kiểm tay (6): hộp từ chối camera thật, AC33 | Không | E2E thay `getUserMedia` |
| Thử đột biến cho `gen-vectors` (plan §4) | Không kiểm | Tôi chỉ thấy lệnh xanh và `testkit/vectors.js` không đổi |

## 4. Regressions

```
$ npm test
ℹ tests 200   ℹ pass 196   ℹ fail 0   ℹ skipped 4   (4 skip = IndexedDB, chỉ chạy ở trình duyệt)

$ npm run test:browser
Mozilla/5.0 (Macintosh; ...) HeadlessChrome/156.0.0.0 Safari/537.36
tests 193  pass 193  fail 0  (15297 ms)

$ npm run vectors
ok       vaultGzip gunzips to inputs.vault
ok       envelope.ct is AES-GCM over the committed vaultGzip
ok       every other key and the file header match node:crypto byte for byte

$ git diff master -- testkit/vectors.js | wc -l
0

$ npm run test:e2e
ℹ tests 63   ℹ pass 63   ℹ fail 0   ℹ skipped 0   (119 s)
```

Quét tĩnh `src/public` (không tính `core/` và CSS) tìm `innerHTML`, `insertAdjacentHTML`, `eval(`, `console.`, `style=`: 0 kết quả. `rg` tìm `trashItem|purgeItem|restoreItem|serviceWorker|localStorage` trong `src/public`: chỉ ba định nghĩa trong `core/model.js`, không có nơi gọi.

## 5. Out-of-scope check

Không thấy gì từ mục Out of scope được giao: không có `sw.js`, `_headers`, `manifest`, `wrangler.toml`, `functions/`; không gọi thao tác thùng rác; không có `localStorage`. `AC44` (quét chuỗi FR47 và duyệt mọi màn) xanh. Hộp "Bỏ bản nháp?" thêm khi rời form (plan §8) là hành vi spec không nêu, nhưng không thuộc danh sách cấm; ghi nhận để originator quyết.

## 6. Findings

| # | Finding | Severity | Where |
|---|---|---|---|
| 1 | `AC49` chưa có kết quả trên trình duyệt nào ngoài Chrome. Safari chạy `test:browser` không trả kết quả trong 180 giây, nguyên nhân chưa rõ; luồng chính chưa chạy; Firefox chưa cài. App mới chỉ được chứng minh trên Chrome | High (chặn verdict) | `implement.md` §AC49, `spec.md` NFR07 |
| 2 | Sáu mục kiểm tay (§3) chưa làm. Các bản tự động thay thế bằng giả lập (đồng hồ, camera, quyền, clipboard) | Medium | `implement.md:662` |
| 3 | `AC36`: chỉ gọi `readText` khi quyền đã `granted`, nên với quyền mặc định thứ khác vừa copy cũng bị xoá sau 30 giây. Đúng Concern 7 nhưng xảy ra ở phần lớn lần dùng | Low (đã được chấp nhận) | `plan.md` §1 |
| 4 | `AC50` unlock 200 KB đo qua lõi, không qua UI; số trung vị lấy từ `implement.md`, tôi chỉ thấy assert xanh | Low | `test/e2e/perf.e2e.js:48-66` |
| 5 | Chưa xem ảnh chụp màn hình (plan §6 "nhìn bằng mắt"); assert bố cục xanh không chứng minh giao diện đúng | Low | `plan.md` §6 |
| 6 | Hộp xác nhận "Bỏ bản nháp?" không có trong spec | Info | `plan.md` §8 |
| 7 | Vòng phản hồi của plan kiểm được mọi AC trừ `AC49` (cần Safari/Firefox thật) và các mục kiểm tay trên máy thật; đây là giới hạn của vòng, không phải lỗi mã | Info | `plan.md` §6 |

## 7. Shortest path to pass

1. Ghi kết quả `AC49` vào `implement.md` hoặc phụ lục của file này: chạy `npm start`, mở trang trên Safari desktop, đi qua lập tài khoản → mở khoá → tạo item → copy; mở `test:browser` trên Safari và ghi kết quả, kể cả lỗi (nếu vẫn không trả về thì ghi đúng như vậy kèm lệnh đã thử). Làm tương tự với Firefox nếu cài được. NFR07 không đòi Safari/Firefox phải xanh, chỉ đòi ghi lại; có kết quả thì `AC49` thành `pass`.
2. (Khuyến nghị, không chặn) Làm sáu mục kiểm tay ở §3, nhất là Wi-Fi thật, camera thật và clipboard mất focus, rồi ghi kết quả.
