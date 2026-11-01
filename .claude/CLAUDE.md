<!-- aidlc:codegraph:start -->
## codegraph (managed by AIDLC extension — do not edit by hand)

This project has a CodeGraph index at `.codegraph/`, exposed via the
`codegraph` MCP server (auto-registered by the AIDLC VS Code extension). The
server watches the project and re-syncs changed files within a couple of
seconds, so the graph reflects edits made in this session too.

**Prefer `codegraph_explore` over grep/read sweeps when the question is
structural** — "how does X work", "who calls X", "how does X reach Y", "what
breaks if I change X". One call returns the relevant symbols' source grouped by
file, the call paths between them, and a blast-radius summary.

AIDLC skills and agents may name **ast-graph** tools. This workspace uses
codegraph instead — map them:
- ast-graph `symbol` / `search` → `codegraph_explore` naming the symbol
- ast-graph `blast-radius` / `changed-symbols` → `codegraph_explore` (its blast-radius section)
- ast-graph `hotspots` / `routes` / `dead-code` → `codegraph_explore` on the area in question

Keep using grep/read/edit for editing, config files, prose, and non-code signals.

If the index looks missing or stale, ask the user to run `AIDLC Native: Rescan AST Graph`.
<!-- aidlc:codegraph:end -->

## Quy ước code (bắt buộc cho mọi epic)

Nguồn: `docs/02-architecture.md` (cấu trúc repo, stack), `docs/04-security.md` (CSP, client),
`docs/09-core-api.md` (hợp đồng lõi, có từ KM-001). Muốn đổi quy ước nào ở đây thì sửa luôn tài liệu
nguồn và ghi lý do vào artifact của epic.

### Cấu trúc thư mục

Theo cây ở `docs/02-architecture.md` § "Cấu trúc repo". **Mọi mã sản phẩm nằm trong `src/`**; không thêm
thư mục gốc mới ngoài cây đó.

- `src/` là root của project Pages: `src/wrangler.toml`, `src/public/` (thứ được phục vụ, kể cả `_headers`),
  `src/functions/api/` (Pages Functions), `src/migrations/NNNN_<tên>.sql` (D1).
- Mã client ở `src/public/js/`: lõi thuần ở `core/`, màn hình ở `ui/`, các lớp khác (`app.js`, `store.js`,
  `sync.js`, `mirror.js`, `config.js`) ngay trong `js/`.
- `test/<khu-vực>.test.js` — chỉ chứa file test. `testkit/` — helper, vector, runner trình duyệt.
  Cả hai nằm ngoài `src/` nên không bao giờ bị deploy.
- `envvault.html` (v1) và `design/` (prototype) chỉ để **tham chiếu**: không sửa, không import từ mã v2.
  KM-003 chép/viết lại phần cần dùng vào `src/public/`.

### Ngôn ngữ và phụ thuộc

- JavaScript thuần, ES module (`"type": "module"`), Node 24.22.1 (`.nvmrc`, `engines`). Không TypeScript, không bundler, không
  bước build cho `public/` — file trong repo là file chạy trên trình duyệt.
- **Không phụ thuộc bên thứ ba** ở runtime lẫn test: `dependencies` rỗng, chỉ dùng WebCrypto, API trình
  duyệt và module `node:*`. Ngoại lệ duy nhất: `wrangler` làm devDependency (từ KM-005).
- Import bằng đường dẫn tương đối có đuôi `.js`; không dùng bare specifier (trừ `node:*` trong test/tooling).

### Phân lớp

Chiều phụ thuộc chỉ đi xuống: `ui/` → `app.js` → `store.js` / `sync.js` / `mirror.js` → `core/`.

- **`core/`** (`bytes`, `errors`, `crypto`, `model`, `merge`): thuần. Không DOM, không
  IndexedDB/localStorage, không `fetch`, không trạng thái chung chứa khoá hay plaintext; thời gian và
  `deviceId` do bên gọi truyền vào. `core/` chỉ import trong `core/`. Phải chạy được trên cả Node và
  trình duyệt.
- **Server** (`src/functions/`) chỉ được import `core/` qua `../../public/js/core/*.js` (wrangler tự
  bundle), không bao giờ import phần còn lại của `public/js/`. Server không giải mã gì.
- API export của `core/` là hợp đồng ở `docs/09-core-api.md`. Đổi chữ ký hay hành vi thì cập nhật 09 trong
  cùng thay đổi. Lỗi ném ra dùng `KeymeshError` với `code` đã định nghĩa, không ném `Error` trần.

### Đặt tên

- File chữ thường, nhiều từ thì `kebab-case`. Hàm/biến `camelCase`, hằng `UPPER_SNAKE`, class `PascalCase`.
- Identifier bằng tiếng Anh. Comment ngắn, chỉ viết khi cần giải thích *vì sao*.
- Bảng D1 theo tiền tố `dt_` / `sys_` ở `docs/03-data-model.md`.

### Test

- Chỉ dùng `node:test` và `node:assert/strict`. Chạy bằng `npm test`; lõi còn phải pass
  `npm run test:browser`. Implement chưa xong khi `npm test` chưa xanh.
- Vector trong `testkit/vectors.js` được sinh độc lập rồi commit; không sinh lại để "cho test pass".
- Server test bằng môi trường local của wrangler (D1 local), không gọi Cloudflare thật: `npm run test:server`,
  tệp `test/server/*.server.js`. Phần server chưa xong khi lệnh này chưa xanh. Bộ này không nằm trong `npm test`,
  để `npm test` vẫn chạy được khi chưa cài gì.

### Bảo mật phía client (xem `docs/04-security.md`)

- Không `innerHTML` / `insertAdjacentHTML` với dữ liệu người dùng; dùng `textContent` và tạo DOM.
- CSP chỉ cho `'self'`: không `<script>` hay `<style>` inline, không thuộc tính `style="…"` hay `on*="…"`,
  không tải tài nguyên ngoài origin, không `eval`.
- Không ghi password, khoá, secret hay plaintext vault ra `console`, thông điệp lỗi hay URL.
- Service Worker không cache `/api/*`.
