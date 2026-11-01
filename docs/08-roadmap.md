# 08 · Lộ trình và các quyết định đã chốt

## Các giai đoạn

| Giai đoạn | Nội dung | Kết quả kiểm chứng được |
|---|---|---|
| **M0 · Đã xong** | v1 một file HTML, lưu file cục bộ hoặc localStorage | `legacy/envvault.html` |
| **M1 · Nền tảng** | Tạo repo git; tách v1 thành module (`crypto`, `model`, `store`, `ui`); vault v2; IndexedDB **theo từng vault**; khoá phân tầng (`accountKey` → `vaultKey`); `merge.js` **gộp theo field** có unit test; tombstone thùng rác trong model | Chạy cục bộ được với dữ liệu thử, test gộp dữ liệu pass (kể cả các tính chất gộp theo field) |
| **M2 · PWA mobile** | Manifest, Service Worker, giao diện mobile, tự khoá khi chuyển nền (chỉnh được trong cài đặt) | Cài lên Android và iPhone, mở được khi offline |
| **M3 · Đồng bộ** | Pages Functions, D1 migration (nhiều vault/user), auth, kiểm tra `ALLOWED_ORIGINS`, `/api/vaults/*`, sync engine theo từng vault, thanh trạng thái | Đạt tiêu chí chấp nhận 1–3 trong [07](07-features.md#tiêu-chí-chấp-nhận-cho-kịch-bản-chính) |
| **M4 · Passkey** | Mở khoá bằng WebAuthn PRF | Đạt tiêu chí 4 |
| **M5 · Hoàn thiện** | Snapshot, quản lý thiết bị, đổi mật khẩu theo luồng mới, export Bitwarden, audit log, **thùng rác** (UI khôi phục và tự xoá trắng), **bản sao tự động ra file**, **quản lý vault** (tạo, đổi tên, chuyển, xoá) | Đạt tiêu chí 6–8 |
| **M6 · Tuỳ chọn** | Argon2id (WASM), recovery key, mật khẩu riêng cho từng vault, chuyển item giữa vault, share target | — |

**Trạng thái M2 (KM-004, 2026-11-01): chưa đạt.** Giả lập Android và iOS đều đã cài, mở được offline và tự khoá khi ở nền. Còn năm mục kiểm tay của KM-003 chưa chạy, và copy bằng tay trên Safari, Firefox desktop. Màn đa nhiệm vẫn lộ nội dung trên cả hai giả lập; originator chấp nhận cho M2 vì chỉ dùng dữ liệu thử (2026-11-01), tự che lại secret ở KM-012. Khi đạt, tiêu chí này chỉ có nghĩa là đạt trên giả lập: **chưa kiểm trên điện thoại thật thì chưa cất secret thật trên điện thoại**.

M1 và M2 vẫn dùng được hoàn toàn cục bộ mà không cần Cloudflare, nên có thể dùng ngay trong lúc làm M3.

## Hướng mở rộng: chia sẻ nhiều người (nếu không chuyển sang Vaultwarden)

Phần này chỉ phác thảo để đảm bảo thiết kế hiện tại không cản đường, chưa phải cam kết sẽ làm.

- **Vault là đơn vị chia sẻ dễ nhất:** mỗi vault đã có `vaultKey` riêng, nên chia sẻ cả một vault chỉ cần bọc `vaultKey` bằng khoá công khai của từng thành viên (bảng `dt_vault_member`). Sync vẫn là một blob cho mỗi vault, không phải viết lại.
- Chia sẻ mịn hơn theo env thì mỗi env có một **khoá env** riêng. Item được mã hoá riêng, rồi khoá item được bọc bằng khoá của từng env mà item thuộc về. Nhờ vậy, item dùng chung vẫn chỉ có **một bản**.
- Mỗi thành viên có một cặp khoá (ECDH P-256 trong WebCrypto). Khoá env được bọc bằng khoá công khai của từng thành viên có quyền với env đó, đúng mô hình phân quyền theo project+env.
- Chia sẻ theo env thì server cần chuyển từ một blob sang **các dòng theo item** (`dt_item`, `dt_item_key`, `dt_env_key`, `dt_member`), nghĩa là phải viết lại phần sync.
- Thu hồi quyền của một người thì phải xoay khoá (vault hoặc env) và đổi các secret mà người đó đã thấy.

Chia sẻ theo env có khối lượng gần bằng làm lại Bitwarden. **Khuyến nghị:** khi cần chia sẻ, chuyển sang Vaultwarden qua F-DATA-03, thay vì tự làm. Chia sẻ theo vault là phương án trung gian nếu chỉ cần chia sẻ cho vài người.

## Các quyết định đã chốt

Các câu hỏi mở trước đây, chốt ngày 2026-10-30:

| # | Câu hỏi | Quyết định | Ghi ở |
|---|---|---|---|
| Q1 | Dùng domain riêng hay `*.pages.dev`? | Dùng `pages.dev` trước. Code không hard-code domain: `ALLOWED_ORIGINS` là cấu hình phía server, origin/RP ID lấy từ `location` phía client, để chuyển sang domain riêng (kèm Cloudflare Access) chỉ cần đổi cấu hình | [02](02-architecture.md#cấu-hình-theo-domain), [04](04-security.md) |
| Q2 | Có cần thùng rác không? | **Có.** Xoá item thì vào thùng rác, giữ nguyên nội dung 30 ngày rồi tự xoá trắng; có *Xoá vĩnh viễn*. F-ITM-12 lên P1, làm ở M5 | [03](03-data-model.md#quy-tắc-toàn-vẹn), [05](05-sync.md#xoá-thùng-rác-và-sửa), [07](07-features.md) |
| Q3 | Mobile tự khoá sau bao lâu khi chuyển nền? | 60 giây, chỉnh được trong cài đặt (F-AUTH-11) | [04](04-security.md), [07](07-features.md) |
| Q4 | Có giữ chế độ lưu file cục bộ trên desktop không? | **Không** dùng file làm nơi lưu dữ liệu. Thay bằng **bản sao tự động chỉ ghi** ra file (Chromium), không bao giờ đọc lại để sync; trình duyệt khác dùng nút tải backup (F-DATA-06, M5) | [03](03-data-model.md#bản-sao-tự-động-ra-file-chỉ-ghi), [05](05-sync.md) |
| Q5 | Có tách vault công việc và vault cá nhân không? | **Thiết kế nhiều vault** ngay từ đầu: mỗi vault có `vaultKey` và blob riêng, bọc bằng `accountKey` chung (một master password). Schema, API, lưu trữ, sync làm theo nhiều vault từ M1–M3; UI v2 tạo sẵn một vault mặc định, quản lý vault ở M5 | [03](03-data-model.md), [04](04-security.md), [05](05-sync.md), [06](06-api.md) |
| Q6 | Có gộp theo field ngay từ đầu không? | **Có.** Gộp ba chiều theo từng thuộc tính và từng field; `scopes`/`tags` gộp như tập hợp; chỉ tính xung đột khi hai bên cùng sửa một giá trị | [03](03-data-model.md#đồng-hồ-clock), [05](05-sync.md#thuật-toán-gộp-ba-chiều-theo-field) |
| Q7 | Dùng tiền tố id hay hex trần? | Id trong vault dùng tiền tố (`p_`, `e_`, `i_`, `f_`, `d_`). `vaultId` là 16 hex ngẫu nhiên **không tiền tố**, không băm hay HMAC vì id ngẫu nhiên không chứa thông tin gì. Code chấp nhận cả hai dạng. UI không hiện id thô | [03](03-data-model.md#id), [04](04-security.md) |
| Q8 | Có import hoặc migrate dữ liệu v1 không? (chốt 2026-11-01) | **Không.** v1 chưa từng chứa dữ liệu thật và không có file v1 nào cần giữ. `envvault.html` chỉ còn để tham chiếu | [07](07-features.md), intent KM-001 và KM-003 |
