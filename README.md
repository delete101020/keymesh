# KeyMesh

Kho lưu credential và link tài liệu **cá nhân**, tổ chức theo **Project → Environment**. Một item có thể gán cho nhiều môi trường: sửa một lần, mọi môi trường đều thấy giá trị mới.

Dữ liệu mã hoá đầu-cuối, dùng được trên máy tính, Android và iPhone (PWA), chạy offline, đồng bộ qua Cloudflare (gói miễn phí, không cần server riêng).

> **Trạng thái:** v1 (một file HTML, chạy cục bộ, tên cũ là EnvVault) đã dùng được, hiện ở [`envvault.html`](envvault.html). Theo kế hoạch, file này sẽ được chuyển sang `legacy/` ở M1. v2 (PWA + đồng bộ) đang ở giai đoạn thiết kế.

## Tài liệu thiết kế

| # | Tài liệu | Nội dung |
|---|---|---|
| 01 | [Tổng quan](docs/01-overview.md) | Bối cảnh, mục tiêu, phạm vi, các quyết định chính, thuật ngữ |
| 02 | [Kiến trúc](docs/02-architecture.md) | Thành phần, luồng chính, công nghệ, cấu trúc repo, triển khai |
| 03 | [Thiết kế dữ liệu](docs/03-data-model.md) | Nhiều vault, schema vault v2, khoá và envelope, IndexedDB, **D1 schema** |
| 04 | [Bảo mật](docs/04-security.md) | Mật mã, vòng đời khoá, xác thực, passkey, CSP, mô hình mối đe doạ |
| 05 | [Đồng bộ](docs/05-sync.md) | Giao thức offline-first theo từng vault, gộp ba chiều theo field, xử lý xung đột |
| 06 | [API](docs/06-api.md) | Các endpoint của Pages Functions |
| 07 | [Chức năng](docs/07-features.md) | Danh sách chức năng, wireframe desktop/mobile, tiêu chí chấp nhận |
| 08 | [Lộ trình](docs/08-roadmap.md) | Các giai đoạn M0–M6, hướng chia sẻ nhiều người, các quyết định đã chốt |
| 09 | [Hợp đồng lõi](docs/09-core-api.md) | Thao tác của `src/public/js/core/` (mật mã, model vault v2), loại lỗi, bộ vector cố định, epic nào dùng gì |

## Chạy app cục bộ

```
npm start          # http://127.0.0.1:8787/, đúng CSP ở docs/04, không cần cài gì
```

Chỉ dùng dữ liệu thử: dữ liệu nằm trên đúng một trình duyệt và chưa có cách sao lưu (KM-003).

## Chạy test

Cần Node 24.22.1 (`.nvmrc`). `npm test` không cần cài gì; chỉ `test:server` và `dev:server` cần `npm install` (`wrangler`, không cần tài khoản Cloudflare).

```bash
npm test               # node --test trên test/*.test.js
npm run test:browser   # cùng bộ test trong Chrome/Edge headless (đặt CHROME_PATH nếu không tự tìm thấy)
npm run vectors        # tính lại testkit/vectors.js bằng node:crypto và so với bản đã commit
npm run sw-version     # ghi VERSION và danh sách file vào sw.js; npm test đỏ nếu quên sau khi đổi file trong src/public
BROWSER_APP=Safari npm run test:browser   # hoặc Firefox: mở app đó trên macOS thay vì Chrome headless
npm run test:server    # API trên wrangler pages dev thật, D1 cục bộ; mỗi tệp test tự có server và dữ liệu tạm
```

`npm run test:e2e` chạy app thật trên Chrome qua DevTools Protocol, không cần package nào. Đặt `KEYMESH_SHOTS=<thư mục>` để lưu ảnh chụp màn hình, `CHROME_PATH` nếu Chrome nằm chỗ khác.

## Chạy server cục bộ

`npm run dev:server` áp migration rồi chạy app kèm API ở `http://127.0.0.1:8788/`, dữ liệu nằm trong `src/.wrangler/`. Cần tệp `src/.dev.vars` (đã ở `.gitignore`, chỉ dùng giá trị thử):

```
ALLOWED_ORIGINS=http://127.0.0.1:8788
REGISTRATION_TOKEN=<ít nhất 32 ký tự>
SERVER_SECRET=<chuỗi ngẫu nhiên dài>
```

## Ghi công

Bộ sinh mật khẩu *Dễ nhớ* dùng [EFF Large Wordlist](https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt) © Electronic Frontier Foundation, theo giấy phép [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ([eff.org/copyright](https://www.eff.org/copyright)). Đã bỏ số xúc xắc và 4 từ có gạch nối. Chi tiết ở đầu `src/public/js/wordlist.js`.
