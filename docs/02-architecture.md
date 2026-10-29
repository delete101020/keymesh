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
    D1[("D1 (SQLite)<br/>users · vaults · sessions<br/>snapshots · audit")]
    FN --> D1
  end

  SW -. tải app .-> PG
  SY -- "HTTPS, cùng origin<br/>chỉ gửi blob đã mã hoá" --> FN
```

Nguyên tắc: **mọi thao tác mã hoá và giải mã đều diễn ra trên thiết bị.** Server chỉ nhận và trả blob, kiểm tra phiên đăng nhập và kiểm tra version.

## Thành phần

| Thành phần | Trách nhiệm |
|---|---|
| **PWA UI** | Màn hình đăng nhập/mở khoá, điều hướng project/env, danh sách, chi tiết, sửa, cài đặt. Bố cục 3 cột trên desktop, xếp chồng trên mobile |
| **crypto.js** | PBKDF2, HKDF, AES-GCM, bọc/mở `vaultKey`, WebAuthn PRF |
| **store.js** | Đọc và ghi IndexedDB: blob cục bộ, base, session token, `vaultKey` đã bọc bằng passkey, cài đặt riêng từng thiết bị |
| **merge.js** | Hàm thuần `merge(base, local, remote) → {result, conflicts}`, có unit test |
| **sync.js** | Pull/push với server, gom các thay đổi (debounce), thử lại khi mất mạng, hiển thị trạng thái đồng bộ |
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
  S-->>C: session token + wrappedVaultKey
  C->>C: vaultKey = unwrap(encKey, wrappedVaultKey)
  C->>S: GET /api/vault
  S-->>C: {version, blob}
  C->>C: giải mã → vault; lưu blob + base vào IndexedDB
  C-->>U: (tuỳ chọn) đăng ký passkey để lần sau mở bằng vân tay
```

### Mở khoá hằng ngày

1. App mở từ cache của Service Worker, nên có mạng hay không đều được.
2. Mở khoá bằng passkey (vân tay/Face ID) hoặc master password. Bước này hoàn toàn cục bộ, **không cần mạng**.
3. Nếu có mạng, chạy đồng bộ ở nền ([05-sync.md](05-sync.md)).

### Khi sửa một item

1. Sửa vault trong bộ nhớ, cập nhật `updatedAt`, đẩy phiên bản cũ vào `history`.
2. Mã hoá lại rồi ghi vào IndexedDB ngay, đánh dấu `dirty`.
3. Sau khoảng 1–2 giây debounce, `sync.js` push lên. Nếu bị 409, nó pull về, gộp, rồi push lại.

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

## Cấu trúc repo đề xuất

```
keymesh/
├── README.md
├── docs/                      # tài liệu này
├── legacy/
│   └── envvault.html          # bản v1 một file, chạy cục bộ (giữ để tham chiếu và migrate)
├── public/                    # Cloudflare Pages phục vụ thư mục này
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── icons/
│   └── js/
│       ├── app.js             # khởi động, router, render
│       ├── ui/                # các màn hình
│       ├── crypto.js
│       ├── store.js
│       ├── sync.js
│       ├── merge.js
│       └── model.js           # schema, migrate v1 → v2, validate
├── functions/
│   └── api/
│       └── [[route]].js       # router API (hoặc tách file theo nhóm)
├── migrations/
│   └── 0001_init.sql
├── test/
│   ├── merge.test.js
│   └── crypto.test.js
├── _headers                   # CSP và các security header cho Pages
└── wrangler.toml
```

## Triển khai và vận hành

- **Môi trường:** chỉ có `prod`, cùng một project `preview` của Pages để thử với một D1 riêng.
- **Domain:** dùng `*.pages.dev` hoặc domain riêng. Nếu có domain riêng, có thể đặt thêm **Cloudflare Access** (Zero Trust free) phía trước để có thêm một lớp đăng nhập. Xem [04-security.md](04-security.md).
- **Backup:** server giữ N snapshot gần nhất. Người dùng có thể tải **bản backup đã mã hoá** về bất cứ lúc nào, và nên làm định kỳ.
- **Giới hạn gói Free:** 100k request/ngày cho Workers, D1 5 GB và 5 triệu lượt đọc/ngày. Mức dùng cá nhân thấp hơn hàng nghìn lần.
