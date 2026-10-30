# KeyMesh

Kho lưu credential và link tài liệu **cá nhân**, tổ chức theo **Project → Environment**. Một item có thể gán cho nhiều môi trường: sửa một lần, mọi môi trường đều thấy giá trị mới.

Dữ liệu mã hoá đầu-cuối, dùng được trên máy tính, Android và iPhone (PWA), chạy offline, đồng bộ qua Cloudflare (gói miễn phí, không cần server riêng).

> **Trạng thái:** v1 (một file HTML, chạy cục bộ, tên cũ là EnvVault) đã dùng được, hiện ở [`envvault.html`](envvault.html). Theo kế hoạch, file này sẽ được chuyển sang `legacy/` ở M1. v2 (PWA + đồng bộ) đang ở giai đoạn thiết kế.

## Tài liệu thiết kế

| # | Tài liệu | Nội dung |
|---|---|---|
| 01 | [Tổng quan](docs/01-overview.md) | Bối cảnh, mục tiêu, phạm vi, các quyết định chính, thuật ngữ |
| 02 | [Kiến trúc](docs/02-architecture.md) | Thành phần, luồng chính, công nghệ, cấu trúc repo, triển khai |
| 03 | [Thiết kế dữ liệu](docs/03-data-model.md) | Nhiều vault, schema vault v2, khoá và envelope, IndexedDB, **D1 schema**, migrate v1→v2 |
| 04 | [Bảo mật](docs/04-security.md) | Mật mã, vòng đời khoá, xác thực, passkey, CSP, mô hình mối đe doạ |
| 05 | [Đồng bộ](docs/05-sync.md) | Giao thức offline-first theo từng vault, gộp ba chiều theo field, xử lý xung đột |
| 06 | [API](docs/06-api.md) | Các endpoint của Pages Functions |
| 07 | [Chức năng](docs/07-features.md) | Danh sách chức năng, wireframe desktop/mobile, tiêu chí chấp nhận |
| 08 | [Lộ trình](docs/08-roadmap.md) | Các giai đoạn M0–M6, hướng chia sẻ nhiều người, các quyết định đã chốt |
| 09 | [Hợp đồng lõi](docs/09-core-api.md) | Thao tác của `src/public/js/core/` (mật mã, model vault v2), loại lỗi, bộ vector cố định, epic nào dùng gì |

## Chạy test

Không có dependency nào để cài; cần Node ≥ 20.

```bash
npm test               # node --test trên test/*.test.js
npm run test:browser   # cùng bộ test trong Chrome/Edge headless (đặt CHROME_PATH nếu không tự tìm thấy)
npm run vectors        # tính lại testkit/vectors.js bằng node:crypto và so với bản đã commit
```
