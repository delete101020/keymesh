# 02 · Kiến trúc

## Sơ đồ tổng thể

```mermaid
flowchart LR
  subgraph Device["Thiết bị (Android / iPhone / máy tính)"]
    UI["PWA UI<br/>(vanilla JS)"]
    CR["crypto.js<br/>WebCrypto"]
    SY["sync.js + merge.js"]
    IDB[("IndexedDB<br/>cache đã mã hoá<br/>+ base + session")]
    SW["Service Worker<br/>cache app shell"]
    UI --> CR --> IDB
    UI --> SY --> IDB
  end

  subgraph CF["Cloudflare (gói Free)"]
    PG["Pages<br/>(file tĩnh)"]
    FN["Pages Functions<br/>/api/*"]
    D1[("D1 (SQLite)<br/>dt_user · dt_vault (nhiều/user) · dt_session<br/>dt_vault_snapshot · dt_audit_log")]
    FN --> D1
  end

  SW -. tải app .-> PG
  SY -- "HTTPS, cùng origin<br/>chỉ gửi blob đã mã hoá" --> FN
  SY -. "bản sao chỉ ghi<br/>(Chromium, tuỳ chọn)" .-> FILE[("File backup<br/>trên đĩa")]
```

Nguyên tắc: **mọi thao tác mã hoá và giải mã đều diễn ra trên thiết bị.** Server chỉ nhận và trả blob, kiểm tra phiên đăng nhập và kiểm tra version.

## Thành phần

| Thành phần | Trách nhiệm |
|---|---|
| **PWA UI** | Màn hình đăng nhập/mở khoá, điều hướng project/env, danh sách, chi tiết, sửa, cài đặt. Bố cục 3 cột trên desktop, xếp chồng trên mobile |
| **crypto.js** | PBKDF2, HKDF, AES-GCM, bọc/mở `accountKey` và `vaultKey`, WebAuthn PRF |
| **store.js** | Đọc và ghi IndexedDB: blob cục bộ và base **theo từng vault**, session token, `accountKey` đã bọc bằng passkey, cài đặt riêng từng thiết bị |
| **merge.js** | Hàm thuần `merge(base, local, remote) → vault`, gộp **theo thuộc tính và theo field**; đánh dấu xung đột nằm ở `item.conflict`. Nằm trong lõi (`js/core/merge.js`), hợp đồng ở [09](09-core-api.md) |
| **sync.js** | Pull/push với server cho từng vault, gom các thay đổi (debounce), thử lại khi mất mạng, hiển thị trạng thái đồng bộ |
| **mirror.js** | Bản sao tự động chỉ ghi ra file qua File System Access API (chỉ Chromium); không bao giờ đọc file để sync |
| **config.js** | Cấu hình theo domain (xem [Cấu hình theo domain](#cấu-hình-theo-domain)) |
| **Service Worker** | Cache app shell theo version để mở được khi offline; **không** cache `/api/*` |
| **Pages Functions** | API REST trong [06-api.md](06-api.md): auth, vault, sessions, snapshots |
| **D1** | Lưu user, blob, session, snapshot, audit. Xem [03-data-model.md](03-data-model.md) |

## Luồng chính

### Lần đầu trên một thiết bị mới

```mermaid
sequenceDiagram
  participant U as Người dùng
  participant C as Client
  participant S as Server
  U->>C: username + master password
  C->>S: GET /api/prelogin?username
  S-->>C: kdf {iter, salt}
  C->>C: masterKey = PBKDF2(pw, salt, iter)<br/>encKey, authKey = HKDF(masterKey)
  C->>S: POST /api/login {username, authKey, device}
  S-->>C: session token + wrappedAccountKey
  C->>C: accountKey = unwrap(encKey, wrappedAccountKey)
  C->>S: GET /api/vaults
  S-->>C: [{id, version, wrappedVaultKey, meta}]
  loop mỗi vault
    C->>S: GET /api/vaults/:id
    S-->>C: {version, blob}
    C->>C: vaultKey = unwrap(accountKey, wrappedVaultKey)<br/>giải mã → vault; lưu blob + base vào IndexedDB
  end
  C-->>U: (tuỳ chọn) đăng ký passkey để lần sau mở bằng vân tay
```

### Mở khoá hằng ngày

1. App mở từ cache của Service Worker, nên có mạng hay không đều được.
2. Mở khoá bằng passkey (vân tay/Face ID) hoặc master password. Bước này hoàn toàn cục bộ, **không cần mạng**.
3. Nếu có mạng, chạy đồng bộ ở nền ([05-sync.md](05-sync.md)).

### Khi sửa một item

1. Sửa vault trong bộ nhớ, cập nhật đồng hồ (`clock`) của **đúng các thuộc tính và field vừa đổi**, cập nhật `updatedAt`, đẩy phiên bản cũ vào `history`.
2. Mã hoá lại vault đó rồi ghi vào IndexedDB ngay, đánh dấu `dirty`.
3. Sau khoảng 1–2 giây debounce, `sync.js` push vault đó lên. Nếu bị 409, nó pull về, gộp, rồi push lại.
4. Nếu đã bật bản sao file, `mirror.js` ghi lại file sau khoảng 10 giây debounce.

## Công nghệ

| Lớp | Lựa chọn |
|---|---|
| Frontend | HTML, CSS, JavaScript ES modules, không framework, không build |
| Mã hoá | WebCrypto (PBKDF2-SHA256, HKDF-SHA256, AES-GCM-256), WebAuthn PRF |
| Lưu trữ cục bộ | IndexedDB |
| Offline | Service Worker cùng Web App Manifest |
| Backend | Cloudflare Pages Functions (Workers runtime) |
| Database | Cloudflare D1 |
| Triển khai | `wrangler` CLI; repo git cá nhân (có thể dùng Pages tự deploy từ GitHub) |
| Test | `node --test` cho `merge.js` và `crypto.js`; Playwright (tuỳ chọn) cho E2E |

## Cấu trúc repo

Toàn bộ mã sản phẩm nằm trong `src/`, và `src/` là *root directory* của project Pages (`wrangler pages dev` chạy từ `src/`; trên dashboard đặt Root directory = `src`). Thư mục gốc chỉ còn tài liệu, tham chiếu và test.

```
keymesh/
├── README.md
├── package.json               # "type": "module", chỉ có scripts, không có dependency (trừ wrangler)
├── docs/                      # tài liệu này; 09-core-api.md là hợp đồng lõi
├── design/                    # prototype giao diện, chỉ để tham chiếu
├── envvault.html              # bản v1 một file, chỉ để tham chiếu (không sửa)
├── src/
│   ├── wrangler.toml          # pages_build_output_dir = "public", binding D1
│   ├── public/                # Cloudflare Pages phục vụ thư mục này
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── manifest.webmanifest
│   │   ├── sw.js
│   │   ├── _headers           # CSP và các security header (phải nằm trong thư mục được phục vụ)
│   │   ├── icons/
│   │   └── js/
│   │       ├── core/          # lõi thuần: không DOM, không lưu trữ, không mạng; chạy cả Node
│   │       │   ├── bytes.js
│   │       │   ├── errors.js
│   │       │   ├── crypto.js
│   │       │   ├── model.js   # schema, validate
│   │       │   └── merge.js
│   │       ├── app.js         # khởi động, trạng thái màn hình, hành động; không biết gì về DOM của màn hình
│   │       ├── ui/            # các màn hình; ui/shell.js là điểm vào của trang
│   │       ├── session.js     # khoá và vault trong bộ nhớ; mọi thay đổi đi qua session.mutate()
│   │       ├── store.js
│   │       ├── tab-lock.js, idle.js, clipboard.js   # một tab mở khoá, tự khoá, clipboard tự xoá
│   │       ├── settings.js    # cài đặt của thiết bị (meta.settings), logic thuần
│   │       ├── pwa.js         # đăng ký Service Worker, báo bản mới
│   │       ├── vault-query.js, vault-ops.js, history-diff.js, field-file.js   # logic thuần trên vault
│   │       ├── otp.js, passgen.js, wordlist.js
│   │       ├── sync.js
│   │       ├── mirror.js      # bản sao tự động ra file (Chromium)
│   │       └── config.js      # cấu hình theo domain
│   ├── functions/
│   │   └── api/
│   │       └── [[route]].js   # router API (hoặc tách file theo nhóm)
│   └── migrations/
│       └── 0001_init.sql
├── test/                      # *.test.js, chạy bằng node --test; test/e2e/*.e2e.js chạy bằng npm run test:e2e
└── testkit/                   # helper, vector, runner trình duyệt, serve.mjs (phục vụ cục bộ, đọc header từ `_headers`), sw-version.mjs (ghi VERSION và SHELL vào sw.js), gen-icons.mjs, e2e/ (harness CDP); không được phục vụ
```

## Triển khai và vận hành

- **Môi trường:** chỉ có `prod`, cùng một project `preview` của Pages để thử với một D1 riêng.
- **Domain:** dùng `*.pages.dev` trước. Code không hard-code domain nào, để có thể chuyển sang domain riêng bằng cách đổi cấu hình (xem bên dưới). Khi có domain riêng, có thể đặt thêm **Cloudflare Access** (Zero Trust free) phía trước để có thêm một lớp đăng nhập. Xem [04-security.md](04-security.md).
- **Backup:** server giữ 30 snapshot gần nhất cho mỗi vault. Người dùng có thể tải **bản backup đã mã hoá** về bất cứ lúc nào, và trên Chromium có thể bật **bản sao tự động ra file**.

### Cấu hình theo domain

| Ở đâu | Giá trị | Ghi chú |
|---|---|---|
| Server (`wrangler.toml` / biến môi trường Pages) | `ALLOWED_ORIGINS` | Danh sách origin được phép gọi API, ví dụ `https://keymesh.pages.dev,https://vault.example.com`. Server kiểm tra header `Origin` |
| Server | `RP_ID` | Không dùng ở giai đoạn này (passkey chỉ mở khoá cục bộ), để sẵn cho khi passkey dùng để đăng nhập server |
| Client (`config.js`) | Origin và RP ID của WebAuthn | Lấy từ `location.origin` và `location.hostname` lúc chạy, không hard-code |
| `_headers` | CSP | Chỉ dùng `'self'`, nên không phụ thuộc domain |

Khi chuyển từ `pages.dev` sang domain riêng:

- **IndexedDB gắn theo origin**: trên domain mới, mỗi thiết bị phải đăng nhập lại và tải vault từ server. Trước khi chuyển, đảm bảo mọi thiết bị đã sync xong (không còn thay đổi dirty) ở domain cũ.
- **Passkey gắn theo RP ID** (domain): phải đăng ký lại passkey trên domain mới.
- Giữ domain cũ trong `ALLOWED_ORIGINS` một thời gian để thiết bị nào còn thay đổi chưa push vẫn push được.
- File bản sao tự động phải chọn lại trên domain mới.
- **Giới hạn gói Free:** 100k request/ngày cho Workers, D1 5 GB và 5 triệu lượt đọc/ngày. Mức dùng cá nhân thấp hơn hàng nghìn lần.
