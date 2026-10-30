# Review Report — Lõi mật mã và model vault v2

**Epic ID:** `KM-001`
**Reviewer:** Reviewer (policy)
**Status:** Draft
**Created:** `2026-10-30`
**Reviewed against:** `CLAUDE.md`, loaded skills, workspace SDLC standard

---

## 1. Verdict

Verdict: ship

Revision 2. Blocker #1 của lần review trước (`kdf.iter` không có cận trên) và should-fix #2 (`updateItem` để lại thay đổi nửa vời) đều đã được sửa trong `604bccf` và `186457e`, có test và cập nhật `docs/03`, `docs/09`. Chạy lại `npm test`: 75/75 pass. Không còn blocker. Còn hai note, không chặn.

## 2. Scope reviewed

| | |
|---|---|
| Base | `master` (`5f9ad2d`) |
| Head | `feat/KM-001-core` (`827be0f`) |
| Files changed | 30 (+4184 / −31) so với `master`; revision này đọc thêm diff `22616bf..827be0f` (6 file mã, test, tài liệu: `crypto.js`, `model.js`, `keys.test.js`, `model.test.js`, `docs/03`, `docs/09`) |
| Read in full | yes cho diff sửa lỗi và toàn bộ `model.js` ở các thao tác sửa; phần còn lại của `core/` đã đọc đủ ở revision 1 và không đổi |

Không tính lại những gì `verify.md` đã kiểm. Lưu ý: `verify.md` (pass 24/24) viết trước hai commit sửa; thay đổi từ đó chỉ là cận trên `kdf.iter` và tính nguyên tử, không đụng AC nào khác, và `npm test` hiện xanh.

## 3. Policy checklist

| Source | Rule | Honored |
|---|---|---|
| `CLAUDE.md` § Cấu trúc thư mục | Mã sản phẩm trong `src/`; không thêm thư mục gốc mới | yes |
| `CLAUDE.md` § Cấu trúc thư mục | `design/` chỉ để tham chiếu, không sửa | no, xem #2 (đã khai, không chặn) |
| `CLAUDE.md` § Ngôn ngữ và phụ thuộc | JS thuần, ES module, `dependencies` rỗng; import tương đối có `.js` | yes |
| `CLAUDE.md` § Phân lớp | `core/` thuần, chỉ import trong `core/`, thời gian và `deviceId` do bên gọi truyền | yes |
| `CLAUDE.md` § Phân lớp | Lỗi ném ra dùng `KeymeshError`, không ném `Error` trần | yes (`readKdf` chặn `iter` ngoài khoảng bằng `unsupported` trước khi gọi PBKDF2; test kiểm `deriveBits` không được gọi) |
| `CLAUDE.md` § Phân lớp | Đổi chữ ký/hành vi thì cập nhật `docs/09` cùng thay đổi | yes (`KDF_MAX_ITER`, bảng lỗi `unsupported`, "Một lần lưu" đã cập nhật; `docs/03` cùng khoảng 600 000 ≤ iter ≤ 6 000 000) |
| `docs/09` § Một lần lưu | Hoặc thành công trọn vẹn, hoặc ném lỗi không để lại thay đổi | yes (xem bên dưới) |
| `CLAUDE.md` § Đặt tên | kebab-case, camelCase, `UPPER_SNAKE`, id tiếng Anh, comment ngắn nêu *vì sao* | yes (`KDF_MAX_ITER`; comment mới giải thích lý do) |
| `CLAUDE.md` § Test | Chỉ `node:test` + `node:assert/strict`; không sinh lại vector để cho pass | yes (vector không đổi) |
| `CLAUDE.md` § Bảo mật phía client | Không `innerHTML`, không ghi secret ra console/lỗi/URL; CSP | yes / n-a |

Kiểm tính nguyên tử theo từng thao tác sửa trong `model.js`: `addProject`, `addEnv`, `createItem` kiểm hết rồi mới `push`; `updateProject`/`updateEnv` qua `patchClocked` giờ kiểm hết trước khi ghi; `updateItem` sao lưu bản clone rồi khôi phục tại chỗ khi lỗi (giữ nguyên danh tính đối tượng, test khẳng định `vault.items[0] === item`); `deleteProject`, `deleteEnv`, `trashItem`, `restoreItem`, `purgeItem` chỉ `stamp(ctx)` rồi mới sửa, không có điểm ném giữa chừng. Đúng với câu mới ở `docs/09`.

## 4. Findings

| # | Severity | Location | Finding | Policy |
|---|---|---|---|---|
| 1 | note | `src/public/js/core/crypto.js:408-428` (`_internal`) | Module trình duyệt xuất `_internal` với `aesEncrypt(key, iv, …)` (tự chọn IV) và `importKey(raw, kind)`. `docs/09` ghi "chỉ dành cho test, không thuộc hợp đồng" và `ui/` chưa tồn tại nên không chặn. Khi KM-003 thêm `ui/`, nên có kiểm tra (grep trong CI) rằng không file nào ngoài `test/`, `testkit/` import `_internal` | `opinion` |
| 2 | note | `design/README.md:20` | Một dòng đường dẫn đổi `public/` → `src/public/`, vi phạm chữ của "`design/` chỉ để tham chiếu: không sửa". Nằm trong commit tài liệu `c174d44`, nội dung vô hại, `implement.md` (Sai khác #1) và `verify.md` Finding 1 đã khai; chỉ nhắc lại, không tính lại | `CLAUDE.md` § Cấu trúc thư mục |

Đã đóng so với revision 1: blocker (`readKdf` không chặn trên) và should-fix (`updateItem` không nguyên tử). Hai chỗ nhỏ khi đối chiếu bản sửa, không đáng thành finding: (a) `deriveFromPassword` vẫn không `zeroize(pw)` khi PBKDF2 ném lỗi; (b) cận 6 000 000 là 10× cận dưới, nên lần nâng `iter` sau này vượt 6 triệu sẽ cần đổi hằng này cùng `docs/03`, đã ghi ở cả hai nơi.

## 5. Always-in-scope checks

| Check | Result |
|---|---|
| Secrets in code / fixtures / logs | clean. Password trong test là hằng giả; `core/` không `console.*`; thông điệp lỗi mới (`kdf.iter`) chỉ là tên trường |
| Data handling (PII, retention, boundaries) | clean. Rollback trong `updateItem` giữ bản clone cục bộ trong lời gọi, không lưu ra ngoài, thoát phạm vi khi hàm trả về |
| Silent failure (swallowed errors, ignored codes) | clean. `catch` mới trong `updateItem` khôi phục rồi `throw err` nguyên vẹn, không nuốt lỗi; các `catch {}` ở `aesDecrypt`, `unwrapWith`, `gunzip` cố ý gộp lỗi theo `docs/09` |
| Newly reachable surface (API, route, permission) | clean. Chỉ thêm hằng export `KDF_MAX_ITER` (đã ghi vào `docs/09`); không route, endpoint hay permission mới. `_internal` xem #1 |

## 6. Not re-checked

Trích từ `verify.md`, không chạy lại: 24/24 tiêu chí `KM-001-AC01…AC24`, vector độc lập từ `node:crypto`, quét `core/` không storage/network/DOM/console, hiệu năng AC23, `npm run test:browser`. Trong phiên này chỉ chạy lại `npm test` (75/75) để xác nhận hai bản sửa không làm hỏng gì. `test:browser` chưa chạy lại sau hai commit sửa; thay đổi nằm trong mã thuần, không dùng API riêng của Node, nên rủi ro thấp, nhưng nên chạy một lần trước khi merge.

## 7. Shortest path to ship

Không áp dụng: verdict là `ship`. Khuyến nghị không chặn: chạy `npm run test:browser` một lần trên head trước khi merge.

## 8. Policy amendments

Hai đề xuất từ revision 1 vẫn đúng và chưa được áp dụng vào tài liệu chính sách (bản sửa chỉ ghi vào `docs/09`, `docs/03`). Nên đưa vào ở stage 6:

| Proposed rule | Where it belongs | Why |
|---|---|---|
| "Mọi tham số số đến từ bên ngoài lõi (kdf, kích thước, độ dài) phải có cận **cả hai phía**; vi phạm là `unsupported`/`format` do `KeymeshError`, không để API nền tảng ném lỗi gốc." | `CLAUDE.md` § Phân lớp, kế bên dòng về `KeymeshError` | Quy tắc hiện có chỉ nói "dùng `KeymeshError`"; blocker #1 lọt qua plan và verify vì thiếu dòng này |
| "Thao tác sửa trong `model.js` hoặc thành công trọn vẹn, hoặc ném lỗi mà không để lại thay đổi nào." | `CLAUDE.md` § Phân lớp (đã có ở `docs/09` § Một lần lưu sau revision 2) | Nay là hợp đồng ở `docs/09`; thêm vào quy ước code để mọi thao tác sửa mới (KM-002 merge, KM-003) tuân theo |
| "Không file ngoài `test/` và `testkit/` được import `_internal` từ `core/crypto.js`." | `CLAUDE.md` § Phân lớp | Biến ghi chú trong `docs/09` thành quy tắc kiểm được (finding #1) |
