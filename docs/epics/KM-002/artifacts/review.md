# Review Report — Gộp ba chiều theo field (merge.js)

**Epic ID:** `KM-002`
**Reviewer:** Reviewer (policy)
**Status:** Draft
**Created:** `2026-11-01`
**Reviewed against:** `CLAUDE.md` (global + project § "Quy ước code"), `docs/02-architecture.md`, `docs/04-security.md`, `docs/09-core-api.md`, `spec.md`, `verify.md`

---

## 1. Verdict

Verdict: ship

Không có blocker. Có 1 should-fix nhỏ (tài liệu) và 3 note. `npm test` chạy lại trên nhánh: 119/119 xanh.

## 2. Scope reviewed

| | |
|---|---|
| Base | `master` |
| Head | `feat/KM-002-merge` (`d9b6150`) |
| Files changed | 15 (1 mã sản phẩm `src/public/js/core/merge.js`, 5 test/testkit, 4 tài liệu `docs/0x`, 4 artifact epic, 1 sửa `test/model.test.js`) |
| Read in full | yes — `merge.js` đọc trọn (487 dòng); diff tài liệu và `leak.test.js`/`model.test.js` đọc đầy đủ; `merge.test.js` (742 dòng), `merge-gen.js` (319 dòng) và `merge-props.test.js` chỉ đọc phần import/cấu trúc, vì `verify.md` đã chạy và đột biến chúng |

## 3. Policy checklist

| Source | Rule | Honored |
|---|---|---|
| `CLAUDE.md` § Cấu trúc thư mục | Mã sản phẩm nằm trong `src/`; không thêm thư mục gốc mới | yes — `merge.js` ở `src/public/js/core/`, test ở `test/`, helper ở `testkit/` |
| `CLAUDE.md` § Cấu trúc thư mục | Không sửa `envvault.html`, `design/` | yes — không chạm |
| `CLAUDE.md` § Ngôn ngữ và phụ thuộc | JS thuần, ES module, không dependency mới | yes — `package.json` không đổi |
| `CLAUDE.md` § Ngôn ngữ và phụ thuộc | Import tương đối có đuôi `.js`, không bare specifier | yes — `./errors.js`, `./model.js` |
| `CLAUDE.md` § Phân lớp | `core/` thuần: không DOM, storage, `fetch`, thời gian, ngẫu nhiên; chỉ import trong `core/` | yes — `rg` không thấy `Date`, `Math.random`, `console`, `fetch`; chỉ import `errors`, `model`. `model.test.js` đưa `merge.js` vào `CORE_FILES` để test tự động chặn |
| `CLAUDE.md` § Phân lớp | Đổi API `core/` thì cập nhật `docs/09` cùng thay đổi | yes — `09` có § `merge.js`; test FR23 kiểm mọi export có tên trong tài liệu |
| `CLAUDE.md` § Phân lớp | Ném `KeymeshError` với `code` đã định nghĩa | yes — chỉ `invalid`, đã thêm vào bảng lỗi của `09` |
| `CLAUDE.md` § Đặt tên | Tên file kebab-case, `camelCase`/`UPPER_SNAKE`, identifier tiếng Anh | yes — `merge-gen.js`, `merge-props.test.js`, `DELETED_ELSEWHERE`, `ITEM_ATTRS` |
| `CLAUDE.md` § Test | Chỉ `node:test` + `node:assert/strict`; `npm test` xanh | yes — chạy lại: 119 pass, 0 fail |
| `CLAUDE.md` § Test | Không sinh lại vector để "cho test pass" | yes — `testkit/vectors.js` không đổi |
| `CLAUDE.md` § Bảo mật phía client | Không ghi secret/plaintext ra `console`, thông điệp lỗi, URL | yes — lỗi chỉ mang tên tham số (`local`, `remote`, `base`, `v`, `vaultId`); `leak.test.js` AC22 kiểm message/stack/JSON/console |
| `CLAUDE.md` § Bảo mật phía client | Không `innerHTML`, CSP | n-a — không có mã UI/HTML |
| `CLAUDE.md` § Quy ước code (nguồn) | Đổi quy ước thì sửa tài liệu nguồn | n-a — không đổi quy ước |
| `docs/09` § "Mở rộng ở epic sau" | KM-006/KM-009 dựa vào hợp đồng | yes — hai dòng mới được thêm |

## 4. Findings

| # | Severity | Location | Finding | Policy |
|---|---|---|---|---|
| 1 | should-fix | `docs/epics/KM-002/artifacts/spec.md` (NFR03/AC27, FR06, FR12) | `verify.md` §7 đã nêu hai chỗ spec lệch mã: ngưỡng 200 ms chỉ chấm trên vault ~1 MB không lịch sử cũ (hình dạng 20 lịch sử/item chỉ đo), và `fieldOrder`/công thức `rev`/`updatedAt` theo amendment ở `plan.md`/`09`. Mã và `09` đã đúng; spec chưa sửa nên KM-006 đọc spec sẽ thấy hai nguồn mâu thuẫn. Sửa chữ, không sửa mã | `CLAUDE.md` § Quy ước code (đổi quy ước/hợp đồng thì sửa tài liệu nguồn và ghi lý do vào artifact epic) |
| 2 | note | `src/public/js/core/merge.js:307` | `conflictEntry` chép nguyên `fields` (gồm giá trị secret ở dạng plaintext) vào `history` của item. Đây là hành vi đúng thiết kế (`history` đã có sẵn trong `model.js`, vault được mã hoá trước khi rời máy, `HISTORY_MAX` chặn số bản), nhưng nghĩa là giá trị thua tồn tại trong vault đến khi bị đẩy khỏi giới hạn. Không phải lỗi | `opinion` |
| 3 | note | `src/public/js/core/merge.js:473–487` | `merge` luôn `validateVault` cả ba bản; thất bại ném `invalid` kèm tên tham số, không báo vi phạm cụ thể. Chấp nhận được (tránh lộ giá trị), nhưng KM-006 sẽ khó chẩn đoán bản hỏng nào ở mức đường dẫn | `opinion` |
| 4 | note | working tree | `.aidlc/runs/KM-002.json`, `docs/epics/KM-002/state.json`, `artifacts/verify.md` chưa commit — đây là trạng thái điều phối pipeline và báo cáo verify, không phải mã. Cần commit cùng artifact review khi epic đóng | `opinion` |

## 5. Always-in-scope checks

| Check | Result |
|---|---|
| Secrets in code / fixtures / logs | clean — không có khoá/token; fixture dùng chuỗi marker giả (`MERGE-MARKER-…`); không có `console` trong `merge.js` |
| Data handling (PII, retention, boundaries) | clean — hàm thuần, không I/O, kết quả không chung object với đầu vào (`clone`). Lưu giữ giá trị thua trong `history` là finding #2 (note, có giới hạn `HISTORY_MAX`) |
| Silent failure (swallowed errors, ignored codes) | clean — không có `catch` nào trong `merge.js`; đầu vào sai ném `KeymeshError('invalid')`; không có nhánh nuốt lỗi |
| Newly reachable surface (API, route, permission) | clean — thêm hai export công khai `merge`, `DELETED_ELSEWHERE`, đều có tên trong `09`; không route, không permission, server chưa import |

## 6. Not re-checked

Theo `verify.md` (29/29 AC pass, 119/119 test Node và trình duyệt, đột biến, dấu vân tay 500 kết quả Node so trình duyệt, đo hiệu năng 1 MB): tính đúng của từng dòng bảng xoá, tính giao hoán/idempotent/không mất dữ liệu, ngưỡng hiệu năng. Review này chỉ chạy lại `npm test` để xác nhận trạng thái hiện tại.

## 7. Shortest path to ship

Không cần vì verdict là ship. Nên làm trước khi KM-006 bắt đầu (không chặn): sửa `spec.md` theo finding #1.

## 8. Policy amendments

| Proposed rule | Where it belongs | Why |
|---|---|---|
| "Khi amendment trong lúc implement làm hợp đồng lệch `spec.md`, cập nhật `spec.md` (hoặc ghi mục 'Đã thay thế bởi' trong spec) ở cùng epic" | `CLAUDE.md` § Quy ước code, cạnh câu "Muốn đổi quy ước nào…" | Finding #1: quy ước hiện chỉ nói về `docs/0x`, không nói về spec của epic nên chỗ lệch này không có điều khoản nào chặn |
