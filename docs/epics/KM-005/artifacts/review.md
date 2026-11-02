# Review Report — Server: D1, xác thực và API vault

**Epic ID:** `KM-005`
**Reviewer:** Reviewer (policy)
**Status:** Draft
**Created:** `2026-11-02`
**Reviewed against:** `CLAUDE.md`, loaded skills, workspace SDLC standard

---

## 1. Verdict

Verdict: ship

Không có blocker, không có should-fix. Ba ghi chú (note) bên dưới không chặn gì. Diff đã đọc hết, mã server (`src/functions/api/*`, migration, `wrangler.toml`) đọc từng dòng.

## 2. Scope reviewed

| | |
|---|---|
| Base | `master` (merge-base `e77fde3`) |
| Head | `feat/KM-005-server` (`dc93f9c`) |
| Files changed | 43 (+5425 / −100): 7 tệp `src/functions/api/`, 1 migration, `wrangler.toml`, 10 tệp `test/server/`, `testkit/{wrangler-server,dev-server}.mjs`, `package.json` + lock, docs 02–06, artifact KM-005, ghi chú KM-006/008/009 |
| Read in full | yes (lock file chỉ xem phần khai báo devDependency; không có thay đổi dưới `src/public/`, nên `core/` và client không đổi) |

Cây làm việc còn `M .aidlc/runs/KM-005.json`, `M docs/epics/KM-005/state.json`, `?? verify.md` chưa commit: đây là trạng thái pipeline, không phải mã sản phẩm, không thuộc diff được review.

## 3. Policy checklist

| Source | Rule | Honored |
|---|---|---|
| `CLAUDE.md` § Cấu trúc thư mục | Mã sản phẩm trong `src/`; không thêm thư mục gốc mới; `envvault.html`, `design/` không sửa | yes |
| `CLAUDE.md` § Cấu trúc thư mục | `src/functions/api/`, `src/migrations/NNNN_<tên>.sql`, test ngoài `src/` | yes (`0001_init.sql`, `test/server/`, `testkit/`) |
| `CLAUDE.md` § Ngôn ngữ và phụ thuộc | `dependencies` rỗng; ngoại lệ duy nhất là `wrangler` devDependency | yes (ghim `4.156.0`, test `ui-static` đã cập nhật và khẳng định đúng tập này) |
| `CLAUDE.md` § Ngôn ngữ và phụ thuộc | Node 24.22.1 (`.nvmrc`, `engines`) | yes (`>=24.22.1`, `.nvmrc` 24.22.1) |
| `CLAUDE.md` § Ngôn ngữ và phụ thuộc | Import tương đối có đuôi `.js`, không bare specifier | yes |
| `CLAUDE.md` § Phân lớp | Server chỉ import `core/` qua `../../public/js/core/*.js` | yes (`bytes.js`, `crypto.js`; có `layering.server.js` canh) |
| `CLAUDE.md` § Phân lớp | `core/` không đổi chữ ký; đổi thì cập nhật 09 | yes (không đổi `core/`; chỉ dùng hằng đã có trong 09 § Hằng export) |
| `CLAUDE.md` § Đặt tên | File kebab-case, camelCase/UPPER_SNAKE, identifier tiếng Anh, comment ngắn nói *vì sao* | yes (`_rate-limit.js`; comment giải thích lý do) |
| `CLAUDE.md` § Đặt tên | Bảng D1 tiền tố `dt_` / `sys_` | yes (`dt_user`, `dt_vault`, `dt_vault_snapshot`, `dt_session`, `dt_audit_log`, `sys_auth_attempt`) |
| `CLAUDE.md` § Test | Chỉ `node:test` + `node:assert/strict`; server test bằng wrangler local, `test/server/*.server.js`, không nằm trong `npm test` | yes |
| `CLAUDE.md` § Bảo mật client | Không `innerHTML`/`eval`, không inline, không ghi secret ra console/lỗi/URL | yes (`rg` không thấy `innerHTML`/`eval`/`console.log`; hai `console.error` chỉ in `error.name`; thông điệp lỗi cố định theo mã) |
| `CLAUDE.md` § Bảo mật client | Service Worker không cache `/api/*` | n-a (SW không đổi); API tự đặt `no-store` |
| `docs/04-security.md` | Constant-time, token lưu SHA-256, `security_stamp`, Origin, `404` chung, no-store | yes (xem §5; bằng chứng từng AC ở `verify.md`) |

## 4. Findings

| # | Severity | Location | Finding | Policy |
|---|---|---|---|---|
| 1 | note | `src/functions/api/_auth.js:44-49`, `_vaults.js:60` | Phân biệt `username_taken` / `vault_exists` bằng cách so chuỗi thông điệp lỗi SQLite (`dt_user.username`, `dt_vault.id`). Nếu D1 thật đổi cách viết, lỗi trùng sẽ thành `500` thay vì `409`. Không mất dữ liệu, không lộ gì. KM-006 đã được giao kiểm trên D1 thật. | `opinion` |
| 2 | note | `src/functions/api/_auth.js:130-137` | Mỗi request có phiên đều ghi một dòng D1 (gia hạn trượt `expires_at`, `last_seen_at`). Đúng thiết kế (FR, 30 ngày trượt) và chạy được trong một câu lệnh nguyên tử; chỉ lưu ý chi phí ghi nếu sau này dùng gói Free với nhiều thiết bị đồng bộ liên tục. | `opinion` |
| 3 | note | `src/functions/api/_vaults.js:45-64` | `POST /api/vaults` không giới hạn số vault hay tổng dung lượng mỗi tài khoản (mỗi vault ≤ 2 MB). Spec đã loại ra ngoài phạm vi có chủ đích (`spec.md` dòng 218: công cụ cá nhân, chỉ chủ tài khoản có phiên gọi được), và đăng ký đã khoá sau `REGISTRATION_TOKEN`. Ghi lại để nhớ nếu mô hình người dùng đổi. | `opinion` (spec: out-of-scope) |

> Ba dòng trên đều là ghi chú; không dòng nào chặn.

## 5. Always-in-scope checks

| Check | Result |
|---|---|
| Secrets in code / fixtures / logs | clean. `wrangler.toml` chỉ có `database_id` giả (`00000000-…05`, ghi rõ là placeholder đến KM-006) và nhắc rằng ba biến bí mật nằm ở Pages settings; `.dev.vars` và `.wrangler/` đã gitignore, không có tệp nào bị track. Test sinh `REGISTRATION_TOKEN`/`SERVER_SECRET` ngẫu nhiên mỗi lần chạy và quét log server tìm giá trị bí mật (`wrangler-server.mjs:176`). |
| Data handling (PII, retention, boundaries) | clean. Server chỉ nhận ciphertext, không giải mã (`_validate.js` chỉ kiểm hình dạng). Khoá bộ đếm đăng nhập là HMAC dưới `SERVER_SECRET`, không đọc ngược được username hay IP. Token phiên lưu SHA-256. `removeStale` xoá phiên hết hạn và bộ đếm cũ sau 24 giờ (FR35). Thiếu `SERVER_SECRET` thì `500`, không có giá trị mặc định đoán được. |
| Silent failure (swallowed errors, ignored codes) | clean. Chỗ duy nhất nuốt lỗi là `removeStale` (`_rate-limit.js:110`): có chủ đích, ghi `error.name` ra log và không làm hỏng đăng nhập, có comment nêu lý do. Lỗi lạ trong `onRequest` thành `500` với thông điệp cố định, không rò câu lệnh. |
| Newly reachable surface (API, route, permission) | clean. Tám route khai báo tường minh; mọi route vault bắt buộc `authenticate` trước khi kiểm id; mọi truy vấn vault lọc theo `user_id` của phiên và dùng chung đường tới `404` (đọc, ghi, và ghi với blob sai của vault người khác đều vẫn `404`). Không có CORS header; Origin ngoài danh sách hoặc `null` bị từ chối trước tiên; danh sách rỗng từ chối mọi Origin. Rủi ro còn lại (khoá đăng nhập mới 15 phút nếu biết username; dò id qua `409 vault_exists`) đã được originator chấp nhận và ghi ở `docs/04-security.md`. |

## 6. Not re-checked

Hành vi theo từng tiêu chí: `verify.md` (59/59 pass, 72 test `npm run test:server` do verifier chạy) — không chạy lại. Hai tiêu chí AC25 (IP thật qua `CF-Connecting-IP`) và AC26, cùng kiểm giới hạn dòng D1 và thông điệp lỗi trùng khoá trên hạ tầng thật, đã được giao cho KM-006 (`KM-006.md`).

## 7. Shortest path to ship

Không cần: verdict là `ship`.

## 8. Policy amendments

| Proposed rule | Where it belongs | Why |
|---|---|---|
| "Trong `src/functions/`, lỗi ném ra dùng `ApiError` với `code` cố định của `_http.js`; quy tắc `KeymeshError` chỉ áp dụng cho `core/`." | `CLAUDE.md` § Phân lớp (mục Server) | Câu "không ném `Error` trần" đọc được theo cả hai nghĩa; server dùng `ApiError` (có `code`) và đúng tinh thần, nhưng văn bản chưa nói. Không vi phạm lần nào, chỉ là chỗ mơ hồ. |
